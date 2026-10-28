import { requirePermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import {
  REVIEW_REPORT_QUEUE_LIMIT,
  normalizeReviewDisplayName,
} from "@/lib/reviews-core";
import type {
  AdminReviewReportEntry,
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
