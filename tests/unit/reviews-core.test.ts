import test from "node:test";
import assert from "node:assert/strict";
import {
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
// Reporting: published, other people's reviews only
// ---------------------------------------------------------------------------

test("a published review by someone else is reportable", () => {
  assert.equal(
    isReviewReportable({
      status: "published",
      authorId: OTHER_CUSTOMER,
      viewerId: CUSTOMER,
    }),
    true
  );
});

test("hidden, self-authored, authorless and guest reports are refused", () => {
  assert.equal(
    isReviewReportable({
      status: "hidden",
      authorId: OTHER_CUSTOMER,
      viewerId: CUSTOMER,
    }),
    false
  );
  assert.equal(
    isReviewReportable({
      status: "published",
      authorId: CUSTOMER,
      viewerId: CUSTOMER,
    }),
    false
  );
  assert.equal(
    isReviewReportable({
      status: "published",
      authorId: null,
      viewerId: CUSTOMER,
    }),
    false
  );
  assert.equal(
    isReviewReportable({
      status: "published",
      authorId: OTHER_CUSTOMER,
      viewerId: null,
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
    isMissingReviewSchema({ message: "permission denied for table orders" }),
    false
  );
  assert.equal(isMissingReviewSchema(null), false);
});

// ---------------------------------------------------------------------------
// Audit summaries for privileged review actions
// ---------------------------------------------------------------------------

test("review audit summaries carry the reason and resolution note", () => {
  assert.match(
    formatAuditSummary(
      "review.hidden",
      { review_title: "Lovely", reason: "Contains personal data" },
      "en"
    ),
    /Contains personal data/
  );
  assert.match(
    formatAuditSummary(
      "review.report_resolved",
      { note: "Hidden after review" },
      "en"
    ),
    /Hidden after review/
  );
  assert.match(
    formatAuditSummary(
      "review.report_dismissed",
      { note: "No violation" },
      "vi"
    ),
    /No violation/
  );
});
