"use client";

import { createContext, useContext } from "react";
import { cn } from "@/lib/utils";
import {
  useUrlSearch,
  type UrlSearchController,
  type UseUrlSearchOptions,
} from "@/hooks/use-url-search";

// ---------------------------------------------------------------------------
// Shared state for one admin search surface.
//
// The provider owns the URL-backed controller so the search input, the status
// filter and the result region all observe the same transition. That is what
// keeps the spinner, the dimmed table and the announced result count in sync.
// ---------------------------------------------------------------------------

const AdminSearchContext = createContext<UrlSearchController | null>(null);

export interface AdminSearchProviderProps extends UseUrlSearchOptions {
  children: React.ReactNode;
}

export function AdminSearchProvider({
  children,
  ...options
}: AdminSearchProviderProps) {
  const controller = useUrlSearch(options);

  return (
    <AdminSearchContext.Provider value={controller}>
      {children}
    </AdminSearchContext.Provider>
  );
}

export function useAdminSearch(): UrlSearchController {
  const context = useContext(AdminSearchContext);

  if (!context) {
    throw new Error("useAdminSearch must be used inside AdminSearchProvider.");
  }

  return context;
}

export interface AdminSearchResultsProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Result region for an admin search surface.
 *
 * Only opacity changes while the transition is pending: the previous rows stay
 * in place, so the table height and scroll position do not jump. Reduced-motion
 * users get the same dimming without the fade.
 */
export function AdminSearchResults({
  children,
  className,
}: AdminSearchResultsProps) {
  const { isPending } = useAdminSearch();

  return (
    <div
      aria-busy={isPending}
      data-search-pending={isPending ? "true" : "false"}
      className={cn(
        "transition-opacity duration-200 ease-out motion-reduce:transition-none",
        isPending ? "opacity-60" : "opacity-100",
        className
      )}
    >
      {children}
    </div>
  );
}
