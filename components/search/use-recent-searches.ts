"use client";

import { useCallback, useRef, useState } from "react";
import { normalizeSearchText } from "@/lib/search";

const RECENT_SEARCH_STORAGE_KEY = "solenne:recent-searches";
const MAX_RECENT_SEARCHES = 5;

function readRecentSearches(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCH_STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

function writeRecentSearches(values: string[]): void {
  try {
    window.localStorage.setItem(
      RECENT_SEARCH_STORAGE_KEY,
      JSON.stringify(values),
    );
  } catch {
    // Storage can be unavailable in private mode; recents simply stay in memory.
  }
}

export interface RecentSearches {
  recent: string[];
  saveRecent: (query: string) => void;
  clearRecent: () => void;
}

export function useRecentSearches(): RecentSearches {
  // The palette is mounted only while open, so the lazy initializer re-reads
  // storage on each visit without an effect or an extra render.
  const [recent, setRecent] = useState<string[]>(() =>
    readRecentSearches(),
  );
  // Selection closes (and therefore unmounts) the palette in the same event.
  // Keep the latest list in a ref and write storage synchronously so the
  // persisted value never depends on React processing a queued state update.
  const recentRef = useRef(recent);

  const saveRecent = useCallback((query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    const normalized = normalizeSearchText(trimmed);
    const next = [
      trimmed,
      ...recentRef.current.filter(
        (entry) => normalizeSearchText(entry) !== normalized,
      ),
    ].slice(0, MAX_RECENT_SEARCHES);

    recentRef.current = next;
    writeRecentSearches(next);
    setRecent(next);
  }, []);

  const clearRecent = useCallback(() => {
    recentRef.current = [];
    setRecent([]);

    try {
      window.localStorage.removeItem(RECENT_SEARCH_STORAGE_KEY);
    } catch {
      // Ignore storage failures.
    }
  }, []);

  return { recent, saveRecent, clearRecent };
}
