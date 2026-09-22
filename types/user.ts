export type RoleName = "customer" | "staff" | "manager" | "admin";

export type AccountStatus = "active" | "suspended" | "banned" | "pending";

// Explicit permission catalogue — no wildcards. The database
// (public.permissions) is the source of truth; this union only keeps
// call sites type-safe. Keep it in sync with 0002_rbac_seed.sql.
export type PermissionKey =
  | "product.read"
  | "product.create"
  | "product.update"
  | "product.delete"
  | "order.read"
  | "order.read_own"
  | "order.create"
  | "order.update"
  | "order.cancel"
  | "inventory.read"
  | "inventory.update"
  | "customer.read"
  | "customer.update"
  | "analytics.read"
  | "staff.read"
  | "staff.manage"
  | "role.read"
  | "role.manage"
  | "audit.read"
  | "profile.read_own"
  | "profile.update_own";

export interface Role {
  id: string;
  name: RoleName;
  description?: string;
  rank: number;
}

export interface Permission {
  id: string;
  key: PermissionKey;
  description?: string;
}

// What server-side authorization resolves for the current caller.
// role may be null when the RBAC migration has not been applied yet.
export interface ActorContext {
  userId: string;
  role: RoleName | null;
  status: AccountStatus | null;
  permissions: PermissionKey[];
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface Address {
  id: string;
  userId: string;
  label?: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

export interface Review {
  id: string;
  productId: string;
  userId: string;
  rating: number;
  title?: string;
  body: string;
  isVerified: boolean;
  createdAt: string;
  userName: string;
}
