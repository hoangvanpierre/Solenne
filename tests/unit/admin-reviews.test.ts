import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ADMIN_REVIEW_COLUMNS,
  ADMIN_REVIEW_MAX_PAGE,
  ADMIN_REVIEW_PAGE_SIZE,
  ADMIN_REVIEW_RATING_FILTERS,
  ADMIN_REVIEW_SEARCH_MAX,
  ADMIN_REVIEW_STATUS_FILTERS,
  ADMIN_REVIEW_VIEWS,
  buildAdminReviewSearchPattern,
  isLegacyReviewReportStatus,
  mapAdminReviewRow,
  normalizeAdminReviewPage,
  normalizeAdminReviewRatingFilter,
  normalizeAdminReviewSearch,
  normalizeAdminReviewStatusFilter,
  normalizeAdminReviewView,
  type AdminReviewRow,
} from "../../lib/reviews-core.ts";

// ---------------------------------------------------------------------------
// Admin /admin/reviews view resolution + legacy URL compatibility
// ---------------------------------------------------------------------------

test("no parameters lands on All Reviews, the default view", () => {
  assert.equal(normalizeAdminReviewView(undefined, undefined), "all");
  assert.equal(normalizeAdminReviewView(null, null), "all");
  assert.equal(normalizeAdminReviewView("", ""), "all");
});

test("the two explicit views are preserved", () => {
  assert.equal(normalizeAdminReviewView("all", undefined), "all");
  assert.equal(normalizeAdminReviewView("reports", undefined), "reports");
});

test("an explicit view wins over a report status parameter", () => {
  assert.equal(normalizeAdminReviewView("all", "open"), "all");
  assert.equal(normalizeAdminReviewView("reports", "dismissed"), "reports");
});

test("legacy report bookmarks keep opening Review Reports", () => {
  for (const status of ["open", "resolved", "dismissed", "all"]) {
    assert.equal(
      normalizeAdminReviewView(undefined, status),
      "reports",
      `?status=${status} must stay on the Reports view`
    );
  }
});

test("an unrecognized status without a view is not treated as legacy", () => {
  assert.equal(normalizeAdminReviewView(undefined, "published"), "all");
  assert.equal(normalizeAdminReviewView(undefined, "nonsense"), "all");
});

test("an unrecognized view falls back like a missing one", () => {
  assert.equal(normalizeAdminReviewView("report", undefined), "all");
  assert.equal(normalizeAdminReviewView("report", "open"), "reports");
  assert.equal(normalizeAdminReviewView(42, undefined), "all");
});

test("the legacy report status set is exactly the four queue filters", () => {
  assert.equal(isLegacyReviewReportStatus("open"), true);
  assert.equal(isLegacyReviewReportStatus("resolved"), true);
  assert.equal(isLegacyReviewReportStatus("dismissed"), true);
  assert.equal(isLegacyReviewReportStatus("all"), true);
  assert.equal(isLegacyReviewReportStatus("hidden"), false);
  assert.equal(isLegacyReviewReportStatus(undefined), false);
});

test("view and status constants match the URL contract", () => {
  assert.deepEqual([...ADMIN_REVIEW_VIEWS], ["all", "reports"]);
  assert.deepEqual([...ADMIN_REVIEW_STATUS_FILTERS], [
    "all",
    "published",
    "hidden",
  ]);
  assert.deepEqual([...ADMIN_REVIEW_RATING_FILTERS], [5, 4, 3, 2, 1]);
});

// ---------------------------------------------------------------------------
// Publication-status filter
// ---------------------------------------------------------------------------

test("publication status accepts only all/published/hidden", () => {
  assert.equal(normalizeAdminReviewStatusFilter("all"), "all");
  assert.equal(normalizeAdminReviewStatusFilter("published"), "published");
  assert.equal(normalizeAdminReviewStatusFilter("hidden"), "hidden");
});

test("unknown publication statuses fall back to all", () => {
  for (const value of ["", "pending", "PUBLISHED", "open", 5, null, undefined, ["hidden"]]) {
    assert.equal(normalizeAdminReviewStatusFilter(value), "all");
  }
});

// ---------------------------------------------------------------------------
// Rating filter validation
// ---------------------------------------------------------------------------

test("every valid star value is accepted", () => {
  for (const rating of [1, 2, 3, 4, 5]) {
    assert.equal(normalizeAdminReviewRatingFilter(String(rating)), rating);
    assert.equal(normalizeAdminReviewRatingFilter(rating), rating);
    assert.equal(normalizeAdminReviewRatingFilter(` ${rating} `), rating);
  }
});

test("invalid ratings never reach the query", () => {
  for (const value of ["0", "6", "-1", "4.5", "five", "", " ", "1e1", null, undefined, {}, ["5"]]) {
    assert.equal(normalizeAdminReviewRatingFilter(value), null);
  }

  assert.equal(normalizeAdminReviewRatingFilter(0), null);
  assert.equal(normalizeAdminReviewRatingFilter(6), null);
  assert.equal(normalizeAdminReviewRatingFilter(Number.NaN), null);
  assert.equal(normalizeAdminReviewRatingFilter(3.5), null);
});

// ---------------------------------------------------------------------------
// Pagination boundaries
// ---------------------------------------------------------------------------

test("a missing or malformed page resolves to page 1", () => {
  for (const value of [undefined, null, "", "  ", "abc", "1abc", "0", "-3", "0.4", Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(normalizeAdminReviewPage(value), 1, `input: ${String(value)}`);
  }
});

test("fractional pages floor and valid pages are kept", () => {
  assert.equal(normalizeAdminReviewPage("2"), 2);
  assert.equal(normalizeAdminReviewPage(" 7 "), 7);
  assert.equal(normalizeAdminReviewPage("2.9"), 2);
  assert.equal(normalizeAdminReviewPage(4), 4);
});

test("an absurd page number is clamped, so the offset stays bounded", () => {
  assert.equal(normalizeAdminReviewPage("999999999"), ADMIN_REVIEW_MAX_PAGE);
  assert.equal(
    normalizeAdminReviewPage(String(ADMIN_REVIEW_MAX_PAGE + 1)),
    ADMIN_REVIEW_MAX_PAGE
  );
});

test("the page size is bounded and matches the documented window", () => {
  assert.equal(ADMIN_REVIEW_PAGE_SIZE, 20);
  assert.ok(ADMIN_REVIEW_PAGE_SIZE > 0 && ADMIN_REVIEW_PAGE_SIZE <= 50);
});

// ---------------------------------------------------------------------------
// Search sanitization (PostgREST `.or()` injection safety)
// ---------------------------------------------------------------------------

test("search terms are bounded", () => {
  const long = "a".repeat(ADMIN_REVIEW_SEARCH_MAX + 40);
  assert.equal(normalizeAdminReviewSearch(long).length, ADMIN_REVIEW_SEARCH_MAX);
  assert.equal(normalizeAdminReviewSearch(undefined), "");
  assert.equal(normalizeAdminReviewSearch(42), "");
});

test("search terms cannot rewrite the PostgREST filter expression", () => {
  const hostile = 'title.ilike.%,body.eq."x",select=*,created_at.gte.0';
  const normalized = normalizeAdminReviewSearch(hostile);

  assert.equal(normalized.includes(","), false);
  assert.equal(normalized.includes("("), false);
  assert.equal(normalized.includes(")"), false);
  assert.equal(normalized.includes('"'), false);
  assert.equal(normalized.includes("'"), false);
  assert.equal(normalized.includes(":"), false);
  assert.equal(normalized.includes("*"), false);
  assert.equal(normalized.includes("\\"), false);
});

test("search keeps meaningful text and collapses whitespace", () => {
  assert.equal(normalizeAdminReviewSearch("  cedar   smoke "), "cedar smoke");
  assert.equal(normalizeAdminReviewSearch("100% cotton"), "100% cotton");
});

test("the LIKE pattern is built only for a real term", () => {
  assert.equal(buildAdminReviewSearchPattern(""), null);
  assert.equal(buildAdminReviewSearchPattern("   "), null);
  assert.equal(buildAdminReviewSearchPattern(undefined), null);
  assert.equal(buildAdminReviewSearchPattern("cedar"), "%cedar%");
});

test("SQL wildcards in the term match literally", () => {
  assert.equal(buildAdminReviewSearchPattern("100%"), "%100\\%%");
  assert.equal(buildAdminReviewSearchPattern("a_b"), "%a\\_b%");
  assert.equal(buildAdminReviewSearchPattern("a\\b"), "%a b%");
});

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

const ROW: AdminReviewRow = {
  id: "11111111-1111-4111-8111-111111111111",
  product_id: "33333333-3333-4333-8333-333333333333",
  rating: 4,
  title: "Quiet and warm",
  body: "Burns evenly for hours.",
  display_name: "Solenne Customer #a1b2c3d4",
  status: "published",
  created_at: "2026-10-01T10:00:00.000Z",
  updated_at: "2026-10-02T10:00:00.000Z",
};

test("a published row maps onto the display model", () => {
  const entry = mapAdminReviewRow(ROW, { name: "Cedar Nocturne", slug: "cedar-nocturne" });

  assert.deepEqual(entry, {
    id: ROW.id,
    productId: ROW.product_id,
    productName: "Cedar Nocturne",
    productSlug: "cedar-nocturne",
    rating: 4,
    title: "Quiet and warm",
    body: "Burns evenly for hours.",
    displayName: "Solenne Customer #a1b2c3d4",
    status: "published",
    createdAt: ROW.created_at,
    updatedAt: ROW.updated_at,
  });
});

test("a numeric rating serialized as a string becomes a number", () => {
  assert.equal(mapAdminReviewRow({ ...ROW, rating: "5" }, null).rating, 5);
});

test("a non-numeric rating degrades to zero stars instead of NaN", () => {
  assert.equal(mapAdminReviewRow({ ...ROW, rating: "n/a" }, null).rating, 0);
  assert.equal(mapAdminReviewRow({ ...ROW, rating: Number.NaN }, null).rating, 0);
});

test("hidden rows keep their hidden state; unknown states read as published", () => {
  assert.equal(mapAdminReviewRow({ ...ROW, status: "hidden" }, null).status, "hidden");
  assert.equal(mapAdminReviewRow({ ...ROW, status: "PUBLISHED" }, null).status, "published");
  assert.equal(mapAdminReviewRow({ ...ROW, status: "" }, null).status, "published");
});

test("the pseudonym is normalized and never invented", () => {
  assert.equal(
    mapAdminReviewRow({ ...ROW, display_name: "  Solenne   Customer #aa " }, null)
      .displayName,
    "Solenne Customer #aa"
  );
  assert.equal(mapAdminReviewRow({ ...ROW, display_name: "   " }, null).displayName, null);
  assert.equal(mapAdminReviewRow({ ...ROW, display_name: null }, null).displayName, null);
});

test("a review whose product is missing still renders", () => {
  const entry = mapAdminReviewRow(ROW, null);
  assert.equal(entry.productName, "");
  assert.equal(entry.productSlug, null);
  assert.equal(entry.id, ROW.id);
});

test("a product without a slug keeps its name", () => {
  const entry = mapAdminReviewRow(ROW, { name: "  Cedar Nocturne  ", slug: null });
  assert.equal(entry.productName, "Cedar Nocturne");
  assert.equal(entry.productSlug, null);
});

// ---------------------------------------------------------------------------
// Column contract: privacy-safe by construction
// ---------------------------------------------------------------------------

test("the query selects exactly the granted, non-sensitive columns", () => {
  assert.deepEqual([...ADMIN_REVIEW_COLUMNS], [
    "id",
    "product_id",
    "rating",
    "title",
    "body",
    "display_name",
    "status",
    "created_at",
    "updated_at",
  ]);
});

test("no author identity, purchase evidence or moderation actor is selected", () => {
  const columns = ADMIN_REVIEW_COLUMNS.join(",");
  for (const forbidden of [
    "user_id",
    "order_item_id",
    "hidden_by",
    "hidden_at",
    "hidden_reason",
  ]) {
    assert.equal(
      columns.includes(forbidden),
      false,
      `${forbidden} must not be selected by the All Reviews query`
    );
  }
});

// ---------------------------------------------------------------------------
// Data-layer contract (static: the module imports next/headers, so it cannot
// be imported by the Node test runner)
// ---------------------------------------------------------------------------

const ADMIN_DATA_SOURCE = readFileSync(
  new URL("../../lib/admin-reviews.ts", import.meta.url),
  "utf8"
);

test("the All Reviews data layer re-checks review.manage_reports", () => {
  const checks = ADMIN_DATA_SOURCE.match(
    /requirePermission\("review\.manage_reports"\)/g
  );
  assert.ok(
    (checks ?? []).length >= 4,
    "queue, list, counts and product options each re-check the permission"
  );
});

test("the All Reviews data layer uses the user-scoped client only", () => {
  assert.match(ADMIN_DATA_SOURCE, /from "@\/lib\/supabase\/server"/);
  assert.equal(ADMIN_DATA_SOURCE.includes("supabase/admin"), false);
  assert.equal(ADMIN_DATA_SOURCE.includes("createAdminClient"), false);
});

test("the All Reviews query is bounded and paginated server-side", () => {
  assert.match(ADMIN_DATA_SOURCE, /ADMIN_REVIEW_PAGE_SIZE/);
  assert.match(ADMIN_DATA_SOURCE, /\.range\(offset, offset \+ limit - 1\)/);
  assert.match(ADMIN_DATA_SOURCE, /count: "exact"/);
});

test("the All Reviews data layer never reads identity or evidence columns", () => {
  for (const forbidden of ["user_id", "order_item_id", "hidden_by", "hidden_at", "reporter_id"]) {
    assert.equal(
      ADMIN_DATA_SOURCE.includes(forbidden),
      false,
      `${forbidden} must not appear in lib/admin-reviews.ts`
    );
  }
});

// ---------------------------------------------------------------------------
// Pagination copy contract
//
// The pagination labels are the one place where a message is NOT a finished
// sentence: AdminPagination substitutes {page}/{total} and
// {start}/{end}/{item} from the numbers the server returned. Reading such a
// template with plain t() runs ICU formatting at render time and throws
// FORMATTING_ERROR because the variables are supplied later. These tests keep
// that regression out.
// ---------------------------------------------------------------------------

const REVIEW_TABLE_SOURCE = readFileSync(
  new URL("../../components/admin/admin-review-table.tsx", import.meta.url),
  "utf8"
);

const MESSAGES = {
  en: JSON.parse(
    readFileSync(new URL("../../messages/en.json", import.meta.url), "utf8")
  ),
  vi: JSON.parse(
    readFileSync(new URL("../../messages/vi.json", import.meta.url), "utf8")
  ),
} as Record<string, { reviewsAdmin: Record<string, string> }>;

test("pagination templates are read with t.raw, never formatted early", () => {
  assert.match(REVIEW_TABLE_SOURCE, /t\.raw\("paginationPageOf"\)/);
  assert.match(REVIEW_TABLE_SOURCE, /t\.raw\("paginationSummary"\)/);
  assert.equal(
    /[^.\w]t\("paginationPageOf"\)/.test(REVIEW_TABLE_SOURCE),
    false,
    "paginationPageOf must not be read with t() — it still contains {page}/{total}"
  );
  assert.equal(
    /[^.\w]t\("paginationSummary"\)/.test(REVIEW_TABLE_SOURCE),
    false,
    "paginationSummary must not be read with t() — it still contains {start}/{end}/{item}"
  );
});

test("every reviewsAdmin message read without arguments is placeholder-free", () => {
  const keys = [
    ...REVIEW_TABLE_SOURCE.matchAll(/\bt\("([A-Za-z0-9_.]+)"\)/g),
  ].map((match) => match[1]);

  assert.ok(keys.length > 0, "the table must translate its own copy");

  for (const key of keys) {
    for (const locale of ["en", "vi"] as const) {
      const message = MESSAGES[locale].reviewsAdmin[key];
      assert.equal(
        typeof message,
        "string",
        `reviewsAdmin.${key} is missing from messages/${locale}.json`
      );
      assert.equal(
        /\{[^}]*\}/.test(message),
        false,
        `reviewsAdmin.${key} (${locale}) has an ICU variable but is read with t() without values`
      );
    }
  }
});

