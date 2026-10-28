import type {
  ReviewDistribution,
  ReviewEligibility,
  ReviewReportReason,
  ReviewSort,
  ReviewStatus,
  ReviewSummary,
} from "@/types";
import type {
  ReviewErrorCode,
  ReviewModerationErrorCode,
} from "@/lib/validations/reviews";

// ---------------------------------------------------------------------------
// Pure review helpers.
//
// Deliberately free of `next/headers`, Supabase, React and runtime imports so
// the real business rules can be unit-tested directly
// (tests/unit/reviews-core.test.ts) with `node --test`.
//
// The server actions, the data layer and the client components all consume
// these functions, so there is exactly one definition of "valid rating",
// "verified purchase", "which sort is this", "what does the average look like"
// and "which localized message does this failure map to".
// ---------------------------------------------------------------------------

export const REVIEW_RATING_MIN = 1;
export const REVIEW_RATING_MAX = 5;
export const REVIEW_TITLE_MIN = 3;
export const REVIEW_TITLE_MAX = 120;
export const REVIEW_BODY_MIN = 10;
export const REVIEW_BODY_MAX = 4000;
export const REVIEW_DETAILS_MAX = 1000;
export const REVIEW_MODERATION_REASON_MIN = 3;
export const REVIEW_MODERATION_REASON_MAX = 500;
export const REVIEW_DISPLAY_NAME_MAX = 60;

/** Newest-first window the storefront loads in one request. */
export const REVIEW_LIST_LIMIT = 50;
/** Upper bound for the moderation queue. */
export const REVIEW_REPORT_QUEUE_LIMIT = 100;

/**
 * Canonical Postgres uuid shape (8-4-4-4-12 hex). Shape-only on purpose: every
 * id that reaches this check already came from a `uuid` column, and the goal is
 * to reject malformed or hostile input before any query is issued.
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a trimmed, canonical uuid string. */
export function isReviewUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

/**
 * Normalizes a client-supplied id (product, review, report) or returns null.
 *
 * Only a bare string is accepted. An object carrying `{ reviewId, userId }` is
 * rejected, so ownership and verification can never be smuggled in from the
 * client — they are derived from the session and from trusted tables.
 */
export function parseReviewUuid(input: unknown): string | null {
  if (!isReviewUuid(input)) return null;
  return input.trim();
}

/** 1–5 inclusive, integral, numeric. Rejects `3.5`, `"5"`, `0`, `6`. */
export function isValidReviewRating(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= REVIEW_RATING_MIN &&
    value <= REVIEW_RATING_MAX
  );
}

export const REVIEW_SORTS = [
  "newest",
  "oldest",
  "highest",
  "lowest",
] as const satisfies readonly ReviewSort[];

/** Unknown or missing values fall back to newest-first. */
export function normalizeReviewSort(value: unknown): ReviewSort {
  return typeof value === "string" &&
    (REVIEW_SORTS as readonly string[]).includes(value)
    ? (value as ReviewSort)
    : "newest";
}

export const REVIEW_REPORT_REASONS = [
  "spam",
  "abuse",
  "harassment",
  "personal_information",
  "irrelevant",
  "other",
] as const satisfies readonly ReviewReportReason[];

export function isReviewReportReason(
  value: unknown
): value is ReviewReportReason {
  return (
    typeof value === "string" &&
    (REVIEW_REPORT_REASONS as readonly string[]).includes(value)
  );
}

/** Message key (under `reviews.*`) for a report reason. */
export function reviewReportReasonKey(reason: ReviewReportReason): string {
  switch (reason) {
    case "spam":
      return "reasonSpam";
    case "abuse":
      return "reasonAbuse";
    case "harassment":
      return "reasonHarassment";
    case "personal_information":
      return "reasonPersonalInformation";
    case "irrelevant":
      return "reasonIrrelevant";
    case "other":
    default:
      return "reasonOther";
  }
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

interface SortableReview {
  id: string;
  rating: number;
  createdAt: string;
}

/**
 * Returns a NEW array ordered for display. The input is never mutated, so a
 * client component can keep the server order and re-sort on demand.
 *
 * Ties are broken newest-first, then by id, so the order is deterministic
 * across requests and renders.
 */
export function sortReviews<T extends SortableReview>(
  reviews: readonly T[],
  sort: ReviewSort
): T[] {
  const newestFirst = (a: T, b: T) => {
    const delta = timestamp(b.createdAt) - timestamp(a.createdAt);
    return delta !== 0 ? delta : a.id.localeCompare(b.id);
  };

  const copy = [...reviews];

  switch (sort) {
    case "oldest":
      return copy.sort((a, b) => {
        const delta = timestamp(a.createdAt) - timestamp(b.createdAt);
        return delta !== 0 ? delta : a.id.localeCompare(b.id);
      });
    case "highest":
      return copy.sort(
        (a, b) => b.rating - a.rating || newestFirst(a, b)
      );
    case "lowest":
      return copy.sort(
        (a, b) => a.rating - b.rating || newestFirst(a, b)
      );
    case "newest":
    default:
      return copy.sort(newestFirst);
  }
}

export function emptyReviewDistribution(): ReviewDistribution {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

/** Counts each star value. Out-of-range values are ignored, not coerced. */
export function computeReviewDistribution(
  ratings: readonly number[]
): ReviewDistribution {
  const distribution = emptyReviewDistribution();

  for (const rating of ratings) {
    if (!isValidReviewRating(rating)) continue;
    distribution[rating as 1 | 2 | 3 | 4 | 5] += 1;
  }

  return distribution;
}

/** Rounded to two decimals, or null when there is nothing to average. */
export function computeAverageRating(
  ratings: readonly number[]
): number | null {
  const valid = ratings.filter(isValidReviewRating);
  if (valid.length === 0) return null;

  const total = valid.reduce((sum, rating) => sum + rating, 0);
  return Math.round((total / valid.length) * 100) / 100;
}

export function buildReviewSummary(
  productId: string,
  ratings: readonly number[]
): ReviewSummary {
  return {
    productId,
    reviewCount: ratings.filter(isValidReviewRating).length,
    averageRating: computeAverageRating(ratings),
    distribution: computeReviewDistribution(ratings),
  };
}

export function emptyReviewSummary(productId: string): ReviewSummary {
  return {
    productId,
    reviewCount: 0,
    averageRating: null,
    distribution: emptyReviewDistribution(),
  };
}

/**
 * PostgREST returns `numeric` as a string, and the stats view rounds to two
 * decimals. Anything non-numeric, negative or above five becomes null rather
 * than rendering a bogus rating.
 */
export function normalizeAverageRating(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > REVIEW_RATING_MAX) {
    return null;
  }

  return Math.round(parsed * 100) / 100;
}

/** "4.5" / "—". The em dash is intentionally locale-neutral. */
export function formatAverageRating(value: number | null): string {
  return value === null ? "—" : value.toFixed(1);
}

/** Percentage width (0–100) of one distribution bar. */
export function reviewDistributionPercent(
  count: number,
  total: number
): number {
  if (!Number.isFinite(count) || !Number.isFinite(total) || total <= 0) return 0;
  const percent = (count / total) * 100;
  if (percent <= 0) return 0;
  return Math.min(100, Math.round(percent));
}

/**
 * Structural definition of a verified purchase.
 *
 * A review is valid only when the viewer owns the order, the order reached
 * `delivered`, and the order item is for the product being reviewed. This
 * mirrors the INSERT policy and the guard trigger in 0015_reviews.sql; the
 * database remains the authority — this predicate exists so the rule is
 * explicit and testable.
 */
export function qualifiesAsVerifiedPurchase(evidence: {
  viewerId: string | null | undefined;
  orderUserId: string | null | undefined;
  orderStatus: string | null | undefined;
  orderItemProductId: string | null | undefined;
  reviewedProductId: string | null | undefined;
}): boolean {
  if (!evidence.viewerId) return false;

  return (
    evidence.orderUserId === evidence.viewerId &&
    evidence.orderStatus === "delivered" &&
    Boolean(evidence.orderItemProductId) &&
    evidence.orderItemProductId === evidence.reviewedProductId
  );
}

/**
 * One review per customer per product: an existing review can be edited, never
 * duplicated. A hidden review is read-only for its author (the trigger raises
 * REVIEW_HIDDEN_READONLY), so `canEdit` is false in that state.
 */
export function resolveReviewEligibility(input: {
  hasDeliveredPurchase: boolean;
  hasReview: boolean;
  reviewStatus?: ReviewStatus | null;
}): ReviewEligibility {
  return {
    hasDeliveredPurchase: input.hasDeliveredPurchase,
    hasReview: input.hasReview,
    canWrite: input.hasDeliveredPurchase && !input.hasReview,
    canEdit: input.hasReview && input.reviewStatus !== "hidden",
  };
}

/**
 * Only a published review by someone else may be reported. Guests cannot
 * report (the database grants `anon` nothing on review_reports anyway), and
 * authors cannot report themselves.
 */
export function isReviewReportable(input: {
  status: ReviewStatus | null | undefined;
  authorId: string | null | undefined;
  viewerId: string | null | undefined;
}): boolean {
  if (!input.viewerId) return false;
  if (!input.authorId) return false;
  if (input.authorId === input.viewerId) return false;
  return input.status === "published";
}

/**
 * Normalizes the privacy-safe public name snapshotted by the trigger. Returns
 * null when there is nothing to show, so the UI renders its localized
 * "anonymous" label instead of an empty line.
 */
export function normalizeReviewDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length === 0) return null;

  return normalized.slice(0, REVIEW_DISPLAY_NAME_MAX);
}

/** Postgres unique violation: the customer already reviewed this product. */
export function isDuplicateReviewError(
  code: string | null | undefined
): boolean {
  return code === "23505";
}

/**
 * True when the review schema itself is absent (migration 0015 not applied).
 * The storefront degrades to "reviews unavailable" instead of taking the
 * product page down, while a genuine query failure is still surfaced/logged.
 */
export function isMissingReviewSchema(
  error: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  if (!error) return false;

  if (error.code === "42P01" || error.code === "PGRST205") return true;

  const message = (error.message ?? "").toLowerCase();
  if (!message.includes("does not exist") && !message.includes("could not find")) {
    return false;
  }

  return (
    message.includes("product_reviews") ||
    message.includes("review_reports") ||
    message.includes("product_review_stats")
  );
}

/**
 * Maps a failed customer action onto the `reviews.*` message key the UI should
 * render. Returning a key (not a sentence) keeps both locales correct and makes
 * the mapping testable without a DOM.
 */
export function reviewErrorKey(
  state: { code?: ReviewErrorCode } | null | undefined
): string {
  switch (state?.code) {
    case "unauthenticated":
      return "errorSignIn";
    case "restricted":
      return "errorRestricted";
    case "validation":
      return "errorValidation";
    case "not_eligible":
      return "errorNotEligible";
    case "duplicate":
      return "errorDuplicate";
    case "hidden_readonly":
      return "errorHiddenReadonly";
    case "not_found":
      return "errorNotFound";
    case "not_reportable":
      return "errorNotReportable";
    case "self_report":
      return "errorSelfReport";
    case "already_reported":
      return "errorAlreadyReported";
    case "unavailable":
      return "errorUnavailable";
    case "persist_failed":
    default:
      return "errorSubmit";
  }
}

/** Same idea for the back-office moderation controls. */
export function reviewModerationErrorKey(
  state: { code?: ReviewModerationErrorCode } | null | undefined
): string {
  switch (state?.code) {
    case "unauthenticated":
      return "errorSignIn";
    case "restricted":
      return "errorRestricted";
    case "forbidden":
      return "errorForbidden";
    case "validation":
      return "errorValidation";
    case "not_found":
      return "errorNotFound";
    case "persist_failed":
    default:
      return "errorGeneric";
  }
}
