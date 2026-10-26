"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  History,
  Layers,
  MessageCircle,
  Search,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useLockedBody } from "@/hooks/use-locked-body";
import { useAppLocale } from "@/hooks/use-locale";
import { SCENT_CATEGORIES } from "@/lib/constants";
import {
  flattenSearchResults,
  searchCatalog,
  type SearchIndex,
  type SearchResult,
} from "@/lib/search";
import { loadSearchIndex, peekSearchIndex } from "@/lib/search-index-client";
import { cn, formatPrice } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { SearchHighlight } from "./search-highlight";
import { useRecentSearches } from "./use-recent-searches";

const LISTBOX_ID = "solenne-search-results";
const PRODUCTS_HEADING_ID = "solenne-search-products-heading";
const COLLECTIONS_HEADING_ID = "solenne-search-collections-heading";
const OPTION_ID_PREFIX = "solenne-search-option";
const SEARCH_PRODUCT_LIMIT = 6;
const SEARCH_COLLECTION_LIMIT = 4;

function optionId(index: number): string {
  return `${OPTION_ID_PREFIX}-${index}`;
}

function resultHref(result: SearchResult): string {
  return result.kind === "product"
    ? `/products/${result.item.slug}`
    : `/collections/${result.item.slug}`;
}

export function SearchCommandPalette() {
  const t = useTranslations("search");
  const tCommon = useTranslations("common");
  const locale = useAppLocale();
  const router = useRouter();
  const pathname = usePathname();
  const reduceMotion = Boolean(useReducedMotion());

  const isOpen = useUIStore((state) => state.isSearchOpen);
  const closeSearch = useUIStore((state) => state.closeSearch);
  const requestAssistant = useUIStore((state) => state.requestAssistant);
  const currency = useUIStore((state) => state.currency);

  const [index, setIndex] = useState<SearchIndex | null>(() =>
    peekSearchIndex(),
  );
  const [loading, setLoading] = useState(
    () => peekSearchIndex() === null,
  );
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [shortcutLabel] = useState(() => {
    const isApple =
      typeof navigator !== "undefined" &&
      /Mac|iPhone|iPad|iPod/.test(navigator.platform);
    return isApple ? t("shortcutHintMac") : t("shortcutHint");
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const composingRef = useRef(false);

  const { recent, saveRecent, clearRecent } = useRecentSearches();

  useLockedBody(isOpen);

  const requestIndex = useCallback((force = false) => {
    setLoading(true);
    setFailed(false);

    loadSearchIndex(force)
      .then((nextIndex) => {
        setIndex(nextIndex);
        setLoading(false);
      })
      .catch(() => {
        setFailed(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    let cancelled = false;

    // This is a no-op when hover/focus prefetching already populated the
    // module cache, and returns the in-flight request when one exists.
    loadSearchIndex()
      .then((nextIndex) => {
        if (cancelled) return;
        setIndex(nextIndex);
        setLoading(false);
        setFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        setLoading(false);
      });

    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      const target = previousFocusRef.current;

      window.setTimeout(() => {
        if (target && document.contains(target)) {
          target.focus({ preventScroll: true });
        }
      }, 0);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      closeSearch();
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, closeSearch]);

  const results = useMemo(() => {
    if (!index || !query.trim()) {
      return { products: [], collections: [], total: 0 };
    }

    return searchCatalog(index, query, {
      products: SEARCH_PRODUCT_LIMIT,
      collections: SEARCH_COLLECTION_LIMIT,
    });
  }, [index, query]);

  const flatResults = useMemo(
    () => flattenSearchResults(results),
    [results],
  );

  const hasQuery = query.trim().length > 0;
  const hasResults = flatResults.length > 0;
  const showLoading = loading && !index;
  const showError = failed && !index;
  // The concierge deliberately returns null on checkout (see chat-widget), so
  // offering the handoff there would close search and leave the visitor with
  // no panel. Everywhere else the assistant action is available.
  const assistantAvailable = !pathname?.startsWith("/checkout");

  // Derive the usable active row instead of clamping it in an effect. This
  // keeps the first row active as soon as the index arrives and clears the
  // descendant immediately when a query has no matches.
  const resolvedActiveIndex =
    flatResults.length === 0
      ? -1
      : Math.min(Math.max(activeIndex, 0), flatResults.length - 1);

  const activeId =
    resolvedActiveIndex >= 0
      ? optionId(resolvedActiveIndex)
      : undefined;

  useEffect(() => {
    if (resolvedActiveIndex < 0) return;

    document
      .getElementById(optionId(resolvedActiveIndex))
      ?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    // `query` is intentional: a new result set should start at the top even
    // when the active index is already 0.
  }, [resolvedActiveIndex, query]);

  const liveMessage = showLoading
    ? t("loading")
    : showError
      ? t("error")
      : hasQuery
        ? t("resultsCount", { count: results.total })
        : "";

  const updateQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    setActiveIndex(nextQuery.trim() ? 0 : -1);
  };

  const selectRecent = (term: string) => {
    updateQuery(term);
    inputRef.current?.focus();
  };

  const selectSuggestion = (term: string) => {
    updateQuery(term);
    inputRef.current?.focus();
  };

  const openResult = (resultIndex: number) => {
    const result = flatResults[resultIndex];
    if (!result) return;

    const name =
      locale === "vi" ? result.item.name.vi : result.item.name.en;

    saveRecent(query.trim() || name);
    closeSearch();
    router.push(resultHref(result));
  };

  const selectResultLink = (result: SearchResult) => {
    const name =
      locale === "vi" ? result.item.name.vi : result.item.name.en;
    saveRecent(query.trim() || name);
    closeSearch();
  };

  const askAssistant = () => {
    requestAssistant(query.trim());
    closeSearch();
  };

  const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const panel = panelRef.current;
    if (!panel) return;

    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(
      (element) =>
        element.tabIndex >= 0 && element.offsetParent !== null,
    );

    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      trapFocus(event);
      return;
    }

    // Arrow/Enter/Home/End are only command keys while the query field owns
    // focus. Other controls keep their normal keyboard behaviour.
    if (event.target !== inputRef.current) return;

    const isComposing =
      event.nativeEvent.isComposing || composingRef.current;

    if (isComposing) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (flatResults.length === 0) return;
      setActiveIndex(
        resolvedActiveIndex < 0
          ? 0
          : (resolvedActiveIndex + 1) % flatResults.length,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (flatResults.length === 0) return;
      setActiveIndex(
        resolvedActiveIndex <= 0
          ? flatResults.length - 1
          : resolvedActiveIndex - 1,
      );
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      if (flatResults.length === 0) return;
      setActiveIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      if (flatResults.length === 0) return;
      setActiveIndex(flatResults.length - 1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (flatResults.length === 0) return;
      openResult(resolvedActiveIndex >= 0 ? resolvedActiveIndex : 0);
    }
  };

  const backdropTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const };

  const panelTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const };

  const itemTransition = (itemIndex: number) =>
    reduceMotion
      ? { duration: 0 }
      : {
          duration: 0.2,
          delay: Math.min(itemIndex * 0.025, 0.1),
          ease: [0.22, 1, 0.36, 1] as const,
        };

  const renderProduct = (resultIndex: number) => {
    const result = flatResults[resultIndex];
    if (!result || result.kind !== "product") return null;

    const product = result.item;
    const isActive = resolvedActiveIndex === resultIndex;
    const name = locale === "vi" ? product.name.vi : product.name.en;
    const family = locale === "vi" ? product.family.vi : product.family.en;

    return (
      <motion.div
        role="presentation"
        key={`product-${product.id}`}
        initial={reduceMotion ? false : { opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={itemTransition(resultIndex)}
      >
        <Link
          id={optionId(resultIndex)}
          href={resultHref(result)}
          role="option"
          aria-selected={isActive}
          tabIndex={-1}
          onMouseEnter={() => setActiveIndex(resultIndex)}
          onClick={() => selectResultLink(result)}
          className={cn(
            "group flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/50",
            isActive ? "bg-muted" : "hover:bg-muted/60",
          )}
        >
          <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-muted">
            {product.image ? (
              // The index already carries the generated 384px WebP. Rendering
              // it directly deliberately avoids `/_next/image`, which is broken
              // on Cloudflare Workers in this project.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image}
                alt=""
                width={44}
                height={44}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center font-serif text-sm text-muted-foreground">
                {product.name.en.slice(0, 1)}
              </span>
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate font-serif text-[14px] leading-snug text-foreground">
              <SearchHighlight text={name} query={query} />
            </span>
            <span className="mt-0.5 flex items-center gap-2 text-[11.5px] leading-tight text-muted-foreground">
              <span className="truncate">{family}</span>
              {!product.inStock && (
                <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em]">
                  {tCommon("outOfStock")}
                </span>
              )}
            </span>
          </span>

          <span className="ml-2 shrink-0 text-[12px] tabular-nums text-foreground">
            {formatPrice(product.price[currency], currency)}
          </span>
        </Link>
      </motion.div>
    );
  };

  const renderCollection = (resultIndex: number) => {
    const result = flatResults[resultIndex];
    if (!result || result.kind !== "collection") return null;

    const collection = result.item;
    const isActive = resolvedActiveIndex === resultIndex;
    const name =
      locale === "vi" ? collection.name.vi : collection.name.en;
    const description =
      locale === "vi"
        ? collection.description.vi
        : collection.description.en;

    return (
      <motion.div
        role="presentation"
        key={`collection-${collection.slug}`}
        initial={reduceMotion ? false : { opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={itemTransition(resultIndex)}
      >
        <Link
          id={optionId(resultIndex)}
          href={resultHref(result)}
          role="option"
          aria-selected={isActive}
          tabIndex={-1}
          onMouseEnter={() => setActiveIndex(resultIndex)}
          onClick={() => selectResultLink(result)}
          className={cn(
            "group flex items-start gap-3 rounded-xl px-2.5 py-2.5 transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/50",
            isActive ? "bg-muted" : "hover:bg-muted/60",
          )}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground">
            <Layers
              className="h-4 w-4"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate font-serif text-[14px] leading-snug text-foreground">
                <SearchHighlight text={name} query={query} />
              </span>
              <ArrowUpRight
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </span>
            <span className="mt-0.5 line-clamp-1 block text-[11.5px] leading-relaxed text-muted-foreground">
              <SearchHighlight text={description} query={query} />
            </span>
          </span>
        </Link>
      </motion.div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/*
            Layer order (documented here because the app has several overlays):
            navbar + assistant/back-to-top dock = z-50, cart/mobile nav backdrop
            = z-[60], their panels = z-[70]. Search is intentionally the top
            transient layer (backdrop z-[80], panel z-[90]) so Cmd/Ctrl+K still
            works with a drawer open; closing search reveals the drawer intact.
          */}
          <motion.div
            key="search-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={backdropTransition}
            className="fixed inset-0 z-[80] bg-warm-black/55 backdrop-blur-md"
            onClick={closeSearch}
            aria-hidden="true"
          />

          <div className="pointer-events-none fixed inset-0 z-[90] flex items-start justify-center sm:px-6 sm:pt-[12vh]">
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="solenne-search-title"
              onKeyDown={handlePanelKeyDown}
              initial={
                reduceMotion ? false : { opacity: 0, scale: 0.98, y: 6 }
              }
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.985, y: 4 }
              }
              transition={panelTransition}
              className={cn(
                "search-command-palette pointer-events-auto flex h-[100dvh] w-full flex-col overflow-hidden",
                "border-border bg-card/98 text-card-foreground backdrop-blur-xl",
                "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
                "shadow-[0_32px_90px_-28px_rgba(26,26,26,0.65)]",
                "sm:h-auto sm:max-h-[min(40rem,calc(100dvh-14vh))] sm:max-w-[640px]",
                "sm:rounded-[1.75rem] sm:border sm:pt-0 sm:pb-0",
              )}
            >
              <h2 id="solenne-search-title" className="sr-only">
                {t("title")}
              </h2>

              <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2.5 sm:px-4 sm:py-3">
                <div className="search-command-field flex min-w-0 flex-1 items-center gap-2 rounded-full px-2 py-0.5 ring-1 ring-transparent transition-colors duration-200 focus-within:bg-muted/35 focus-within:ring-amber/40">
                  <Search
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />

                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(event) => updateQuery(event.target.value)}
                    onCompositionStart={() => {
                      composingRef.current = true;
                    }}
                    onCompositionEnd={() => {
                      composingRef.current = false;
                    }}
                    role="combobox"
                    aria-expanded={hasResults}
                    aria-controls={hasResults ? LISTBOX_ID : undefined}
                    aria-activedescendant={activeId}
                    aria-autocomplete="list"
                    aria-label={t("placeholder")}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="search"
                    placeholder={t("placeholder")}
                    className={cn(
                      "h-10 min-w-0 flex-1 bg-transparent text-[15px] text-foreground",
                      "outline-none placeholder:text-muted-foreground/75",
                    )}
                  />
                </div>

                <kbd className="hidden items-center rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground sm:inline-flex">
                  {shortcutLabel}
                </kbd>

                <button
                  type="button"
                  onClick={closeSearch}
                  aria-label={t("close")}
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    "text-muted-foreground transition-colors duration-200",
                    "hover:bg-muted hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/50",
                  )}
                >
                  <X className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>

              <div
                className="sr-only"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {liveMessage}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3 sm:px-3">
                {!hasQuery ? (
                  <div className="pb-2">
                    <section aria-labelledby="solenne-search-families">
                      <h3
                        id="solenne-search-families"
                        className="px-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
                      >
                        {t("browseFamilies")}
                      </h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {SCENT_CATEGORIES.map((category) => {
                          const familyName =
                            locale === "vi"
                              ? category.nameVi
                              : category.name;

                          return (
                            <Link
                              key={category.id}
                              href={`/collections/${category.id}`}
                              onClick={closeSearch}
                              aria-label={t("familyAria", {
                                family: familyName,
                              })}
                              className={cn(
                                "inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5",
                                "text-[12px] text-foreground transition-colors duration-200",
                                "hover:border-amber/60 hover:bg-muted/60",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/50",
                              )}
                            >
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: category.color }}
                                aria-hidden="true"
                              />
                              {familyName}
                            </Link>
                          );
                        })}
                      </div>
                    </section>

                    <section
                      aria-labelledby="solenne-search-suggestions"
                      className="mt-6"
                    >
                      <h3
                        id="solenne-search-suggestions"
                        className="px-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
                      >
                        {t("suggestions")}
                      </h3>

                      {showLoading ? (
                        <div className="mt-2 flex flex-wrap gap-2 px-2">
                          {[0, 1, 2].map((item) => (
                            <span
                              key={item}
                              className="h-8 w-28 animate-pulse rounded-full bg-muted"
                            />
                          ))}
                        </div>
                      ) : index && index.products.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {index.products.slice(0, 3).map((product) => {
                            const name =
                              locale === "vi"
                                ? product.name.vi
                                : product.name.en;

                            return (
                              <button
                                key={product.id}
                                type="button"
                                onClick={() => selectSuggestion(name)}
                                className={cn(
                                  "rounded-full border border-border px-3 py-1.5 text-[12px] text-foreground",
                                  "transition-colors duration-200 hover:border-amber/60 hover:bg-muted/60",
                                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/50",
                                )}
                              >
                                {name}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}

                      {showError && (
                        <div className="mx-2 mt-3 rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5">
                          <p className="text-[12px] leading-relaxed text-muted-foreground">
                            {t("error")}
                          </p>
                          <button
                            type="button"
                            onClick={() => requestIndex(true)}
                            className={cn(
                              "mt-1 text-[11px] text-foreground underline underline-offset-4",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/50",
                            )}
                          >
                            {t("retry")}
                          </button>
                        </div>
                      )}
                    </section>

                    {recent.length > 0 && (
                      <section
                        aria-labelledby="solenne-search-recent"
                        className="mt-6"
                      >
                        <div className="flex items-center justify-between px-2">
                          <h3
                            id="solenne-search-recent"
                            className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
                          >
                            {t("recentSearches")}
                          </h3>
                          <button
                            type="button"
                            onClick={clearRecent}
                            className={cn(
                              "text-[11px] text-muted-foreground transition-colors hover:text-foreground",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/50",
                            )}
                          >
                            {t("clearRecent")}
                          </button>
                        </div>

                        <div className="mt-1.5 space-y-0.5">
                          {recent.map((term) => (
                            <button
                              key={term}
                              type="button"
                              onClick={() => selectRecent(term)}
                              aria-label={t("recentSearchAria", {
                                query: term,
                              })}
                              className={cn(
                                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left",
                                "transition-colors duration-150 hover:bg-muted/60",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/50",
                              )}
                            >
                              <History
                                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                                strokeWidth={1.5}
                                aria-hidden="true"
                              />
                              <span className="truncate text-[13px] text-foreground">
                                {term}
                              </span>
                            </button>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                ) : showLoading ? (
                  <div className="space-y-2 px-2 py-2">
                    {[0, 1, 2].map((item) => (
                      <div
                        key={item}
                        className="flex animate-pulse items-center gap-3 rounded-xl px-2.5 py-2.5"
                      >
                        <span className="h-11 w-11 shrink-0 rounded-lg bg-muted" />
                        <span className="flex-1 space-y-2">
                          <span className="block h-3 w-1/2 rounded bg-muted" />
                          <span className="block h-2.5 w-1/3 rounded bg-muted" />
                        </span>
                      </div>
                    ))}
                    <p className="px-2 pt-2 text-[12px] text-muted-foreground">
                      {t("loading")}
                    </p>
                  </div>
                ) : showError ? (
                  <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                    <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
                      {t("error")}
                    </p>
                    <button
                      type="button"
                      onClick={() => requestIndex(true)}
                      className={cn(
                        "rounded-full border border-border px-4 py-1.5 text-[12px] text-foreground",
                        "transition-colors duration-200 hover:border-amber/60 hover:bg-muted/60",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/50",
                      )}
                    >
                      {t("retry")}
                    </button>
                  </div>
                ) : !hasResults ? (
                  <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                    <p className="max-w-sm font-serif text-lg leading-snug text-foreground">
                      {t("noResultsTitle", { query: query.trim() })}
                    </p>
                    <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
                      {t("noResultsDescription")}
                    </p>
                    {assistantAvailable && (
                      <button
                        type="button"
                        onClick={askAssistant}
                        className={cn(
                          "mt-1 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2",
                          "text-[12px] text-foreground transition-colors duration-200",
                          "hover:border-amber/60 hover:bg-muted/60",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/50",
                        )}
                      >
                        <MessageCircle
                          className="h-3.5 w-3.5"
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                        {t("askAssistant")}
                      </button>
                    )}
                  </div>
                ) : (
                  <div
                    id={LISTBOX_ID}
                    role="listbox"
                    aria-label={t("ariaResults")}
                    className="space-y-4"
                  >
                    {results.products.length > 0 && (
                      <section
                        role="group"
                        aria-labelledby={PRODUCTS_HEADING_ID}
                      >
                        <h3
                          id={PRODUCTS_HEADING_ID}
                          className="px-2 pb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
                        >
                          {t("products")}
                        </h3>
                        <div className="space-y-0.5">
                          {results.products.map((_, itemIndex) =>
                            renderProduct(itemIndex),
                          )}
                        </div>
                      </section>
                    )}

                    {results.collections.length > 0 && (
                      <section
                        role="group"
                        aria-labelledby={COLLECTIONS_HEADING_ID}
                      >
                        <h3
                          id={COLLECTIONS_HEADING_ID}
                          className="px-2 pb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
                        >
                          {t("collections")}
                        </h3>
                        <div className="space-y-0.5">
                          {results.collections.map((_, itemIndex) =>
                            renderCollection(
                              results.products.length + itemIndex,
                            ),
                          )}
                        </div>
                      </section>
                    )}
                  </div>
                )}
              </div>

              <div className="hidden items-center justify-between border-t border-border/70 px-5 py-2.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:flex">
                <span>{t("selectHint")}</span>
                <span>{shortcutLabel}</span>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
