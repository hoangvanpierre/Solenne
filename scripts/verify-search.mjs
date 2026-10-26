#!/usr/bin/env node
// ===========================================================================
// Solenne — Verification Harness for Site Search
// ===========================================================================
// Runs the real pure search functions from lib/search.ts against sample
// catalogue data, then statically checks the parts that cannot be executed
// outside Next.js (route caching, lazy host, combobox/IME wiring, i18n keys).
//
// Requires Node's built-in TypeScript type stripping (Node >= 22.18).
// ===========================================================================

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  flattenSearchResults,
  getHighlightRanges,
  normalizeSearchText,
  searchCatalog,
  SEARCH_SYNONYMS,
  tokenizeSearchQuery,
} from "../lib/search.ts";

const root = fileURLToPath(new URL("..", import.meta.url));

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`[FAIL] ${name}`);
    console.error(`       ${error instanceof Error ? error.message : error}`);
    failed += 1;
  }
}

function read(relativePath) {
  return readFileSync(`${root}${relativePath}`, "utf8");
}

function localized(en, vi = en) {
  return { en, vi };
}

function notes(...values) {
  return {
    top: { en: values, vi: values },
    heart: { en: [], vi: [] },
    base: { en: [], vi: [] },
  };
}

function product({
  slug,
  name,
  description = "",
  family = "Fresh",
  familyVi = "Tươi mát",
  familyDescription = "",
  familyDescriptionVi = "",
  noteList = [],
  price = 36,
  inStock = true,
}) {
  return {
    id: `id-${slug}`,
    slug,
    name: localized(name),
    description: localized(description),
    scentFamily: family.toLowerCase(),
    family: localized(family, familyVi),
    familyDescription: localized(familyDescription, familyDescriptionVi),
    notes: notes(...noteList),
    price: { USD: price, VND: price * 25_000 },
    inStock,
    image: null,
  };
}

function collection(slug, name, nameVi, description, descriptionVi) {
  return {
    slug,
    name: localized(name, nameVi),
    description: localized(description, descriptionVi),
    scentFamily: slug === "gift-sets" ? null : slug,
  };
}

const index = {
  version: 1,
  products: [
    product({
      slug: "vanilla-ember",
      name: "Vanilla Ember",
      description:
        "Rich Madagascar vanilla meets smoky embers and exotic spices.",
      family: "Warm",
      familyVi: "Ấm áp",
      familyDescription: "Rich vanilla, amber, and spiced comfort",
      familyDescriptionVi: "Vanilla nồng nàn, hổ phách và hương gia vị",
      noteList: ["Vanilla", "Tonka Bean", "Caramel"],
      price: 44,
    }),
    product({
      slug: "cedar-sage",
      name: "Cedar & Sage",
      description:
        "Earthy cedarwood with aromatic sage for a forest retreat.",
      family: "Woody",
      familyVi: "Gỗ",
      familyDescription: "Warm cedar, sandalwood, and earthy tones",
      familyDescriptionVi:
        "Gỗ tuyết tùng ấm áp, đàn hương và hương đất",
      noteList: ["Cedarwood", "Vetiver", "Patchouli"],
      price: 38,
    }),
    product({
      slug: "ocean-breeze",
      name: "Ocean Breeze",
      description:
        "Crisp sea salt, gentle ozone, and sun-warmed driftwood.",
      family: "Fresh",
      familyVi: "Tươi mát",
      familyDescription: "Crisp citrus, ocean breeze, and morning dew",
      familyDescriptionVi: "Cam chanh tươi mát, gió biển và sương mai",
      noteList: ["Sea Salt", "Ozone", "Driftwood"],
      price: 36,
    }),
    product({
      slug: "midnight-garden",
      name: "Midnight Garden",
      description:
        "Jasmine and rose under a canopy of stars, poured in small batches.",
      family: "Floral",
      familyVi: "Hoa",
      familyDescription: "Delicate blooms and garden-fresh petals",
      familyDescriptionVi: "Hương hoa tinh tế và cánh hoa tươi mát",
      noteList: ["Jasmine", "Rose", "Lily of the Valley"],
      price: 42,
    }),
  ],
  collections: [
    collection(
      "floral",
      "Floral",
      "Hoa",
      "Delicate blooms and garden-fresh petals",
      "Hương hoa tinh tế và cánh hoa tươi mát",
    ),
    collection(
      "woody",
      "Woody",
      "Gỗ",
      "Warm cedar, sandalwood, and earthy tones",
      "Gỗ tuyết tùng ấm áp, đàn hương và hương đất",
    ),
    collection(
      "fresh",
      "Fresh",
      "Tươi mát",
      "Crisp citrus, ocean breeze, and morning dew",
      "Cam chanh tươi mát, gió biển và sương mai",
    ),
    collection(
      "warm",
      "Warm",
      "Ấm áp",
      "Rich vanilla, amber, and spiced comfort",
      "Vanilla nồng nàn, hổ phách và hương gia vị",
    ),
    collection(
      "gift-sets",
      "Gift Sets",
      "Hộp Quà Thượng Hạng",
      "Thoughtfully composed sets of our most-loved candles.",
      "Những bộ nến tuyển chọn được đóng gói trang trọng trong hộp quà.",
    ),
  ],
};

// Two more real catalogue entries make the typo/synonym checks meaningful
// without disturbing the exact expectations of the original 20 checks.
const extendedIndex = {
  version: 1,
  products: [
    ...index.products,
    product({
      slug: "wild-lavender",
      name: "Wild Lavender",
      description:
        "Transport yourself to the lavender fields of Provence. A soothing, herbaceous blend.",
      family: "Floral",
      familyVi: "Hoa",
      familyDescription: "Delicate blooms and garden-fresh petals",
      familyDescriptionVi: "Hương hoa tinh tế và cánh hoa tươi mát",
      noteList: [
        "Lavender",
        "Eucalyptus",
        "Lemon",
        "French Lavender",
        "Clary Sage",
        "Geranium",
        "Cedarwood",
        "Tonka Bean",
        "White Musk",
      ],
      price: 36,
    }),
    product({
      slug: "golden-hour",
      name: "Golden Hour",
      description:
        "A golden sunset of mandarin, saffron, honey, amber, rose, and vanilla.",
      family: "Warm",
      familyVi: "Ấm áp",
      familyDescription: "Rich vanilla, amber, and spiced comfort",
      familyDescriptionVi: "Vanilla nồng nàn, hổ phách và hương gia vị",
      noteList: [
        "Mandarin",
        "Saffron",
        "Ginger",
        "Honey",
        "Amber",
        "Rose Absolute",
        "Sandalwood",
        "Vanilla",
        "Caramel",
      ],
      price: 46,
    }),
  ],
  collections: index.collections,
};

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

check("normalizes Vietnamese diacritics to ASCII search form", () => {
  assert.equal(normalizeSearchText("Hương hoa"), "huong hoa");
  assert.equal(normalizeSearchText("Tươi mát"), "tuoi mat");
  assert.equal(normalizeSearchText("Ấm áp"), "am ap");
});

check("maps đ to d", () => {
  assert.equal(normalizeSearchText("Đỗ"), "do");
  assert.equal(normalizeSearchText("đường"), "duong");
});

check("lowercases, strips NFD combining marks, and collapses spaces", () => {
  assert.equal(
    normalizeSearchText("  HƯƠNG   HOA  "),
    "huong hoa",
  );
  assert.deepEqual(tokenizeSearchQuery("  Hương   Hoa "), [
    "huong",
    "hoa",
  ]);
});

// ---------------------------------------------------------------------------
// Highlighting
// ---------------------------------------------------------------------------

check("highlights accents and đ without breaking the original text", () => {
  const ranges = getHighlightRanges("Tươi mát", ["tuoi"]);
  assert.equal(ranges.length, 1);
  assert.equal("Tươi mát".slice(ranges[0].start, ranges[0].end), "Tươi");

  const multi = getHighlightRanges("Hương hoa", ["huong", "hoa"]);
  assert.equal(multi.length, 2);
  assert.equal(
    "Hương hoa".slice(multi[0].start, multi[0].end),
    "Hương",
  );
  assert.equal("Hương hoa".slice(multi[1].start, multi[1].end), "hoa");
});

check("merges overlapping highlight ranges", () => {
  const ranges = getHighlightRanges("vanilla", ["van", "nilla"]);
  assert.equal(ranges.length, 1);
  assert.deepEqual(ranges[0], { start: 0, end: 7 });
});

// ---------------------------------------------------------------------------
// Real query behaviour
// ---------------------------------------------------------------------------

check("vanilla matches the product name", () => {
  const results = searchCatalog(index, "vanilla");
  assert.equal(results.products[0]?.item.slug, "vanilla-ember");
});

check("floral matches the English family label", () => {
  const results = searchCatalog(index, "floral");
  assert.equal(results.products[0]?.item.slug, "midnight-garden");
  assert.equal(results.collections[0]?.item.slug, "floral");
});

check("huong hoa matches Vietnamese family copy", () => {
  const results = searchCatalog(index, "huong hoa");
  assert.equal(results.products[0]?.item.slug, "midnight-garden");
  assert.equal(results.collections[0]?.item.slug, "floral");
});

check("tuoi mat matches the Vietnamese Fresh family", () => {
  const results = searchCatalog(index, "tuoi mat");
  assert.equal(results.products[0]?.item.slug, "ocean-breeze");
  assert.equal(results.collections[0]?.item.slug, "fresh");
});

check("go am matches the Vietnamese Woody family copy", () => {
  const results = searchCatalog(index, "go am");
  assert.equal(results.products[0]?.item.slug, "cedar-sage");
  assert.equal(results.collections[0]?.item.slug, "woody");
});

check("gio bien matches the Fresh family copy", () => {
  const results = searchCatalog(index, "gio bien");
  assert.equal(results.products[0]?.item.slug, "ocean-breeze");
  assert.equal(results.collections[0]?.item.slug, "fresh");
});

check("multi-word queries require every token", () => {
  assert.equal(searchCatalog(index, "vanilla ocean").total, 0);
  assert.equal(searchCatalog(index, "vanilla nonsense").total, 0);
});

check("nonsense queries return no results", () => {
  const results = searchCatalog(index, "zzzz-not-a-scent");
  assert.equal(results.total, 0);
  assert.deepEqual(flattenSearchResults(results), []);
});

// ---------------------------------------------------------------------------
// Typo tolerance and synonyms
// ---------------------------------------------------------------------------

check("search synonyms are normalized and bidirectional", () => {
  for (const group of SEARCH_SYNONYMS) {
    assert.ok(group.length >= 2, "synonym group must have two or more terms");
    for (const term of group) {
      assert.equal(
        normalizeSearchText(term),
        term,
        `synonym "${term}" is not normalized`,
      );
    }
  }

  const pairs = [
    ["hoa", "floral"],
    ["go", "woody"],
    ["tuoi mat", "fresh"],
    ["am ap", "warm"],
    ["oai huong", "lavender"],
    ["vani", "vanilla"],
    ["bien", "ocean"],
    ["gio", "breeze"],
    ["nen", "candle"],
    ["lai", "jasmine"],
    ["hong", "rose"],
    ["tuyet tung", "cedar"],
    ["xo thom", "sage"],
    ["ho phach", "amber"],
    ["huong xa", "musk"],
  ];

  for (const [left, right] of pairs) {
    const group = SEARCH_SYNONYMS.find((terms) => terms.includes(left));
    assert.ok(group, `missing synonym group for "${left}"`);
    assert.ok(group.includes(right), `"${left}" is not linked to "${right}"`);
  }
});

check("lavendr finds Wild Lavender through bounded typo tolerance", () => {
  const results = searchCatalog(extendedIndex, "lavendr");
  assert.equal(results.products[0]?.item.slug, "wild-lavender");
});

check("floral and hoa both return the Floral family", () => {
  const english = searchCatalog(extendedIndex, "floral");
  const vietnamese = searchCatalog(extendedIndex, "hoa");

  const englishProducts = english.products
    .map((result) => result.item.slug)
    .sort();
  const vietnameseProducts = vietnamese.products
    .map((result) => result.item.slug)
    .sort();

  assert.deepEqual(englishProducts, ["midnight-garden", "wild-lavender"]);
  assert.deepEqual(vietnameseProducts, englishProducts);
  assert.equal(english.collections[0]?.item.slug, "floral");
  assert.equal(vietnamese.collections[0]?.item.slug, "floral");
});

check("oai huong reaches the English Lavender product through synonyms", () => {
  const results = searchCatalog(extendedIndex, "oai huong");
  assert.equal(results.products[0]?.item.slug, "wild-lavender");
});

check("tuoi mat and fresh return the same catalogue set", () => {
  const vietnamese = searchCatalog(extendedIndex, "tuoi mat");
  const english = searchCatalog(extendedIndex, "fresh");

  const productSlugs = (results) =>
    results.products.map((result) => result.item.slug).sort();
  const collectionSlugs = (results) =>
    results.collections.map((result) => result.item.slug).sort();

  assert.deepEqual(productSlugs(vietnamese), productSlugs(english));
  assert.deepEqual(collectionSlugs(vietnamese), collectionSlugs(english));
  assert.deepEqual(productSlugs(english), [
    "midnight-garden",
    "ocean-breeze",
    "wild-lavender",
  ]);
});

check("vani finds Vanilla Ember", () => {
  const results = searchCatalog(extendedIndex, "vani");
  assert.equal(results.products[0]?.item.slug, "vanilla-ember");
});

check("go am and tuyet tung reach the woody and warm catalogue", () => {
  const goAm = searchCatalog(extendedIndex, "go am");
  const goAmProducts = goAm.products.map((result) => result.item.slug);
  assert.ok(goAmProducts.includes("cedar-sage"));
  assert.ok(goAmProducts.includes("golden-hour"));
  assert.equal(goAm.collections[0]?.item.slug, "woody");

  const cedar = searchCatalog(extendedIndex, "tuyet tung");
  assert.equal(cedar.products[0]?.item.slug, "cedar-sage");
  assert.equal(cedar.collections[0]?.item.slug, "woody");
});

check("ocen is fuzzy-matched while short tokens are not", () => {
  const fuzzy = searchCatalog(extendedIndex, "ocen");
  assert.equal(fuzzy.products[0]?.item.slug, "ocean-breeze");
  assert.equal(searchCatalog(extendedIndex, "ocn").total, 0);
});

check("exact and prefix matches outrank fuzzy matches", () => {
  const rankingIndex = {
    version: 1,
    products: [
      product({ slug: "fuzzy", name: "Lavender" }),
      product({ slug: "prefix", name: "Lavendr Light" }),
      product({ slug: "exact", name: "Lavendr" }),
    ],
    collections: [],
  };

  const results = searchCatalog(rankingIndex, "lavendr");
  assert.deepEqual(
    results.products.map((result) => result.item.slug),
    ["exact", "prefix", "fuzzy"],
  );
});

check("typo tolerance and synonyms do not invent nonsense results", () => {
  assert.equal(searchCatalog(extendedIndex, "zzzz-not-a-scent").total, 0);
  assert.equal(searchCatalog(extendedIndex, "qzxv-not-a-scent").total, 0);
});

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

check("name exact > prefix > word-start > contains > family > description", () => {
  const rankingIndex = {
    version: 1,
    products: [
      product({
        slug: "description",
        name: "Quiet",
        description: "A candle for the evening.",
        family: "Fresh",
        familyVi: "Tươi mát",
      }),
      product({
        slug: "family",
        name: "Quiet",
        family: "Candle",
        familyVi: "Candle",
        familyDescription: "Candle",
        familyDescriptionVi: "Candle",
      }),
      product({
        slug: "contains",
        name: "Encandled",
      }),
      product({
        slug: "word-start",
        name: "Warm Candle",
      }),
      product({
        slug: "prefix",
        name: "Candlelight",
      }),
      product({
        slug: "exact",
        name: "Candle",
      }),
    ],
    collections: [],
  };

  const results = searchCatalog(rankingIndex, "candle");
  assert.deepEqual(
    results.products.map((result) => result.item.slug),
    [
      "exact",
      "prefix",
      "word-start",
      "contains",
      "family",
      "description",
    ],
  );
});

check("caps products at 6 and collections at 4", () => {
  const many = {
    version: 1,
    products: Array.from({ length: 8 }, (_, index) =>
      product({
        slug: `product-${index}`,
        name: `Candle ${index + 1}`,
      }),
    ),
    collections: Array.from({ length: 6 }, (_, index) =>
      collection(
        `collection-${index}`,
        `Candle Collection ${index + 1}`,
        `Bộ sưu tập nến ${index + 1}`,
        "Candle collection",
        "Bộ sưu tập nến",
      ),
    ),
  };

  const results = searchCatalog(many, "candle");
  assert.equal(results.products.length, 6);
  assert.equal(results.collections.length, 4);
  assert.equal(results.total, 10);
});

// ---------------------------------------------------------------------------
// Static wiring checks
// ---------------------------------------------------------------------------

check("search API has no user-controlled query parameters", () => {
  const source = read("/app/api/search/route.ts");
  assert.match(source, /export async function GET\(\)/);
  assert.doesNotMatch(source, /searchParams/);
  assert.doesNotMatch(source, /request\.url/);
});

check("search API projects public data and sets Cloudflare cache headers", () => {
  const source = read("/app/api/search/route.ts");
  assert.match(source, /getProducts/);
  assert.match(source, /inStock/);
  assert.match(source, /s-maxage=60/);
  assert.match(source, /stale-while-revalidate=300/);
  assert.doesNotMatch(source, /stockQuantity:\s*variant/);
  assert.doesNotMatch(source, /sku:/);
  assert.doesNotMatch(source, /compareAtPrice/);
});

check("palette is dynamically loaded without SSR", () => {
  const host = read("/components/search/search-overlay-host.tsx");
  assert.match(host, /dynamic\(/);
  assert.match(host, /ssr:\s*false/);
  assert.match(host, /isTypingTarget/);
});

check("combobox, listbox, live count and IME guards are wired", () => {
  const palette = read("/components/search/search-command-palette.tsx");
  assert.match(palette, /role="combobox"/);
  assert.match(palette, /aria-activedescendant/);
  assert.match(palette, /role="listbox"/);
  assert.match(palette, /aria-live="polite"/);
  assert.match(palette, /isComposing/);
  assert.match(palette, /onCompositionStart/);
  assert.match(palette, /onCompositionEnd/);
  assert.match(palette, /requestAssistant/);
});

check("English and Vietnamese search copy is present", () => {
  const en = JSON.parse(read("/messages/en.json"));
  const vi = JSON.parse(read("/messages/vi.json"));

  const keys = [
    "title",
    "placeholder",
    "close",
    "loading",
    "error",
    "retry",
    "browseFamilies",
    "suggestions",
    "recentSearches",
    "clearRecent",
    "products",
    "collections",
    "resultsCount",
    "noResultsTitle",
    "noResultsDescription",
    "askAssistant",
    "ariaResults",
    "recentSearchAria",
    "familyAria",
    "selectHint",
  ];

  for (const key of keys) {
    assert.ok(en.search?.[key], `messages/en.json missing search.${key}`);
    assert.ok(vi.search?.[key], `messages/vi.json missing search.${key}`);
  }
});

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
