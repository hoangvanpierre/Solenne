"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Filter, Loader2, RotateCcw, Search } from "lucide-react";
import { Button, Input } from "@/components/ui";

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
  initialSearch?: string;
  initialStatus?: string;
  locale?: string;
}

export function OrderFilterBar({
  initialSearch = "",
  initialStatus = "all",
  locale = "en",
}: OrderFilterBarProps) {
  const isVi = locale === "vi";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentSearch = searchParams.get("search") ?? initialSearch;
  const currentStatus = searchParams.get("status") ?? initialStatus;

  const [searchInput, setSearchInput] = useState(currentSearch);

  const hasActiveFilters =
    currentSearch.trim() !== "" ||
    (currentStatus !== "all" && currentStatus !== "");

  const updateParams = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "" || value === "all") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    // Any filter change invalidates the current page: start from the first one.
    params.delete("page");
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  };

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateParams({ search: searchInput.trim() });
  };

  const handleReset = () => {
    setSearchInput("");
    startTransition(() => {
      router.push(pathname);
    });
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <form
          onSubmit={handleSearchSubmit}
          className="flex flex-1 items-center gap-2 max-w-xl"
          role="search"
        >
          <div className="relative flex-1">
            <Search
              className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              name="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={
                isVi
                  ? "Tìm theo mã đơn, ID hoặc email khách hàng..."
                  : "Search by order number, ID, or customer email..."
              }
              aria-label={
                isVi
                  ? "Tìm kiếm đơn hàng theo mã, ID hoặc email khách hàng"
                  : "Search orders by number, ID, or customer email"
              }
              className="admin-quiet-field pl-9.5 pr-4 h-10 text-[13px] rounded-xl"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            className="h-10 px-4 rounded-xl text-xs font-normal"
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            <span>{isVi ? "Tìm kiếm" : "Search"}</span>
          </Button>
        </form>

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
              onClick={handleReset}
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
