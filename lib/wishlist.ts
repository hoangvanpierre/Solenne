import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getActorContext, requireActiveActor } from "@/lib/authz";
import { getProductsByIds } from "@/lib/products";
import { normalizeWishlistIds } from "@/lib/wishlist-core";
import type { Product } from "@/types";

// ---------------------------------------------------------------------------
// Wishlist data layer (server only).
//
// Reads run through the user-scoped Supabase client, so RLS
// (`wishlist_items_select_own`, migration 0014) is the real row filter. The
// explicit `.eq("user_id", …)` is defence in depth, never the authority.
//
// Two entry points on purpose:
//   * getWishlistProductIdsForViewer() is GUEST-SAFE. It is called from the
//     storefront pages that render hearts, so an anonymous visitor — or a
//     degraded database — must not break the catalogue. It performs no query
//     unless there is an active account.
//   * getWishlistProducts() is STRICT. It backs /account/wishlist and throws
//     AuthError for guests/restricted accounts, which the page maps onto a
//     login redirect or RestrictedAccountNotice.
// ---------------------------------------------------------------------------

async function selectWishlistProductIds(userId: string): Promise<string[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("wishlist_items")
    .select("product_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load wishlist: ${error.message}`);
  }

  return normalizeWishlistIds(data);
}

/**
 * Saved product ids for the current viewer, or `[]` when there is nobody to
 * ask. Memoized per request so a page that hydrates several components costs a
 * single query.
 */
export const getWishlistProductIdsForViewer = cache(
  async function getWishlistProductIdsForViewer(): Promise<string[]> {
    let actor;
    try {
      actor = await getActorContext();
    } catch (error) {
      // Authorization unavailable (e.g. missing migration). Hearts degrade to
      // "unsaved" rather than taking the storefront down with them.
      console.error("Wishlist: could not resolve actor context:", error);
      return [];
    }

    if (!actor || actor.status !== "active") return [];

    try {
      return await selectWishlistProductIds(actor.userId);
    } catch (error) {
      console.error("Wishlist: failed to load saved ids:", error);
      return [];
    }
  }
);

/**
 * The current customer's wishlist as full products, newest saved first.
 * Products that have since been deactivated are dropped (they are also
 * filtered by getProductsByIds), so the list only ever links to live pages.
 */
export async function getWishlistProducts(): Promise<Product[]> {
  const actor = await requireActiveActor();
  const ids = await selectWishlistProductIds(actor.userId);

  if (ids.length === 0) return [];

  const products = await getProductsByIds(ids);
  const byId = new Map(products.map((product) => [product.id, product]));

  return ids
    .map((id) => byId.get(id))
    .filter((product): product is Product => Boolean(product));
}
