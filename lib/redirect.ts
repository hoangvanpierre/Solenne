/**
 * Validate a user-controlled post-login redirect target (`next`).
 *
 * S-2 (open redirect): `next` arrives from the `?next=` query parameter and is
 * submitted with the login/register forms. It must only ever point to an
 * internal path of this application — never an external or protocol-relative
 * URL, and never a dangerous scheme (javascript:, data:, ...).
 *
 * This is intentionally stricter than a `startsWith("/")` check, which would
 * still accept protocol-relative targets like `//evil.example`.
 *
 * Rules:
 *  - accepts relative internal paths (path + optional query/hash), e.g.
 *    `/account`, `/account/orders`, `/checkout/success?x=1`
 *  - rejects absolute URLs (`https://evil.example`), protocol-relative URLs
 *    (`//evil.example`), backslash tricks (`/\evil.example`), control
 *    characters, and anything that does not parse to this fixed base origin
 *  - never returns a value that could redirect outside the current origin
 *
 * Safe fallback for invalid, missing, or unsafe values: `/account`.
 *
 * Pure and synchronous so the same rule can be applied on the server (server
 * actions — authoritative) and in the auth client forms (defense in depth).
 */
import type { ActorContext, PermissionKey } from "@/types";

const BASE_ORIGIN = "https://solenne.internal";
export const FALLBACK_PATH = "/account";

// Back-office management permissions (consistent with 0002_rbac_seed.sql & app/admin/layout.tsx)
export const MANAGEMENT_PERMISSIONS: PermissionKey[] = [
  "product.create",
  "product.update",
  "product.delete",
  "order.read",
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
];

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

export function sanitizeNextPath(value: string | null | undefined): string;
export function sanitizeNextPath(
  value: string | null | undefined,
  fallback: null
): string | null;
export function sanitizeNextPath(
  value: string | null | undefined,
  fallback: string | null
): string | null;
export function sanitizeNextPath(
  value: string | null | undefined,
  fallback: string | null = FALLBACK_PATH
): string | null {
  if (typeof value !== "string") return fallback;

  const target = value.trim();
  if (target === "") return fallback;

  // Internal paths start with exactly one "/". A leading "//" is a
  // protocol-relative URL (//evil.example) and must be rejected.
  if (!target.startsWith("/") || target.startsWith("//")) return fallback;

  // Browsers normalize "\" to "/" in URLs, so "/\evil.example" would become
  // protocol-relative after a redirect. Reject backslashes outright.
  if (target.includes("\\")) return fallback;

  // Control characters (tabs, newlines, NUL) can be used to smuggle a scheme
  // past naive prefix checks or to split headers.
  if (hasControlChars(target)) return fallback;

  // Parse against a fixed base origin. Absolute URLs, protocol-relative URLs,
  // or anything that resolves to a different origin will fail the checks below.
  let url: URL;
  try {
    url = new URL(target, BASE_ORIGIN);
  } catch {
    return fallback; // malformed value
  }

  if (url.origin !== BASE_ORIGIN || url.protocol !== "https:") {
    return fallback;
  }

  // Return only same-origin path components — never a full URL.
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Check if the actor holds any management permission.
 */
export function hasManagementAccess(actor: ActorContext | null): boolean {
  if (!actor || actor.status !== "active") return false;
  return MANAGEMENT_PERMISSIONS.some((p) => actor.permissions.includes(p));
}

/**
 * Determine the default post-login landing destination based on actor role & status.
 *
 * Rules:
 *  - Non-active status (suspended, banned, pending, null) -> "/account"
 *  - Role admin, manager, or staff with management permissions -> "/admin"
 *  - Role customer or active user without management permissions -> "/account"
 */
export function getRoleDefaultPath(actor: ActorContext | null): string {
  if (!actor || actor.status !== "active") {
    return FALLBACK_PATH;
  }

  if (
    (actor.role === "admin" ||
      actor.role === "manager" ||
      actor.role === "staff") &&
    hasManagementAccess(actor)
  ) {
    return "/admin";
  }

  return FALLBACK_PATH;
}

/**
 * Centralized server-side post-login destination resolver.
 *
 * Precedence rules:
 * 1. If actor is restricted (non-active status), unconditionally return "/account".
 * 2. If an explicit, sanitized `next` path was supplied:
 *    - If it's a management route (/admin*):
 *      - Allowed if actor is active AND holds management permissions.
 *      - Otherwise falls back to role default (/account).
 *    - If it's the generic customer destination (/account, /account/, /account?..., /account#...):
 *      - For active management actors (admin, manager, staff), treat as the
 *        customer fallback and route to role default (/admin).
 *      - For customers, return /account.
 *    - If it's a specific storefront route (/checkout, /account/orders, /products, /, etc.):
 *      - Allowed for all active actors (customers, staff, managers, admins).
 *    - If it points to an auth entry route (/login, /register, etc.):
 *      - Falls back to role default (prevent looping back to auth forms).
 * 3. When no explicit next path exists (or next is invalid/empty):
 *    - Returns role default via getRoleDefaultPath(actor).
 */
export function resolvePostLoginPath(
  actor: ActorContext | null,
  rawOrSanitizedNext?: string | null
): string {
  // Restricted accounts (suspended, banned, pending) must NEVER enter back-office
  if (!actor || actor.status !== "active") {
    return FALLBACK_PATH;
  }

  const roleDefault = getRoleDefaultPath(actor);

  // If next is not provided or empty, use role default
  if (!rawOrSanitizedNext || rawOrSanitizedNext.trim() === "") {
    return roleDefault;
  }

  // Sanitize next with null fallback to distinguish valid next vs invalid
  const target = sanitizeNextPath(rawOrSanitizedNext, null);
  if (!target) {
    return roleDefault;
  }

  // Prevent redirecting back to auth pages
  if (
    target === "/login" ||
    target.startsWith("/login?") ||
    target === "/register" ||
    target.startsWith("/register?")
  ) {
    return roleDefault;
  }

  // Management routes require management permissions
  if (target.startsWith("/admin")) {
    if (hasManagementAccess(actor)) {
      return target;
    }
    // Actor lacks management access: fall back to role default
    return roleDefault;
  }

  // Generic customer account destination (/account, /account/, /account?...)
  // is treated as the customer fallback. For active management actors,
  // route to their management default (/admin) instead.
  // Specific storefront destinations like /account/orders, /checkout, etc.
  // are preserved.
  const targetPathname = target.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (targetPathname === "/account" && hasManagementAccess(actor)) {
    return roleDefault;
  }

  // Storefront / customer routes (e.g. /checkout, /account/orders, /products)
  // are accessible to all authenticated, active actors
  return target;
}
