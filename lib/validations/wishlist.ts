import { z } from "zod";
import { isWishlistProductId } from "@/lib/wishlist-core";

// ---------------------------------------------------------------------------
// Wishlist validation + action-state contract.
//
// The only client-supplied value in this feature is a product id. The owner of
// a row is NEVER accepted from the client: app/actions/wishlist.ts derives
// `user_id` from the verified session (requireActiveActor) and the database
// re-checks it in RLS. This schema exists so a malformed or forged id is
// rejected before any query is issued.
//
// The uuid rule itself lives in lib/wishlist-core.ts so the exact same
// predicate is used by the server action and by the unit tests.
// ---------------------------------------------------------------------------

export const wishlistProductIdSchema = z
  .string()
  .trim()
  .refine(isWishlistProductId, "Invalid product identifier.");

export type WishlistProductId = z.infer<typeof wishlistProductIdSchema>;

/**
 * Machine-readable failure reasons. The UI maps these onto localized copy
 * (messages/*.json `wishlist.*`) instead of rendering the English `error`
 * string, so a failure is never shown in the wrong language.
 */
export type WishlistErrorCode =
  | "unauthenticated"
  | "restricted"
  | "validation"
  | "product_unavailable"
  | "persist_failed";

export type WishlistActionState = {
  success?: boolean;
  code?: WishlistErrorCode;
  /** English fallback for logs/tests; the UI prefers `code`. */
  error?: string;
  /** Echoed back so an optimistic client can reconcile the right row. */
  productId?: string;
  /** Authoritative saved state after the mutation. */
  saved?: boolean;
};
