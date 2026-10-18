"use client";

import React from "react";
import Link from "next/link";
import { clearSavedLocaleScrollPosition } from "@/lib/locale-scroll-restoration";

function toPathname(href: string): string {
  const end = href.search(/[?#]/);
  const path = end === -1 ? href : href.slice(0, end);

  if (path.length > 1 && path.endsWith("/")) {
    return path.replace(/\/+$/, "");
  }

  return path || "/";
}

function isSameDestination(href: string, currentPathname: string): boolean {
  return toPathname(href) === toPathname(currentPathname);
}

/**
 * Handles brand logo clicks:
 * 1. When on another page (e.g. /products/vanilla-ember), allows normal navigation back to the home page (href).
 * 2. When already on the home page (or target href), Next.js router treats it as a no-op, so we perform
 *    a genuine full-page reload and return the user to the top of the page.
 *
 * Modified clicks (Ctrl/Cmd/Shift/Alt or non-primary mouse buttons) are passed through so native
 * browser behaviors (such as opening in a new tab) work as expected.
 */
export function handleBrandLogoClick(
  event: React.MouseEvent<HTMLAnchorElement>,
  onBeforeAction?: () => void,
  targetHref: string = "/"
): void {
  // Pass through modified clicks or non-primary buttons to preserve native link semantics
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

  if (onBeforeAction) {
    try {
      onBeforeAction();
    } catch {
      // Ignore pre-hook error to guarantee navigation/reload continues
    }
  }

  // Ensure any previous parked scroll position is cleared
  clearSavedLocaleScrollPosition();

  const currentPathname =
    typeof window !== "undefined" ? window.location.pathname : "";

  // If already on the target destination (e.g. already on "/" when clicking the logo),
  // Next.js client router treats it as a no-op. We force a genuine reload and return to top.
  if (isSameDestination(targetHref, currentPathname)) {
    event.preventDefault();

    // If the URL has an anchor hash, clear it so the browser does not jump down to that section
    if (typeof window !== "undefined" && window.location.hash) {
      try {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search
        );
      } catch {
        // Ignore state error if restricted
      }
    }

    // Suspend native browser scroll restoration so the browser does not restore a deep scroll position
    if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    // Immediately scroll to the top of the document
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }

    window.location.reload();
    return;
  }

  // When on another page (e.g. /products/vanilla-ember), we do NOT prevent default;
  // Next.js <Link href={targetHref}> navigates directly to the home page, landing at the top.
}

export interface BrandLogoProps
  extends Omit<React.ComponentPropsWithoutRef<typeof Link>, "href"> {
  href?: string;
  onBeforeReload?: () => void;
}

/**
 * Reusable Solenne brand logo link.
 * Returns to the home page when clicked from another page;
 * reloads and returns to the top when clicked while already on the home page.
 */
export function BrandLogo({
  href = "/",
  children,
  onClick,
  onBeforeReload,
  className,
  ...props
}: BrandLogoProps) {
  return (
    <Link
      href={href}
      onClick={(event) => {
        if (onClick) {
          onClick(event);
        }
        handleBrandLogoClick(event, onBeforeReload, href);
      }}
      className={className}
      {...props}
    >
      {children ?? "Solenne"}
    </Link>
  );
}
