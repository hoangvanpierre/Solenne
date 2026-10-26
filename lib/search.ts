/**
 * Pure search primitives for the command palette.
 *
 * This module deliberately has no imports and no browser/Node APIs so the
 * static verification harness (`scripts/verify-search.mjs`) can execute the
 * real functions directly, and so the same rules run on the server and client.
 */

export interface LocalizedText {
  en: string;
  vi: string;
}

export interface LocalizedList {
  en: string[];
  vi: string[];
}

export interface SearchProductNotes {
  top: LocalizedList;
  heart: LocalizedList;
  base: LocalizedList;
}

export interface SearchIndexProduct {
  id: string;
  slug: string;
  name: LocalizedText;
  description: LocalizedText;
  scentFamily: string;
  family: LocalizedText;
  familyDescription: LocalizedText;
  notes: SearchProductNotes;
  price: {
    USD: number;
    VND: number;
  };
  inStock: boolean;
  image: string | null;
}

export interface SearchIndexCollection {
  slug: string;
  name: LocalizedText;
  description: LocalizedText;
  scentFamily: string | null;
}

export interface SearchIndex {
  version: number;
  products: SearchIndexProduct[];
  collections: SearchIndexCollection[];
}

export type SearchMatchKind =
  | "name-exact"
  | "name-prefix"
  | "name-word"
  | "name-contains"
  | "family-notes"
  | "description"
  | "any-field";

export interface RankedProduct {
  kind: "product";
  item: SearchIndexProduct;
  score: number;
  match: SearchMatchKind;
}

export interface RankedCollection {
  kind: "collection";
  item: SearchIndexCollection;
  score: number;
  match: SearchMatchKind;
}

export type SearchResult = RankedProduct | RankedCollection;

export interface SearchResults {
  products: RankedProduct[];
  collections: RankedCollection[];
  total: number;
}

export interface SearchLimits {
  products?: number;
  collections?: number;
}

export interface HighlightRange {
  start: number;
  end: number;
}

const MATCH_SCORES: Record<SearchMatchKind, number> = {
  "name-exact": 1000,
  "name-prefix": 900,
  "name-word": 800,
  "name-contains": 700,
  "family-notes": 500,
  description: 300,
  "any-field": 100,
};

/**
 * Bidirectional search synonyms, written in normalized form (lowercase, no
 * accents, `đ` -> `d`). Each inner array is one equivalence group: any term in
 * the group can stand in for the others. Multi-word terms are matched as whole
 * phrases; single words are expanded per token.
 *
 * Edit this one constant to teach the palette a new scent-family or note name.
 */
export const SEARCH_SYNONYMS: readonly (readonly string[])[] = [
  // Scent families
  ["hoa", "floral"],
  ["go", "woody"],
  ["tuoi mat", "fresh"],
  ["am ap", "warm"],

  // Sea / fresh vocabulary
  ["bien", "ocean", "breeze"],
  ["gio", "breeze"],
  ["gio bien", "ocean breeze"],
  ["nen", "candle"],
  ["muoi bien", "sea salt"],
  ["la xanh", "green leaves"],
  ["ozon", "ozone"],
  ["go troi", "driftwood"],
  ["chanh", "lemon"],
  ["khuynh diep", "eucalyptus"],

  // Floral notes
  ["lai", "jasmine"],
  ["hong", "rose", "rose absolute", "hong tuyet doi"],
  ["loa ken", "linh lan", "lily", "lily of the valley"],
  ["phong lu", "geranium"],
  ["oai huong", "lavender", "french lavender", "oai huong phap"],

  // Woody notes
  ["cedar", "cedarwood", "tuyet tung"],
  ["dan huong", "sandalwood"],
  ["huong lau", "vetiver"],
  ["hoac huong", "patchouli"],
  ["thong", "pine"],

  // Warm / spiced notes
  ["vani", "vanilla"],
  ["ho phach", "amber"],
  ["huong xa", "musk", "white musk", "huong xa trang"],
  ["que", "cinnamon"],
  ["bach dau khau", "cardamom"],
  ["tieu hong", "pink pepper"],
  ["dau tonka", "tonka bean"],
  ["caramen", "caramel"],
  ["mat ong", "honey"],
  ["quyt", "mandarin"],
  ["nghe tay", "saffron"],
  ["gung", "ginger"],
  ["canh kien", "benzoin"],
  ["xo thom", "sage", "clary sage", "xo thom clary"],
];

const SYNONYM_SCORE_PENALTY = 40;
const FUZZY_SCORE_PENALTY_PER_EDIT = 350;
const MAX_FUZZY_EDITS = 2;
const MAX_QUERY_VARIANTS = 12;

/**
 * Accent-insensitive, case-insensitive search form.
 *
 * Vietnamese text is precomposed in the catalogue, so NFD + combining-mark
 * stripping makes "Hương hoa" and "huong hoa" comparable. `đ` is not decomposed
 * by NFD, hence the explicit mapping. Whitespace is collapsed last so repeated
 * spaces in a query never create empty tokens.
 */
export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeSearchQuery(query: string): string[] {
  const normalized = normalizeSearchText(query);
  return normalized ? normalized.split(" ") : [];
}

function buildSynonymIndex(): Map<string, Set<string>> {
  const alternatives = new Map<string, Set<string>>();

  for (const group of SEARCH_SYNONYMS) {
    const terms = Array.from(
      new Set(group.map((term) => normalizeSearchText(term)).filter(Boolean)),
    );

    for (const term of terms) {
      let set = alternatives.get(term);
      if (!set) {
        set = new Set<string>();
        alternatives.set(term, set);
      }
      for (const other of terms) {
        if (other !== term) set.add(other);
      }
    }
  }

  return alternatives;
}

const SYNONYM_ALTERNATIVES = buildSynonymIndex();

const SINGLE_TOKEN_SYNONYMS = new Map<string, string[]>();

interface PhraseSynonym {
  tokens: string[];
  alternatives: string[][];
}

const PHRASE_SYNONYMS: PhraseSynonym[] = [];

for (const [term, alternativeSet] of SYNONYM_ALTERNATIVES) {
  const items = Array.from(alternativeSet);
  if (term.includes(" ")) {
    PHRASE_SYNONYMS.push({
      tokens: term.split(" "),
      alternatives: items.map((value) => value.split(" ")),
    });
  } else {
    SINGLE_TOKEN_SYNONYMS.set(term, items);
  }
}

interface PreparedDocument {
  names: string[];
  nameText: string;
  nameWords: string[];
  familyText: string;
  descriptionText: string;
  allText: string;
  fuzzyWords: string[];
}

interface QueryVariant {
  tokens: string[];
  queryText: string;
  penalty: number;
}

interface SearchPlan {
  query: string;
  tokens: string[];
  variants: QueryVariant[] | null;
}

interface ResolvedToken {
  term: string;
  penalty: number;
}

interface DistanceScratch {
  previousPrevious: number[];
  previous: number[];
  current: number[];
}

const preparedDocumentCache = new WeakMap<object, PreparedDocument>();

function prepareDocument(
  names: string[],
  familyAndNotes: string[],
  descriptions: string[],
): PreparedDocument {
  const normalizedNames = names
    .map((name) => normalizeSearchText(name))
    .filter(Boolean);
  const familyText = familyAndNotes
    .map((value) => normalizeSearchText(value))
    .filter(Boolean)
    .join(" ");
  const descriptionText = descriptions
    .map((value) => normalizeSearchText(value))
    .filter(Boolean)
    .join(" ");
  const nameText = normalizedNames.join(" ");
  const allText = [nameText, familyText, descriptionText]
    .filter(Boolean)
    .join(" ");

  return {
    names: normalizedNames,
    nameText,
    nameWords: nameText.split(" ").filter(Boolean),
    familyText,
    descriptionText,
    allText,
    // Typo targets are the name, scent family, and notes only. Descriptions are
    // intentionally excluded so a vague misspelling cannot match marketing copy.
    fuzzyWords: Array.from(
      new Set([
        ...nameText.split(" ").filter(Boolean),
        ...familyText.split(" ").filter(Boolean),
      ]),
    ),
  };
}

function normalizeWithMap(input: string): {
  text: string;
  starts: number[];
  ends: number[];
} {
  let text = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let cursor = 0;

  // Iterate by code point so surrogate pairs are not split, while retaining
  // the original UTF-16 offsets needed to slice the display string.
  for (const character of input) {
    const originalStart = cursor;
    cursor += character.length;

    const normalized = character
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/đ/g, "d");

    for (let index = 0; index < normalized.length; index += 1) {
      text += normalized[index];
      starts.push(originalStart);
      ends.push(cursor);
    }
  }

  return { text, starts, ends };
}

/**
 * Accent-insensitive highlight ranges for `text` against already-normalized
 * query tokens. Returns [start, end) offsets into the original display string.
 * Overlapping/adjacent matches are merged.
 */
export function getHighlightRanges(
  text: string,
  tokens: string[],
): HighlightRange[] {
  if (!text || tokens.length === 0) return [];

  const normalized = normalizeWithMap(text);
  const ranges: HighlightRange[] = [];

  for (const token of tokens) {
    if (!token) continue;

    let from = 0;
    let index = normalized.text.indexOf(token, from);

    while (index !== -1) {
      const lastIndex = index + token.length - 1;
      ranges.push({
        start: normalized.starts[index],
        end: normalized.ends[lastIndex],
      });
      from = index + token.length;
      index = normalized.text.indexOf(token, from);
    }
  }

  if (ranges.length === 0) return [];

  ranges.sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: HighlightRange[] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  return merged;
}

function wordStartsWith(tokens: string[], text: string): boolean {
  const words = normalizeSearchText(text).split(" ").filter(Boolean);
  return tokens.every((token) =>
    words.some((word) => word.startsWith(token)),
  );
}

function containsEveryToken(tokens: string[], text: string): boolean {
  return tokens.every((token) => text.includes(token));
}

function scoreDirect(
  doc: PreparedDocument,
  query: string,
  tokens: string[],
): { score: number; match: SearchMatchKind } | null {
  if (!query || tokens.length === 0) return null;

  // Every token must match somewhere in the document, even when the tokens
  // come from different fields (for example one from the name, one from a
  // note). Ranking below only rewards a tier when it accounts for all tokens.
  if (!containsEveryToken(tokens, doc.allText)) return null;

  if (doc.names.some((name) => name === query)) {
    return { score: MATCH_SCORES["name-exact"], match: "name-exact" };
  }

  if (doc.names.some((name) => name.startsWith(query))) {
    return { score: MATCH_SCORES["name-prefix"], match: "name-prefix" };
  }

  if (doc.names.some((name) => wordStartsWith(tokens, name))) {
    return { score: MATCH_SCORES["name-word"], match: "name-word" };
  }

  if (doc.names.some((name) => name.includes(query))) {
    return { score: MATCH_SCORES["name-contains"], match: "name-contains" };
  }

  if (containsEveryToken(tokens, doc.familyText)) {
    return { score: MATCH_SCORES["family-notes"], match: "family-notes" };
  }

  if (containsEveryToken(tokens, doc.descriptionText)) {
    return { score: MATCH_SCORES.description, match: "description" };
  }

  return { score: MATCH_SCORES["any-field"], match: "any-field" };
}

function termStartsWord(term: string, words: string[]): boolean {
  return !term.includes(" ") && words.some((word) => word.startsWith(term));
}

/**
 * Bounded optimal-string-alignment (Damerau-Levenshtein with adjacent
 * transpositions). Returns `maxDistance + 1` as soon as a row proves the
 * distance can no longer fit, and reuses scratch arrays across comparisons.
 */
function boundedDamerauLevenshtein(
  source: string,
  target: string,
  maxDistance: number,
  scratch: DistanceScratch,
): number {
  const sourceLength = source.length;
  const targetLength = target.length;

  if (source === target) return 0;
  if (Math.abs(sourceLength - targetLength) > maxDistance) {
    return maxDistance + 1;
  }
  if (sourceLength === 0) return targetLength;
  if (targetLength === 0) return sourceLength;

  const size = targetLength + 1;
  if (scratch.previous.length < size) {
    scratch.previousPrevious = new Array<number>(size).fill(0);
    scratch.previous = new Array<number>(size).fill(0);
    scratch.current = new Array<number>(size).fill(0);
  }

  let previousPrevious = scratch.previousPrevious;
  let previous = scratch.previous;
  let current = scratch.current;

  for (let column = 0; column <= targetLength; column += 1) {
    previous[column] = column;
  }

  for (let row = 1; row <= sourceLength; row += 1) {
    current[0] = row;
    let rowMinimum = current[0];
    const sourceCode = source.charCodeAt(row - 1);

    for (let column = 1; column <= targetLength; column += 1) {
      const targetCode = target.charCodeAt(column - 1);
      const cost = sourceCode === targetCode ? 0 : 1;
      let value = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + cost,
      );

      if (
        row > 1 &&
        column > 1 &&
        sourceCode === target.charCodeAt(column - 2) &&
        source.charCodeAt(row - 2) === targetCode
      ) {
        value = Math.min(value, previousPrevious[column - 2] + 1);
      }

      current[column] = value;
      if (value < rowMinimum) rowMinimum = value;
    }

    if (rowMinimum > maxDistance) {
      scratch.previousPrevious = previousPrevious;
      scratch.previous = previous;
      scratch.current = current;
      return maxDistance + 1;
    }

    const swap = previousPrevious;
    previousPrevious = previous;
    previous = current;
    current = swap;
  }

  scratch.previousPrevious = previousPrevious;
  scratch.previous = previous;
  scratch.current = current;
  return previous[targetLength];
}

function resolveFallbackToken(
  doc: PreparedDocument,
  token: string,
  scratch: DistanceScratch,
): ResolvedToken | null {
  if (doc.allText.includes(token)) {
    return { term: token, penalty: 0 };
  }

  const synonyms = SINGLE_TOKEN_SYNONYMS.get(token);
  if (synonyms) {
    for (const synonym of synonyms) {
      if (doc.allText.includes(synonym)) {
        return { term: synonym, penalty: SYNONYM_SCORE_PENALTY };
      }
    }
  }

  // Short tokens are too noisy for edit distance. A 4-6 character token gets
  // one edit; 7+ gets two. Word-length prefiltering and the bounded DP keep
  // this cheap across the whole index.
  if (token.length >= 4) {
    const maxDistance = token.length <= 6 ? 1 : MAX_FUZZY_EDITS;
    let bestTerm: string | null = null;
    let bestDistance = maxDistance + 1;

    for (const word of doc.fuzzyWords) {
      if (Math.abs(word.length - token.length) > maxDistance) continue;

      const distance = boundedDamerauLevenshtein(
        token,
        word,
        maxDistance,
        scratch,
      );

      if (distance < bestDistance) {
        bestDistance = distance;
        bestTerm = word;
        if (distance <= 1) break;
      }
    }

    if (bestTerm && bestDistance <= maxDistance) {
      return {
        term: bestTerm,
        penalty: bestDistance * FUZZY_SCORE_PENALTY_PER_EDIT,
      };
    }
  }

  return null;
}

function scoreFallback(
  doc: PreparedDocument,
  tokens: string[],
  scratch: DistanceScratch,
): { score: number; match: SearchMatchKind } | null {
  const resolved: ResolvedToken[] = [];
  let penalty = 0;

  for (const token of tokens) {
    const item = resolveFallbackToken(doc, token, scratch);
    if (!item) return null;
    resolved.push(item);
    penalty += item.penalty;
  }

  if (resolved.every((item) => termStartsWord(item.term, doc.nameWords))) {
    return {
      score: MATCH_SCORES["name-word"] - penalty,
      match: "name-word",
    };
  }

  if (resolved.every((item) => doc.nameText.includes(item.term))) {
    return {
      score: MATCH_SCORES["name-contains"] - penalty,
      match: "name-contains",
    };
  }

  if (resolved.every((item) => doc.familyText.includes(item.term))) {
    return {
      score: MATCH_SCORES["family-notes"] - penalty,
      match: "family-notes",
    };
  }

  if (resolved.every((item) => doc.descriptionText.includes(item.term))) {
    return {
      score: MATCH_SCORES.description - penalty,
      match: "description",
    };
  }

  if (resolved.every((item) => doc.allText.includes(item.term))) {
    return {
      score: MATCH_SCORES["any-field"] - penalty,
      match: "any-field",
    };
  }

  return null;
}

function buildQueryVariants(tokens: string[]): QueryVariant[] {
  const variants: QueryVariant[] = [];
  const queue: { tokens: string[]; penalty: number }[] = [
    { tokens, penalty: 0 },
  ];
  const seen = new Set([tokens.join(" ")]);

  while (queue.length > 0 && variants.length < MAX_QUERY_VARIANTS) {
    const current = queue.shift();
    if (!current) break;

    for (const phrase of PHRASE_SYNONYMS) {
      const phraseLength = phrase.tokens.length;
      if (phraseLength === 0 || current.tokens.length < phraseLength) {
        continue;
      }

      for (
        let start = 0;
        start <= current.tokens.length - phraseLength;
        start += 1
      ) {
        let matches = true;
        for (let offset = 0; offset < phraseLength; offset += 1) {
          if (current.tokens[start + offset] !== phrase.tokens[offset]) {
            matches = false;
            break;
          }
        }
        if (!matches) continue;

        for (const alternative of phrase.alternatives) {
          if (alternative.length === 0) continue;

          const nextTokens = [
            ...current.tokens.slice(0, start),
            ...alternative,
            ...current.tokens.slice(start + phraseLength),
          ];
          const key = nextTokens.join(" ");
          if (seen.has(key)) continue;
          seen.add(key);

          const next = {
            tokens: nextTokens,
            penalty: current.penalty + SYNONYM_SCORE_PENALTY,
          };
          variants.push({ ...next, queryText: key });

          if (variants.length >= MAX_QUERY_VARIANTS) return variants;
          queue.push(next);
        }
      }
    }
  }

  return variants;
}

function buildSearchPlan(query: string): SearchPlan {
  const normalized = normalizeSearchText(query);
  const tokens = normalized ? normalized.split(" ") : [];

  return {
    query: normalized,
    tokens,
    variants: null,
  };
}

function getQueryVariants(plan: SearchPlan): QueryVariant[] {
  if (!plan.variants) {
    plan.variants = buildQueryVariants(plan.tokens);
  }
  return plan.variants;
}

function scoreDocument(
  doc: PreparedDocument,
  plan: SearchPlan,
  scratch: DistanceScratch,
): { score: number; match: SearchMatchKind } | null {
  if (plan.tokens.length === 0) return null;

  // Direct matching always wins outright. Fuzzy and synonym work is only
  // consulted when the query as typed cannot cover every token.
  const direct = scoreDirect(doc, plan.query, plan.tokens);
  if (direct) return direct;

  let best = scoreFallback(doc, plan.tokens, scratch);

  for (const variant of getQueryVariants(plan)) {
    const variantDirect = scoreDirect(doc, variant.queryText, variant.tokens);
    const candidate =
      variantDirect ?? scoreFallback(doc, variant.tokens, scratch);
    if (!candidate) continue;

    const adjusted = {
      score: candidate.score - variant.penalty,
      match: candidate.match,
    };

    if (!best || adjusted.score > best.score) {
      best = adjusted;
    }
  }

  return best;
}

function productNoteText(product: SearchIndexProduct): string[] {
  const { top, heart, base } = product.notes;
  return [...top.en, ...top.vi, ...heart.en, ...heart.vi, ...base.en, ...base.vi];
}

function prepareProductDocument(product: SearchIndexProduct): PreparedDocument {
  const cached = preparedDocumentCache.get(product);
  if (cached) return cached;

  const doc = prepareDocument(
    [product.name.en, product.name.vi],
    [
      product.family.en,
      product.family.vi,
      product.familyDescription.en,
      product.familyDescription.vi,
      ...productNoteText(product),
    ],
    [product.description.en, product.description.vi],
  );
  preparedDocumentCache.set(product, doc);
  return doc;
}

function prepareCollectionDocument(
  collection: SearchIndexCollection,
): PreparedDocument {
  const cached = preparedDocumentCache.get(collection);
  if (cached) return cached;

  const doc = prepareDocument(
    [collection.name.en, collection.name.vi],
    [],
    [collection.description.en, collection.description.vi],
  );
  preparedDocumentCache.set(collection, doc);
  return doc;
}

function rankProduct(
  product: SearchIndexProduct,
  plan: SearchPlan,
  scratch: DistanceScratch,
): RankedProduct | null {
  const scored = scoreDocument(prepareProductDocument(product), plan, scratch);
  return scored ? { kind: "product", item: product, ...scored } : null;
}

function rankCollection(
  collection: SearchIndexCollection,
  plan: SearchPlan,
  scratch: DistanceScratch,
): RankedCollection | null {
  const scored = scoreDocument(
    prepareCollectionDocument(collection),
    plan,
    scratch,
  );
  return scored ? { kind: "collection", item: collection, ...scored } : null;
}

function compareRanked(a: SearchResult, b: SearchResult): number {
  if (b.score !== a.score) return b.score - a.score;

  const aName = a.item.name.en || a.item.name.vi;
  const bName = b.item.name.en || b.item.name.vi;

  if (aName.length !== bName.length) return aName.length - bName.length;

  return aName.localeCompare(bName);
}

export function searchCatalog(
  index: SearchIndex,
  query: string,
  limits: SearchLimits = {},
): SearchResults {
  const plan = buildSearchPlan(query);

  if (plan.tokens.length === 0) {
    return { products: [], collections: [], total: 0 };
  }

  const productLimit = limits.products ?? 6;
  const collectionLimit = limits.collections ?? 4;
  const scratch: DistanceScratch = {
    previousPrevious: [],
    previous: [],
    current: [],
  };

  const products = index.products
    .map((product) => rankProduct(product, plan, scratch))
    .filter((result): result is RankedProduct => result !== null)
    .sort(compareRanked)
    .slice(0, Math.max(0, productLimit));

  const collections = index.collections
    .map((collection) => rankCollection(collection, plan, scratch))
    .filter((result): result is RankedCollection => result !== null)
    .sort(compareRanked)
    .slice(0, Math.max(0, collectionLimit));

  return {
    products,
    collections,
    total: products.length + collections.length,
  };
}

export function flattenSearchResults(results: SearchResults): SearchResult[] {
  return [...results.products, ...results.collections];
}
