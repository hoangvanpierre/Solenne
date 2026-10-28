import type {
  WishlistActionState,
  WishlistErrorCode,
} from "@/lib/validations/wishlist";

// ---------------------------------------------------------------------------
// Pure wishlist helpers.
//
// Deliberately free of `next/headers`, Supabase, React AND runtime imports so
// the real business rules can be unit-tested directly
// (tests/unit/wishlist-core.test.ts) with `node --test` instead of being
// asserted through source-code string matching. (`@/lib/validations/wishlist`
// is a TYPE-ONLY import, erased at runtime, so it does not pull zod in here.)
//
// The server action, the data layer and the client store all consume these
// functions, so there is exactly one definition of "valid id", "idempotent
// add", "toggle" and "which localized message does this failure map to".
// ---------------------------------------------------------------------------

/**
 * Canonical Postgres uuid shape (8-4-4-4-12 hex). Intentionally shape-only:
 * version/variant bits are not constrained, because every id that reaches this
 * check already came from a `uuid` column, and the goal is to reject malformed
 * or hostile input before any query is issued.
 */
const PRODUCT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a trimmed, canonical uuid string. */
export function isWishlistProductId(value: unknown): value is string {
  return typeof value === "string" && PRODUCT_ID_PATTERN.test(value.trim());
}

export type ParsedWishlistProductId =
  | { ok: true; productId: string }
  | { ok: false };

/**
 * Validates the only client-supplied value in the feature.
 *
 * A bare uuid string is the only accepted shape: an object carrying
 * `{ productId, userId }` is rejected, so ownership can never be smuggled in
 * from the client. The owner is derived from the verified session in
 * app/actions/wishlist.ts and re-checked by RLS.
 */
export function parseWishlistProductId(input: unknown): ParsedWishlistProductId {
  if (!isWishlistProductId(input)) return { ok: false };
  return { ok: true, productId: input.trim() };
}

/**
 * Postgres unique-violation. The add operation is idempotent: the second save
 * of the same (user_id, product_id) pair is a success, not an error.
 */
export function isDuplicateWishlistError(
  code: string | null | undefined
): boolean {
  return code === "23505";
}

/**
 * Returns the next id collection for a save/unsave, without mutating the
 * input. Newly saved ids go to the front because the wishlist is displayed
 * newest-first. Unsaving removes every occurrence (the unique constraint makes
 * duplicates impossible server-side, but a client store must stay consistent
 * even if it somehow holds one).
 */
export function applyWishlistToggle(
  ids: readonly string[],
  productId: string,
  saved: boolean
): string[] {
  if (!productId) return [...ids];

  const without = ids.filter((id) => id !== productId);
  return saved ? [productId, ...without] : without;
}

/** True when the product is currently saved. */
export function isWishlistSaved(
  ids: readonly string[],
  productId: string
): boolean {
  return ids.includes(productId);
}

/**
 * Normalizes the `product_id` column values returned by Supabase into a
 * deduplicated id list, preserving server order (newest first).
 */
export function normalizeWishlistIds(rows: unknown): string[] {
  if (!Array.isArray(rows)) return [];

  const seen = new Set<string>();
  const ids: string[] = [];

  for (const row of rows) {
    const value =
      typeof row === "string"
        ? row
        : row && typeof row === "object" && "product_id" in row
          ? (row as { product_id?: unknown }).product_id
          : null;

    if (typeof value !== "string" || value.length === 0) continue;
    if (seen.has(value)) continue;

    seen.add(value);
    ids.push(value);
  }

  return ids;
}

/**
 * Maps a failed action result onto the `wishlist.*` message key the UI should
 * render. Returning a key (not a sentence) keeps both locales correct and makes
 * the mapping testable without a DOM.
 */
export function wishlistErrorKey(
  state: WishlistActionState | null | undefined
): string {
  const code: WishlistErrorCode | undefined = state?.code;

  switch (code) {
    case "unauthenticated":
      return "errorSignIn";
    case "restricted":
      return "errorRestricted";
    case "product_unavailable":
      return "errorUnavailable";
    case "validation":
    case "persist_failed":
    default:
      return "actionError";
  }
}

/**
 * True only for a relative, internal path that is safe to hand to the login
 * form. Mirrors the intent of `sanitizeNextPath` (lib/redirect.ts) so the
 * client never even proposes a target the server would reject:
 *   - must start with a single "/" (rejects "https://…", "javascript:…")
 *   - rejects protocol-relative "//host" and backslash tricks "/\host"
 *   - rejects control characters
 */
export function isSafeWishlistReturnPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (value.includes("\\")) return false;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return false;
  }

  return true;
}

/**
 * Builds the login return path for a guest who taps a heart. The target is
 * always an internal path (never a full URL), and the login action re-validates
 * it through `sanitizeNextPath` on submit.
 */
export function wishlistLoginHref(pathname: string): string {
  const target = isSafeWishlistReturnPath(pathname) ? pathname : "/account";
  return `/login?next=${encodeURIComponent(target)}`;
}
