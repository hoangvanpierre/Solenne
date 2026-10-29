import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Shared surface for every management table.
//
// The frame owns the panel, the horizontal scroll container, the <table>
// baseline typography and the one header treatment, so the five list screens
// read as a single system. Column widths, alignment and cell padding stay with
// each table: they carry the domain meaning and must keep lining up with the
// values underneath.
//
// Header cells are passed as a fragment of <th> elements (not a string array)
// so tables can keep sort controls, tooltips and right-aligned numeric columns.
//
// Accessibility: the header row is a real <thead>, callers pass `scope="col"`
// cells, and `caption` (screen-reader only) names the table when the visible
// heading is not adjacent to it.
export interface AdminTableFrameProps {
  /** `<th scope="col">` cells, in column order. */
  head: ReactNode;
  /** Table body — `<tbody>` (and `<tfoot>` if needed). */
  children: ReactNode;
  /** Screen-reader-only table caption. */
  caption?: string;
  /** Extra classes for the `<table>` element. */
  className?: string;
}

export function AdminTableFrame({
  head,
  children,
  caption,
  className,
}: AdminTableFrameProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table
          className={cn(
            "w-full border-collapse text-left text-sm text-foreground",
            className
          )}
        >
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className="border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
            <tr>{head}</tr>
          </thead>
          {children}
        </table>
      </div>
    </div>
  );
}
