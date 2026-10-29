import type { PermissionKey } from "@/types";

// ---------------------------------------------------------------------------
// Solenne management navigation model.
//
// PRESENTATION ONLY. These entries decide which links the shell *shows*; they
// never decide what an actor may *do*. Every route under /admin re-checks its
// own permission on the server (app/admin/{orders,products,inventory,
// customers,audit}/page.tsx) and the database enforces RLS on top of that, so
// hiding a link can never grant or revoke access.
//
// Each item's `requires` mirrors the exact gate used by its target route:
//   /admin/orders     requirePermission("order.read")
//   /admin/products   requireAnyPermission(["product.create", "product.update", "product.delete"])
//   /admin/inventory  requirePermission("inventory.read")
//   /admin/customers  requirePermission("customer.read")
//   /admin/reviews    requirePermission("review.manage_reports")
//   /admin/audit      requirePermission("audit.read")
//
// An empty `requires` means "any active management actor" — the layout has
// already proven MANAGEMENT_PERMISSIONS before the shell renders.
//
// Keep this file free of JSX and component imports: it is passed from the
// server layout to the client shell as props, so every field must stay
// serializable. Icons are resolved by `id` inside the client component.
// ---------------------------------------------------------------------------

export type AdminNavItemId =
  | "overview"
  | "orders"
  | "products"
  | "inventory"
  | "customers"
  | "reviews"
  | "audit";

export interface AdminNavItem {
  id: AdminNavItemId;
  href: string;
  label: string;
  labelVi: string;
  /** Permissions that grant visibility. Several entries are OR-ed. */
  requires: readonly PermissionKey[];
  /** "exact" matches only the root path; "prefix" also matches child routes. */
  match: "exact" | "prefix";
}

export interface AdminNavGroup {
  id: string;
  label: string;
  labelVi: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV_GROUPS: readonly AdminNavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    labelVi: "Tổng quan",
    items: [
      {
        id: "overview",
        href: "/admin",
        label: "Dashboard",
        labelVi: "Tổng quan",
        requires: [],
        match: "exact",
      },
    ],
  },
  {
    id: "commerce",
    label: "Commerce",
    labelVi: "Kinh doanh",
    items: [
      {
        id: "orders",
        href: "/admin/orders",
        label: "Orders",
        labelVi: "Đơn hàng",
        requires: ["order.read"],
        match: "prefix",
      },
      {
        id: "products",
        href: "/admin/products",
        label: "Products",
        labelVi: "Sản phẩm",
        requires: ["product.create", "product.update", "product.delete"],
        match: "prefix",
      },
      {
        id: "inventory",
        href: "/admin/inventory",
        label: "Inventory",
        labelVi: "Tồn kho",
        requires: ["inventory.read"],
        match: "prefix",
      },
    ],
  },
  {
    id: "oversight",
    label: "Oversight",
    labelVi: "Giám sát",
    items: [
      {
        id: "customers",
        href: "/admin/customers",
        label: "Customers",
        labelVi: "Khách hàng",
        requires: ["customer.read"],
        match: "prefix",
      },
      {
        id: "reviews",
        href: "/admin/reviews",
        label: "Reviews",
        labelVi: "Đánh giá",
        requires: ["review.manage_reports"],
        match: "prefix",
      },
      {
        id: "audit",
        href: "/admin/audit",
        label: "Audit trail",
        labelVi: "Nhật ký kiểm toán",
        requires: ["audit.read"],
        match: "prefix",
      },
    ],
  },
];

/**
 * Filter the navigation down to what the actor may actually reach.
 *
 * `permissions` must come from the trusted server actor context
 * (lib/authz.ts -> getActorContext()). Groups left without items are dropped
 * so the sidebar never renders an empty heading.
 */
export function filterAdminNav(
  permissions: readonly PermissionKey[]
): AdminNavGroup[] {
  const granted = new Set<PermissionKey>(permissions);

  return ADMIN_NAV_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    labelVi: group.labelVi,
    items: group.items.filter(
      (item) => item.requires.length === 0 || item.requires.some((p) => granted.has(p))
    ),
  })).filter((group) => group.items.length > 0);
}

/**
 * Resolve which navigation entry owns the current pathname. Used by the shell
 * to mark the active link and to render the top bar's section context.
 *
 * Longest matching prefix wins, so "/admin/products/new" resolves to Products
 * rather than the Dashboard entry.
 */
export function findAdminNavItem(pathname: string): AdminNavItem | null {
  const current = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  let best: AdminNavItem | null = null;

  for (const group of ADMIN_NAV_GROUPS) {
    for (const item of group.items) {
      if (item.match === "exact") {
        if (current === item.href) return item;
        continue;
      }

      const isChild = current === item.href || current.startsWith(`${item.href}/`);
      if (isChild && (!best || item.href.length > best.href.length)) {
        best = item;
      }
    }
  }

  return best;
}
