"use server";

import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { AuthError, requirePermission } from "@/lib/authz";
import {
  buildReviewHidePayload,
  buildReviewReportResolutionPayload,
  isMissingReviewSchema,
} from "@/lib/reviews-core";
import {
  reviewModerationSchema,
  reviewReportResolutionSchema,
  toReviewFieldErrors,
  type ReviewModerationActionState,
} from "@/lib/validations/reviews";

// ---------------------------------------------------------------------------
// Post-publication review moderation.
//
// Only `review.manage_reports` holders (manager + admin) may reach these
// actions. The permission is checked here AND re-checked inside the database:
// the UPDATE policies require public.has_permission('review.manage_reports')
// and public.is_active_account(), and the guard triggers refuse to let a
// moderator touch the customer's words.
//
// Writes run through the USER-SCOPED client on purpose. 0015 grants
// `service_role` SELECT only, because the moderator's authenticated JWT must
// reach PostgreSQL: that is what lets auth.uid(), is_active_account(),
// has_permission(), the RLS policies, the column-authority guard and the audit
// trigger all evaluate in the same transaction.
//
// The guard triggers write `review.hidden`, `review.report_resolved` and
// `review.report_dismissed` into audit_logs themselves. There is deliberately
// no application-level audit write for these events: the mutation and its audit
// row commit or roll back together, so a success can never be reported without
// its trail.
//
// Hiding a review and resolving its report are deliberately separate actions:
// a report never hides anything by itself, and hiding does not silently close
// the report that prompted it.
// ---------------------------------------------------------------------------

function authFailure(error: unknown): ReviewModerationActionState {
  if (error instanceof AuthError) {
    if (error.status === 401) {
      return { code: "unauthenticated", error: error.message };
    }

    if (error.code === "ACCOUNT_DISABLED") {
      return { code: "restricted", error: error.message };
    }

    return {
      code: "forbidden",
      error: "You do not have permission to moderate reviews.",
    };
  }

  console.error("Review moderation authorization failed:", error);
  return {
    code: "persist_failed",
    error: "We couldn't complete the moderation action. Please try again.",
  };
}

function validationFailure(error: ZodError): ReviewModerationActionState {
  return {
    code: "validation",
    error: error.issues[0]?.message ?? "Please check the moderation form.",
    fieldErrors: toReviewFieldErrors(error),
  };
}

function revalidateModerationSurfaces(slug?: string | null) {
  revalidatePath("/admin/reviews");
  revalidatePath("/admin/audit");
  revalidatePath("/products");
  if (slug) revalidatePath(`/products/${slug}`);
}

/**
 * Hide a published review after a substantiated policy violation. The reason is
 * mandatory (the database enforces >= 3 characters as well) and is recorded on
 * the review row and in the transactional audit entry.
 */
export async function hideReviewAction(
  input: unknown
): Promise<ReviewModerationActionState> {
  try {
    await requirePermission("review.manage_reports");
  } catch (error) {
    return authFailure(error);
  }

  const parsed = reviewModerationSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  const { reviewId, reason } = parsed.data;

  try {
    const supabase = await createClient();

    // Read only what the moderation decision needs. The customer's words are
    // never read here because they are never written back.
    const { data: review, error: lookupError } = await supabase
      .from("product_reviews")
      .select("id, product_id, status")
      .eq("id", reviewId)
      .maybeSingle();

    if (lookupError) {
      if (isMissingReviewSchema(lookupError)) {
        return {
          code: "not_found",
          error: "Reviews are temporarily unavailable.",
        };
      }

      console.error("Review lookup failed:", lookupError.message);
      return {
        code: "persist_failed",
        error: "We couldn't complete the moderation action. Please try again.",
      };
    }

    if (!review) {
      return { code: "not_found", error: "This review no longer exists." };
    }

    const row = review as unknown as {
      id: string;
      product_id: string;
      status: string;
    };

    // Already hidden: idempotent success. The guard trigger never fires a
    // second audit row because the status does not change.
    if (row.status === "hidden") {
      return { success: true, reviewId, status: "hidden" };
    }

    // Visibility only: `status` + `hidden_reason`. The trigger derives
    // hidden_by/hidden_at and inserts the audit row in this transaction.
    const { error: updateError } = await supabase
      .from("product_reviews")
      .update(buildReviewHidePayload(reason))
      .eq("id", reviewId);

    if (updateError) {
      const message = updateError.message ?? "";

      if (message.includes("REVIEW_HIDE_REASON_REQUIRED")) {
        return {
          code: "validation",
          error: "A reason is required to hide a review.",
        };
      }

      if (message.includes("REVIEW_STATUS_TRANSITION_INVALID")) {
        return {
          code: "validation",
          error: "This visibility change is not permitted.",
        };
      }

      if (message.includes("REVIEW_UPDATE_FORBIDDEN") || updateError.code === "42501") {
        return {
          code: "forbidden",
          error: "You do not have permission to moderate reviews.",
        };
      }

      console.error("Review hide failed:", message);
      return {
        code: "persist_failed",
        error: "We couldn't complete the moderation action. Please try again.",
      };
    }

    const { data: product } = await supabase
      .from("products")
      .select("slug")
      .eq("id", row.product_id)
      .maybeSingle();

    revalidateModerationSurfaces(
      (product as { slug?: string } | null)?.slug ?? null
    );

    return { success: true, reviewId, status: "hidden" };
  } catch (error) {
    if (isMissingReviewSchema(error as { code?: string; message?: string })) {
      return { code: "not_found", error: "Reviews are temporarily unavailable." };
    }

    console.error("Review hide failed:", error);
    return {
      code: "persist_failed",
      error: "We couldn't complete the moderation action. Please try again.",
    };
  }
}

/**
 * Close a report as `resolved` or `dismissed`. This changes only the report;
 * the review's visibility is controlled by hideReviewAction().
 */
export async function resolveReviewReportAction(
  input: unknown
): Promise<ReviewModerationActionState> {
  try {
    await requirePermission("review.manage_reports");
  } catch (error) {
    return authFailure(error);
  }

  const parsed = reviewReportResolutionSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  const { reportId, resolution, note } = parsed.data;

  try {
    const supabase = await createClient();

    const { data: report, error: lookupError } = await supabase
      .from("review_reports")
      .select("id, review_id, status")
      .eq("id", reportId)
      .maybeSingle();

    if (lookupError) {
      if (isMissingReviewSchema(lookupError)) {
        return {
          code: "not_found",
          error: "Reports are temporarily unavailable.",
        };
      }

      console.error("Report lookup failed:", lookupError.message);
      return {
        code: "persist_failed",
        error: "We couldn't complete the moderation action. Please try again.",
      };
    }

    if (!report) {
      return { code: "not_found", error: "This report no longer exists." };
    }

    const row = report as unknown as {
      id: string;
      review_id: string;
      status: string;
    };

    // Idempotent: re-submitting the same resolution does not fail or double-log.
    if (row.status !== "open") {
      return {
        success: true,
        reportId,
        reviewId: row.review_id,
        status: row.status === "resolved" ? "resolved" : "dismissed",
      };
    }

    // Only `status` + `resolution_note`. The trigger derives resolved_by,
    // resolved_at and the audit row in the same transaction.
    const { error: updateError } = await supabase
      .from("review_reports")
      .update(buildReviewReportResolutionPayload(resolution, note))
      .eq("id", reportId);

    if (updateError) {
      const message = updateError.message ?? "";

      if (message.includes("REPORT_ALREADY_RESOLVED")) {
        return {
          success: true,
          reportId,
          reviewId: row.review_id,
          status: resolution,
        };
      }

      if (message.includes("REPORT_STATUS_INVALID")) {
        return {
          code: "validation",
          error: "This report status is not permitted.",
        };
      }

      if (message.includes("REPORT_UPDATE_FORBIDDEN") || updateError.code === "42501") {
        return {
          code: "forbidden",
          error: "You do not have permission to moderate reviews.",
        };
      }

      console.error("Report resolution failed:", message);
      return {
        code: "persist_failed",
        error: "We couldn't complete the moderation action. Please try again.",
      };
    }

    revalidatePath("/admin/reviews");
    revalidatePath("/admin/audit");

    return {
      success: true,
      reportId,
      reviewId: row.review_id,
      status: resolution,
    };
  } catch (error) {
    if (isMissingReviewSchema(error as { code?: string; message?: string })) {
      return { code: "not_found", error: "Reports are temporarily unavailable." };
    }

    console.error("Report resolution failed:", error);
    return {
      code: "persist_failed",
      error: "We couldn't complete the moderation action. Please try again.",
    };
  }
}
