import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwnership, requireOwnershipOrPermission } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { saveDefaultAddress } from "@/lib/addresses";
import { SHIPPING } from "@/lib/constants";
import type {
  Order,
  OrderItem,
  ShippingAddress,
} from "@/types";

// ---------------------------------------------------------------------------
// Orders data layer.
//
// Reads and customer writes use the USER-SCOPED Supabase client, so the RLS
// policies in 0003 (orders_select_own, orders_insert_own, order_items_*,
// orders_select_with_order_read) are enforced by the database on every query
// instead of being bypassed by the secret key.
//
// The secret-key client appears exactly twice, both after an explicit
// authorization check:
//   1. stock decrement (inventory is cross-account data; `authenticated` has
//      no write grant on product_variants);
//   2. rollback deletion of an order the SAME request just created (orders has
//      no DELETE policy or grant for `authenticated` by design).
// ---------------------------------------------------------------------------

interface OrderRow {
  id: string;
  user_id: string | null;
  order_number: string;
  status: string;
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
    stripeSessionId: row.stripe_session_id ?? undefined,
    stripePaymentIntent: row.stripe_payment_intent ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
}

function generateOrderNumber(): string {
  const date = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SLN-${date}-${random}`;
}

interface VariantRow {
  id: string;
  product_id: string;
  name: string;
  price: number | string;
  stock_quantity: number;
  products: { id: string; name: string; is_active: boolean } | null;
}

/**
 * Place an order for the authenticated caller.
 *
 * Authorization happens FIRST: `requireOwnership(userId, "order.create")`
 * authenticates the caller, rejects non-active accounts, requires the
 * `order.create` permission, and refuses any userId other than the session's
 * own — so a forged payload cannot order on another account's behalf. Only
 * after that check is the secret-key client used (stock movement + rollback),
 * which is why this function must never be called before it.
 */
export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const actor = await requireOwnership(input.userId, "order.create");
  const userId = actor.userId;

  const supabase = await createClient();

  // Price authority: variant prices and stock come from the database, never
  // from the client payload (which only carries variantId + quantity).
  const variantIds = input.items.map((item) => item.variantId);

  const { data: variantData, error: variantError } = await supabase
    .from("product_variants")
    .select(
      "id, product_id, name, price, stock_quantity, products(id, name, is_active)"
    )
    .in("id", variantIds);

  if (variantError) {
    throw new Error(`Failed to verify cart items: ${variantError.message}`);
  }

  const variantsById = new Map<string, VariantRow>(
    (variantData as unknown as VariantRow[]).map((row) => [row.id, row])
  );

  const lineItems = input.items.map((item) => {
    const variant = variantsById.get(item.variantId);
    if (!variant) {
      throw new OrderError("One of the items in your cart is no longer available.");
    }
    if (!variant.products?.is_active) {
      throw new OrderError(
        `"${variant.products?.name ?? "An item"}" is no longer available.`
      );
    }
    if (variant.stock_quantity < item.quantity) {
      throw new OrderError(
        `Only ${variant.stock_quantity} left of ${variant.products.name} (${variant.name}). Please adjust your cart.`
      );
    }

    const unitPrice = toNumber(variant.price);
    return {
      variantId: variant.id,
      productId: variant.products.id,
      productName: variant.products.name,
      variantName: variant.name,
      quantity: item.quantity,
      unitPrice,
      totalPrice: unitPrice * item.quantity,
      stockBefore: variant.stock_quantity,
    };
  });

  const subtotal = lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const shippingFee =
    subtotal >= SHIPPING.freeThresholdUSD ? 0 : SHIPPING.flatRateUSD;
  const total = subtotal + shippingFee;

  const orderNumber = generateOrderNumber();


  // Writes run on the user-scoped client. RLS enforces the same rules the
  // application layer just checked: orders_insert_own requires
  // user_id = auth.uid() and status = 'pending'; order_items_insert_own
  // requires the parent order to belong to the caller.
  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .insert({
      user_id: userId,
      order_number: orderNumber,
      status: "pending",
      subtotal,
      shipping_fee: shippingFee,
      discount: 0,
      total,
      shipping_address: { ...input.shippingAddress, email: input.email },
      notes: input.notes ?? null,
    })
    .select("id")
    .single();

  if (orderError) {
    throw new Error(`Failed to create order: ${orderError.message}`);
  }

  const orderId = (orderData as { id: string }).id;

  const { error: itemsError } = await supabase.from("order_items").insert(
    lineItems.map((item) => ({
      order_id: orderId,
      product_id: item.productId,
      variant_id: item.variantId,
      product_name: item.productName,
      variant_name: item.variantName,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total_price: item.totalPrice,
    }))
  );

  if (itemsError) {
    // Cleanup is privileged because customers deliberately have no DELETE
    // grant or policy on orders (financial records). It only ever removes the
    // row this same request just created.
    const admin = createAdminClient();
    await admin.from("orders").delete().eq("id", orderId);
    await writeAuditLog({
      actorId: userId,
      action: "order.create_rolled_back",
      resourceType: "order",
      resourceId: orderId,
      metadata: { orderNumber, reason: itemsError.message },
    });
    throw new Error(`Failed to create order items: ${itemsError.message}`);
  }

  // Stock movement is a cross-account inventory write, so it runs on the
  // secret-key client — always after the requireOwnership("order.create")
  // check at the top of this function. The optimistic guard
  // (stock_quantity = value read earlier) keeps concurrent orders honest.
  const admin = createAdminClient();

  for (const item of lineItems) {
    const { data: updated, error: stockError } = await admin
      .from("product_variants")
      .update({ stock_quantity: item.stockBefore - item.quantity })
      .eq("id", item.variantId)
      .eq("stock_quantity", item.stockBefore)
      .select("id");

    if (stockError) {
      throw new Error(`Failed to update stock: ${stockError.message}`);
    }
    if (!updated || updated.length === 0) {
      await writeAuditLog({
        actorId: userId,
        action: "order.stock_conflict",
        resourceType: "order",
        resourceId: orderId,
        metadata: { orderNumber, variantId: item.variantId },
      });
      throw new OrderError(
        `Stock for ${item.productName} (${item.variantName}) changed while placing your order. Please try again.`
      );
    }
  }

  await writeAuditLog({
    actorId: userId,
    action: "order.created",
    resourceType: "order",
    resourceId: orderId,
    metadata: {
      orderNumber,
      itemCount: lineItems.length,
      subtotal,
      shippingFee,
      total,
      currency: "USD",
      status: "pending",
    },
  });

  const order = await getOrderByNumber(orderNumber, userId);

  if (!order) throw new Error("Order created but could not be read back.");

  // Remember the shipping address as the user's default so future checkouts
  // can be prefilled. Best-effort: never fail the order over this.
  try {
    await saveDefaultAddress(userId, input.shippingAddress);
  } catch (error) {
    console.warn("Failed to save default address:", error);
  }

  return order;
}

export class OrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderError";
  }
}

