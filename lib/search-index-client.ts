/**
 * Client-side cache for the public search index.
 *
 * The single index is fetched once per page load, kept in memory, and shared by
 * navbar hover/focus prefetching and the palette itself. The API response is
 * CDN-cached for 60s; the in-memory copy also prevents repeated round trips
 * while a visitor opens and closes the palette.
 */

import type { SearchIndex } from "@/lib/search";

const SEARCH_INDEX_URL = "/api/search";

let cachedIndex: SearchIndex | null = null;
let inflightRequest: Promise<SearchIndex> | null = null;

export function peekSearchIndex(): SearchIndex | null {
  return cachedIndex;
}

function isSearchIndex(value: unknown): value is SearchIndex {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<SearchIndex>;
  return (
    typeof candidate.version === "number" &&
    Array.isArray(candidate.products) &&
    Array.isArray(candidate.collections)
  );
}

export function loadSearchIndex(force = false): Promise<SearchIndex> {
  if (!force && cachedIndex) return Promise.resolve(cachedIndex);
  if (!force && inflightRequest) return inflightRequest;

  const request = fetch(SEARCH_INDEX_URL, {
    headers: { Accept: "application/json" },
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Search index request failed (${response.status}).`);
      }

      const data: unknown = await response.json();
      if (!isSearchIndex(data)) {
        throw new Error("Search index returned an unexpected payload.");
      }

      cachedIndex = data;
      return data;
    })
    .finally(() => {
      // A rejected request must not poison the cache; the next open can retry.
      inflightRequest = null;
    });

  inflightRequest = request;
  return request;
}

export function prefetchSearchIndex(): void {
  void loadSearchIndex().catch(() => {
    // Hover/focus prefetch failures are silent; the palette shows the explicit
    // error state and retry button when the visitor actually opens it.
  });
}
