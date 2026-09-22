import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type {
  AccountStatus,
  ActorContext,
  PermissionKey,
  RoleName,
} from "@/types";

// ---------------------------------------------------------------------------
// Solenne server-side authorization layer.
//
// Source of truth is the DATABASE: profiles.role_id -> roles ->
// role_permissions -> permissions. Every lookup below derives from the
// authenticated session (auth.getUser()) plus trusted database rows — never
// from client-supplied values (request bodies, headers, query strings,
// localStorage, URL params).
//
// Resolution goes through public.current_actor(), a SECURITY DEFINER RPC
// granted to `authenticated` and scoped internally to auth.uid(). This is why
// the secret-key client is not needed here: a caller may read only its own
// role/status/permissions, while role_permissions and permissions stay
// unreadable to non-admins under RLS.
//
// Fail-closed: if the RPC is unavailable (migrations 0001-0003 not applied)
// this throws instead of inventing a role, so protected operations deny
// rather than silently granting self-service rights.
// ---------------------------------------------------------------------------

interface CurrentActorRow {
  user_id: string;
  role: string | null;
  role_rank: number | null;
  status: string | null;
  permissions: string[] | null;
}

export class AuthError extends Error {
  status: 401 | 403;
  code: "UNAUTHENTICATED" | "FORBIDDEN" | "ACCOUNT_DISABLED";

  constructor(
    status: 401 | 403,
    code: "UNAUTHENTICATED" | "FORBIDDEN" | "ACCOUNT_DISABLED",
    message: string
  ) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.code = code;
  }
}

function forbidden(message: string): AuthError {
  return new AuthError(403, "FORBIDDEN", message);
}

function unauthenticated(): AuthError {
  return new AuthError(401, "UNAUTHENTICATED", "Please sign in to continue.");
}

/** Authenticated user id, or throws 401. Never returns a nullable user. */
export async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw unauthenticated();

  return user.id;
}

/**
 * Resolve the caller's actor context from the database.
 *
 * Returns null when there is no session. A session without a resolvable role
 * yields an empty permission set (fail closed) rather than a default role.
 * Suspended/banned/pending accounts are returned as-is — the require* helpers
 * below reject them, and the database reports an empty permission set for
 * them, so the application layer, the database helper functions and RLS all
 * agree.
 */
async function resolveActorContext(): Promise<ActorContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase.rpc("current_actor");

  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error(
        "Authorization is unavailable: public.current_actor() is missing. Apply supabase/migrations/0001-0003."
      );
    }
    throw new Error(`Failed to resolve account: ${error.message}`);
  }

  const row = data as unknown as CurrentActorRow | null;
  if (!row) {
    return { userId: user.id, role: null, status: null, permissions: [] };
  }

  // Defence in depth: the RPC is scoped to auth.uid() internally, so a
  // mismatch means the database function was replaced with something unsafe.
  if (row.user_id !== user.id) {
    throw new Error(
      "Authorization aborted: current_actor() returned another account's context."
    );
  }

  return {
    userId: user.id,
    role: (row.role ?? null) as RoleName | null,
    status: (row.status ?? null) as AccountStatus | null,
    permissions: (row.permissions ?? []) as PermissionKey[],
  };
}

/**
 * Per-request memoized actor context. React's cache() dedupes within a single
 * render pass (and degrades to a plain call outside one), so a page that reads
 * orders, addresses and profile details resolves authorization once.
 */
export const getActorContext: () => Promise<ActorContext | null> =
  cache(resolveActorContext);

/**
 * Authenticated AND status = 'active'. This is the gate that makes account
 * suspension effective everywhere: a suspended account keeps its role but
 * loses every permission, so it fails here and in RLS simultaneously.
 */
export async function requireActiveActor(): Promise<ActorContext> {
  const actor = await getActorContext();

  if (!actor) throw unauthenticated();

  if (actor.status !== "active") {
    throw new AuthError(
      403,
      "ACCOUNT_DISABLED",
      "This account is not active. Please contact support."
    );
  }

  return actor;
}

/**
 * Authenticated, active, and holding the permission. 401 when there is no
 * session; 403 when the account is not active or the permission is missing.
 */
export async function requirePermission(
  permission: PermissionKey
): Promise<ActorContext> {
  const actor = await requireActiveActor();

  if (!actor.permissions.includes(permission)) {
    // Generic message — never reveals which permission was missing.
    throw forbidden("You do not have permission to perform this action.");
  }

  return actor;
}

/**
 * Authenticated, active, and holding at least one of the permissions. Use for
 * routes reachable through several permissions (e.g. a page that renders for
 * anyone who may read at least one of the resources it shows).
 */
export async function requireAnyPermission(
  permissions: PermissionKey[]
): Promise<ActorContext> {
  const actor = await requireActiveActor();

  if (!permissions.some((p) => actor.permissions.includes(p))) {
    throw forbidden("You do not have permission to perform this action.");
  }

  return actor;
}

/**
 * Resource-level authorization for the caller's OWN data.
 *
 * `userId` must come from the authenticated session, never from user input.
 * When `permission` is given the caller must also hold it, which keeps the
 * permission a real part of the decision instead of a UI-only convention.
 */
export async function requireOwnership(
  userId: string,
  permission?: PermissionKey
): Promise<ActorContext> {
  const actor = await requireActiveActor();

  if (permission && !actor.permissions.includes(permission)) {
    throw forbidden("You do not have permission to perform this action.");
  }

  if (actor.userId !== userId) {
    throw forbidden("You can only access your own account data.");
  }

  return actor;
}


/**
 * Owner OR holder of `permission`. This is how staff/admin read another
 * customer's data (e.g. `order.read`) while customers stay limited to their
 * own rows. RLS applies the same rule independently in the database, so a
 * caller who never reaches this function still cannot cross-read.
 */
export async function requireOwnershipOrPermission(
  userId: string,
  permission?: PermissionKey
): Promise<ActorContext> {
  const actor = await requireActiveActor();

  if (actor.userId === userId) return actor;

  if (permission && actor.permissions.includes(permission)) return actor;

  throw forbidden("You do not have permission to perform this action.");
}

/** Minimum role rank, mirroring the rank column seeded in 0002. */
const ROLE_RANK: Record<RoleName, number> = {
  customer: 10,
  staff: 20,
  manager: 30,
  admin: 40,
};

/**
 * Authenticated, active, and at-or-above the given role in the hierarchy.
 * Prefer requirePermission for feature checks; use this for coarse gates such
 * as "/admin requires staff or above".
 */
export async function requireRole(role: RoleName): Promise<ActorContext> {
  const actor = await requireActiveActor();

  if (!actor.role || ROLE_RANK[actor.role] < ROLE_RANK[role]) {
    throw forbidden("You do not have permission to perform this action.");
  }

  return actor;
}

/**
 * Translate an AuthError into the action-state shape every server action in
 * this codebase returns, so actions can `catch (e) { return
 * authErrorState(e, fallback); }` instead of inventing per-action messages.
 */
export function authErrorState(
  error: unknown,
  fallbackMessage = "You do not have permission to perform this action."
): { error: string } {
  if (error instanceof AuthError) {
    return { error: error.message };
  }
  return { error: fallbackMessage };
}

