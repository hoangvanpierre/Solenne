"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { prefetchSearchIndex } from "@/lib/search-index-client";
import { useUIStore } from "@/stores/ui-store";

const SearchCommandPalette = dynamic(
  () =>
    import("@/components/search/search-command-palette").then(
      (mod) => mod.SearchCommandPalette,
    ),
  { ssr: false },
);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable ||
    Boolean(target.closest("[contenteditable='true']"))
  );
}

/**
 * Keeps the palette's JS out of the first paint: the dynamic chunk is only
 * requested while the palette is actually open. The host itself is tiny and
 * stays mounted so the global `/` and Cmd/Ctrl+K shortcuts work before the
 * palette has ever been opened. The index cache lives in a module, so closing
 * and re-opening the palette does not refetch it.
 */
export function SearchOverlayHost() {
  const isSearchOpen = useUIStore((state) => state.isSearchOpen);
  const openSearch = useUIStore((state) => state.openSearch);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTypingTarget(event.target)) return;

      const isCommandK =
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "k";
      const isSlash =
        event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;

      if (!isCommandK && !isSlash) return;

      event.preventDefault();
      prefetchSearchIndex();
      openSearch();
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [openSearch]);

  if (!isSearchOpen) return null;

  return <SearchCommandPalette />;
}
