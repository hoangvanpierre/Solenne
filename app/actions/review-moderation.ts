"use server";

import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { AuthError, requirePermission } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { isMissingReviewSchema } from "@/lib/reviews-core";
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
// the UPDATE policies require public.has_permission('review.manage_reports'),
// and the guard trigger refuses to let a moderator touch the customer's words.
//
// Every successful state change writes an audit_logs row through the admin
// client (audit_logs deliberately grants nothing to `authenticated`). Audit
// logging is best-effort and never blocks the moderation action.
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
 * mandatory (the database enforces >= 3 characters as well) and is recorded in
 * both the review row and the audit trail.
 */
export async function hideReviewAction(
  input: unknown
): Promise<ReviewModerationActionState> {
  let actor;
  try {
    actor = await requirePermission("review.manage_reports");
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

    const { data: review, error: lookupError } = await supabase
      .from("product_reviews")
      .select("id, product_id, title, status")
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
      title: string;
      status: string;
    };

    // Already hidden: idempotent success, and no duplicate audit entry.
    if (row.status === "hidden") {
      return { success: true, reviewId, status: "hidden" };
    }

    const { error: updateError } = await supabase
      .from("product_reviews")
      .update({ status: "hidden", hidden_reason: reason })
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

    await writeAuditLog({
      actorId: actor.userId,
      action: "review.hidden",
      resourceType: "review",
      resourceId: reviewId,
      metadata: {
        review_id: reviewId,
        product_id: row.product_id,
        review_title: row.title,
        reason,
      },
    });

    revalidateModerationSurfaces(
      (product as { slug?: string } | null)?.slug ?? null
    );

    return { success: true, reviewId, status: "hidden" };
  } catch (error) {
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
  let actor;
  try {
    actor = await requirePermission("review.manage_reports");
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

    const { error: updateError } = await supabase
      .from("review_reports")
      .update({ status: resolution, resolution_note: note })
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

      console.error("Report resolution failed:", message);
      return {
        code: "persist_failed",
        error: "We couldn't complete the moderation action. Please try again.",
      };
    }

    await writeAuditLog({
      actorId: actor.userId,
      action:
        resolution === "resolved"
          ? "review.report_resolved"
          : "review.report_dismissed",
      resourceType: "review",
      resourceId: row.review_id,
      metadata: {
        report_id: reportId,
        review_id: row.review_id,
        resolution,
        note,
      },
    });

    revalidatePath("/admin/reviews");
    revalidatePath("/admin/audit");

    return {
      success: true,
      reportId,
      reviewId: row.review_id,
      status: resolution,
    };
  } catch (error) {
    console.error("Report resolution failed:", error);
    return {
      code: "persist_failed",
      error: "We couldn't complete the moderation action. Please try again.",
    };
  }
}
