import test from "node:test";
import assert from "node:assert/strict";
import {
  applyWishlistToggle,
  isDuplicateWishlistError,
  isWishlistSaved,
  normalizeWishlistIds,
  parseWishlistProductId,
  wishlistErrorKey,
  wishlistLoginHref,
} from "../../lib/wishlist-core.ts";

const PRODUCT_A = "11111111-1111-4111-8111-111111111111";
const PRODUCT_B = "22222222-2222-4222-8222-222222222222";
const PRODUCT_C = "33333333-3333-4333-8333-333333333333";

// ---------------------------------------------------------------------------
// Product id validation
// ---------------------------------------------------------------------------

test("accepts a canonical product uuid", () => {
  const parsed = parseWishlistProductId(PRODUCT_A);
  assert.deepEqual(parsed, { ok: true, productId: PRODUCT_A });
});

test("trims surrounding whitespace before validating", () => {
  const parsed = parseWishlistProductId(`  ${PRODUCT_B}  `);
  assert.deepEqual(parsed, { ok: true, productId: PRODUCT_B });
});

test("rejects malformed product ids", () => {
  const invalid = [
    "",
    "   ",
    "not-a-uuid",
    "123",
    `${PRODUCT_A.slice(0, -1)}z`,
    // SQL-ish payloads must never reach a query.
    "' or 1=1 --",
    "*",
  ];

  for (const value of invalid) {
    assert.deepEqual(parseWishlistProductId(value), { ok: false }, value);
  }
});

test("rejects non-string product ids, including smuggled ownership fields", () => {
  // A caller cannot pass an object in the hope that `user_id` is honoured: the
  // only accepted shape is a bare uuid string. Ownership is derived from the
  // session in app/actions/wishlist.ts and re-checked by RLS.
  const invalid: unknown[] = [
    null,
    undefined,
    42,
    true,
    {},
    [],
    { productId: PRODUCT_A },
    { productId: PRODUCT_A, userId: PRODUCT_B },
    [PRODUCT_A],
  ];

  for (const value of invalid) {
    assert.deepEqual(parseWishlistProductId(value), { ok: false });
  }
});

// ---------------------------------------------------------------------------
// Duplicate (23505) idempotency
// ---------------------------------------------------------------------------

test("treats a unique violation as an already-saved success", () => {
  assert.equal(isDuplicateWishlistError("23505"), true);
});

test("does not treat other error codes as duplicates", () => {
  for (const code of [
    "23503", // foreign key violation
    "42501", // insufficient privilege (RLS rejection)
    "42P01", // undefined table (migration not applied)
    "",
    null,
    undefined,
  ]) {
    assert.equal(isDuplicateWishlistError(code), false, String(code));
  }
});

// ---------------------------------------------------------------------------
// Toggle semantics
// ---------------------------------------------------------------------------

test("saving appends to an empty list", () => {
  assert.deepEqual(applyWishlistToggle([], PRODUCT_A, true), [PRODUCT_A]);
});

test("saving places the product first, newest saved first", () => {
  assert.deepEqual(applyWishlistToggle([PRODUCT_A], PRODUCT_B, true), [
    PRODUCT_B,
    PRODUCT_A,
  ]);
});

test("saving an already-saved product never duplicates it", () => {
  assert.deepEqual(
    applyWishlistToggle([PRODUCT_A, PRODUCT_B], PRODUCT_A, true),
    [PRODUCT_A, PRODUCT_B]
  );
});

test("unsaving removes the product", () => {
  assert.deepEqual(
    applyWishlistToggle([PRODUCT_A, PRODUCT_B], PRODUCT_A, false),
    [PRODUCT_B]
  );
});

test("unsaving a product that is not saved is a no-op", () => {
  assert.deepEqual(applyWishlistToggle([PRODUCT_A], PRODUCT_C, false), [
    PRODUCT_A,
  ]);
});

test("unsaving removes every occurrence, so a corrupt store self-heals", () => {
  assert.deepEqual(
    applyWishlistToggle([PRODUCT_A, PRODUCT_B, PRODUCT_A], PRODUCT_A, false),
    [PRODUCT_B]
  );
});

test("toggle never mutates the input array", () => {
  const ids = [PRODUCT_A, PRODUCT_B];
  const next = applyWishlistToggle(ids, PRODUCT_C, true);

  assert.deepEqual(ids, [PRODUCT_A, PRODUCT_B]);
  assert.notEqual(next, ids);
});

test("toggle with an empty product id leaves the list untouched", () => {
  assert.deepEqual(applyWishlistToggle([PRODUCT_A], "", true), [PRODUCT_A]);
});

test("isWishlistSaved reports the saved state", () => {
  assert.equal(isWishlistSaved([PRODUCT_A, PRODUCT_B], PRODUCT_B), true);
  assert.equal(isWishlistSaved([PRODUCT_A], PRODUCT_B), false);
  assert.equal(isWishlistSaved([], PRODUCT_A), false);
});

// ---------------------------------------------------------------------------
// Server row normalization
// ---------------------------------------------------------------------------

test("normalizes product_id rows in server order", () => {
  const rows = [
    { product_id: PRODUCT_C },
    { product_id: PRODUCT_A },
    { product_id: PRODUCT_B },
  ];

  assert.deepEqual(normalizeWishlistIds(rows), [PRODUCT_C, PRODUCT_A, PRODUCT_B]);
});

test("normalizes plain string rows", () => {
  assert.deepEqual(normalizeWishlistIds([PRODUCT_A, PRODUCT_B]), [
    PRODUCT_A,
    PRODUCT_B,
  ]);
});

test("deduplicates repeated product ids, keeping the first position", () => {
  const rows = [
    { product_id: PRODUCT_A },
    { product_id: PRODUCT_B },
    { product_id: PRODUCT_A },
  ];

  assert.deepEqual(normalizeWishlistIds(rows), [PRODUCT_A, PRODUCT_B]);
});

test("drops rows without a usable product id", () => {
  const rows = [
    null,
    undefined,
    42,
    {},
    { product_id: null },
    { product_id: "" },
    { product_id: 7 },
    { other: PRODUCT_A },
    { product_id: PRODUCT_A },
  ];

  assert.deepEqual(normalizeWishlistIds(rows), [PRODUCT_A]);
});

test("returns an empty list for non-array input", () => {
  for (const value of [null, undefined, {}, "", 0, PRODUCT_A]) {
    assert.deepEqual(normalizeWishlistIds(value), [], String(value));
  }
});

// ---------------------------------------------------------------------------
// Localized error mapping
// ---------------------------------------------------------------------------

test("maps each failure code onto a wishlist.* message key", () => {
  assert.equal(wishlistErrorKey({ code: "unauthenticated" }), "errorSignIn");
  assert.equal(wishlistErrorKey({ code: "restricted" }), "errorRestricted");
  assert.equal(
    wishlistErrorKey({ code: "product_unavailable" }),
    "errorUnavailable"
  );
  assert.equal(wishlistErrorKey({ code: "validation" }), "actionError");
  assert.equal(wishlistErrorKey({ code: "persist_failed" }), "actionError");
});

test("falls back to the generic error key when no code is supplied", () => {
  assert.equal(wishlistErrorKey(null), "actionError");
  assert.equal(wishlistErrorKey(undefined), "actionError");
  assert.equal(wishlistErrorKey({}), "actionError");
  // A success payload must never render an error, but if it is passed by
  // mistake the generic key is the safe, non-alarming choice.
  assert.equal(wishlistErrorKey({ success: true }), "actionError");
});

// ---------------------------------------------------------------------------
// Guest login redirect
// ---------------------------------------------------------------------------

test("builds an internal login return path for the current page", () => {
  assert.equal(
    wishlistLoginHref("/products/midnight-garden"),
    "/login?next=%2Fproducts%2Fmidnight-garden"
  );
});

test("encodes query strings and hashes in the return path", () => {
  assert.equal(
    wishlistLoginHref("/collections/floral?sort=price#top"),
    "/login?next=%2Fcollections%2Ffloral%3Fsort%3Dprice%23top"
  );
});

test("never produces an absolute or protocol-relative target", () => {
  for (const pathname of [
    "https://evil.example/steal",
    "//evil.example/steal",
    "/\\evil.example/steal",
    "javascript:alert(1)",
    "/account\u0000/../../etc",
    "",
  ]) {
    const href = wishlistLoginHref(pathname);
    const next = decodeURIComponent(href.split("next=")[1]);

    assert.ok(href.startsWith("/login?next="), href);
    assert.ok(next.startsWith("/"), `${pathname} -> ${next}`);
    assert.ok(!next.startsWith("//"), `${pathname} -> ${next}`);
    assert.ok(!next.includes("\\"), `${pathname} -> ${next}`);
    assert.ok(!next.includes("://"), `${pathname} -> ${next}`);
  }
});

test("keeps a legitimate nested path intact", () => {
  assert.equal(
    decodeURIComponent(wishlistLoginHref("/account/wishlist").split("next=")[1]),
    "/account/wishlist"
  );
});

test("falls back to the account page for an unusable pathname", () => {
  assert.equal(wishlistLoginHref(""), "/login?next=%2Faccount");
  assert.equal(wishlistLoginHref("products"), "/login?next=%2Faccount");
});
