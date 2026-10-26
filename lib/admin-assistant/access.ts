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
  "draftCustomerEmail",
  "proposeCancelOrder",
  "proposeFulfillmentTransition",
  "proposeInventoryAdjustment",
] as const;

export type AdminAssistantToolName =
  (typeof ADMIN_ASSISTANT_TOOL_NAMES)[number];

/**
 * The one tool that produces text instead of reading rows. It is UI-only: its
 * execute() echoes its validated input, so it can never send, schedule or save
 * an email. Listed separately so the harness can prove it performs no query.
 */
export const DRAFT_TOOL_NAME = "draftCustomerEmail" as const;

/**
 * Phase 3 — proposal tools. They read the target's current state and return a
 * card; they never write. The drawer's confirmation calls the existing admin
 * server action, so validation, RBAC, the atomic RPC and audit logging all stay
 * exactly where they already are.
 *
 * Listed separately so READ_TOOL_NAMES, the page-gate parity map and the "read
 * verb only" checks can exclude them explicitly.
 */
export const PROPOSAL_TOOL_NAMES = [
  "proposeCancelOrder",
  "proposeFulfillmentTransition",
  "proposeInventoryAdjustment",
] as const;

export type ProposalToolName = (typeof PROPOSAL_TOOL_NAMES)[number];

const PROPOSAL_TOOL_SET: ReadonlySet<string> = new Set(PROPOSAL_TOOL_NAMES);

/** True for the three proposal tools; used by the harness and presentation. */
export function isProposalTool(name: string): boolean {
  return PROPOSAL_TOOL_SET.has(name);
}

/** Tools that read the database. Every one of these has a page gate. */
export const READ_TOOL_NAMES = ADMIN_ASSISTANT_TOOL_NAMES.filter(
  (name) => name !== DRAFT_TOOL_NAME && !isProposalTool(name)
) as readonly Exclude<
  AdminAssistantToolName,
  typeof DRAFT_TOOL_NAME | ProposalToolName
>[];


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
  // Drafting is part of the order workflow: only an operator who can already
  // read orders may ask the assistant to draft a customer reply for one.
  draftCustomerEmail: { all: ["order.read"] },
  // Proposals pair the READ gate of the data they inspect with the WRITE gate
  // the real action enforces, so a role can never be shown a proposal it could
  // not confirm. The RPC re-checks the same permission inside the transaction.
  proposeCancelOrder: { all: ["order.read", "order.cancel"] },
  proposeFulfillmentTransition: { all: ["order.read", "order.update"] },
  proposeInventoryAdjustment: {
    all: ["inventory.read", "inventory.update"],
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
  draftCustomerEmail: {
    name: "draftCustomerEmail",
    description:
      "Hand the operator a ready-to-review customer email. Provide the reply language (vi or en), a short subject and the body. This tool only returns the text you wrote to the drawer: it never sends, schedules or saves an email, and it reads no customer record. Base every fact on an earlier tool result or Solenne's policy, and put a visible placeholder such as [tracking number] or [ETA] where a fact is missing.",
    label: "Draft reply",
    access: TOOL_ACCESS.draftCustomerEmail,
    rowCap: 0,
  },
  proposeCancelOrder: {
    name: "proposeCancelOrder",
    description:
      "Prepare a cancellation PROPOSAL for one order: it reports the current status, the units a cancellation would return to stock and any blocker. It never cancels anything. The operator reviews the card and confirms; the existing cancellation action then re-checks permission and runs the atomic RPC.",
    label: "Cancel proposal",
    access: TOOL_ACCESS.proposeCancelOrder,
    rowCap: 0,
  },
  proposeFulfillmentTransition: {
    name: "proposeFulfillmentTransition",
    description:
      "Prepare a fulfillment PROPOSAL for one order: processing, shipped (a tracking code is required at confirmation) or delivered, or a shipped → processing rollback (a reason is required). It never changes the status itself; the operator confirms with the existing fulfillment control.",
    label: "Fulfillment proposal",
    access: TOOL_ACCESS.proposeFulfillmentTransition,
    rowCap: 0,
  },
  proposeInventoryAdjustment: {
    name: "proposeInventoryAdjustment",
    description:
      "Prepare a stock adjustment PROPOSAL for one variant: a non-zero integer delta and a written reason. It reports the current and resulting stock and any blocker. It never changes stock itself; the operator confirms with the existing inventory control.",
    label: "Stock proposal",
    access: TOOL_ACCESS.proposeInventoryAdjustment,
    rowCap: 0,
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
 *
 * `draftCustomerEmail` is deliberately absent: it reads nothing, so it has no
 * page gate to mirror. Its own gate (order.read) equals the order page gate and
 * is asserted separately by the harness.
 *
 * The three proposal tools are absent too. They mirror the SAME pages as the
 * read tools (orders / inventory) but add the write permission, and the real
 * action re-checks it; a page-gate parity row would imply the page itself
 * performs the change, which it does not.
 */
export const PAGE_GATE_PARITY: Record<
  Exclude<
    AdminAssistantToolName,
    "getDashboardMetrics" | typeof DRAFT_TOOL_NAME | ProposalToolName
  >,
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
