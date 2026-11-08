import { createClient } from "@/lib/supabase/server";
import { escapeLikePattern } from "@/lib/search-utils";
import {
  requireOwnership,
  requireOwnershipOrPermission,
  requirePermission,
} from "@/lib/authz";
import { isValidUuid } from "@/lib/audit-utils";
import { saveDefaultAddress } from "@/lib/addresses";
import { createOrderErrorMessage } from "@/lib/order-rpc-errors";
import {
  isMissingOrderStatusEventsSchema,
  mapOrderStatusEventRow,
  OrderStatusTimelineUnavailableError,
  type OrderStatusEventRow,
} from "@/lib/order-status-events-core";
import type {
  AdminOrderQueryResult,
  Order,
  OrderFilterParams,
  OrderItem,
  OrderStatusEvent,
  ShippingAddress,
} from "@/types";

// ---------------------------------------------------------------------------
// Orders data layer.
//
// Reads and customer writes use the USER-SCOPED Supabase client, so RLS
// (orders_select_own, order_items_select_own, orders_select_with_order_read)
// is enforced by the database on every query.
//
// Order creation is one POSTGRES FUNCTION CALL: public.create_order()
// (migration 0016). It derives the customer from auth.uid(), locks the
// variants, re-prices them, writes orders + order_items, deducts stock and
// writes the audit row in a single transaction. There is no multi-request
// sequence left to leave a partial order behind, and `authenticated` no
// longer holds INSERT on either table.
// ---------------------------------------------------------------------------

interface OrderRow {
  id: string;
  user_id: string | null;
  order_number: string;
  status: string;
  tracking_code: string | null;
  subtotal: number | string;
  shipping_fee: number | string | null;
  discount: number | string | null;
  total: number | string;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  shipping_address: (ShippingAddress & { email?: string }) | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number | string;
  total_price: number | string;
  created_at: string;
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "string" ? Number(value) : value;
}

function mapItem(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id ?? "",
    variantId: row.variant_id ?? "",
    productName: row.product_name,
    variantName: row.variant_name ?? undefined,
    quantity: row.quantity,
    unitPrice: toNumber(row.unit_price),
    totalPrice: toNumber(row.total_price),
  };
}

function mapOrder(row: OrderRow, items: OrderItem[]): Order {
  return {
    id: row.id,
    orderNumber: row.order_number,
    userId: row.user_id ?? "",
    status: row.status as Order["status"],
    items,
    subtotal: toNumber(row.subtotal),
    shippingFee: toNumber(row.shipping_fee),
    discount: toNumber(row.discount),
    total: toNumber(row.total),
    shippingAddress: row.shipping_address as ShippingAddress,
    trackingCode: row.tracking_code ?? undefined,
    stripeSessionId: row.stripe_session_id ?? undefined,
    stripePaymentIntent: row.stripe_payment_intent ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Order status history (migration 0017).
//
// The table is append-only and database-written. Customer reads use the
// user-scoped client and the column-level SELECT grant (no actor/reason), so
// RLS and column privileges both apply. Staff/manager/admin use the
// order.read-gated get_order_status_events_admin() RPC to receive the hidden
// actor/reason columns. Actor names are resolved for the management timeline
// only; a missing profile or a role without customer.read leaves the name blank.
// ---------------------------------------------------------------------------

/**
 * Columns granted to `authenticated` for customer reads. `actor_user_id` and
 * `reason` are intentionally absent: 0017 grants them only through the
 * order.read-gated management RPC.
 */
const CUSTOMER_ORDER_STATUS_EVENT_COLUMNS =
  "id, order_id, from_status, to_status, tracking_code, source, created_at";

function mapOrderStatusEventRows(data: unknown): OrderStatusEvent[] {
  return ((data ?? []) as OrderStatusEventRow[]).map(mapOrderStatusEventRow);
}

async function fetchCustomerOrderStatusEvents(
  orderId: string
): Promise<OrderStatusEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_status_events")
    .select(CUSTOMER_ORDER_STATUS_EVENT_COLUMNS)
    .eq("order_id", orderId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    if (isMissingOrderStatusEventsSchema(error)) {
      throw new OrderStatusTimelineUnavailableError();
    }
    throw new Error(`Failed to fetch order status events: ${error.message}`);
  }

  return mapOrderStatusEventRows(data);
}

async function fetchAdminOrderStatusEvents(
  orderId: string
): Promise<OrderStatusEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_order_status_events_admin",
    { p_order_id: orderId }
  );

  if (error) {
    if (isMissingOrderStatusEventsSchema(error)) {
      throw new OrderStatusTimelineUnavailableError();
    }
    throw new Error(`Failed to fetch order status events: ${error.message}`);
  }

  return mapOrderStatusEventRows(data);
}

/**
 * The caller's own order timeline. `userId` must come from the authenticated
 * session. Ownership permits a customer without order.read; RLS repeats the
 * same ownership check at the database layer.
 */
export async function getOrderStatusEvents(
  orderId: string,
  userId: string
): Promise<OrderStatusEvent[]> {
  await requireOwnershipOrPermission(userId, "order.read");

  return fetchCustomerOrderStatusEvents(orderId);
}

/**
 * Management timeline for any order. Re-checks order.read, then reads the full
 * history through the database-side get_order_status_events_admin() RPC
 * (authenticated has no column grant on actor_user_id/reason). Actor display
 * names are resolved in one batched profile read; a missing profile or a role
 * without customer.read simply leaves the name blank.
 */
export async function getAdminOrderStatusEvents(
  orderId: string
): Promise<OrderStatusEvent[]> {
  await requirePermission("order.read");

  const events = await fetchAdminOrderStatusEvents(orderId);
  const actorIds = [
    ...new Set(
      events
        .map((event) => event.actorUserId)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  if (actorIds.length === 0) return events;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", actorIds);

  if (error || !data) return events;

  const names = new Map(
    (data as { id: string; full_name: string | null }[]).map((row) => [
      row.id,
      row.full_name,
    ])
  );

  return events.map((event) => {
    if (!event.actorUserId) return event;
    const name = names.get(event.actorUserId);
    return name ? { ...event, actorName: name } : event;
  });
}

// Items are read on the user-scoped client: order_items_select_own restricts
// the rows to the caller's own orders, and staff/admin reach the rest through
// order_items_select_with_order_read.
async function fetchItems(orderIds: string[]): Promise<Map<string, OrderItem[]>> {
  const itemsByOrder = new Map<string, OrderItem[]>();
  if (orderIds.length === 0) return itemsByOrder;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_items")
    .select("*")
    .in("order_id", orderIds);

  if (error) throw new Error(`Failed to fetch order items: ${error.message}`);

  for (const row of data as unknown as OrderItemRow[]) {
    const list = itemsByOrder.get(row.order_id) ?? [];
    list.push(mapItem(row));
    itemsByOrder.set(row.order_id, list);
  }

  return itemsByOrder;
}

/**
 * A user's orders, newest first.
 *
 * `userId` must come from the authenticated session, never from user input.
 * The caller must own the orders — or hold `order.read`, which is how staff
 * and managers view customer orders. RLS applies the identical rule.
 */
export async function getOrdersForUser(
  userId: string,
  limit = 20
): Promise<Order[]> {
  await requireOwnershipOrPermission(userId, "order.read");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch orders: ${error.message}`);

  const rows = data as unknown as OrderRow[];
  const itemsByOrder = await fetchItems(rows.map((row) => row.id));

  return rows.map((row) => mapOrder(row, itemsByOrder.get(row.id) ?? []));
}

/** How many orders the given user has (drives the "View all orders (N)" link). */
export async function countOrdersForUser(userId: string): Promise<number> {
  await requireOwnershipOrPermission(userId, "order.read");

  const supabase = await createClient();
  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to count orders: ${error.message}`);

  return count ?? 0;
}

/**
 * All orders across customers for management, newest first.
 *
 * Enforces requirePermission("order.read") on the server.
 * Uses the user-scoped client so RLS (orders_select_with_order_read)
 * enforces access at the database layer as well.
 */
export async function getAdminOrders(limit = 50): Promise<Order[]> {
  await requirePermission("order.read");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch admin orders: ${error.message}`);

  const rows = (data ?? []) as unknown as OrderRow[];
  const itemsByOrder = await fetchItems(rows.map((row) => row.id));

  return rows.map((row) => mapOrder(row, itemsByOrder.get(row.id) ?? []));
}

/**
 * Total count of all orders in the system for management.
 *
 * Enforces requirePermission("order.read") on the server.
 * Uses the user-scoped client under RLS.
 */
export async function countAdminOrders(): Promise<number> {
  await requirePermission("order.read");

  const supabase = await createClient();
  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true });

  if (error) throw new Error(`Failed to count admin orders: ${error.message}`);

  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Management order list: server-side search, status filter and pagination.
//
// Everything the browser sends is untrusted. The page/limit values are clamped,
// the status must be one of the six real OrderStatus values, and the search
// term is bounded and stripped of PostgREST filter delimiters before it is
// interpolated into the composite `.or()` clause (same hardening as the
// customer directory in lib/admin-customers.ts).
//
// Search covers the identifiers an operator actually has at hand:
//   - order number    (orders.order_number, case-insensitive substring)
//   - order id        (exact match, only when the term is a full uuid)
//   - customer email  (orders.shipping_address->>email, case-insensitive)
//   - customer name   (orders.shipping_address->>fullName, case-insensitive)
// The JSON path filters are supported by PostgREST on the live schema, so no
// schema change is needed. The name already belongs to the same order row the
// operator can see, so including it does not widen access.
// ---------------------------------------------------------------------------

const ORDER_STATUSES: readonly string[] = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

const ORDERS_DEFAULT_PAGE_LIMIT = 20;
const ORDERS_MAX_PAGE_LIMIT = 100;
const ORDERS_MAX_SEARCH_LENGTH = 80;

function clampPositiveInt(
  value: number | string | undefined,
  fallback: number,
  max: number
): number {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  const integer = Math.trunc(parsed);
  if (integer < 1) return fallback;
  return Math.min(integer, max);
}

/**
 * Strip PostgREST filter syntax from untrusted text while leaving literal
 * wildcard characters intact. `escapeLikePattern` escapes `%`, `_` and `\`
 * afterwards, so a search for "50%" matches that text instead of every row.
 */
function sanitizeOrderSearch(query: string): string {
  return query
    .slice(0, ORDERS_MAX_SEARCH_LENGTH)
    .replace(/[,().*:"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Validates an untrusted status value; `undefined`/`all` means "no filter". */
export function normalizeOrderStatusFilter(
  value: string | undefined
): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "all") return undefined;
  return ORDER_STATUSES.includes(normalized) ? normalized : undefined;
}

/**
 * Filtered, paginated order list for management.
 *
 * Enforces requirePermission("order.read") before touching the database and
 * keeps using the user-scoped client so RLS still applies. Returns the exact
 * filtered total from PostgREST's count, so the pagination range the UI prints
 * is truthful for the active filters — not just for the rows on this page.
 *
 * Ordering is deterministic and newest-first (created_at desc, then id desc as
 * a tie-breaker) so a page boundary can never shift between requests.
 */
export async function getAdminOrderList(
  params: OrderFilterParams = {}
): Promise<AdminOrderQueryResult> {
  await requirePermission("order.read");

  const page = clampPositiveInt(params.page, 1, 1_000_000);
  const limit = clampPositiveInt(
    params.limit,
    ORDERS_DEFAULT_PAGE_LIMIT,
    ORDERS_MAX_PAGE_LIMIT
  );
  const status = normalizeOrderStatusFilter(params.status);
  const rawSearch =
    typeof params.search === "string" ? params.search : "";
  const search = sanitizeOrderSearch(rawSearch);

  const supabase = await createClient();

  let query = supabase.from("orders").select("*", { count: "exact" });

  if (status) {
    query = query.eq("status", status);
  }

  if (search) {
    if (isValidUuid(search)) {
      query = query.eq("id", search);
    } else {
      const pattern = `%${escapeLikePattern(search)}%`;
      query = query.or(
        [
          `order_number.ilike.${pattern}`,
          `shipping_address->>email.ilike.${pattern}`,
          `shipping_address->>fullName.ilike.${pattern}`,
        ].join(",")
      );
    }
  }

  const from = (page - 1) * limit;
  // One extra row is requested so `hasMore` is authoritative even if the exact
  // count and the window ever disagree.
  const to = from + limit;

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(`Failed to fetch admin order list: ${error.message}`);
  }

  const rows = ((data ?? []) as unknown as OrderRow[]).slice(0, limit);
  const totalCount = count ?? rows.length;
  const itemsByOrder = await fetchItems(rows.map((row) => row.id));

  return {
    orders: rows.map((row) => mapOrder(row, itemsByOrder.get(row.id) ?? [])),
    totalCount,
    page,
    limit,
    hasMore: from + rows.length < totalCount,
  };
}

/**
 * A single order by its primary key ID for management.
 *
 * Enforces requirePermission("order.read") on the server.
 * Uses the user-scoped client so RLS (orders_select_with_order_read)
 * enforces access at the database layer.
 * Returns null if the order does not exist or the actor is not authorized.
 */
export async function getAdminOrderById(
  orderId: string
): Promise<Order | null> {
  await requirePermission("order.read");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch admin order: ${error.message}`);
  if (!data) return null;

  const row = data as unknown as OrderRow;
  const itemsByOrder = await fetchItems([row.id]);

  return mapOrder(row, itemsByOrder.get(row.id) ?? []);
}

/**
 * A single order by its public order number, scoped to its owner. Returns
 * null when the order does not exist OR belongs to somebody else — callers
 * cannot distinguish the two, so order numbers cannot be enumerated.
 */
export async function getOrderByNumber(
  orderNumber: string,
  userId: string
): Promise<Order | null> {
  await requireOwnershipOrPermission(userId, "order.read");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("order_number", orderNumber)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch order: ${error.message}`);
  if (!data) return null;

  const row = data as unknown as OrderRow;
  const itemsByOrder = await fetchItems([row.id]);

  return mapOrder(row, itemsByOrder.get(row.id) ?? []);
}


export interface CreateOrderInput {
  userId: string;
  email: string;
  shippingAddress: ShippingAddress & { email?: string };
  items: { variantId: string; quantity: number }[];
  notes?: string;
  /**
   * Client-generated idempotency key. The database enforces
   * (user_id, key) uniqueness, so an ambiguous network retry returns the
   * original order instead of creating a second one.
   */
  idempotencyKey: string;
}

interface CreateOrderRpcResult {
  success: boolean;
  order_id: string;
  order_number: string;
  status: string;
  subtotal: number | string;
  shipping_fee: number | string;
  discount: number | string;
  total: number | string;
  currency: string;
  item_count: number;
  replayed: boolean;
}

/**
 * Place an order for the authenticated caller.
 *
 * Authorization happens FIRST: `requireOwnership(userId, "order.create")`
 * authenticates the caller, rejects non-active accounts, requires the
 * `order.create` permission, and refuses any userId other than the session's
 * own — so a forged payload cannot order on another account's behalf.
 *
 * The write is then a SINGLE call to public.create_order() on the USER-SCOPED
 * client. The function re-checks the same permissions from auth.uid(), locks
 * the variants, re-prices from the database, writes orders + order_items,
 * deducts stock and writes the audit row in one transaction. The client only
 * ever supplies { variantId, quantity } — never prices or totals.
 */
export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const actor = await requireOwnership(input.userId, "order.create");
  const userId = actor.userId;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_order", {
    p_email: input.email,
    p_shipping_address: input.shippingAddress,
    p_items: input.items,
    p_idempotency_key: input.idempotencyKey,
    p_notes: input.notes?.trim() || null,
  });

  if (error) {
    throw new OrderError(createOrderErrorMessage(error.message));
  }

  const result = data as CreateOrderRpcResult | null;
  if (!result?.success || !result.order_number) {
    throw new Error("Order creation returned an unexpected response.");
  }

  const order = await getOrderByNumber(result.order_number, userId);

  if (!order) throw new Error("Order created but could not be read back.");

  // Remember the shipping address as the user's default so future checkouts
  // can be prefilled. Best-effort: never fail the order over this.
  try {
    await saveDefaultAddress(userId, input.shippingAddress);
  } catch (saveError) {
    console.warn("Failed to save default address:", saveError);
  }

  return order;
}

export class OrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderError";
  }
}

