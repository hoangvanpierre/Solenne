import { createClient } from "@/lib/supabase/server";
import { getActorContext, requireActiveActor } from "@/lib/authz";
import { getProductsByIds } from "@/lib/products";
import { getOrdersForUser } from "@/lib/orders";
import {
  REVIEW_LIST_LIMIT,
  buildReviewSummary,
  emptyReviewSummary,
  isMissingReviewSchema,
  normalizeAverageRating,
  normalizeReviewDisplayName,
  resolveReviewEligibility,
} from "@/lib/reviews-core";
import type {
  ProductReview,
  ProductReviewsPageData,
  ReviewDistribution,
  ReviewEligibility,
  ReviewableItem,
  ReviewSummary,
} from "@/types";

// ---------------------------------------------------------------------------
// Review data layer (server only).
//
// Reads run through the USER-SCOPED Supabase client, so RLS is the real row
// filter:
//   * anonymous visitors reach only `status = 'published'` rows, and only the
//     publishable columns (0015 revokes SELECT on user_id/order_item_id);
//   * customers additionally reach their own rows (including a hidden review);
//   * managers/admins may read everything for investigation.
//
// The explicit `.eq("status", "published")` and `.eq("user_id", …)` filters are
// defence in depth, never the authority.
//
// Two entry points on purpose:
//   * getProductReviewsPageData() is GUEST-SAFE and degrades to
//     `available: false` when migration 0015 is absent, so the product page
//     still renders.
//   * getReviewEligibilityForViewer() / getReviewableDeliveredItems() are
//     STRICT and throw AuthError for guests or restricted accounts; the server
//     actions and /account/orders map that onto their normal auth handling.
// ---------------------------------------------------------------------------

interface ReviewRow {
  id: string;
  product_id: string;
  rating: number | string;
  title: string;
  body: string;
  display_name: string | null;
  status: string;
  hidden_reason?: string | null;
  created_at: string;
  updated_at: string;
}

interface ReviewStatsRow {
  product_id: string;
  review_count: number | string;
  average_rating: number | string | null;
  rating_1: number | string;
  rating_2: number | string;
  rating_3: number | string;
  rating_4: number | string;
  rating_5: number | string;
}

interface ReportIdRow {
  review_id: string;
}

interface DeliveredOrderRow {
  id: string;
  order_number: string;
  created_at: string;
}

const REVIEW_COLUMNS =
  "id, product_id, rating, title, body, display_name, status, hidden_reason, created_at, updated_at";

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "string" ? Number(value) : value;
}

function mapReview(row: ReviewRow): ProductReview {
  return {
    id: row.id,
    productId: row.product_id,
    rating: toNumber(row.rating),
    title: row.title,
    body: row.body,
    displayName: normalizeReviewDisplayName(row.display_name),
    status: row.status === "hidden" ? "hidden" : "published",
    hiddenReason: row.hidden_reason ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDistribution(row: ReviewStatsRow): ReviewDistribution {
  return {
    1: toNumber(row.rating_1),
    2: toNumber(row.rating_2),
    3: toNumber(row.rating_3),
    4: toNumber(row.rating_4),
    5: toNumber(row.rating_5),
  };
}

/**
 * Published reviews, newest first. Guests and customers both reach this
 * through the same public policy; a customer's hidden review is excluded by
 * the explicit status filter (they see it through `ownReview` instead).
 */
export async function getPublishedReviews(
  productId: string
): Promise<ProductReview[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("product_reviews")
    .select(REVIEW_COLUMNS)
    .eq("product_id", productId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(REVIEW_LIST_LIMIT);

  if (error) {
    throw new Error(`Failed to load reviews: ${error.message}`);
  }

  return (data as unknown as ReviewRow[]).map(mapReview);
}

/**
 * Aggregates from `public.product_review_stats` (security_invoker view, so the
 * caller's RLS applies and only published rows are counted).
 */
export async function getProductReviewSummary(
  productId: string
): Promise<ReviewSummary> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("product_review_stats")
    .select(
      "product_id, review_count, average_rating, rating_1, rating_2, rating_3, rating_4, rating_5"
    )
    .eq("product_id", productId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load review summary: ${error.message}`);
  }

  if (!data) return emptyReviewSummary(productId);

  const row = data as unknown as ReviewStatsRow;

  return {
    productId: row.product_id,
    reviewCount: toNumber(row.review_count),
    averageRating: normalizeAverageRating(row.average_rating),
    distribution: mapDistribution(row),
  };
}

async function selectOwnReview(
  productId: string,
  userId: string
): Promise<ProductReview | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("product_reviews")
    .select(REVIEW_COLUMNS)
    .eq("product_id", productId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load your review: ${error.message}`);
  }

  return data ? mapReview(data as unknown as ReviewRow) : null;
}

/**
 * True when the customer owns a delivered order containing this product —
 * exactly the evidence the INSERT policy and guard trigger require.
 */
async function hasDeliveredPurchaseForProduct(
  productId: string,
  userId: string
): Promise<boolean> {
  const supabase = await createClient();

  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "delivered")
    .limit(100);

  if (ordersError) {
    throw new Error(
      `Failed to load delivered orders: ${ordersError.message}`
    );
  }

  const orderIds = ((orders ?? []) as DeliveredOrderRow[]).map((o) => o.id);
  if (orderIds.length === 0) return false;

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("id")
    .eq("product_id", productId)
    .in("order_id", orderIds)
    .limit(1);

  if (itemsError) {
    throw new Error(
      `Failed to verify the delivered product: ${itemsError.message}`
    );
  }

  return (items ?? []).length > 0;
}

async function reportedReviewIds(
  reviewIds: readonly string[],
  userId: string
): Promise<string[]> {
  if (reviewIds.length === 0) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("review_reports")
    .select("review_id")
    .eq("reporter_id", userId)
    .in("review_id", [...reviewIds]);

  if (error) {
    // Reporting state is a convenience for the UI; it must never break the
    // review list. RLS already limits these rows to the caller's own reports.
    console.warn("Reviews: failed to load reported ids:", error.message);
    return [];
  }

  return ((data ?? []) as ReportIdRow[]).map((row) => row.review_id);
}

async function resolveViewer() {
  try {
    return await getActorContext();
  } catch (error) {
    // Authorization unavailable (e.g. missing migration). The storefront
    // degrades to guest behaviour rather than taking the product page down.
    console.error("Reviews: could not resolve actor context:", error);
    return null;
  }
}

function guestPageData(
  productId: string,
  available: boolean,
  reviews: ProductReview[],
  summary: ReviewSummary
): ProductReviewsPageData {
  return {
    available,
    reviews,
    summary,
    ownReview: null,
    eligibility: resolveReviewEligibility({
      hasDeliveredPurchase: false,
      hasReview: false,
    }),
    reportedReviewIds: [],
    isAuthenticated: false,
  };
}

/**
 * Everything the product-detail reviews section renders, in one server pass.
 * A missing review schema yields `available: false` rather than an exception.
 */
export async function getProductReviewsPageData(
  productId: string
): Promise<ProductReviewsPageData> {
  const actor = await resolveViewer();
  const activeActor = actor && actor.status === "active" ? actor : null;

  let available = true;
  let reviews: ProductReview[] = [];
  let summary = emptyReviewSummary(productId);

  try {
    reviews = await getPublishedReviews(productId);
  } catch (error) {
    if (!isMissingReviewSchema(error as { code?: string; message?: string })) {
      console.error("Reviews: failed to load published reviews:", error);
    }
    available = false;
  }

  if (available) {
    try {
      summary = await getProductReviewSummary(productId);
    } catch (error) {
      if (!isMissingReviewSchema(error as { code?: string; message?: string })) {
        console.error("Reviews: failed to load summary:", error);
      }
      // The view ships with the table; if only the view is missing we can still
      // show an honest aggregate for the loaded window.
      summary = buildReviewSummary(
        productId,
        reviews.map((review) => review.rating)
      );
    }
  }

  if (!available) {
    return guestPageData(productId, false, [], emptyReviewSummary(productId));
  }

  if (!activeActor) {
    return guestPageData(productId, true, reviews, summary);
  }

  let ownReview: ProductReview | null = null;
  try {
    ownReview = await selectOwnReview(productId, activeActor.userId);
  } catch (error) {
    if (!isMissingReviewSchema(error as { code?: string; message?: string })) {
      console.error("Reviews: failed to load own review:", error);
    }
  }

  let hasDeliveredPurchase = false;
  try {
    hasDeliveredPurchase = await hasDeliveredPurchaseForProduct(
      productId,
      activeActor.userId
    );
  } catch (error) {
    console.error("Reviews: failed to verify purchase:", error);
  }

  const reportedIds = await reportedReviewIds(
    reviews.map((review) => review.id),
    activeActor.userId
  );

  return {
    available: true,
    reviews,
    summary,
    ownReview,
    eligibility: resolveReviewEligibility({
      hasDeliveredPurchase,
      hasReview: Boolean(ownReview),
      reviewStatus: ownReview?.status ?? null,
    }),
    reportedReviewIds: reportedIds,
    isAuthenticated: true,
  };
}

/**
 * Eligibility for the current viewer. STRICT: throws AuthError for guests and
 * restricted accounts, and re-reads the evidence from the database so a stale
 * client form can never create an ineligible review.
 */
export async function getReviewEligibilityForViewer(
  productId: string
): Promise<ReviewEligibility> {
  const actor = await requireActiveActor();

  const ownReview = await selectOwnReview(productId, actor.userId);
  const hasDeliveredPurchase = await hasDeliveredPurchaseForProduct(
    productId,
    actor.userId
  );

  return resolveReviewEligibility({
    hasDeliveredPurchase,
    hasReview: Boolean(ownReview),
    reviewStatus: ownReview?.status ?? null,
  });
}

/**
 * Delivered products the customer can review (or has already reviewed), ready
 * for the "awaiting your review" list on /account/orders.
 *
 * Deliberately filtered to ACTIVE products: a deactivated product's page
 * 404s, so offering a link to review it would be a dead end. Inactive products
 * keep their existing reviews.
 */
export async function getReviewableDeliveredItems(): Promise<ReviewableItem[]> {
  const actor = await requireActiveActor();
  const orders = await getOrdersForUser(actor.userId, 100);

  const candidates = new Map<
    string,
    {
      productId: string;
      orderId: string;
      orderNumber: string;
      orderCreatedAt: string;
    }
  >();

  for (const order of orders) {
    if (order.status !== "delivered") continue;

    for (const item of order.items) {
      if (!item.productId || candidates.has(item.productId)) continue;

      candidates.set(item.productId, {
        productId: item.productId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderCreatedAt: order.createdAt,
      });
    }
  }

  const productIds = [...candidates.keys()];
  if (productIds.length === 0) return [];

  const products = await getProductsByIds(productIds);
  const productById = new Map(products.map((product) => [product.id, product]));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_reviews")
    .select("id, product_id")
    .eq("user_id", actor.userId)
    .in("product_id", productIds);

  if (error) {
    throw new Error(`Failed to load your reviews: ${error.message}`);
  }

  const reviewByProduct = new Map<string, string>();
  for (const row of (data ?? []) as { id: string; product_id: string }[]) {
    reviewByProduct.set(row.product_id, row.id);
  }

  const items: ReviewableItem[] = [];

  for (const candidate of candidates.values()) {
    const product = productById.get(candidate.productId);
    if (!product) continue;

    items.push({
      ...candidate,
      productName: product.name,
      productSlug: product.slug,
      reviewId: reviewByProduct.get(candidate.productId) ?? null,
    });
  }

  return items;
}
