"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { AuthError, requireActiveActor } from "@/lib/authz";
import {
  parseWishlistProductId,
  isDuplicateWishlistError,
} from "@/lib/wishlist-core";
import type { WishlistActionState } from "@/lib/validations/wishlist";
import type { ActorContext } from "@/types";

// ---------------------------------------------------------------------------
// Wishlist server actions.
//
// Security model (see supabase/migrations/0014_wishlist.sql):
//   * Identity comes ONLY from requireActiveActor(), which resolves the
//     session through auth.getUser() + public.current_actor(). No user id is
//     ever read from the request payload.
//   * The Supabase client is the USER-SCOPED one (lib/supabase/server.ts), so
//     the insert/delete below is additionally constrained by RLS to
//     `user_id = auth.uid()`. The service-role client is deliberately not used.
//   * A suspended/banned account fails requireActiveActor() before any query,
//     and RLS would reject it anyway via public.is_active_account().
// ---------------------------------------------------------------------------

function authFailure(error: unknown): WishlistActionState {
  if (error instanceof AuthError) {
    if (error.status === 401) {
      return { code: "unauthenticated", error: error.message };
    }
    // 403 here means the session exists but the account is not active
    // (suspended/banned/pending), or holds no self-service permission.
    return { code: "restricted", error: error.message };
  }

  console.error("Wishlist authorization failed:", error);
  return {
    code: "persist_failed",
    error: "We couldn't update your wishlist. Please try again.",
  };
}

function revalidateWishlist(slug?: string | null) {
  revalidatePath("/account/wishlist");
  revalidatePath("/products");
  if (slug) revalidatePath(`/products/${slug}`);
}

/**
 * Save a product to the current customer's wishlist.
 *
 * Idempotent: saving an already-saved product returns success. The unique
 * (user_id, product_id) constraint raises 23505, which is treated as
 * "already saved" rather than surfaced as a failure.
 */
export async function addToWishlistAction(
  input: unknown
): Promise<WishlistActionState> {
  let actor: ActorContext;
  try {
    actor = await requireActiveActor();
  } catch (error) {
    return authFailure(error);
  }

  const parsed = parseWishlistProductId(input);
  if (!parsed.ok) {
    return { code: "validation", error: "Invalid product identifier." };
  }

  const { productId } = parsed;

  try {
    const supabase = await createClient();

    // The product must exist and be purchasable before it can be saved, so a
    // deactivated or deleted product can never be added to a wishlist.
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, slug, is_active")
      .eq("id", productId)
      .maybeSingle();

    if (productError) {
      console.error("Wishlist product lookup failed:", productError.message);
      return {
        code: "persist_failed",
        error: "We couldn't update your wishlist. Please try again.",
      };
    }

    if (!product || !product.is_active) {
      return {
        code: "product_unavailable",
        error: "This product is no longer available.",
      };
    }

    // `user_id` is the verified session id â€” never client input. RLS
    // (wishlist_items_insert_own) re-checks it in the database.
    const { error: insertError } = await supabase
      .from("wishlist_items")
      .insert({ user_id: actor.userId, product_id: productId });

    if (insertError && !isDuplicateWishlistError(insertError.code)) {
      console.error("Wishlist insert failed:", insertError.message);
      return {
        code: "persist_failed",
        error: "We couldn't update your wishlist. Please try again.",
      };
    }

    revalidateWishlist(product.slug);

    return { success: true, saved: true, productId };
  } catch (error) {
    console.error("Wishlist save failed:", error);
    return {
      code: "persist_failed",
      error: "We couldn't update your wishlist. Please try again.",
    };
  }
}

/**
 * Remove a product from the current customer's wishlist.
 *
 * Idempotent in the other direction: removing a product that is not saved is a
 * success, because the desired end state is already true.
 */
export async function removeFromWishlistAction(
  input: unknown
): Promise<WishlistActionState> {
  let actor: ActorContext;
  try {
    actor = await requireActiveActor();
  } catch (error) {
    return authFailure(error);
  }

  const parsed = parseWishlistProductId(input);
  if (!parsed.ok) {
    return { code: "validation", error: "Invalid product identifier." };
  }

  const { productId } = parsed;

  try {
    const supabase = await createClient();

    // Best effort: the slug is only used to revalidate the detail page, so a
    // missing product never blocks the removal.
    const { data: product } = await supabase
      .from("products")
      .select("slug")
      .eq("id", productId)
      .maybeSingle();

    // `user_id` is the verified session id. RLS (wishlist_items_delete_own)
    // re-checks it, so this can only ever delete the caller's own row.
    const { error: deleteError } = await supabase
      .from("wishlist_items")
      .delete()
      .eq("user_id", actor.userId)
      .eq("product_id", productId);

    if (deleteError) {
      console.error("Wishlist delete failed:", deleteError.message);
      return {
        code: "persist_failed",
        error: "We couldn't update your wishlist. Please try again.",
      };
    }

    revalidateWishlist(product?.slug ?? null);

    return { success: true, saved: false, productId };
  } catch (error) {
    console.error("Wishlist remove failed:", error);
    return {
      code: "persist_failed",
      error: "We couldn't update your wishlist. Please try again.",
    };
  }
}
