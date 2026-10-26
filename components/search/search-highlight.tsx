"use client";

import { getHighlightRanges, tokenizeSearchQuery } from "@/lib/search";

export interface SearchHighlightProps {
  text: string;
  query: string;
}

/**
 * Renders accent-insensitive matches without `dangerouslySetInnerHTML`.
 * If a query cannot be mapped back to the display string the text is rendered
 * unchanged, which keeps highlighting optional rather than fragile.
 */
export function SearchHighlight({ text, query }: SearchHighlightProps) {
  const tokens = tokenizeSearchQuery(query);
  const ranges = getHighlightRanges(text, tokens);

  if (ranges.length === 0) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  ranges.forEach((range, index) => {
    if (range.start > cursor) {
      parts.push(text.slice(cursor, range.start));
    }

    parts.push(
      <mark
        key={`${range.start}-${range.end}-${index}`}
        className="rounded-sm bg-amber/25 px-0.5 text-foreground"
      >
        {text.slice(range.start, range.end)}
      </mark>,
    );

    cursor = range.end;
  });

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return <>{parts}</>;
}
