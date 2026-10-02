"use client";

import { useCallback } from "react";
import type { MouseEvent } from "react";
import { usePathname } from "next/navigation";

// ---------------------------------------------------------------------------
// Solenne — same-destination Navbar reload
// ---------------------------------------------------------------------------
// Clicking the Navbar link for the page you are already on should feel like a
// fresh arrival: a real document load positioned at the top. Next's <Link>
// would otherwise treat it as a no-op client navigation that leaves the
// viewport exactly where it is.
//
// This hook owns ONLY the same-destination case. Every other click is left to
// Next's router untouched, so navigation to a different route keeps its normal
// client-side behavior.
//
// It does not introduce a scroll system of its own: it merely suspends the
// browser's native scroll restoration for the reloaded document (the exact knob
// lib/locale-scroll-restoration.ts already uses for the same reason) and lets
// the existing SmoothScroll/Lenis layer pin the viewport to the top on mount.
// ---------------------------------------------------------------------------

/**
 * Pathname-only form of an href: query string, hash and a trailing slash are
 * dropped so that `/` and `/`, or `/products` and `/products/`, compare equal.
 */
function toPathname(href: string): string {
  const end = href.search(/[?#]/);
  const path = end === -1 ? href : href.slice(0, end);

  if (path.length > 1 && path.endsWith("/")) {
    return path.replace(/\/+$/, "");
  }

  return path || "/";
}

/**
 * True only when `href` points at the document currently on screen.
 *
 * Links carrying a query string or an anchor are deliberate destinations
 * (filters, in-page anchors) and are never collapsed into a reload, so their
 * existing navigation — and any intentional hash/query handling — is preserved.
 */
function isSameDestination(href: string, pathname: string): boolean {
  if (href.includes("?") || href.includes("#")) return false;

  return toPathname(href) === toPathname(pathname);
}

/**
 * Returns a click handler for Navbar links that converts a click on the
 * current page's own link into a hard reload at the top of the document.
 * Clicks on any other destination are ignored, leaving Next's <Link> routing
 * in charge.
 */
export function useSamePageReload() {
  const pathname = usePathname();

  return useCallback(
    (event: MouseEvent<HTMLAnchorElement>, href: string): void => {
      // Leave modified clicks (new tab/window, download, middle-click) to the
      // browser — they are never same-document navigations.
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      if (!isSameDestination(href, pathname)) return;

      // Same destination: stop Next's client-side no-op navigation and reload
      // the current document instead.
      event.preventDefault();

      // The previous deep scroll position must not come back with the reload.
      // Native restoration is suspended for this load; SmoothScroll already
      // resets the viewport to the top on mount, so the two agree rather than
      // competing. Guarded for environments without the property.
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = "manual";
      }

      window.location.reload();
    },
    [pathname]
  );
}