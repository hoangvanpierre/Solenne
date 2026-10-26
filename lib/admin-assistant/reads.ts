import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getAdminCustomers } from "@/lib/admin-customers";
import {
  getCustomerMetrics,
  getInventorySnapshot,
  getOrderMetrics,
} from "@/lib/admin-metrics";
import { getAdminInventory } from "@/lib/inventory";
import { getAdminOrderList } from "@/lib/orders";
import {
  getStockStatus,
  LOW_STOCK_THRESHOLD,
} from "@/components/admin/stock-status-badge";
import { formatPrice } from "@/lib/utils";
import type { OrderStatus, PermissionKey } from "@/types";
import {
  ORDER_DETAIL_MAX_ITEMS,
  resolveRangeStart,
  type AssistantOrderRange,
  type AssistantOrderStatus,
} from "./schemas";

// ---------------------------------------------------------------------------
// Solenne admin assistant — read-only data helpers.
//
// Every function here:
//   * calls requirePermission() itself (the tool wrapper re-checks too),
//   * uses the USER-SCOPED Supabase client, so RLS applies exactly as it does
//     for the admin pages — no service-role client ever reads data,
//   * selects an explicit column list (no `*`), so tokens, payment ids and
//     other internal fields cannot leak into the model's context,
//   * bounds every result.
//
// PERMISSION PARITY is a hard rule here: every helper mirrors the exact gate
// and the exact field set of the admin page that shows the same data.
//
//   orders list / detail   /admin/orders, /admin/orders/[id]   order.read
//   order counts           dashboard order block              order.read
//   inventory              /admin/inventory                   inventory.read
//   customer directory     /admin/customers                   customer.read
//                          (+ order.read for orderCount/lifetimeSpend)
//
// Two consequences are deliberate:
//   * There is NO aggregate revenue. No admin screen shows one — `analytics.read`
//     is not read by any page or helper — so the assistant cannot either.
//   * Customer orderCount/lifetimeSpend are null unless the actor holds
//     order.read, because /admin/customers and /admin/customers/[id] hide those
//     two figures behind exactly that permission.
//
// Nothing in this file writes. Stock, order status and customer status remain
// reachable only through their atomic RPCs in the admin UI.
// ---------------------------------------------------------------------------

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(amount: number): { amount: number; formatted: string } {
  const rounded = Math.round(amount * 100) / 100;
  return { amount: rounded, formatted: formatPrice(rounded, "USD") };
}

interface ShippingAddressLike {
  fullName?: unknown;
  email?: unknown;
  city?: unknown;
  country?: unknown;
}

function shippingSummary(value: unknown): {
  recipientName: string | null;
  email: string | null;
  city: string | null;
  country: string | null;
} {
  const address =
    value && typeof value === "object" ? (value as ShippingAddressLike) : {};

  const read = (field: unknown): string | null =>
    typeof field === "string" && field.trim().length > 0 ? field.trim() : null;

  return {
    recipientName: read(address.fullName),
    email: read(address.email),
    city: read(address.city),
    country: read(address.country),
  };
}

export interface AssistantOrderListRow {
  orderNumber: string;
  status: string;
  total: { amount: number; formatted: string };
  placedAt: string;
  customerName: string | null;
  customerEmail: string | null;
}

interface OrderListRow {
  order_number: string;
  status: string;
  total: number | string;
  created_at: string;
  shipping_address: unknown;
}

export interface AssistantOrderListResult {
  orders: AssistantOrderListRow[];
  matchedCount: number;
  returnedCount: number;
  truncated: boolean;
  filters: {
    status: string | null;
    olderThanDays: number | null;
  };
}

/**
 * Newest orders for the management list, optionally filtered by status and by
 * age. `olderThanDays` is applied in SQL (not after the limit) so the row cap
 * never hides older matching orders.
 */
export async function assistantListOrders(params: {
  status?: OrderStatus;
  olderThanDays?: number;
  limit: number;
}): Promise<AssistantOrderListResult> {
  await requirePermission("order.read");

  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select(
      "order_number, status, total, created_at, shipping_address",
      { count: "exact" }
    );

  if (params.status) {
    query = query.eq("status", params.status);
  }

  if (params.olderThanDays && params.olderThanDays > 0) {
    const cutoff = new Date(
      Date.now() - params.olderThanDays * 24 * 60 * 60 * 1000
    ).toISOString();
    query = query.lt("created_at", cutoff);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(params.limit);

  if (error) {
    throw new Error(`Failed to list orders: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as OrderListRow[];
  const matchedCount = count ?? rows.length;

  return {
    orders: rows.map((row) => {
      const shipping = shippingSummary(row.shipping_address);
      return {
        orderNumber: row.order_number,
        status: row.status,
        total: money(toNumber(row.total)),
        placedAt: row.created_at,
        customerName: shipping.recipientName,
        customerEmail: shipping.email,
      };
    }),
    matchedCount,
    returnedCount: rows.length,
    truncated: matchedCount > rows.length,
    filters: {
      status: params.status ?? null,
      olderThanDays: params.olderThanDays ?? null,
    },
  };
}

export interface AssistantOrderItem {
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: { amount: number; formatted: string };
  lineTotal: { amount: number; formatted: string };
}

export interface AssistantOrderDetail {
  orderNumber: string;
  status: string;
  placedAt: string;
  updatedAt: string;
  trackingCode: string | null;
  totals: {
    subtotal: { amount: number; formatted: string };
    shippingFee: { amount: number; formatted: string };
    discount: { amount: number; formatted: string };
    total: { amount: number; formatted: string };
    currency: "USD";
  };
  shipping: {
    recipientName: string | null;
    city: string | null;
    country: string | null;
  };
  items: AssistantOrderItem[];
  itemCount: number;
  itemsTruncated: boolean;
}

interface OrderDetailRow {
  id: string;
  order_number: string;
  status: string;
  subtotal: number | string;
  shipping_fee: number | string | null;
  discount: number | string | null;
  total: number | string;
  tracking_code: string | null;
  shipping_address: unknown;
  created_at: string;
  updated_at: string;
}

interface OrderItemRow {
  product_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number | string;
  total_price: number | string;
}

/**
 * One order by its public order number. Returns null when no such order exists
 * (RLS still decides visibility). Items are capped at 10; the exact count is
 * returned separately so the model can say "showing 10 of N".
 */
export async function assistantOrderDetail(
  orderNumber: string
): Promise<AssistantOrderDetail | null> {
  await requirePermission("order.read");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, subtotal, shipping_fee, discount, total, tracking_code, shipping_address, created_at, updated_at"
    )
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load order detail: ${error.message}`);
  }

  if (!data) return null;

  const row = data as unknown as OrderDetailRow;

  const {
    data: itemData,
    error: itemError,
    count,
  } = await supabase
    .from("order_items")
    .select(
      "product_name, variant_name, quantity, unit_price, total_price",
      { count: "exact" }
    )
    .eq("order_id", row.id)
    .order("created_at", { ascending: true })
    .limit(ORDER_DETAIL_MAX_ITEMS);

  if (itemError) {
    throw new Error(`Failed to load order items: ${itemError.message}`);
  }

  const items = ((itemData ?? []) as unknown as OrderItemRow[]).map((item) => ({
    productName: item.product_name,
    variantName: item.variant_name,
    quantity: item.quantity,
    unitPrice: money(toNumber(item.unit_price)),
    lineTotal: money(toNumber(item.total_price)),
  }));

  const itemCount = count ?? items.length;
  const shipping = shippingSummary(row.shipping_address);

  return {
    orderNumber: row.order_number,
    status: row.status,
    placedAt: row.created_at,
    updatedAt: row.updated_at,
    trackingCode: row.tracking_code,
    totals: {
      subtotal: money(toNumber(row.subtotal)),
      shippingFee: money(toNumber(row.shipping_fee)),
      discount: money(toNumber(row.discount)),
      total: money(toNumber(row.total)),
      currency: "USD",
    },
    shipping: {
      recipientName: shipping.recipientName,
      city: shipping.city,
      country: shipping.country,
    },
    items,
    itemCount,
    itemsTruncated: itemCount > items.length,
  };
}

export interface AssistantOrderSearchResult {
  query: string;
  matchedCount: number;
  returnedCount: number;
  truncated: boolean;
  orders: AssistantOrderListRow[];
}

/**
 * Order search by order number, order id, customer email or customer name.
 *
 * Delegates to getAdminOrderList(), which owns the sanitization: it bounds the
 * term, strips PostgREST filter delimiters and escapes LIKE wildcards before
 * building the composite `.or()`. Model text is never interpolated directly.
 */
export async function assistantFindOrders(
  query: string,
  limit: number
): Promise<AssistantOrderSearchResult> {
  await requirePermission("order.read");

  const result = await getAdminOrderList({ page: 1, limit, search: query });

  return {
    query,
    matchedCount: result.totalCount,
    returnedCount: result.orders.length,
    truncated: result.totalCount > result.orders.length,
    orders: result.orders.map((order) => {
      const shipping = shippingSummary(order.shippingAddress);
      return {
        orderNumber: order.orderNumber,
        status: order.status,
        total: money(order.total),
        placedAt: order.createdAt,
        customerName: shipping.recipientName,
        customerEmail: shipping.email,
      };
    }),
  };
}

export interface AssistantOrderSummary {
  range: AssistantOrderRange;
  since: string;
  counts: Record<AssistantOrderStatus, number> & { total: number };
  /**
   * Aggregate revenue is deliberately absent. No admin screen shows a revenue
   * total (see the parity notes at the top of this file), so the assistant must
   * not surface one either. Per-order amounts remain available from
   * listOrders / findOrder / getOrderDetail, exactly as the orders pages show
   * them.
   */
  revenueAvailable: false;
}

/**
 * Counts by status for a window.
 *
 * PERMISSION PARITY: `/admin/orders` and the dashboard's order block both gate
 * on `order.read` and show counts only. There is no revenue surface anywhere in
 * the admin UI — `analytics.read` is not consulted by any page or helper — so
 * this tool returns counts and nothing else.
 */
export async function assistantOrderSummary(
  range: AssistantOrderRange
): Promise<AssistantOrderSummary> {
  await requirePermission("order.read");

  const supabase = await createClient();
  const since = resolveRangeStart(range);

  const statuses: AssistantOrderStatus[] = [
    "pending",
    "paid",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
  ];

  const countFor = async (
    status?: AssistantOrderStatus
  ): Promise<number> => {
    const base = supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since);

    const query = status ? base.eq("status", status) : base;

    const { count, error } = await query;

    if (error) {
      throw new Error(`Failed to count orders: ${error.message}`);
    }

    return count ?? 0;
  };

  const [total, ...statusCounts] = await Promise.all([
    countFor(),
    ...statuses.map((status) => countFor(status)),
  ]);

  const counts = {
    total,
    ...Object.fromEntries(
      statuses.map((status, index) => [status, statusCounts[index] ?? 0])
    ),
  } as Record<AssistantOrderStatus, number> & { total: number };

  return {
    range,
    since,
    counts,
    revenueAvailable: false,
  };
}

export interface AssistantStockRow {
  variantId: string;
  productName: string;
  productSlug: string;
  variantName: string;
  sku: string | null;
  stock: number;
  stockStatus: "low_stock" | "out_of_stock";
  price: { amount: number; formatted: string };
  productActive: boolean;
}

export interface AssistantLowStockResult {
  threshold: number;
  lowStockCount: number;
  outOfStockCount: number;
  returnedCount: number;
  truncated: boolean;
  variants: AssistantStockRow[];
}

/** Emptiest variants first, including only those at/below the UI threshold. */
export async function assistantLowStock(
  limit: number
): Promise<AssistantLowStockResult> {
  await requirePermission("inventory.read");

  const items = await getAdminInventory();

  let lowStockCount = 0;
  let outOfStockCount = 0;

  const below: AssistantStockRow[] = [];

  for (const item of items) {
    const status = getStockStatus(item.stockQuantity);

    if (status === "in_stock") continue;

    if (status === "out_of_stock") outOfStockCount += 1;
    else lowStockCount += 1;

    below.push({
      variantId: item.id,
      productName: item.productName,
      productSlug: item.productSlug,
      variantName: item.name,
      sku: item.sku ?? null,
      stock: item.stockQuantity,
      stockStatus: status,
      price: money(item.price),
      productActive: item.isProductActive,
    });
  }

  below.sort((a, b) => a.stock - b.stock);

  const variants = below.slice(0, limit);

  return {
    threshold: LOW_STOCK_THRESHOLD,
    lowStockCount,
    outOfStockCount,
    returnedCount: variants.length,
    truncated: below.length > variants.length,
    variants,
  };
}

export interface AssistantProductStockResult {
  query: string;
  matchedCount: number;
  returnedCount: number;
  truncated: boolean;
  variants: {
    productName: string;
    productSlug: string;
    variantName: string;
    sku: string | null;
    stock: number;
    stockStatus: "in_stock" | "low_stock" | "out_of_stock";
    price: { amount: number; formatted: string };
    productActive: boolean;
  }[];
}

/**
 * Case-insensitive substring match over product name, slug, variant name and
 * SKU. Runs in memory over the already-bounded inventory read: the catalogue
 * is small and this avoids interpolating model text into a filter at all.
 */
export async function assistantProductStock(
  term: string,
  limit: number
): Promise<AssistantProductStockResult> {
  await requirePermission("inventory.read");

  const items = await getAdminInventory();
  const needle = term.trim().toLowerCase();

  const matches = items
    .filter((item) => {
      const haystack = [
        item.productName,
        item.productSlug,
        item.name,
        item.sku ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    })
    .sort((a, b) => a.stockQuantity - b.stockQuantity);

  const variants = matches.slice(0, limit).map((item) => ({
    productName: item.productName,
    productSlug: item.productSlug,
    variantName: item.name,
    sku: item.sku ?? null,
    stock: item.stockQuantity,
    stockStatus: getStockStatus(item.stockQuantity),
    price: money(item.price),
    productActive: item.isProductActive,
  }));

  return {
    query: term,
    matchedCount: matches.length,
    returnedCount: variants.length,
    truncated: matches.length > variants.length,
    variants,
  };
}

export interface AssistantCustomerResult {
  query: string;
  matchedCount: number;
  returnedCount: number;
  truncated: boolean;
  customers: {
    id: string;
    fullName: string | null;
    status: string;
    joinedAt: string;
    orderCount: number | null;
    lifetimeSpend: { amount: number; formatted: string } | null;
  }[];
}

/**
 * Customer lookup through the existing directory helper, which already scopes
 * results to the customer role, sanitizes the search term and escapes LIKE
 * wildcards. No new query is built from model text.
 *
 * PERMISSION PARITY: /admin/customers and /admin/customers/[id] render the
 * order count and lifetime spend only when the actor holds `order.read`
 * (`canReadOrders` in both pages). getAdminCustomers already nulls those two
 * fields without that permission; `includeOrderMetrics` re-applies the same
 * rule here so a future change in the helper cannot quietly widen the tool.
 */
export async function assistantFindCustomer(
  query: string,
  limit: number,
  options: { includeOrderMetrics: boolean }
): Promise<AssistantCustomerResult> {
  await requirePermission("customer.read");

  const result = await getAdminCustomers({
    page: 1,
    limit,
    search: query,
  });

  return {
    query,
    matchedCount: result.totalCount,
    returnedCount: result.customers.length,
    truncated: result.totalCount > result.customers.length,
    customers: result.customers.map((customer) => ({
      id: customer.id,
      fullName: customer.fullName,
      status: customer.status,
      joinedAt: customer.createdAt,
      orderCount: options.includeOrderMetrics ? customer.orderCount : null,
      lifetimeSpend:
        options.includeOrderMetrics && customer.lifetimeSpend !== null
          ? money(customer.lifetimeSpend)
          : null,
    })),
  };
}

export interface AssistantDashboardMetrics {
  orders: {
    total: number;
    awaitingPayment: number;
    inFulfillment: number;
    cancelled: number;
  } | null;
  customers: {
    total: number;
    restricted: number;
  } | null;
  inventory: {
    variantCount: number;
    lowStockCount: number;
    outOfStockCount: number;
    restockCandidates: {
      productName: string;
      variantName: string;
      stock: number;
    }[];
  } | null;
  omitted: string[];
}

/**
 * The dashboard's headline metrics, each group included only when the actor
 * holds the matching permission. The underlying helpers re-check too.
 */
export async function assistantDashboardMetrics(
  permissions: readonly PermissionKey[]
): Promise<AssistantDashboardMetrics> {
  const omitted: string[] = [];

  let orders: AssistantDashboardMetrics["orders"] = null;
  if (permissions.includes("order.read")) {
    orders = await getOrderMetrics();
  } else {
    omitted.push("orders");
  }

  let customers: AssistantDashboardMetrics["customers"] = null;
  if (permissions.includes("customer.read")) {
    customers = await getCustomerMetrics();
  } else {
    omitted.push("customers");
  }

  let inventory: AssistantDashboardMetrics["inventory"] = null;
  if (permissions.includes("inventory.read")) {
    inventory = await getInventorySnapshot(5);
  } else {
    omitted.push("inventory");
  }

  return { orders, customers, inventory, omitted };
}
