import { requirePermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import {
  ADMIN_REVIEW_COLUMNS,
  ADMIN_REVIEW_PAGE_SIZE,
  REVIEW_REPORT_QUEUE_LIMIT,
  buildAdminReviewSearchPattern,
  isReviewUuid,
  mapAdminReviewRow,
  normalizeAdminReviewPage,
  normalizeAdminReviewRatingFilter,
  normalizeAdminReviewStatusFilter,
  normalizeReviewDisplayName,
  type AdminReviewRow,
} from "@/lib/reviews-core";
import type {
  AdminReviewProductOption,
  AdminReviewQueryResult,
  AdminReviewReportEntry,
  AdminReviewStatusCounts,
  ReportedReview,
  ReviewReport,
  ReviewReportReason,
  ReviewReportStatus,
} from "@/types";

// ---------------------------------------------------------------------------
// Post-publication moderation queue (server only).
//
// Reads go through the USER-SCOPED client: the review_reports SELECT policy
// grants a manager/admin (review.manage_reports) every report, while a customer
// would only ever see their own. The permission is checked here as well, so a
// direct call cannot read the queue through this helper.
//
// This queue exists only AFTER publication. There is no pre-publication
// approval step anywhere in the feature.
// ---------------------------------------------------------------------------

export const REVIEW_REPORT_STATUS_FILTERS = [
  "open",
  "resolved",
  "dismissed",
  "all",
] as const;

export type ReviewReportStatusFilter =
  (typeof REVIEW_REPORT_STATUS_FILTERS)[number];

export function normalizeReviewReportStatusFilter(
  value: unknown
): ReviewReportStatusFilter {
  return typeof value === "string" &&
    (REVIEW_REPORT_STATUS_FILTERS as readonly string[]).includes(value)
    ? (value as ReviewReportStatusFilter)
    : "open";
}

interface ReportRow {
  id: string;
  review_id: string;
  reason: string;
  details: string | null;
  status: string;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
}

interface ReviewRow {
  id: string;
  product_id: string;
  rating: number | string;
  title: string;
  body: string;
  display_name: string | null;
  status: string;
  created_at: string;
}

interface ProductRow {
  id: string;
  name: string;
  slug: string;
}

function toNumber(value: number | string): number {
  return typeof value === "string" ? Number(value) : value;
}

function mapReport(row: ReportRow): ReviewReport {
  return {
    id: row.id,
    reviewId: row.review_id,
    reason: row.reason as ReviewReportReason,
    details: row.details,
    status: row.status as ReviewReportStatus,
    resolutionNote: row.resolution_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Reports for the moderation queue, newest first, each with the review it
 * targets. Missing reviews (theoretically impossible thanks to the cascade)
 * are returned with `review: null` instead of dropping the report silently.
 */
export async function getAdminReviewReports(
  filter: ReviewReportStatusFilter = "open"
): Promise<AdminReviewReportEntry[]> {
  await requirePermission("review.manage_reports");

  const supabase = await createClient();

  let query = supabase
    .from("review_reports")
    .select(
      "id, review_id, reason, details, status, resolution_note, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(REVIEW_REPORT_QUEUE_LIMIT);

  if (filter !== "all") {
    query = query.eq("status", filter);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load review reports: ${error.message}`);
  }

  const reports = ((data ?? []) as unknown as ReportRow[]).map(mapReport);
  if (reports.length === 0) return [];

  const reviewIds = Array.from(new Set(reports.map((r) => r.reviewId)));

  const { data: reviewRows, error: reviewError } = await supabase
    .from("product_reviews")
    .select(
      "id, product_id, rating, title, body, display_name, status, created_at"
    )
    .in("id", reviewIds);

  if (reviewError) {
    throw new Error(`Failed to load reported reviews: ${reviewError.message}`);
  }

  const reviewById = new Map<string, ReviewRow>();
  for (const row of (reviewRows ?? []) as unknown as ReviewRow[]) {
    reviewById.set(row.id, row);
  }

  const productIds = Array.from(
    new Set(
      [...reviewById.values()].map((review) => review.product_id).filter(Boolean)
    )
  );

  const productById = new Map<string, ProductRow>();
  if (productIds.length > 0) {
    const { data: productRows, error: productError } = await supabase
      .from("products")
      .select("id, name, slug")
      .in("id", productIds);

    if (productError) {
      throw new Error(
        `Failed to load reported products: ${productError.message}`
      );
    }

    for (const row of (productRows ?? []) as unknown as ProductRow[]) {
      productById.set(row.id, row);
    }
  }

  return reports.map((report) => {
    const row = reviewById.get(report.reviewId);
    if (!row) return { report, review: null };

    const product = productById.get(row.product_id);

    const review: ReportedReview = {
      id: row.id,
      productId: row.product_id,
      productName: product?.name ?? "",
      productSlug: product?.slug ?? null,
      rating: toNumber(row.rating),
      title: row.title,
      body: row.body,
      displayName: normalizeReviewDisplayName(row.display_name),
      status: row.status === "hidden" ? "hidden" : "published",
      createdAt: row.created_at,
    };

    return { report, review };
  });
}

/** Open-report count for the page header. Returns null when unavailable. */
export async function countOpenReviewReports(): Promise<number | null> {
  await requirePermission("review.manage_reports");

  const supabase = await createClient();
  const { count, error } = await supabase
    .from("review_reports")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");

  if (error) {
    console.warn("Failed to count open review reports:", error.message);
    return null;
  }

  return count ?? 0;
}

// ---------------------------------------------------------------------------
// All Reviews browsing (server only).
//
// This is the MONITORING half of /admin/reviews: it lists the review table
// itself, with its product, rating, pseudonym and publication state. It is not
// a moderation surface — there is no hide, edit, delete or publish control
// here, and nothing in this module writes a row.
//
// Reads go through the USER-SCOPED client and the same permission the report
// queue uses (review.manage_reports). That is the boundary the SELECT policy in
// 0015 already enforces, so no new permission, grant or policy is involved and
// the secret-key client is never used.
//
// Privacy: only the columns `authenticated` was granted are selected. The
// author UUID, the purchase evidence and the moderation actor are neither
// selected nor filtered on, and the reviewer is shown through the pseudonym the
// database generated.
// ---------------------------------------------------------------------------

/** Bounds the product filter's option list; the catalogue is far smaller. */
export const ADMIN_REVIEW_PRODUCT_OPTIONS_LIMIT = 100;

const REVIEW_SELECT_COLUMNS = ADMIN_REVIEW_COLUMNS.join(", ");

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

interface PostgrestErrorLike {
  code?: string | null;
  message?: string | null;
}

/**
 * Wraps a query failure without losing the Postgres error code, so the page can
 * still distinguish "schema missing" (PGRST205/42P01) from a real failure. A
 * failed query is always thrown, never turned into an empty list.
 */
function reviewDataError(context: string, error: PostgrestErrorLike): Error {
  const wrapped = new Error(
    `${context}: ${error.message ?? "unknown database error"}`
  );
  (wrapped as Error & { code?: string | null }).code = error.code ?? null;
  return wrapped;
}

/** Batched product labels for one page of reviews (no N+1 request). */
async function loadProductLabels(
  supabase: SupabaseServerClient,
  productIds: string[]
): Promise<Map<string, ProductRow>> {
  const productById = new Map<string, ProductRow>();
  if (productIds.length === 0) return productById;

  const { data, error } = await supabase
    .from("products")
    .select("id, name, slug")
    .in("id", productIds);

  if (error) {
    throw reviewDataError("Failed to load review products", error);
  }

  for (const row of (data ?? []) as unknown as ProductRow[]) {
    productById.set(row.id, row);
  }

  return productById;
}

export interface AdminReviewQueryParams {
  /** 1-based page from the URL; validated by normalizeAdminReviewPage. */
  page?: unknown;
  /** "all" | "published" | "hidden". */
  status?: unknown;
  /** 1–5, or anything else for "all ratings". */
  rating?: unknown;
  /** Product UUID for the product filter; malformed values are ignored. */
  productId?: unknown;
  /** Free text matched against title, body and the reviewer pseudonym. */
  search?: unknown;
}

/**
 * One page of customer reviews, newest first, with an exact filtered total.
 *
 * Filters, search and pagination are all applied server-side and bounded: the
 * page size is fixed, the page number is clamped, the search term is sanitized
 * before it reaches PostgREST, and only the products on this page are looked up.
 */
export async function getAdminReviews(
  params: AdminReviewQueryParams = {}
): Promise<AdminReviewQueryResult> {
  await requirePermission("review.manage_reports");

  const supabase = await createClient();

  const page = normalizeAdminReviewPage(params.page);
  const limit = ADMIN_REVIEW_PAGE_SIZE;
  const offset = (page - 1) * limit;

  const status = normalizeAdminReviewStatusFilter(params.status);
  const rating = normalizeAdminReviewRatingFilter(params.rating);
  const productId = isReviewUuid(params.productId)
    ? String(params.productId).trim()
    : null;

  let query = supabase
    .from("product_reviews")
    .select(REVIEW_SELECT_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  if (rating !== null) {
    query = query.eq("rating", rating);
  }

  if (productId) {
    query = query.eq("product_id", productId);
  }

  const pattern = buildAdminReviewSearchPattern(params.search);
  if (pattern) {
    // Values are sanitized and wildcard-escaped before interpolation; the three
    // columns are all granted to authenticated in 0015.
    query = query.or(
      `title.ilike.${pattern},body.ilike.${pattern},display_name.ilike.${pattern}`
    );
  }

  const { data, count, error } = await query;

  if (error) {
    throw reviewDataError("Failed to load reviews", error);
  }

  const rows = (data ?? []) as unknown as AdminReviewRow[];

  // A stale bookmark can point past the last page (e.g. after reviews were
  // hidden). Re-run once on the real last page instead of rendering an empty
  // list beside a truthful but useless "page 999" label. The recursion depth is
  // one: the last page's offset is always inside the result set.
  if (count !== null && count > 0 && offset >= count) {
    return getAdminReviews({ ...params, page: Math.ceil(count / limit) });
  }

  const productById = await loadProductLabels(
    supabase,
    Array.from(new Set(rows.map((row) => row.product_id).filter(Boolean)))
  );

  const reviews = rows.map((row) => {
    const product = productById.get(row.product_id);
    return mapAdminReviewRow(
      row,
      product ? { name: product.name, slug: product.slug } : null
    );
  });

  // `count` is exact because the query asks for it. The fallback is only a
  // lower bound for the (unexpected) case PostgREST omits it, and is never
  // presented as a total when the header counts are unavailable.
  const totalCount = count ?? offset + reviews.length;
  const hasMore =
    count !== null ? offset + reviews.length < count : reviews.length === limit;

  return { reviews, totalCount, page, limit, hasMore };
}

/**
 * Unfiltered publication totals for the page header.
 *
 * Two head requests (`published`, `hidden`) plus an exact sum. `total` is exact
 * rather than an estimate because `product_reviews.status` only accepts those
 * two values. Returns null when the counts cannot be read, so the header shows
 * no numbers instead of inventing them.
 */
export async function getAdminReviewStatusCounts(): Promise<AdminReviewStatusCounts | null> {
  await requirePermission("review.manage_reports");

  const supabase = await createClient();

  const [published, hidden] = await Promise.all([
    supabase
      .from("product_reviews")
      .select("id", { count: "exact", head: true })
      .eq("status", "published"),
    supabase
      .from("product_reviews")
      .select("id", { count: "exact", head: true })
      .eq("status", "hidden"),
  ]);

  if (published.error || hidden.error) {
    console.warn(
      "Failed to count reviews by status:",
      published.error?.message ?? hidden.error?.message
    );
    return null;
  }

  const publishedCount = published.count ?? 0;
  const hiddenCount = hidden.count ?? 0;

  return {
    total: publishedCount + hiddenCount,
    published: publishedCount,
    hidden: hiddenCount,
  };
}

/**
 * Product options for the All Reviews product filter, alphabetical and bounded.
 * Inactive products are included on purpose: a review of a deactivated piece
 * still exists and must stay findable.
 */
export async function getAdminReviewProductOptions(): Promise<
  AdminReviewProductOption[]
> {
  await requirePermission("review.manage_reports");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select("id, name, slug")
    .order("name", { ascending: true })
    .limit(ADMIN_REVIEW_PRODUCT_OPTIONS_LIMIT);

  if (error) {
    throw reviewDataError("Failed to load review product options", error);
  }

  return ((data ?? []) as unknown as ProductRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug ?? null,
  }));
}
