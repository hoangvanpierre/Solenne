import test from "node:test";
import assert from "node:assert/strict";
import {
  GET_MY_PRODUCT_REVIEW_RPC,
  REVIEW_HIDE_FIELDS,
  REVIEW_INSERT_FIELDS,
  REVIEW_REPORT_INSERT_FIELDS,
  REVIEW_REPORT_RESOLUTION_FIELDS,
  REVIEW_UPDATE_FIELDS,
  buildReviewHidePayload,
  buildReviewInsertPayload,
  buildReviewReportInsertPayload,
  buildReviewReportResolutionPayload,
  buildReviewUpdatePayload,
  buildReviewSummary,
  computeAverageRating,
  computeReviewDistribution,
  emptyReviewDistribution,
  formatAverageRating,
  isDuplicateReviewError,
  isMissingReviewSchema,
  isReviewReportReason,
  isReviewReportable,
  isValidReviewRating,
  normalizeAverageRating,
  normalizeReviewDisplayName,
  normalizeReviewSort,
  parseReviewUuid,
  qualifiesAsVerifiedPurchase,
  resolveReviewEligibility,
  reviewDistributionPercent,
  reviewErrorKey,
  reviewModerationErrorKey,
  reviewReportReasonKey,
  sortReviews,
} from "../../lib/reviews-core.ts";
import { formatAuditSummary } from "../../lib/audit-utils.ts";
import type { ReviewErrorCode } from "../../lib/validations/reviews.ts";

const CUSTOMER = "11111111-1111-4111-8111-111111111111";
const OTHER_CUSTOMER = "22222222-2222-4222-8222-222222222222";
const PRODUCT_A = "33333333-3333-4333-8333-333333333333";
const PRODUCT_B = "44444444-4444-4444-8444-444444444444";

// ---------------------------------------------------------------------------
// Eligibility is structural: delivered + owned + matching product
// ---------------------------------------------------------------------------

test("a delivered order item owned by the viewer qualifies", () => {
  assert.equal(
    qualifiesAsVerifiedPurchase({
      viewerId: CUSTOMER,
      orderUserId: CUSTOMER,
      orderStatus: "delivered",
      orderItemProductId: PRODUCT_A,
      reviewedProductId: PRODUCT_A,
    }),
    true
  );
});

test("every non-delivered status is ineligible", () => {
  for (const status of [
    "pending",
    "paid",
    "processing",
    "shipped",
    "cancelled",
    null,
    undefined,
    "",
  ]) {
    assert.equal(
      qualifiesAsVerifiedPurchase({
        viewerId: CUSTOMER,
        orderUserId: CUSTOMER,
        orderStatus: status,
        orderItemProductId: PRODUCT_A,
        reviewedProductId: PRODUCT_A,
      }),
      false,
      String(status)
    );
  }
});

test("another customer's delivered order never qualifies", () => {
  assert.equal(
    qualifiesAsVerifiedPurchase({
      viewerId: CUSTOMER,
      orderUserId: OTHER_CUSTOMER,
      orderStatus: "delivered",
      orderItemProductId: PRODUCT_A,
      reviewedProductId: PRODUCT_A,
    }),
    false
  );
});

test("a delivered order for a different product never qualifies", () => {
  assert.equal(
    qualifiesAsVerifiedPurchase({
      viewerId: CUSTOMER,
      orderUserId: CUSTOMER,
      orderStatus: "delivered",
      orderItemProductId: PRODUCT_B,
      reviewedProductId: PRODUCT_A,
    }),
    false
  );
});

test("a guest can never qualify, even with a matching payload", () => {
  for (const viewerId of [null, undefined, ""]) {
    assert.equal(
      qualifiesAsVerifiedPurchase({
        viewerId,
        orderUserId: CUSTOMER,
        orderStatus: "delivered",
        orderItemProductId: PRODUCT_A,
        reviewedProductId: PRODUCT_A,
      }),
      false
    );
  }
});

// ---------------------------------------------------------------------------
// Ownership / one-review-per-product state machine
// ---------------------------------------------------------------------------

test("a delivered purchase without a review may be written", () => {
  const eligibility = resolveReviewEligibility({
    hasDeliveredPurchase: true,
    hasReview: false,
  });

  assert.equal(eligibility.canWrite, true);
  assert.equal(eligibility.canEdit, false);
});

test("an existing review can be edited but never re-created", () => {
  const eligibility = resolveReviewEligibility({
    hasDeliveredPurchase: true,
    hasReview: true,
    reviewStatus: "published",
  });

  assert.equal(eligibility.canWrite, false);
  assert.equal(eligibility.canEdit, true);
});

test("a hidden review is read-only for its author", () => {
  const eligibility = resolveReviewEligibility({
    hasDeliveredPurchase: true,
    hasReview: true,
    reviewStatus: "hidden",
  });

  assert.equal(eligibility.canWrite, false);
  assert.equal(eligibility.canEdit, false);
});

test("no delivered purchase means neither write nor edit", () => {
  const eligibility = resolveReviewEligibility({
    hasDeliveredPurchase: false,
    hasReview: false,
  });

  assert.deepEqual(eligibility, {
    hasDeliveredPurchase: false,
    hasReview: false,
    canWrite: false,
    canEdit: false,
  });
});

test("a unique violation means the customer already reviewed the piece", () => {
  assert.equal(isDuplicateReviewError("23505"), true);
  for (const code of ["23503", "42501", "42P01", "", null, undefined]) {
    assert.equal(isDuplicateReviewError(code), false, String(code));
  }
});

// ---------------------------------------------------------------------------
// Rating validation: integers 1–5 only
// ---------------------------------------------------------------------------

test("accepts every integer star value", () => {
  for (const value of [1, 2, 3, 4, 5]) {
    assert.equal(isValidReviewRating(value), true, String(value));
  }
});

test("rejects out-of-range, fractional and non-numeric ratings", () => {
  for (const value of [0, 6, -1, 3.5, 4.0001, NaN, Infinity, "5", null, undefined, true, {}]) {
    assert.equal(isValidReviewRating(value), false, String(value));
  }
});

test("invalid ratings are ignored by the aggregate, not coerced", () => {
  assert.equal(computeAverageRating([5, 0, 4, 6, 3.5]), 4.5);
  assert.equal(computeAverageRating([]), null);
  assert.equal(computeAverageRating([0, 6]), null);
});

test("distribution counts each star and drops invalid values", () => {
  assert.deepEqual(computeReviewDistribution([5, 5, 4, 3, 3, 3, 0, 9]), {
    1: 0,
    2: 0,
    3: 3,
    4: 1,
    5: 2,
  });
  assert.deepEqual(emptyReviewDistribution(), {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  });
});

test("summary keeps count, average and distribution consistent", () => {
  const summary = buildReviewSummary(PRODUCT_A, [5, 4, 4]);

  assert.equal(summary.productId, PRODUCT_A);
  assert.equal(summary.reviewCount, 3);
  assert.equal(summary.averageRating, 4.33);
  assert.equal(summary.distribution[4], 2);
});

// ---------------------------------------------------------------------------
// Public privacy surface
// ---------------------------------------------------------------------------

test("only a bare uuid string is accepted as an id", () => {
  assert.equal(parseReviewUuid(PRODUCT_A), PRODUCT_A);
  assert.equal(parseReviewUuid(`  ${PRODUCT_A}  `), PRODUCT_A);

  for (const value of [
    null,
    undefined,
    42,
    true,
    {},
    [],
    { productId: PRODUCT_A },
    { productId: PRODUCT_A, userId: OTHER_CUSTOMER },
    "not-a-uuid",
    "' or 1=1 --",
  ]) {
    assert.equal(parseReviewUuid(value), null);
  }
});

test("the public display name is trimmed, collapsed and bounded", () => {
  assert.equal(normalizeReviewDisplayName("  Minh   An  "), "Minh An");
  assert.equal(normalizeReviewDisplayName(""), null);
  assert.equal(normalizeReviewDisplayName("   "), null);
  assert.equal(normalizeReviewDisplayName(null), null);
  assert.equal(normalizeReviewDisplayName(42), null);
  assert.equal(normalizeReviewDisplayName("x".repeat(100))?.length, 60);
});

// ---------------------------------------------------------------------------
// Reporting: published reviews that are not the viewer's own
// ---------------------------------------------------------------------------

test("a published review by someone else is reportable", () => {
  assert.equal(
    isReviewReportable({
      status: "published",
      isAuthenticated: true,
      isOwnReview: false,
    }),
    true
  );
});

test("hidden, self-authored and guest reports are refused", () => {
  assert.equal(
    isReviewReportable({
      status: "hidden",
      isAuthenticated: true,
      isOwnReview: false,
    }),
    false
  );
  assert.equal(
    isReviewReportable({
      status: "published",
      isAuthenticated: true,
      isOwnReview: true,
    }),
    false
  );
  assert.equal(
    isReviewReportable({
      status: "published",
      isAuthenticated: false,
      isOwnReview: false,
    }),
    false
  );
  assert.equal(
    isReviewReportable({
      status: null,
      isAuthenticated: true,
      isOwnReview: false,
    }),
    false
  );
});

test("report reasons are a closed, localized set", () => {
  assert.equal(isReviewReportReason("spam"), true);
  assert.equal(isReviewReportReason("harassment"), true);
  assert.equal(isReviewReportReason("other"), true);
  assert.equal(isReviewReportReason("something-else"), false);
  assert.equal(reviewReportReasonKey("personal_information"), "reasonPersonalInformation");
  assert.equal(reviewReportReasonKey("other"), "reasonOther");
});

// ---------------------------------------------------------------------------
// Sorting + aggregate formatting
// ---------------------------------------------------------------------------

test("sorts newest, oldest, highest and lowest without mutating input", () => {
  const reviews = [
    { id: "a", rating: 3, createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "b", rating: 5, createdAt: "2026-02-01T00:00:00.000Z" },
    { id: "c", rating: 4, createdAt: "2026-03-01T00:00:00.000Z" },
  ];
  const original = [...reviews];

  assert.deepEqual(
    sortReviews(reviews, "newest").map((r) => r.id),
    ["c", "b", "a"]
  );
  assert.deepEqual(
    sortReviews(reviews, "oldest").map((r) => r.id),
    ["a", "b", "c"]
  );
  assert.deepEqual(
    sortReviews(reviews, "highest").map((r) => r.id),
    ["b", "c", "a"]
  );
  assert.deepEqual(
    sortReviews(reviews, "lowest").map((r) => r.id),
    ["a", "c", "b"]
  );
  assert.deepEqual(reviews, original);
});

test("unknown sorts fall back to newest-first", () => {
  assert.equal(normalizeReviewSort("nonsense"), "newest");
  assert.equal(normalizeReviewSort(null), "newest");
  assert.equal(normalizeReviewSort("highest"), "highest");
});

test("averages are normalized and formatted for display", () => {
  assert.equal(normalizeAverageRating("4.666"), 4.67);
  assert.equal(normalizeAverageRating(4.666), 4.67);
  assert.equal(normalizeAverageRating(0), 0);
  assert.equal(normalizeAverageRating("not-a-number"), null);
  assert.equal(normalizeAverageRating(-1), null);
  assert.equal(normalizeAverageRating(5.5), null);
  assert.equal(normalizeAverageRating(null), null);
  assert.equal(formatAverageRating(4.5), "4.5");
  assert.equal(formatAverageRating(null), "—");
});

test("distribution percentages stay within 0–100", () => {
  assert.equal(reviewDistributionPercent(1, 4), 25);
  assert.equal(reviewDistributionPercent(0, 4), 0);
  assert.equal(reviewDistributionPercent(4, 0), 0);
  assert.equal(reviewDistributionPercent(-1, 4), 0);
});

// ---------------------------------------------------------------------------
// Database write payloads: only the columns 0015 grants
// ---------------------------------------------------------------------------

test("the own-review lookup targets the dedicated RPC", () => {
  assert.equal(GET_MY_PRODUCT_REVIEW_RPC, "get_my_product_review");
});

test("a review INSERT carries exactly the four granted columns", () => {
  const payload = buildReviewInsertPayload({
    productId: PRODUCT_A,
    rating: 5,
    title: "Beautiful",
    body: "Warm and quiet for hours.",
  });

  assert.deepEqual(Object.keys(payload).sort(), [...REVIEW_INSERT_FIELDS].sort());
  assert.deepEqual(payload, {
    product_id: PRODUCT_A,
    rating: 5,
    title: "Beautiful",
    body: "Warm and quiet for hours.",
  });

  // Identity, evidence, pseudonym, status and moderation fields are
  // database-derived; a client must never be able to smuggle them in.
  for (const forbidden of [
    "user_id",
    "order_item_id",
    "display_name",
    "status",
    "hidden_by",
    "hidden_at",
    "hidden_reason",
    "verified_purchase",
    "is_verified",
    "created_at",
    "updated_at",
  ]) {
    assert.equal(forbidden in payload, false, forbidden);
  }
});

test("a review UPDATE carries only rating, title and body", () => {
  const payload = buildReviewUpdatePayload({
    rating: 4,
    title: "Still lovely",
    body: "A second season with the same candle.",
  });

  assert.deepEqual(Object.keys(payload).sort(), [...REVIEW_UPDATE_FIELDS].sort());
  assert.equal("status" in payload, false);
  assert.equal("hidden_reason" in payload, false);
  assert.equal("user_id" in payload, false);
});

test("a report INSERT carries exactly review_id, reason and details", () => {
  const payload = buildReviewReportInsertPayload({
    reviewId: PRODUCT_B,
    reason: "spam",
    details: null,
  });

  assert.deepEqual(
    Object.keys(payload).sort(),
    [...REVIEW_REPORT_INSERT_FIELDS].sort()
  );
  assert.deepEqual(payload, {
    review_id: PRODUCT_B,
    reason: "spam",
    details: null,
  });

  for (const forbidden of [
    "reporter_id",
    "status",
    "resolved_by",
    "resolved_at",
    "resolution_note",
  ]) {
    assert.equal(forbidden in payload, false, forbidden);
  }
});

test("hiding a review sends visibility fields only", () => {
  const payload = buildReviewHidePayload("Contains personal data");

  assert.deepEqual(Object.keys(payload).sort(), [...REVIEW_HIDE_FIELDS].sort());
  assert.deepEqual(payload, {
    status: "hidden",
    hidden_reason: "Contains personal data",
  });

  for (const forbidden of [
    "title",
    "body",
    "rating",
    "user_id",
    "product_id",
    "order_item_id",
    "display_name",
    "hidden_by",
    "hidden_at",
  ]) {
    assert.equal(forbidden in payload, false, forbidden);
  }
});

test("closing a report sends status and resolution_note only", () => {
  for (const resolution of ["resolved", "dismissed"] as const) {
    const payload = buildReviewReportResolutionPayload(resolution, "Reviewed");

    assert.deepEqual(
      Object.keys(payload).sort(),
      [...REVIEW_REPORT_RESOLUTION_FIELDS].sort()
    );
    assert.deepEqual(payload, {
      status: resolution,
      resolution_note: "Reviewed",
    });

    for (const forbidden of ["resolved_by", "resolved_at", "reporter_id"]) {
      assert.equal(forbidden in payload, false, forbidden);
    }
  }
});

// ---------------------------------------------------------------------------
// Localized error mapping
// ---------------------------------------------------------------------------

test("customer failures map onto reviews.* keys", () => {
  const mapping: Record<ReviewErrorCode, string> = {
    unauthenticated: "errorSignIn",
    restricted: "errorRestricted",
    validation: "errorValidation",
    not_eligible: "errorNotEligible",
    duplicate: "errorDuplicate",
    hidden_readonly: "errorHiddenReadonly",
    not_found: "errorNotFound",
    not_reportable: "errorNotReportable",
    self_report: "errorSelfReport",
    already_reported: "errorAlreadyReported",
    unavailable: "errorUnavailable",
    persist_failed: "errorSubmit",
  };

  for (const [code, key] of Object.entries(mapping) as [
    ReviewErrorCode,
    string,
  ][]) {
    assert.equal(reviewErrorKey({ code }), key, code);
  }

  assert.equal(reviewErrorKey(null), "errorSubmit");
  assert.equal(reviewErrorKey({}), "errorSubmit");
});

test("moderation failures map onto reviewsAdmin.* keys", () => {
  assert.equal(reviewModerationErrorKey({ code: "unauthenticated" }), "errorSignIn");
  assert.equal(reviewModerationErrorKey({ code: "restricted" }), "errorRestricted");
  assert.equal(reviewModerationErrorKey({ code: "forbidden" }), "errorForbidden");
  assert.equal(reviewModerationErrorKey({ code: "validation" }), "errorValidation");
  assert.equal(reviewModerationErrorKey({ code: "not_found" }), "errorNotFound");
  assert.equal(reviewModerationErrorKey({ code: "persist_failed" }), "errorGeneric");
  assert.equal(reviewModerationErrorKey(null), "errorGeneric");
});

// ---------------------------------------------------------------------------
// Missing schema degradation
// ---------------------------------------------------------------------------

test("recognizes an absent review schema", () => {
  assert.equal(isMissingReviewSchema({ code: "42P01" }), true);
  assert.equal(isMissingReviewSchema({ code: "PGRST205" }), true);
  assert.equal(
    isMissingReviewSchema({
      message: 'relation "public.product_reviews" does not exist',
    }),
    true
  );
  assert.equal(
    isMissingReviewSchema({
      message: 'Could not find the table "public.review_reports"',
    }),
    true
  );
  assert.equal(
    isMissingReviewSchema({
      code: "PGRST202",
      message:
        "Could not find the function public.get_my_product_review(p_product_id) in the schema cache",
    }),
    true
  );
  assert.equal(
    isMissingReviewSchema({
      code: "42883",
      message: "function public.get_my_product_review(uuid) does not exist",
    }),
    true
  );
  assert.equal(
    isMissingReviewSchema({ message: "permission denied for table orders" }),
    false
  );
  assert.equal(isMissingReviewSchema(null), false);
});

// ---------------------------------------------------------------------------
// Audit summaries for privileged review actions
// ---------------------------------------------------------------------------

test("review audit summaries carry the reason and resolution note", () => {
  // product_reviews_guard() metadata: product_id, previous_status,
  // new_status, reason, actor_role. No review title is recorded.
  assert.match(
    formatAuditSummary(
      "review.hidden",
      {
        product_id: PRODUCT_A,
        previous_status: "published",
        new_status: "hidden",
        reason: "Contains personal data",
        actor_role: "manager",
      },
      "en"
    ),
    /Contains personal data/
  );
  assert.match(
    formatAuditSummary(
      "review.report_resolved",
      {
        review_id: PRODUCT_B,
        report_reason: "spam",
        previous_status: "open",
        new_status: "resolved",
        resolution_note: "Hidden after review",
        actor_role: "admin",
      },
      "en"
    ),
    /Hidden after review/
  );
  assert.match(
    formatAuditSummary(
      "review.report_dismissed",
      {
        review_id: PRODUCT_B,
        report_reason: "irrelevant",
        previous_status: "open",
        new_status: "dismissed",
        resolution_note: "No violation",
        actor_role: "manager",
      },
      "vi"
    ),
    /No violation/
  );
  // Historical rows written before the trigger change used `note`.
  assert.match(
    formatAuditSummary("review.report_resolved", { note: "Legacy note" }, "en"),
    /Legacy note/
  );
});
