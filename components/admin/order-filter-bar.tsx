"use client";

import { useSearchParams } from "next/navigation";
import { ChevronDown, Filter, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";
import { AdminSearchInput } from "./admin-search-input";
import { useAdminSearch } from "./admin-search-provider";

// Search + status filter for the management order list.
//
// Both controls write straight to the URL, so the server component re-queries
// the whole (RLS-scoped) order set with the new filters and returns page 1 with
// a truthful total. No filtering happens in the browser, and every filter
// change keeps the URL shareable and reload-safe.
export const ORDER_STATUS_FILTER_OPTIONS = [
  { value: "all", labelEn: "All statuses", labelVi: "Tất cả trạng thái" },
  { value: "pending", labelEn: "Pending payment", labelVi: "Chờ thanh toán" },
  { value: "paid", labelEn: "Paid", labelVi: "Đã thanh toán" },
  { value: "processing", labelEn: "Processing", labelVi: "Đang chế tác" },
  { value: "shipped", labelEn: "Shipped", labelVi: "Đang chuyển giao" },
  { value: "delivered", labelEn: "Delivered", labelVi: "Đã an nhận" },
  { value: "cancelled", labelEn: "Cancelled", labelVi: "Đã hủy" },
] as const;

export interface OrderFilterBarProps {
  initialStatus?: string;
  locale?: string;
  /** Rows matching the current server query, announced to screen readers. */
  resultCount: number;
}

export function OrderFilterBar({
  initialStatus = "all",
  locale = "en",
  resultCount,
}: OrderFilterBarProps) {
  const isVi = locale === "vi";
  const searchParams = useSearchParams();
  const { term, updateParams, resetAll } = useAdminSearch();

  const currentStatus = searchParams.get("status") ?? initialStatus;

  const hasActiveFilters =
    term.trim() !== "" || (currentStatus !== "all" && currentStatus !== "");

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <AdminSearchInput
          label={
            isVi
              ? "Tìm kiếm đơn hàng theo mã, ID, email hoặc tên khách hàng"
              : "Search orders by number, ID, customer email, or customer name"
          }
          placeholder={
            isVi
              ? "Tìm theo mã đơn, ID, email hoặc tên khách hàng..."
              : "Search by order number, ID, customer email, or name..."
          }
          resultCount={resultCount}
        />

        <div className="flex flex-wrap items-center gap-2.5">
          {/* No frame of its own: the control reads as part of the row, the
              same way the customer directory's status filter does. */}
          <div className="inline-flex items-center gap-1.5">
            <Filter
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <label
              htmlFor="order-status-filter"
              className="text-xs font-normal text-muted-foreground whitespace-nowrap"
            >
              {isVi ? "Trạng thái:" : "Status:"}
            </label>
            <span className="relative inline-flex items-center">
              <select
                id="order-status-filter"
                value={currentStatus || "all"}
                onChange={(event) =>
                  updateParams({ status: event.target.value })
                }
                className="admin-inline-select peer cursor-pointer appearance-none rounded-md bg-transparent py-1 pl-1 pr-5 text-xs font-normal text-foreground transition-colors hover:bg-muted/60 focus-visible:text-foreground"
              >
                {ORDER_STATUS_FILTER_OPTIONS.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    className="bg-background text-foreground"
                  >
                    {isVi ? option.labelVi : option.labelEn}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-1 h-3 w-3 text-muted-foreground transition-colors peer-focus-visible:text-foreground"
              />
            </span>
          </div>

          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetAll}
              className="h-9 px-2.5 text-xs font-normal text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isVi ? "Đặt lại" : "Reset"}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
