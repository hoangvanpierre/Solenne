import { z } from "zod";
import {
  REVIEW_BODY_MAX,
  REVIEW_BODY_MIN,
  REVIEW_DETAILS_MAX,
  REVIEW_MODERATION_REASON_MAX,
  REVIEW_MODERATION_REASON_MIN,
  REVIEW_REPORT_REASONS,
  REVIEW_RATING_MAX,
  REVIEW_RATING_MIN,
  REVIEW_TITLE_MAX,
  REVIEW_TITLE_MIN,
  isReviewUuid,
} from "@/lib/reviews-core";

// ---------------------------------------------------------------------------
// Review validation + action-state contracts.
//
// The client supplies only content and ids. It can never supply `user_id`,
// `order_item_id`, `display_name`, `status` or any hidden_* field: the server
// action derives identity from requireActiveActor(), and the database grants
// INSERT only on (product_id, user_id, rating, title, body) while the guard
// trigger derives the purchase evidence, the public name and the status.
//
// The rating/count bounds live in lib/reviews-core.ts so the form, the schema
// and the unit tests share one definition.
// ---------------------------------------------------------------------------

export const reviewInputSchema = z.object({
  productId: z
    .string()
    .trim()
    .refine(isReviewUuid, "Invalid product identifier."),
  // Form values may arrive as strings; coerce then enforce the integer range.
  rating: z.coerce
    .number()
    .int()
    .min(REVIEW_RATING_MIN, "Choose a rating between 1 and 5 stars.")
    .max(REVIEW_RATING_MAX, "Choose a rating between 1 and 5 stars."),
  title: z
    .string()
    .trim()
    .min(
      REVIEW_TITLE_MIN,
      `A title needs at least ${REVIEW_TITLE_MIN} characters.`
    )
    .max(
      REVIEW_TITLE_MAX,
      `A title cannot exceed ${REVIEW_TITLE_MAX} characters.`
    ),
  body: z
    .string()
    .trim()
    .min(
      REVIEW_BODY_MIN,
      `A review needs at least ${REVIEW_BODY_MIN} characters.`
    )
    .max(
      REVIEW_BODY_MAX,
      `A review cannot exceed ${REVIEW_BODY_MAX} characters.`
    ),
});

export type ReviewInput = z.infer<typeof reviewInputSchema>;

export const reviewReportSchema = z.object({
  reviewId: z.string().trim().refine(isReviewUuid, "Invalid review identifier."),
  reason: z.enum(REVIEW_REPORT_REASONS, {
    message: "Choose a reason for the report.",
  }),
  details: z
    .string()
    .trim()
    .max(
      REVIEW_DETAILS_MAX,
      `Details cannot exceed ${REVIEW_DETAILS_MAX} characters.`
    )
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
});

export type ReviewReportInput = z.infer<typeof reviewReportSchema>;

/** Hiding a review is a manager action and always needs a written reason. */
export const reviewModerationSchema = z.object({
  reviewId: z.string().trim().refine(isReviewUuid, "Invalid review identifier."),
  reason: z
    .string()
    .trim()
    .min(
      REVIEW_MODERATION_REASON_MIN,
      `A reason needs at least ${REVIEW_MODERATION_REASON_MIN} characters.`
    )
    .max(
      REVIEW_MODERATION_REASON_MAX,
      `A reason cannot exceed ${REVIEW_MODERATION_REASON_MAX} characters.`
    ),
});

export type ReviewModerationInput = z.infer<typeof reviewModerationSchema>;

export const reviewReportResolutionSchema = z.object({
  reportId: z.string().trim().refine(isReviewUuid, "Invalid report identifier."),
  resolution: z.enum(["resolved", "dismissed"], {
    message: "Choose how this report was handled.",
  }),
  note: z
    .string()
    .trim()
    .max(
      REVIEW_MODERATION_REASON_MAX,
      `A note cannot exceed ${REVIEW_MODERATION_REASON_MAX} characters.`
    )
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
});

export type ReviewReportResolutionInput = z.infer<
  typeof reviewReportResolutionSchema
>;

/**
 * Machine-readable failure reasons. The UI maps these onto localized copy
 * (messages/*.json `reviews.*`) instead of rendering the English `error`
 * string, so a failure is never shown in the wrong language.
 */
export type ReviewErrorCode =
  | "unauthenticated"
  | "restricted"
  | "validation"
  | "not_eligible"
  | "duplicate"
  | "hidden_readonly"
  | "not_found"
  | "not_reportable"
  | "self_report"
  | "already_reported"
  | "unavailable"
  | "persist_failed";

export type ReviewActionState = {
  success?: boolean;
  code?: ReviewErrorCode;
  /** English fallback for logs/tests; the UI prefers `code`. */
  error?: string;
  fieldErrors?: Record<string, string[]>;
  productId?: string;
  reviewId?: string;
};

export type ReviewModerationErrorCode =
  | "unauthenticated"
  | "restricted"
  | "forbidden"
  | "validation"
  | "not_found"
  | "persist_failed";

export type ReviewModerationActionState = {
  success?: boolean;
  code?: ReviewModerationErrorCode;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  reviewId?: string;
  reportId?: string;
  status?: "hidden" | "resolved" | "dismissed";
};

/** Flattens Zod issues into the field → messages shape the forms consume. */
export function toReviewFieldErrors(
  error: z.ZodError
): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join(".") || "form";
    if (!fieldErrors[path]) fieldErrors[path] = [];
    fieldErrors[path].push(issue.message);
  }

  return fieldErrors;
}
