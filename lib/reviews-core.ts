import type {
  AdminReviewEntry,
  AdminReviewStatusFilter,
  AdminReviewView,
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
 * Only a published review by someone else may be reported.
 *
 * The application cannot know another customer's id: 0015 grants no
 * `user_id`/`reporter_id` column to `authenticated`. It only knows whether the
 * row it is rendering is the viewer's own review, which is enough to hide the
 * control. The database re-derives the author from `auth.uid()` and refuses a
 * self-report (`REVIEW_SELF_REPORT`) regardless of what the client claims.
 */
export function isReviewReportable(input: {
  status: ReviewStatus | null | undefined;
  isAuthenticated: boolean;
  isOwnReview: boolean;
}): boolean {
  if (!input.isAuthenticated) return false;
  if (input.isOwnReview) return false;
  return input.status === "published";
}

/**
 * Normalizes the per-review pseudonym generated by the database
 * (`Solenne Customer #<8 hex>`), never a profile name. Returns null when there
 * is nothing to show, so the UI renders its localized "anonymous" label
 * instead of an empty line.
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
 *
 * `PGRST202` / `42883` cover the own-review RPC: PostgREST reports a missing
 * function from the schema cache rather than a missing relation.
 */
export function isMissingReviewSchema(
  error: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  if (!error) return false;

  if (error.code === "42P01" || error.code === "PGRST205") return true;

  const message = (error.message ?? "").toLowerCase();

  if (
    message.includes("get_my_product_review") &&
    (error.code === "PGRST202" ||
      error.code === "42883" ||
      message.includes("does not exist") ||
      message.includes("could not find"))
  ) {
    return true;
  }

  if (!message.includes("does not exist") && !message.includes("could not find")) {
    return false;
  }

  return (
    message.includes("product_reviews") ||
    message.includes("review_reports") ||
    message.includes("product_review_stats")
  );
}

// ---------------------------------------------------------------------------
// Back-office "All Reviews" browsing (pure helpers).
//
// /admin/reviews has two top-level views: the report queue (moderation) and the
// review list (monitoring). These helpers own the URL contract of the second
// one — which view a request resolves to, how each filter is validated, and how
// a database row becomes a displayable entry — so the server page, the client
// table and the unit tests cannot drift apart.
//
// Nothing here reads an author UUID, purchase evidence or a moderation actor:
// migration 0015 grants `authenticated` none of those columns, and the review
// list has no use for them.
// ---------------------------------------------------------------------------

export const ADMIN_REVIEW_VIEWS = ["all", "reports"] as const;

export const ADMIN_REVIEW_STATUS_FILTERS = [
  "all",
  "published",
  "hidden",
] as const;

export const ADMIN_REVIEW_RATING_FILTERS = [5, 4, 3, 2, 1] as const;

/** Rows per page in the All Reviews table. */
export const ADMIN_REVIEW_PAGE_SIZE = 20;
/** Hard ceiling for a page number, so a hostile `?page=` cannot cost a scan. */
export const ADMIN_REVIEW_MAX_PAGE = 1000;
/** Shortest committed search term; one-character searches are skipped. */
export const ADMIN_REVIEW_SEARCH_MIN = 2;
/**
 * Longest accepted search term. Kept in step with ADMIN_SEARCH_MAX_LENGTH in
 * lib/search-utils.ts; duplicated here so this module stays dependency-free and
 * importable by the Node test runner.
 */
export const ADMIN_REVIEW_SEARCH_MAX = 80;

/**
 * True for the four report-status values the Reports view understands. Used
 * only to recognize pre-existing bookmarks such as `?status=open`, which
 * predate the `view` parameter and must keep opening the Reports view.
 */
export function isLegacyReviewReportStatus(value: unknown): boolean {
  return (
    value === "open" ||
    value === "resolved" ||
    value === "dismissed" ||
    value === "all"
  );
}

/**
 * Resolves the active top-level view.
 *
 * `view` wins whenever it is one of the known values. When it is absent (or
 * unrecognized) but a legacy report `status` parameter is present, the request
 * is an old Reports bookmark and stays on Reports. Everything else is All
 * Reviews, which is the default view of /admin/reviews.
 */
export function normalizeAdminReviewView(
  view: unknown,
  legacyReportStatus?: unknown
): AdminReviewView {
  if (
    typeof view === "string" &&
    (ADMIN_REVIEW_VIEWS as readonly string[]).includes(view)
  ) {
    return view as AdminReviewView;
  }

  return isLegacyReviewReportStatus(legacyReportStatus) ? "reports" : "all";
}

/** Unknown or missing publication status falls back to "all". */
export function normalizeAdminReviewStatusFilter(
  value: unknown
): AdminReviewStatusFilter {
  return typeof value === "string" &&
    (ADMIN_REVIEW_STATUS_FILTERS as readonly string[]).includes(value)
    ? (value as AdminReviewStatusFilter)
    : "all";
}

/**
 * Parses the rating filter. Returns a star value 1–5, or null for "all
 * ratings". Anything malformed (`"6"`, `"0"`, `"4.5"`, `"abc"`, arrays) is
 * treated as no rating filter rather than being passed to the query.
 */
export function normalizeAdminReviewRatingFilter(value: unknown): number | null {
  if (typeof value === "number") {
    return isValidReviewRating(value) ? value : null;
  }

  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!/^[1-5]$/.test(trimmed)) return null;

  const parsed = Number(trimmed);
  return isValidReviewRating(parsed) ? parsed : null;
}

/**
 * Parses a 1-based page number. Missing, non-numeric, fractional and negative
 * values all resolve to page 1; an absurdly large page is clamped so the
 * offset stays bounded.
 */
export function normalizeAdminReviewPage(value: unknown): number {
  const raw =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;

  if (!Number.isFinite(raw)) return 1;

  const page = Math.floor(raw);
  if (page < 1) return 1;

  return Math.min(page, ADMIN_REVIEW_MAX_PAGE);
}

/**
 * Bounds and sanitizes a free-text search term.
 *
 * PostgREST's `.or()` grammar is comma-separated, so a term containing commas,
 * parentheses, quotes, colons, asterisks or backslashes could rewrite the
 * filter expression. Those characters become spaces here, before the term is
 * ever interpolated. `%` and `_` are kept because they are meaningful to the
 * caller's literal search and are escaped when the LIKE pattern is built.
 */
export function normalizeAdminReviewSearch(value: unknown): string {
  if (typeof value !== "string") return "";

  return value
    .slice(0, ADMIN_REVIEW_SEARCH_MAX)
    .replace(/[,().*:"'\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * `%term%` for an ILIKE filter, or null when there is nothing to search.
 * Wildcards in the term match literally (same escaping as `escapeLikePattern`
 * in lib/search-utils.ts, repeated here to keep this module import-free).
 */
export function buildAdminReviewSearchPattern(term: unknown): string | null {
  const normalized = normalizeAdminReviewSearch(term);
  if (normalized.length === 0) return null;

  const escaped = normalized
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");

  return `%${escaped}%`;
}

/** The exact `product_reviews` columns the All Reviews query selects. */
export const ADMIN_REVIEW_COLUMNS = [
  "id",
  "product_id",
  "rating",
  "title",
  "body",
  "display_name",
  "status",
  "created_at",
  "updated_at",
] as const;

/** Row shape returned by the All Reviews query (snake_case). */
export interface AdminReviewRow {
  id: string;
  product_id: string;
  rating: number | string;
  title: string;
  body: string;
  display_name: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

/** Product label needed by one review row. */
export interface AdminReviewProductLabel {
  name: string;
  slug: string | null;
}

function normalizeRowRating(value: number | string): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(REVIEW_RATING_MAX, Math.max(0, Math.round(parsed)));
}

/**
 * Maps a database row plus its resolved product label onto the display model.
 *
 * A review whose product row could not be read still renders (with an empty
 * name, which the UI replaces with its localized "unknown product" label)
 * instead of disappearing from the list. Anything other than `hidden` is
 * treated as `published`, mirroring the two-state CHECK constraint.
 */
export function mapAdminReviewRow(
  row: AdminReviewRow,
  product: AdminReviewProductLabel | null
): AdminReviewEntry {
  const productName = typeof product?.name === "string" ? product.name.trim() : "";

  return {
    id: row.id,
    productId: row.product_id,
    productName,
    productSlug: product?.slug ?? null,
    rating: normalizeRowRating(row.rating),
    title: row.title ?? "",
    body: row.body ?? "",
    displayName: normalizeReviewDisplayName(row.display_name),
    status: row.status === "hidden" ? "hidden" : "published",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Database payload builders.
//
// 0015 is deliberately narrow about what a client may send:
//   * review INSERT   -> product_id, rating, title, body
//   * review UPDATE   -> rating, title, body
//   * report INSERT   -> review_id, reason, details
//   * review hiding   -> status, hidden_reason
//   * report closing  -> status, resolution_note
//
// Identity (`user_id`, `reporter_id`), purchase evidence (`order_item_id`),
// the public pseudonym, the moderation actor and every timestamp are derived by
// the database. These builders are the single place the application constructs
// a write payload, so the column contract is explicit and unit-testable.
// ---------------------------------------------------------------------------

/** The own-review lookup RPC from 0015 (authenticated, active accounts only). */
export const GET_MY_PRODUCT_REVIEW_RPC = "get_my_product_review" as const;

export const REVIEW_INSERT_FIELDS = [
  "product_id",
  "rating",
  "title",
  "body",
] as const;

export const REVIEW_UPDATE_FIELDS = ["rating", "title", "body"] as const;

export const REVIEW_REPORT_INSERT_FIELDS = [
  "review_id",
  "reason",
  "details",
] as const;

export const REVIEW_HIDE_FIELDS = ["status", "hidden_reason"] as const;

export const REVIEW_REPORT_RESOLUTION_FIELDS = [
  "status",
  "resolution_note",
] as const;

export interface ReviewInsertPayload {
  product_id: string;
  rating: number;
  title: string;
  body: string;
}

export interface ReviewUpdatePayload {
  rating: number;
  title: string;
  body: string;
}

export interface ReviewReportInsertPayload {
  review_id: string;
  reason: ReviewReportReason;
  details: string | null;
}

export interface ReviewHidePayload {
  status: "hidden";
  hidden_reason: string;
}

export interface ReviewReportResolutionPayload {
  status: "resolved" | "dismissed";
  resolution_note: string | null;
}

/** Four content columns; the trigger derives everything else. */
export function buildReviewInsertPayload(input: {
  productId: string;
  rating: number;
  title: string;
  body: string;
}): ReviewInsertPayload {
  return {
    product_id: input.productId,
    rating: input.rating,
    title: input.title,
    body: input.body,
  };
}

/** Authors may only rewrite their words, never identity or visibility. */
export function buildReviewUpdatePayload(input: {
  rating: number;
  title: string;
  body: string;
}): ReviewUpdatePayload {
  return {
    rating: input.rating,
    title: input.title,
    body: input.body,
  };
}

/** Three content columns; the trigger derives reporter_id and status. */
export function buildReviewReportInsertPayload(input: {
  reviewId: string;
  reason: ReviewReportReason;
  details: string | null;
}): ReviewReportInsertPayload {
  return {
    review_id: input.reviewId,
    reason: input.reason,
    details: input.details,
  };
}

/** Visibility only; hidden_by/hidden_at and the audit row are derived. */
export function buildReviewHidePayload(reason: string): ReviewHidePayload {
  return { status: "hidden", hidden_reason: reason };
}

/** Closing a report; resolved_by/resolved_at and the audit row are derived. */
export function buildReviewReportResolutionPayload(
  resolution: "resolved" | "dismissed",
  note: string | null
): ReviewReportResolutionPayload {
  return { status: resolution, resolution_note: note };
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
