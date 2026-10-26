"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ADMIN_SEARCH_MAX_LENGTH } from "@/lib/search-utils";

// ---------------------------------------------------------------------------
// URL-backed admin search controller.
//
// The URL is the source of truth: a committed term lives in `?q=`, every other
// query parameter (status, date, …) is preserved, and `page` is dropped so a
// new term always starts on page 1. Search commits use router.replace inside a
// transition, which keeps history clean, avoids a scroll jump and lets the UI
// dim while the server re-runs the same authorized query. Discrete filter
// changes (status) keep a history entry so Back can undo them.
//
// `search` is accepted as a legacy alias so existing bookmarks and links keep
// working; the first commit rewrites it to `q`.
// ---------------------------------------------------------------------------

export interface UseUrlSearchOptions {
  /** Term rendered by the server before the URL is available. */
  initialValue?: string;
  /** Primary query parameter. */
  param?: string;
  /** Previously used query parameter, still read and then removed. */
  legacyParam?: string;
  /** Delay before a keystroke is committed. */
  debounceMs?: number;
  /**
   * Minimum committed length. Shorter non-empty terms clear the query instead
   * of running an expensive one-character search.
   */
  minLength?: number;
}

export interface UrlSearchController {
  /** Text currently in the input (may be ahead of the committed URL term). */
  value: string;
  /** Term the server has been asked to search for. */
  term: string;
  isPending: boolean;
  param: string;
  legacyParam: string;
  minLength: number;
  handleChange: (next: string, options?: { isComposing?: boolean }) => void;
  handleCompositionStart: () => void;
  handleCompositionEnd: () => void;
  submitNow: () => void;
  clearSearch: () => void;
  resetAll: () => void;
  updateParams: (
    next: Record<string, string | null>,
    options?: { resetPage?: boolean; history?: "push" | "replace" }
  ) => void;
}

function normalizeTerm(value: string | null | undefined): string {
  return (value ?? "").trim().slice(0, ADMIN_SEARCH_MAX_LENGTH);
}

export function useUrlSearch(
  options: UseUrlSearchOptions = {}
): UrlSearchController {
  const {
    initialValue = "",
    param = "q",
    legacyParam = "search",
    debounceMs = 300,
    minLength = 2,
  } = options;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const urlTerm = normalizeTerm(
    searchParams.get(param) ?? searchParams.get(legacyParam) ?? initialValue
  );
  const committedTerm = urlTerm.length >= minLength ? urlTerm : "";

  const [value, setValue] = useState(urlTerm);
  const valueRef = useRef(urlTerm);
  const composingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRequestedRef = useRef(urlTerm);

  const searchParamsRef = useRef<URLSearchParams>(
    new URLSearchParams(searchParams.toString())
  );
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    // While a navigation we started is still in flight, keep the optimistic
    // parameter set. An older request completing late must not wipe the newer
    // filters that are already queued behind it.
    if (isPending) return;
    searchParamsRef.current = new URLSearchParams(searchParams.toString());
  }, [searchParams, isPending]);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // Adopt terms that arrive from outside the input (back/forward, reset link,
  // a status change link that carries a term). A term this controller already
  // requested is deliberately ignored: the user may have typed further while
  // the previous navigation was in flight, and that newer text must survive.
  // Stale completions are ignored entirely while a transition is pending, so an
  // older request cannot pull the input back to its term.
  useEffect(() => {
    if (isPending) return;
    if (urlTerm === lastRequestedRef.current) return;
    lastRequestedRef.current = urlTerm;
    valueRef.current = urlTerm;
    setValue(urlTerm);
  }, [isPending, urlTerm]);

  const cancelScheduled = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => cancelScheduled, [cancelScheduled]);

  const buildUrl = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParamsRef.current.toString());
      mutate(params);
      // Keep the next commit on the same filter set even if this navigation is
      // still in flight when the debounce fires.
      searchParamsRef.current = params;
      const query = params.toString();
      return query ? `${pathnameRef.current}?${query}` : pathnameRef.current;
    },
    []
  );

  const commitTerm = useCallback(
    (raw: string) => {
      cancelScheduled();

      const next = normalizeTerm(raw);
      // One-character server searches are avoided: clear the committed query
      // instead, so the list falls back to the full authorized result set.
      const effective = next.length >= minLength ? next : "";
      const current = normalizeTerm(
        searchParamsRef.current.get(param) ??
          searchParamsRef.current.get(legacyParam)
      );
      const hasLegacy = searchParamsRef.current.has(legacyParam);
      const hasPage = searchParamsRef.current.has("page");

      lastRequestedRef.current = effective;

      if (effective === current && !hasLegacy && !hasPage) return;

      const href = buildUrl((params) => {
        params.delete(legacyParam);
        params.delete("page");
        if (effective) params.set(param, effective);
        else params.delete(param);
      });

      startTransition(() => {
        router.replace(href, { scroll: false });
      });
    },
    [
      buildUrl,
      cancelScheduled,
      legacyParam,
      minLength,
      param,
      router,
      startTransition,
    ]
  );

  const scheduleCommit = useCallback(
    (nextValue?: string) => {
      cancelScheduled();
      if (composingRef.current) return;

      const pendingValue = nextValue ?? valueRef.current;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (composingRef.current) return;
        commitTerm(pendingValue);
      }, debounceMs);
    },
    [cancelScheduled, commitTerm, debounceMs]
  );

  const handleChange = useCallback(
    (next: string, changeOptions?: { isComposing?: boolean }) => {
      const bounded = next.slice(0, ADMIN_SEARCH_MAX_LENGTH);
      valueRef.current = bounded;
      setValue(bounded);

      if (changeOptions?.isComposing || composingRef.current) {
        cancelScheduled();
        return;
      }

      scheduleCommit(bounded);
    },
    [cancelScheduled, scheduleCommit]
  );

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true;
    cancelScheduled();
  }, [cancelScheduled]);

  const handleCompositionEnd = useCallback(() => {
    composingRef.current = false;
    scheduleCommit(valueRef.current);
  }, [scheduleCommit]);

  const submitNow = useCallback(() => {
    composingRef.current = false;
    commitTerm(valueRef.current);
  }, [commitTerm]);

  const clearSearch = useCallback(() => {
    cancelScheduled();
    composingRef.current = false;
    valueRef.current = "";
    setValue("");
    lastRequestedRef.current = "";

    const hasQuery =
      searchParamsRef.current.has(param) ||
      searchParamsRef.current.has(legacyParam) ||
      searchParamsRef.current.has("page");
    if (!hasQuery) return;

    const href = buildUrl((params) => {
      params.delete(param);
      params.delete(legacyParam);
      params.delete("page");
    });

    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }, [buildUrl, cancelScheduled, legacyParam, param, router, startTransition]);

  const resetAll = useCallback(() => {
    cancelScheduled();
    composingRef.current = false;
    valueRef.current = "";
    setValue("");
    lastRequestedRef.current = "";

    const hadParams = searchParamsRef.current.toString() !== "";
    searchParamsRef.current = new URLSearchParams();
    if (!hadParams) return;

    startTransition(() => {
      router.replace(pathnameRef.current, { scroll: false });
    });
  }, [cancelScheduled, router, startTransition]);

  const updateParams = useCallback(
    (
      next: Record<string, string | null>,
      updateOptions?: { resetPage?: boolean; history?: "push" | "replace" }
    ) => {
      const href = buildUrl((params) => {
        // Standardise legacy bookmarks on the canonical parameter as soon as
        // any other filter changes, so `search` never lingers beside `q`.
        const legacyTerm = params.get(legacyParam);
        if (legacyTerm !== null && !params.has(param)) {
          params.set(param, legacyTerm);
        }
        params.delete(legacyParam);

        for (const [key, rawValue] of Object.entries(next)) {
          if (rawValue === null || rawValue === "" || rawValue === "all") {
            params.delete(key);
          } else {
            params.set(key, rawValue);
          }
        }
        if (updateOptions?.resetPage !== false) params.delete("page");
      });

      const navigate =
        updateOptions?.history === "replace" ? router.replace : router.push;

      startTransition(() => {
        navigate(href, { scroll: false });
      });
    },
    [buildUrl, legacyParam, param, router, startTransition]
  );

  return {
    value,
    term: committedTerm,
    isPending,
    param,
    legacyParam,
    minLength,
    handleChange,
    handleCompositionStart,
    handleCompositionEnd,
    submitNow,
    clearSearch,
    resetAll,
    updateParams,
  };
}
