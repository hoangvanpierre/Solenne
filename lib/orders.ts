import { createAdminClient } from "@/lib/supabase/admin";
import { saveDefaultAddress } from "@/lib/addresses";
import { SHIPPING } from "@/lib/constants";
import type {
  Order,
  OrderItem,
  ShippingAddress,
} from "@/types";

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

async function fetchItems(orderIds: string[]): Promise<Map<string, OrderItem[]>> {
  const itemsByOrder = new Map<string, OrderItem[]>();
  if (orderIds.length === 0) return itemsByOrder;

  const admin = createAdminClient();
  const { data, error } = await admin
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

// Callers must have verified the session (auth.getUser) before calling these;
// userId must come from the authenticated session, never from user input.
export async function getOrdersForUser(
  userId: string,
  limit = 20
): Promise<Order[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
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

export async function countOrdersForUser(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to count orders: ${error.message}`);

  return count ?? 0;
}

export async function getOrderByNumber(
  orderNumber: string,
  userId: string
): Promise<Order | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
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

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const admin = createAdminClient();
  const variantIds = input.items.map((item) => item.variantId);

  const { data: variantData, error: variantError } = await admin
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

  const { data: orderData, error: orderError } = await admin
    .from("orders")
    .insert({
      user_id: input.userId,
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

  const { error: itemsError } = await admin.from("order_items").insert(
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
    await admin.from("orders").delete().eq("id", orderId);
    throw new Error(`Failed to create order items: ${itemsError.message}`);
  }

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
      throw new OrderError(
        `Stock for ${item.productName} (${item.variantName}) changed while placing your order. Please try again.`
      );
    }
  }

  const order = await getOrderByNumber(orderNumber, input.userId);

  if (!order) throw new Error("Order created but could not be read back.");

  // Remember the shipping address as the user's default so future checkouts
  // can be prefilled. Best-effort: never fail the order over this.
  try {
    await saveDefaultAddress(input.userId, input.shippingAddress);
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
