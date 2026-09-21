"use client";

import { useEffect } from "react";
import { restoreLocaleScrollPosition } from "@/lib/locale-scroll-restoration";

/**
 * Restores the scroll position parked by an earlier language switch once the
 * new locale has finished rendering.
 *
 * Mount this once per document: `I18nProvider` calls it so that a full page
 * reload (or deep link) after a locale switch still lands the visitor where
 * they were. The same routine is also invoked directly after the in-place
 * locale refresh, where this hook's effect has long since run.
 */
export function useLocaleScrollRestoration(): void {
  useEffect(() => restoreLocaleScrollPosition(), []);
}
