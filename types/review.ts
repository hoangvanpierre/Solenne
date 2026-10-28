// ---------------------------------------------------------------------------
// Verified customer reviews (migration 0015).
//
// Every review in this model is a *verified purchase* by construction: the
// database refuses to insert a row unless the author owns a delivered order
// item for the product. That is why there is no `isVerified` field to pass
// around — the review exists, therefore it is verified.
//
// The public model deliberately omits `userId` and `orderItemId`. Neither is
// ever exposed to the storefront; the database grants anonymous readers only
// the publishable columns (see 0015_reviews.sql).
// ---------------------------------------------------------------------------

export type ReviewStatus = "published" | "hidden";

/** Storefront ordering of the loaded review window. */
export type ReviewSort = "newest" | "oldest" | "highest" | "lowest";

export type ReviewReportReason =
  | "spam"
  | "abuse"
  | "harassment"
  | "personal_information"
  | "irrelevant"
  | "other";

export type ReviewReportStatus = "open" | "resolved" | "dismissed";

/** A review as the storefront and the author's own surface may see it. */
export interface ProductReview {
  id: string;
  productId: string;
  /** 1–5, guaranteed by a CHECK constraint and re-validated in the app. */
  rating: number;
  title: string;
  body: string;
  /** Privacy-safe snapshot of the author's profile name, or null. */
  displayName: string | null;
  status: ReviewStatus;
  /** Present on the author's own hidden review; null for public rows. */
  hiddenReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ReviewDistribution = Record<1 | 2 | 3 | 4 | 5, number>;

export interface ReviewSummary {
  productId: string;
  reviewCount: number;
  /** Rounded to two decimals, or null when there is nothing to average. */
  averageRating: number | null;
  distribution: ReviewDistribution;
}

/**
 * Whether the current customer may write or edit a review for a product.
 * `hasDeliveredPurchase` is derived from `orders` + `order_items` on the
 * server; `hasReview` from the caller's own row.
 */
export interface ReviewEligibility {
  hasDeliveredPurchase: boolean;
  hasReview: boolean;
  canWrite: boolean;
  canEdit: boolean;
}

/**
 * A delivered product the customer could review (or has already reviewed).
 * Backs the "awaiting your review" list on /account/orders.
 */
export interface ReviewableItem {
  productId: string;
  productName: string;
  productSlug: string | null;
  orderId: string;
  orderNumber: string;
  orderCreatedAt: string;
  /** Existing review id, or null when the piece has not been reviewed yet. */
  reviewId: string | null;
}

export interface ReviewReport {
  id: string;
  reviewId: string;
  /**
   * The reporter's identity is deliberately not carried here: the moderation
   * queue only needs the complaint, and a profile UUID is an internal id that
   * has no business leaving the database.
   */
  reason: ReviewReportReason;
  details: string | null;
  status: ReviewReportStatus;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The review a report points at, as the moderation queue renders it. */
export interface ReportedReview {
  id: string;
  productId: string;
  productName: string;
  productSlug: string | null;
  rating: number;
  title: string;
  body: string;
  displayName: string | null;
  status: ReviewStatus;
  createdAt: string;
}

/** One row of the moderation queue: a report plus the review it targets. */
export interface AdminReviewReportEntry {
  report: ReviewReport;
  review: ReportedReview | null;
}

/** Everything the product-detail reviews section needs in one round trip. */
export interface ProductReviewsPageData {
  /** False when the review schema/query is unavailable; the UI degrades. */
  available: boolean;
  reviews: ProductReview[];
  summary: ReviewSummary;
  ownReview: ProductReview | null;
  eligibility: ReviewEligibility;
  /** Reviews the current customer has already reported. */
  reportedReviewIds: string[];
  isAuthenticated: boolean;
}
