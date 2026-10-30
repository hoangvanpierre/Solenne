"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";

// URL-driven pagination for the management tables.
//
// The range it prints is derived from the numbers the SERVER returned for the
// current request (`page`, `limit`, and an exact filtered `totalCount`), never
// from however many rows happen to be in the browser. Navigating only rewrites
// the page query parameter on the current URL, so search, status and date
// filters survive every page change and the server re-queries the whole data
// set with the same filters.
export interface AdminPaginationLabels {
  /** Accessible name of the pagination landmark. */
  navigation: string;
  previous: string;
  next: string;
  /** Template with `{page}` and `{total}`. */
  pageOf: string;
  /** Template with `{start}`, `{end}`, `{total}` and `{item}`. */
  summary: string;
}

export interface AdminPaginationProps {
  /** 1-based page the server rendered. */
  page: number;
  /** Rows per page the server applied. */
  limit: number;
  /** Exact number of matching rows across all pages. */
  totalCount: number;
  /** Server-computed "another page exists"; derived from totalCount when omitted. */
  hasMore?: boolean;
  locale?: string;
  /** Localized plural noun for the range summary, e.g. "orders" / "đơn hàng". */
  itemLabelEn: string;
  itemLabelVi: string;
  /** Query parameter that carries the page number. */
  pageParam?: string;
  /**
   * Localized copy from the caller's message catalogue. When omitted the
   * built-in English/Vietnamese wording is used, so the existing tables keep
   * their current text unchanged.
   */
  labels?: AdminPaginationLabels;
  className?: string;
}

function fillTemplate(
  template: string,
  values: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  );
}

export function AdminPagination({
  page,
  limit,
  totalCount,
  hasMore,
  locale = "en",
  itemLabelEn,
  itemLabelVi,
  pageParam = "page",
  labels,
  className,
}: AdminPaginationProps) {
  const isVi = locale === "vi";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const safeLimit = Math.max(1, limit);
  const safePage = Math.max(1, page);
  const totalPages = Math.max(1, Math.ceil(totalCount / safeLimit));
  const canGoPrevious = safePage > 1;
  const canGoNext = hasMore ?? safePage < totalPages;

  const startRecord =
    totalCount === 0 ? 0 : Math.min((safePage - 1) * safeLimit + 1, totalCount);
  const endRecord = Math.min(safePage * safeLimit, totalCount);

  const navigationLabel =
    labels?.navigation ?? (isVi ? "Phân trang" : "Pagination");
  const previousLabel = labels?.previous ?? (isVi ? "Trước" : "Previous");
  const nextLabel = labels?.next ?? (isVi ? "Sau" : "Next");
  const pageOfLabel =
    labels?.pageOf ??
    (isVi ? "Trang {page}/{total}" : "Page {page} of {total}");

  const goToPage = (nextPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage <= 1) {
      params.delete(pageParam);
    } else {
      params.set(pageParam, String(nextPage));
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <nav
      aria-label={navigationLabel}
      className={cn(
        "flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {labels ? (
          fillTemplate(labels.summary, {
            start: startRecord,
            end: endRecord,
            total: totalCount,
            item: isVi ? itemLabelVi : itemLabelEn,
          })
        ) : isVi ? (
          <>
            Hiển thị{" "}
            <span className="tabular-nums text-foreground">{startRecord}</span>
            {"–"}
            <span className="tabular-nums text-foreground">{endRecord}</span>{" "}
            trên <span className="tabular-nums text-foreground">{totalCount}</span>{" "}
            {itemLabelVi}
          </>
        ) : (
          <>
            Showing{" "}
            <span className="tabular-nums text-foreground">{startRecord}</span>
            {"–"}
            <span className="tabular-nums text-foreground">{endRecord}</span> of{" "}
            <span className="tabular-nums text-foreground">{totalCount}</span>{" "}
            {itemLabelEn}
          </>
        )}
      </p>

      <div className="flex items-center gap-2 self-start sm:self-auto">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => goToPage(safePage - 1)}
          disabled={!canGoPrevious}
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{previousLabel}</span>
        </Button>

        <span className="px-1 text-sm tabular-nums text-muted-foreground">
          {fillTemplate(pageOfLabel, {
            page: safePage,
            total: totalPages,
          })}
        </span>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => goToPage(safePage + 1)}
          disabled={!canGoNext}
        >
          <span>{nextLabel}</span>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
