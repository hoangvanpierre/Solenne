import type { PermissionKey } from "@/types";

// ---------------------------------------------------------------------------
// Solenne admin assistant — tool catalogue and access rules.
//
// Two layers decide whether a tool exists for a request:
//
//   1. lib/admin-assistant/tools.ts only *builds* a tool when the actor holds
//      the permissions listed here. A model can therefore never see — let
//      alone call — a tool its operator could not use in the admin UI.
//   2. Every `execute()` re-runs `canUseTool()` before touching data. The
//      filtered tool list is a convenience, not the authorization boundary.
//
// Permissions are the real matrix from 0002_rbac_seed.sql, not role names, so
// a custom role with an unusual permission set behaves correctly. The role
// matrix exported below is documentation + a test fixture; it is never used
// to authorize a request.
//
// This module has no runtime dependencies, so scripts/verify-admin-assistant.mjs
// can import it directly.
// ---------------------------------------------------------------------------

export const ADMIN_ASSISTANT_TOOL_NAMES = [
  "getOrderSummary",
  "listOrders",
  "findOrder",
  "getOrderDetail",
  "listLowStock",
  "getProductStock",
  "findCustomer",
  "getDashboardMetrics",
] as const;

export type AdminAssistantToolName =
  (typeof ADMIN_ASSISTANT_TOOL_NAMES)[number];

export interface ToolAccessRule {
  /** Every one of these permissions is required. */
  all?: readonly PermissionKey[];
  /** At least one of these permissions is required. */
  any?: readonly PermissionKey[];
}

/**
 * Revenue is NOT exposed by this assistant.
 *
 * There is no revenue surface anywhere in the admin UI: `analytics.read` is
 * listed in MANAGEMENT_PERMISSIONS but no page or helper reads it, and the
 * dashboard shows order COUNTS only. Exposing a revenue total here would be
 * strictly more permissive than the pages, so the tool returns counts only.
 * Per-order amounts stay available where the pages show them (orders list and
 * order detail, both gated by `order.read`).
 */
export const NO_AGGREGATE_REVENUE = true;

export const TOOL_ACCESS: Record<AdminAssistantToolName, ToolAccessRule> = {
  getOrderSummary: { all: ["order.read"] },
  listOrders: { all: ["order.read"] },
  findOrder: { all: ["order.read"] },
  getOrderDetail: { all: ["order.read"] },
  listLowStock: { all: ["inventory.read"] },
  getProductStock: { all: ["inventory.read"] },
  findCustomer: { all: ["customer.read"] },
  getDashboardMetrics: {
    any: ["order.read", "inventory.read", "customer.read"],
  },
};

export interface ToolCatalogueEntry {
  name: AdminAssistantToolName;
  /** Shown to the model in the tool definition and in the prompt tool list. */
  description: string;
  /** Short label for the "Data used" disclosure in the drawer. */
  label: string;
  access: ToolAccessRule;
  /** Upper bound on rows the tool may return. */
  rowCap: number;
}

export const TOOL_CATALOGUE: Record<
  AdminAssistantToolName,
  ToolCatalogueEntry
> = {
  getOrderSummary: {
    name: "getOrderSummary",
    description:
      "Order counts by status for a time window (today, last 7 days, last 30 days). Counts only — no admin screen shows a revenue total, so this tool never returns one.",
    label: "Order summary",
    access: TOOL_ACCESS.getOrderSummary,
    rowCap: 1,
  },
  listOrders: {
    name: "listOrders",
    description:
      "Newest orders, optionally filtered by exact status and/or by age (older than N days). Returns at most 10 compact rows.",
    label: "Order list",
    access: TOOL_ACCESS.listOrders,
    rowCap: 10,
  },
  findOrder: {
    name: "findOrder",
    description:
      "Find orders by order number, order id, customer email or customer name fragment. Returns at most 10 matches.",
    label: "Order search",
    access: TOOL_ACCESS.findOrder,
    rowCap: 10,
  },
  getOrderDetail: {
    name: "getOrderDetail",
    description:
      "Full detail for one order number: status, totals, tracking code, shipping city/country and up to 10 line items.",
    label: "Order detail",
    access: TOOL_ACCESS.getOrderDetail,
    rowCap: 10,
  },
  listLowStock: {
    name: "listLowStock",
    description:
      "Product variants at or below the low-stock threshold (10 units), emptiest first. Returns at most 15 variants.",
    label: "Low stock",
    access: TOOL_ACCESS.listLowStock,
    rowCap: 15,
  },
  getProductStock: {
    name: "getProductStock",
    description:
      "Stock levels for product variants matching a product name, slug or SKU fragment. Returns at most 10 variants.",
    label: "Product stock",
    access: TOOL_ACCESS.getProductStock,
    rowCap: 10,
  },
  findCustomer: {
    name: "findCustomer",
    description:
      "Find storefront customers by name, phone or customer id. Returns at most 10 compact profiles.",
    label: "Customer search",
    access: TOOL_ACCESS.findCustomer,
    rowCap: 10,
  },
  getDashboardMetrics: {
    name: "getDashboardMetrics",
    description:
      "The same headline metrics the admin dashboard shows: order counts, customer counts and the inventory snapshot. Each group is included only if the operator may see it.",
    label: "Dashboard metrics",
    access: TOOL_ACCESS.getDashboardMetrics,
    rowCap: 5,
  },
};

export function canUseTool(
  name: AdminAssistantToolName,
  permissions: readonly PermissionKey[]
): boolean {
  const rule = TOOL_ACCESS[name];

  if (rule.all && !rule.all.every((p) => permissions.includes(p))) {
    return false;
  }

  if (rule.any && !rule.any.some((p) => permissions.includes(p))) {
    return false;
  }

  return true;
}

/** The tools this permission set may use, in catalogue order. */
export function selectToolNames(
  permissions: readonly PermissionKey[]
): AdminAssistantToolName[] {
  return ADMIN_ASSISTANT_TOOL_NAMES.filter((name) =>
    canUseTool(name, permissions)
  );
}

/**
 * PAGE PARITY — the gate each admin surface applies to the same data.
 *
 * This table is documentation + a test fixture. The harness asserts that every
 * tool's `TOOL_ACCESS` rule equals the gate recorded here, so a future edit to
 * either side cannot silently make the assistant more permissive than the UI.
 *
 * `getDashboardMetrics` is the one OR-gate: app/admin/page.tsx renders each
 * metric group only when the actor holds that group's permission.
 */
export const PAGE_GATE_PARITY: Record<
  Exclude<AdminAssistantToolName, "getDashboardMetrics">,
  { page: string; gate: ToolAccessRule; fields: string }
> = {
  getOrderSummary: {
    page: "app/admin/page.tsx (order block) + app/admin/orders/page.tsx",
    gate: { all: ["order.read"] },
    fields: "status counts only — the dashboard shows counts, never revenue",
  },
  listOrders: {
    page: "app/admin/orders/page.tsx -> getAdminOrderList",
    gate: { all: ["order.read"] },
    fields: "order number, status, total, placed date, customer name/email",
  },
  findOrder: {
    page: "app/admin/orders/page.tsx (search) -> getAdminOrderList",
    gate: { all: ["order.read"] },
    fields: "same columns as the order list",
  },
  getOrderDetail: {
    page: "app/admin/orders/[id]/page.tsx -> getAdminOrderById",
    gate: { all: ["order.read"] },
    fields:
      "status, tracking code, subtotal/shipping/discount/total, city+country, line items",
  },
  listLowStock: {
    page: "app/admin/inventory/page.tsx -> getAdminInventory",
    gate: { all: ["inventory.read"] },
    fields: "product, variant, SKU, stock, stock status, price",
  },
  getProductStock: {
    page: "app/admin/inventory/page.tsx -> getAdminInventory",
    gate: { all: ["inventory.read"] },
    fields: "same inventory columns, filtered by name/slug/SKU",
  },
  findCustomer: {
    page: "app/admin/customers/page.tsx -> getAdminCustomers",
    gate: { all: ["customer.read"] },
    fields:
      "name, status, joined date; order count + lifetime spend only with order.read",
  },
};

/**
 * Reference matrix from 0002_rbac_seed.sql, for documentation and the static
 * harness ONLY.
 *
 * This is inert data. No runtime module imports it, `canUseTool()` never reads
 * it, and nothing authorizes from a role name: lib/admin-assistant/tools.ts
 * builds the tool set from the live permission set resolved by lib/authz.ts and
 * re-checks it per execution. A custom role with an unusual permission set is
 * therefore handled correctly — and a renamed role changes nothing.
 */
export const SEEDED_ROLE_PERMISSIONS: Record<
  "staff" | "manager" | "admin",
  readonly PermissionKey[]
> = {
  staff: [
    "product.read",
    "product.create",
    "product.update",
    "order.read",
    "order.update",
    "inventory.read",
    "inventory.update",
    "customer.read",
    "profile.read_own",
    "profile.update_own",
  ],
  manager: [
    "product.read",
    "product.create",
    "product.update",
    "product.delete",
    "order.read",
    "order.update",
    "order.cancel",
    "inventory.read",
    "inventory.update",
    "customer.read",
    "analytics.read",
    "staff.read",
    "profile.read_own",
    "profile.update_own",
  ],
  admin: [
    "product.read",
    "product.create",
    "product.update",
    "product.delete",
    "order.read",
    "order.read_own",
    "order.create",
    "order.update",
    "order.cancel",
    "inventory.read",
    "inventory.update",
    "customer.read",
    "customer.update",
    "analytics.read",
    "staff.read",
    "staff.manage",
    "role.read",
    "role.manage",
    "audit.read",
    "profile.read_own",
    "profile.update_own",
  ],
};

/**
 * Role → tool sets, computed on demand for documentation and the harness.
 *
 * Deliberately a FUNCTION, not a module-level constant: nothing is derived from
 * the seeded matrix while the app is running, and this is never called from an
 * authorization path. `selectToolNames()` is the only consumer, and it reads the
 * permission list it is handed.
 */
export function seededRoleTools(
  role: keyof typeof SEEDED_ROLE_PERMISSIONS
): AdminAssistantToolName[] {
  return selectToolNames(SEEDED_ROLE_PERMISSIONS[role]);
}
