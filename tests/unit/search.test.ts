import test from "node:test";
import assert from "node:assert/strict";
import {
  flattenSearchResults,
  getHighlightRanges,
  normalizeSearchText,
  searchCatalog,
  tokenizeSearchQuery,
  type SearchIndex,
} from "../../lib/search.ts";

const index: SearchIndex = {
  version: 1,
  products: [
    {
      id: "p1",
      slug: "midnight-garden",
      name: { en: "Midnight Garden", vi: "Vườn Đêm" },
      description: {
        en: "A quiet floral candle with jasmine and rose.",
        vi: "Nến hương hoa dịu nhẹ với hoa nhài và hoa hồng.",
      },
      scentFamily: "floral",
      family: { en: "Floral", vi: "Hương hoa" },
      familyDescription: { en: "Petal-led scents.", vi: "Hương từ cánh hoa." },
      notes: {
        top: { en: ["jasmine"], vi: ["hoa nhài"] },
        heart: { en: ["rose"], vi: ["hoa hồng"] },
        base: { en: ["vanilla"], vi: ["vani"] },
      },
      price: { USD: 48, VND: 1200000 },
      inStock: true,
      image: null,
    },
    {
      id: "p2",
      slug: "cedar-sage",
      name: { en: "Cedar & Sage", vi: "Tuyết Tùng & Xô Thơm" },
      description: {
        en: "A woody candle with cedar and sage.",
        vi: "Nến hương gỗ với tuyết tùng và xô thơm.",
      },
      scentFamily: "woody",
      family: { en: "Woody", vi: "Hương gỗ" },
      familyDescription: { en: "Dry, resinous scents.", vi: "Hương gỗ khô." },
      notes: {
        top: { en: ["sage"], vi: ["xô thơm"] },
        heart: { en: ["cedar"], vi: ["tuyết tùng"] },
        base: { en: ["amber"], vi: ["hổ phách"] },
      },
      price: { USD: 52, VND: 1300000 },
      inStock: true,
      image: null,
    },
  ],
  collections: [
    {
      slug: "gift-sets",
      name: { en: "Gift Sets", vi: "Bộ Quà Tặng" },
      description: { en: "Curated candle sets.", vi: "Bộ nến tuyển chọn." },
      scentFamily: null,
    },
  ],
};

test("search normalization is accent- and case-insensitive, including đ", () => {
  assert.equal(normalizeSearchText("  Hương   Gỗ Đàn  "), "huong go dan");
  assert.equal(normalizeSearchText("MIDNIGHT"), "midnight");
  assert.deepEqual(tokenizeSearchQuery("  "), []);
});

test("search returns nothing for an empty query", () => {
  assert.deepEqual(searchCatalog(index, "   "), {
    products: [],
    collections: [],
    total: 0,
  });
});

test("search ranks an exact product name above a description match", () => {
  const results = searchCatalog(index, "Midnight Garden");
  assert.equal(results.products.length > 0, true);
  assert.equal(results.products[0].item.slug, "midnight-garden");
  assert.equal(results.products[0].match, "name-exact");
});

test("search finds a product through the Vietnamese scent-family synonym", () => {
  const results = searchCatalog(index, "hương gỗ");
  assert.equal(results.products.length > 0, true);
  assert.equal(
    results.products.some((result) => result.item.slug === "cedar-sage"),
    true
  );
});

test("search honors result limits", () => {
  const results = searchCatalog(index, "candle", { products: 1, collections: 0 });
  assert.equal(results.products.length <= 1, true);
  assert.equal(results.collections.length, 0);
});

test("search finds collections by name", () => {
  const results = searchCatalog(index, "gift");
  assert.equal(results.collections.length, 1);
  assert.equal(results.collections[0].item.slug, "gift-sets");
});

test("highlight ranges point at the original accented text", () => {
  assert.deepEqual(getHighlightRanges("Midnight Garden", ["midnight"]), [
    { start: 0, end: 8 },
  ]);
  assert.deepEqual(getHighlightRanges("Vườn Đêm", ["vuon"]), [
    { start: 0, end: 4 },
  ]);
  assert.deepEqual(getHighlightRanges("", ["x"]), []);
});

test("flattenSearchResults lists products before collections", () => {
  const results = searchCatalog(index, "candle");
  const flat = flattenSearchResults(results);
  assert.equal(flat.length, results.products.length + results.collections.length);
  assert.equal(flat[0].kind, "product");
});
