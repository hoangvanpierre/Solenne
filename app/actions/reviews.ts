"use server";

import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { AuthError, requireActiveActor } from "@/lib/authz";
import { getReviewEligibilityForViewer } from "@/lib/reviews";
import {
  isDuplicateReviewError,
  isMissingReviewSchema,
} from "@/lib/reviews-core";
import {
  reviewInputSchema,
  reviewReportSchema,
  toReviewFieldErrors,
  type ReviewActionState,
} from "@/lib/validations/reviews";

// ---------------------------------------------------------------------------
// Verified review server actions (customer side).
//
// Security model (see supabase/migrations/0015_reviews.sql):
//   * Identity comes ONLY from requireActiveActor(), which resolves the session
//     through auth.getUser() + public.current_actor(). No user id is ever read
//     from the request payload, so a forged `userId` is simply ignored.
//   * The Supabase client is the USER-SCOPED one (lib/supabase/server.ts), so
//     every write is additionally constrained by RLS and by the guard triggers.
//     The service-role client is deliberately not used here.
//   * Eligibility is re-checked against `orders`/`order_items` before the
//     insert. The database then proves the same thing again inside the
//     transaction, derives `order_item_id`/`display_name`/`status` itself, and
//     rejects a review without a delivered purchase.
//   * Only rating/title/body are ever sent. `status`, `display_name`,
//     `order_item_id` and hidden_* are not writable by a customer (the INSERT
//     grant does not include them, and the UPDATE trigger pins them).
// ---------------------------------------------------------------------------

function authFailure(error: unknown): ReviewActionState {
  if (error instanceof AuthError) {
    if (error.status === 401) {
      return { code: "unauthenticated", error: error.message };
    }
    // 403 here means the session exists but the account is not active
    // (suspended/banned/pending), or holds no self-service permission.
    return { code: "restricted", error: error.message };
  }

  console.error("Review authorization failed:", error);
  return {
    code: "persist_failed",
    error: "We couldn't save your review. Please try again.",
  };
}

function validationFailure(error: ZodError): ReviewActionState {
  return {
    code: "validation",
    error: error.issues[0]?.message ?? "Please check the review form.",
    fieldErrors: toReviewFieldErrors(error),
  };
}

function revalidateReviewSurfaces(slug?: string | null) {
  if (slug) revalidatePath(`/products/${slug}`);
  revalidatePath("/products");
  revalidatePath("/account/orders");
  revalidatePath("/admin/reviews");
}

async function selectProductSlug(
  productId: string
): Promise<{ slug: string | null; isActive: boolean } | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select("slug, is_active")
    .eq("id", productId)
    .maybeSingle();

  if (error) {
    console.error("Review product lookup failed:", error.message);
    return null;
  }

  if (!data) return null;

  return { slug: data.slug ?? null, isActive: Boolean(data.is_active) };
}

/**
 * Publish a review immediately.
 *
 * Eligibility is structural: the customer must own a delivered order item for
 * the product, and may only review it once. A duplicate (23505) is reported as
 * `duplicate` so the UI can switch to the edit form instead of failing
 * opaquely.
 */
export async function createReviewAction(
  input: unknown
): Promise<ReviewActionState> {
  let actor;
  try {
    actor = await requireActiveActor();
  } catch (error) {
    return authFailure(error);
  }

  const parsed = reviewInputSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  const { productId, rating, title, body } = parsed.data;

  try {
    const product = await selectProductSlug(productId);
    if (!product || !product.isActive) {
      return {
        code: "unavailable",
        error: "This piece is no longer available for review.",
      };
    }

    const eligibility = await getReviewEligibilityForViewer(productId);

    if (!eligibility.hasDeliveredPurchase) {
      return {
        code: "not_eligible",
        error: "A review requires a delivered order for this piece.",
      };
    }

    if (eligibility.hasReview) {
      return {
        code: "duplicate",
        error: "You have already reviewed this piece. You can edit it instead.",
      };
    }

    const supabase = await createClient();

    // `user_id` is the verified session id — never client input. RLS
    // (product_reviews_insert_own) and the guard trigger re-check it.
    const { data, error } = await supabase
      .from("product_reviews")
      .insert({
        product_id: productId,
        user_id: actor.userId,
        rating,
        title,
        body,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      if (isDuplicateReviewError(error.code)) {
        return {
          code: "duplicate",
          error: "You have already reviewed this piece. You can edit it instead.",
        };
      }

      const message = error.message ?? "";
      if (message.includes("REVIEW_ELIGIBILITY_REQUIRED")) {
        return {
          code: "not_eligible",
          error: "A review requires a delivered order for this piece.",
        };
      }

      // 42501 = RLS rejection (not the owner, wrong status, inactive account).
      if (error.code === "42501") {
        return {
          code: "not_eligible",
          error: "A review requires a delivered order for this piece.",
        };
      }

      if (isMissingReviewSchema(error)) {
        return {
          code: "unavailable",
          error: "Reviews are temporarily unavailable. Please try again later.",
        };
      }

      console.error("Review insert failed:", message);
      return {
        code: "persist_failed",
        error: "We couldn't save your review. Please try again.",
      };
    }

    revalidateReviewSurfaces(product.slug);

    return { success: true, reviewId: data?.id, productId };
  } catch (error) {
    if (isMissingReviewSchema(error as { code?: string; message?: string })) {
      return {
        code: "unavailable",
        error: "Reviews are temporarily unavailable. Please try again later.",
      };
    }

    console.error("Review creation failed:", error);
    return {
      code: "persist_failed",
      error: "We couldn't save your review. Please try again.",
    };
  }
}

/**
 * Edit the caller's existing review. The unique (user_id, product_id) pair
 * means repeat purchases never create a second rating; they update this row.
 * A hidden review is read-only, and the trigger enforces that.
 */
export async function updateReviewAction(
  input: unknown
): Promise<ReviewActionState> {
  let actor;
  try {
    actor = await requireActiveActor();
  } catch (error) {
    return authFailure(error);
  }

  const parsed = reviewInputSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  const { productId, rating, title, body } = parsed.data;

  try {
    const product = await selectProductSlug(productId);
    if (!product) {
      return { code: "not_found", error: "This piece no longer exists." };
    }

    const supabase = await createClient();

    // Only content is sent. The trigger pins identity, evidence, the public
    // name and the visibility fields, and refuses to edit a hidden review.
    const { data, error } = await supabase
      .from("product_reviews")
      .update({ rating, title, body })
      .eq("product_id", productId)
      .eq("user_id", actor.userId)
      .select("id")
      .maybeSingle();

    if (error) {
      const message = error.message ?? "";

      if (message.includes("REVIEW_HIDDEN_READONLY")) {
        return {
          code: "hidden_readonly",
          error: "A hidden review cannot be edited.",
        };
      }

      if (isMissingReviewSchema(error)) {
        return {
          code: "unavailable",
          error: "Reviews are temporarily unavailable. Please try again later.",
        };
      }

      console.error("Review update failed:", message);
      return {
        code: "persist_failed",
        error: "We couldn't update your review. Please try again.",
      };
    }

    if (!data) {
      return {
        code: "not_found",
        error: "We couldn't find your review for this piece.",
      };
    }

    revalidateReviewSurfaces(product.slug);

    return { success: true, reviewId: data.id, productId };
  } catch (error) {
    if (isMissingReviewSchema(error as { code?: string; message?: string })) {
      return {
        code: "unavailable",
        error: "Reviews are temporarily unavailable. Please try again later.",
      };
    }

    console.error("Review update failed:", error);
    return {
      code: "persist_failed",
      error: "We couldn't update your review. Please try again.",
    };
  }
}

/**
 * Report a published review. A report never hides anything by itself: it lands
 * in the moderation queue, and hiding is a separate, audited manager action.
 * One report per customer per review (unique review_id + reporter_id).
 */
export async function reportReviewAction(
  input: unknown
): Promise<ReviewActionState> {
  let actor;
  try {
    actor = await requireActiveActor();
  } catch (error) {
    return authFailure(error);
  }

  const parsed = reviewReportSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  const { reviewId, reason, details } = parsed.data;

  try {
    const supabase = await createClient();

    // `reporter_id` is the verified session id. The trigger rejects a report
    // on a hidden review and a report on the caller's own review.
    const { error } = await supabase.from("review_reports").insert({
      review_id: reviewId,
      reporter_id: actor.userId,
      reason,
      details,
    });

    if (error) {
      if (isDuplicateReviewError(error.code)) {
        return {
          code: "already_reported",
          error: "You have already reported this review.",
        };
      }

      const message = error.message ?? "";

      if (message.includes("REVIEW_NOT_REPORTABLE")) {
        return {
          code: "not_reportable",
          error: "This review is no longer available to report.",
        };
      }

      if (message.includes("REVIEW_SELF_REPORT")) {
        return {
          code: "self_report",
          error: "You cannot report your own review.",
        };
      }

      if (message.includes("REVIEW_NOT_FOUND")) {
        return { code: "not_found", error: "This review no longer exists." };
      }

      if (isMissingReviewSchema(error)) {
        return {
          code: "unavailable",
          error: "Reviews are temporarily unavailable. Please try again later.",
        };
      }

      console.error("Review report failed:", message);
      return {
        code: "persist_failed",
        error: "We couldn't send your report. Please try again.",
      };
    }

    revalidatePath("/admin/reviews");

    return { success: true, reviewId };
  } catch (error) {
    if (isMissingReviewSchema(error as { code?: string; message?: string })) {
      return {
        code: "unavailable",
        error: "Reviews are temporarily unavailable. Please try again later.",
      };
    }

    console.error("Review report failed:", error);
    return {
      code: "persist_failed",
      error: "We couldn't send your report. Please try again.",
    };
  }
}
