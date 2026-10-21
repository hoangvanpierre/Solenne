import { requirePermission } from "@/lib/authz";
import { countAdminCustomers } from "@/lib/admin-customers";
import { getAdminInventory } from "@/lib/inventory";
import { getStockStatus } from "@/components/admin/stock-status-badge";
import { createClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/types";

// ---------------------------------------------------------------------------
// Solenne management overview metrics.
//
// Every helper here is SERVER-ONLY and re-checks the permission it needs
// before touching the database, even though app/admin/page.tsx already
// filtered the dashboard by permission. RLS applies the same rule again at the
// database layer, so a caller reaching these functions directly still cannot
// read another domain's data.
//
// Query budget (see app/admin/page.tsx):
//   orders    -> 4 head counts (total, pending, processing+shipped, cancelled)
//   customers -> 2 head counts (total, suspended+banned)
//   inventory -> 1 list read (the same query /admin/inventory already runs)
// That is 6 count queries and 1 list read per dashboard render — the ceiling
// agreed in the implementation plan. Nothing here aggregates a full table in
// application memory to derive a number a COUNT can return exactly.
// ---------------------------------------------------------------------------

export interface OrderMetrics {
  total: number;
  awaitingPayment: number;
  inFulfillment: number;
  cancelled: number;
}

/** Order counts grouped by the operational buckets the dashboard surfaces. */
export async function getOrderMetrics(): Promise<OrderMetrics> {
  await requirePermission("order.read");

  const supabase = await createClient();

  const countOrders = async (
    statuses?: readonly OrderStatus[]
  ): Promise<number> => {
    const base = supabase
      .from("orders")
      .select("id", { count: "exact", head: true });

    const query = statuses && statuses.length > 0 ? base.in("status", statuses) : base;

    const { count, error } = await query;

    if (error) {
      throw new Error(`Failed to count admin orders: ${error.message}`);
    }

    return count ?? 0;
  };

  const [total, awaitingPayment, inFulfillment, cancelled] = await Promise.all([
    countOrders(),
    countOrders(["pending"]),
    countOrders(["processing", "shipped"]),
    countOrders(["cancelled"]),
  ]);

  return { total, awaitingPayment, inFulfillment, cancelled };
}

export interface CustomerMetrics {
  total: number;
  /** Suspended + banned storefront accounts. "pending" is deliberately excluded. */
  restricted: number;
}

/**
 * Storefront customer counts. `pending` accounts are new, not restricted, so
 * they are excluded from the restricted figure instead of inflating it.
 */
export async function getCustomerMetrics(): Promise<CustomerMetrics> {
  await requirePermission("customer.read");

  const [total, restricted] = await Promise.all([
    countAdminCustomers(),
    countAdminCustomers({ status: ["suspended", "banned"] }),
  ]);

  return { total, restricted };
}

export interface RestockCandidate {
  variantId: string;
  productName: string;
  variantName: string;
  stock: number;
}

export interface InventorySnapshot {
  variantCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  /** Out-of-stock first, then emptiest low-stock variants. */
  restockCandidates: RestockCandidate[];
}

/**
 * Stock posture across every variant. The low-stock boundary is the same
 * editorial UI threshold the inventory table uses (StockStatusBadge), not a
 * database rule — it is presentation, not a business constraint.
 */
export async function getInventorySnapshot(
  candidateLimit = 4
): Promise<InventorySnapshot> {
  await requirePermission("inventory.read");

  const items = await getAdminInventory();

  let lowStockCount = 0;
  let outOfStockCount = 0;
  const belowThreshold: RestockCandidate[] = [];

  for (const item of items) {
    const status = getStockStatus(item.stockQuantity);

    if (status === "out_of_stock") outOfStockCount += 1;
    else if (status === "low_stock") lowStockCount += 1;

    if (status !== "in_stock") {
      belowThreshold.push({
        variantId: item.id,
        productName: item.productName,
        variantName: item.name,
        stock: item.stockQuantity,
      });
    }
  }

  belowThreshold.sort((a, b) => a.stock - b.stock);

  const restockCandidates = belowThreshold.slice(0, Math.max(0, candidateLimit));

  return {
    variantCount: items.length,
    lowStockCount,
    outOfStockCount,
    restockCandidates,
  };
}
