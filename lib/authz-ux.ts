import { AuthError } from "@/lib/authz";

// ---------------------------------------------------------------------------
// Boundary helpers for the AuthError thrown by lib/authz.ts.
//
// These do NOT perform or replace authorization — lib/authz.ts and the data
// layer remain the fail-closed authority. They only classify an error that
// has ALREADY been thrown, so server pages can render a deliberate
// restricted-account state instead of an error boundary:
//
//   - 401 (missing/ended session)  -> callers redirect to /login (existing UX).
//   - 403 + ACCOUNT_DISABLED       -> suspended/banned/inactive account
//     (thrown by requireActiveActor, which every require* helper runs first)
//     -> callers render RestrictedAccountNotice.
//   - 403 + FORBIDDEN              -> an authenticated user who simply lacks
//     the required permission/ownership/role. This is NOT an account
//     restriction, so callers keep the route's pre-existing behavior
//     (rethrow or generic load-failure handling) and the notice is never
//     shown for it.
//   - anything else                -> callers rethrow, so unexpected
//     application or database failures keep surfacing through normal error
//     handling and are never misreported as authorization failures.
//
// Classification keys off AuthError.code — never HTTP status alone: both
// ACCOUNT_DISABLED and generic permission denials arrive as status 403.
// ---------------------------------------------------------------------------

/**
 * True only for the ACCOUNT_DISABLED AuthError of a suspended, banned or
 * inactive account. A generic 403/FORBIDDEN denial (missing permission,
 * ownership or role) is deliberately NOT matched — it must keep the route's
 * normal forbidden/error behavior instead of being mislabeled as a
 * restricted account.
 */
export function isRestrictedAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError && error.code === "ACCOUNT_DISABLED";
}

/** True only for the 401 AuthError (missing or ended session). */
export function isUnauthenticatedAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError && error.status === 401;
}