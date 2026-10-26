"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ChevronDown,
  Filter,
  RotateCcw,
  ShoppingBag,
  User,
  Users,
} from "lucide-react";
import type { CustomerSummary } from "@/types";
import { formatPrice } from "@/lib/utils";
import { CustomerStatusBadge } from "./customer-status-badge";
import { AdminTableFrame } from "./admin-table-frame";
import { AdminPagination } from "./admin-pagination";
import { AdminStatePanel } from "./admin-state-panel";
import { AdminClearSearchButton, AdminSearchInput } from "./admin-search-input";
import {
  AdminSearchResults,
  useAdminSearch,
} from "./admin-search-provider";
import { Button } from "@/components/ui";

export interface CustomerTableProps {
  customers: CustomerSummary[];
  totalCount: number;
  page: number;
  limit: number;
  hasMore: boolean;
  canReadOrders?: boolean;
  locale?: string;
  initialFilters?: {
    search?: string;
    status?: string;
  };
}

const STATUS_FILTER_OPTIONS = [
  { value: "all", labelEn: "All Statuses", labelVi: "Tất cả trạng thái" },
  { value: "active", labelEn: "Active", labelVi: "Đang hoạt động" },
  { value: "suspended", labelEn: "Suspended", labelVi: "Tạm khóa" },
  { value: "banned", labelEn: "Banned", labelVi: "Cấm truy cập" },
  { value: "pending", labelEn: "Pending", labelVi: "Chờ kích hoạt" },
];

export function CustomerTable({
  customers,
  totalCount,
  page,
  limit,
  hasMore,
  canReadOrders = true,
  locale = "en",
  initialFilters = {},
}: CustomerTableProps) {
  const isVi = locale === "vi";
  const searchParams = useSearchParams();
  const { term, updateParams, resetAll } = useAdminSearch();

  const currentStatus = searchParams.get("status") ?? initialFilters.status ?? "all";

  const hasActiveFilters =
    term.trim() !== "" || (currentStatus && currentStatus !== "all");

  const handleStatusChange = (status: string) => {
    updateParams({ status });
  };

  const handleResetFilters = () => {
    resetAll();
  };

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(isVi ? "vi-VN" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6">
      {/* Search and Filters Bar */}
      <div className="rounded-2xl border border-border bg-card/40 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Search Form */}
          <AdminSearchInput
            label={
              isVi
                ? "Tìm kiếm khách hàng theo tên, số điện thoại hoặc ID"
                : "Search customers by name, phone, or UUID"
            }
            placeholder={
              isVi
                ? "Tìm theo tên khách hàng, số điện thoại hoặc ID..."
                : "Search by customer name, phone, or UUID..."
            }
            resultCount={totalCount}
          />

          {/* Status Filter and Reset */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center gap-1.5">
              <Filter
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <label
                htmlFor="customer-status-filter"
                className="text-xs font-normal text-muted-foreground whitespace-nowrap"
              >
                {isVi ? "Trạng thái:" : "Status:"}
              </label>

              {/* No frame of its own: the control reads as part of the row.
                  Its focus appearance (warm tint + darker chevron, no box) is
                  defined next to `.admin-inline-select` in globals.css. */}
              <span className="relative inline-flex items-center">
                <select
                  id="customer-status-filter"
                  value={currentStatus}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="admin-inline-select peer cursor-pointer appearance-none rounded-md bg-transparent py-1 pl-1 pr-5 text-xs font-normal text-foreground transition-colors hover:bg-muted/60 focus-visible:text-foreground"
                >
                  {STATUS_FILTER_OPTIONS.map((opt) => (
                    <option
                      key={opt.value}
                      value={opt.value}
                      className="bg-background text-foreground"
                    >
                      {isVi ? opt.labelVi : opt.labelEn}
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
                onClick={handleResetFilters}
                className="h-9 px-2.5 text-xs font-normal text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{isVi ? "Đặt lại" : "Reset"}</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Directory Table / Cards */}
      <AdminSearchResults>
        {customers.length === 0 ? (
          <AdminStatePanel
            icon={Users}
            title={isVi ? "Không tìm thấy khách hàng" : "No customers found"}
            description={
              hasActiveFilters
                ? isVi
                  ? "Không có khách hàng nào khớp với tiêu chí tìm kiếm hoặc bộ lọc hiện tại."
                  : "No customers match the current search query or status filter."
                : isVi
                  ? "Hệ thống chưa ghi nhận tài khoản khách hàng nào."
                  : "No customer accounts have registered yet."
            }
            actions={
              hasActiveFilters ? (
                <AdminClearSearchButton
                  mode={term ? "search" : "all"}
                  className="text-xs font-normal"
                />
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-4">
            {/* Desktop Table View */}
            <div className="hidden md:block">
              <AdminTableFrame
                caption={isVi ? "Danh bạ khách hàng" : "Customer directory"}
                head={
                  <>
                    <th scope="col" className="py-3.5 px-6 font-normal">
                      {isVi ? "Khách hàng" : "Customer"}
                    </th>
                    <th scope="col" className="py-3.5 px-6 font-normal">
                      {isVi ? "Trạng thái" : "Status"}
                    </th>
                    <th scope="col" className="py-3.5 px-6 font-normal">
                      {isVi ? "Số đơn hàng" : "Orders"}
                    </th>
                    <th scope="col" className="py-3.5 px-6 text-right font-normal">
                      {isVi ? "Tổng chi tiêu" : "Lifetime Spend"}
                    </th>
                    <th scope="col" className="py-3.5 px-6 whitespace-nowrap font-normal">
                      {isVi ? "Gia nhập" : "Member Since"}
                    </th>
                    <th scope="col" className="py-3.5 px-6 text-right font-normal">
                      <span className="sr-only">{isVi ? "Thao tác" : "Actions"}</span>
                    </th>
                  </>
                }
              >
                <tbody className="divide-y divide-border/60">
                  {customers.map((c) => {
                    const displayName =
                      c.fullName?.trim() ||
                      (isVi ? "Khách hàng ẩn danh" : "Anonymous Member");

                    return (
                      <tr
                        key={c.id}
                        className="transition-colors hover:bg-muted/30 group"
                      >
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/80 text-muted-foreground shrink-0 border border-border/60">
                              <User className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <Link
                                href={`/admin/customers/${c.id}`}
                                className="font-normal text-[13.5px] text-foreground hover:text-amber transition-colors line-clamp-1"
                              >
                                {displayName}
                              </Link>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                {c.phone && (
                                  <span className="tabular-nums font-normal text-xs text-foreground/80">
                                    {c.phone}
                                  </span>
                                )}
                                {c.phone && <span>•</span>}
                                <span
                                  className="tabular-nums font-normal text-xs text-muted-foreground/80 truncate max-w-[120px]"
                                  title={c.id}
                                >
                                  {c.id.slice(0, 8)}…
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-4 px-6 whitespace-nowrap">
                          <CustomerStatusBadge status={c.status} locale={locale} />
                        </td>

                        <td className="py-4 px-6 whitespace-nowrap">
                          {canReadOrders && c.orderCount !== null ? (
                            <div className="inline-flex items-center gap-1.5 text-xs text-foreground font-normal tabular-nums">
                              <ShoppingBag className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>
                                {c.orderCount}{" "}
                                {isVi
                                  ? "đơn"
                                  : c.orderCount === 1
                                    ? "order"
                                    : "orders"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              —
                            </span>
                          )}
                        </td>

                        <td className="py-4 px-6 text-right font-normal tabular-nums text-foreground whitespace-nowrap text-[13.5px]">
                          {canReadOrders && c.lifetimeSpend !== null
                            ? formatPrice(c.lifetimeSpend)
                            : "—"}
                        </td>

                        <td className="py-4 px-6 text-xs font-normal tabular-nums text-muted-foreground whitespace-nowrap">
                          {formatDate(c.createdAt)}
                        </td>

                        <td className="py-4 px-6 text-right whitespace-nowrap">
                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="inline-flex items-center gap-1.5 text-xs font-normal h-8 px-3 rounded-lg"
                          >
                            <Link href={`/admin/customers/${c.id}`}>
                              <span>{isVi ? "Xem hồ sơ" : "View"}</span>
                              <ArrowRight className="h-3 w-3" />
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </AdminTableFrame>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {customers.map((c) => {
                const displayName =
                  c.fullName?.trim() ||
                  (isVi ? "Khách hàng ẩn danh" : "Anonymous Member");

                return (
                  <div
                    key={c.id}
                    className="rounded-2xl border border-border bg-card/40 p-4 space-y-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/80 text-muted-foreground shrink-0 border border-border/60">
                          <User className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/admin/customers/${c.id}`}
                            className="font-normal text-foreground hover:text-amber line-clamp-1 text-sm"
                          >
                            {displayName}
                          </Link>
                          {c.phone && (
                            <div className="text-xs tabular-nums font-normal text-muted-foreground">
                              {c.phone}
                            </div>
                          )}
                        </div>
                      </div>
                      <CustomerStatusBadge status={c.status} locale={locale} />
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/60 text-xs">
                      <div>
                        <span className="text-muted-foreground block text-[10.5px] font-normal uppercase tracking-wider">
                          {isVi ? "Đơn hàng" : "Orders"}
                        </span>
                        <span className="font-normal tabular-nums text-foreground mt-0.5 inline-block text-xs">
                          {canReadOrders && c.orderCount !== null ? (
                            <>
                              {c.orderCount}{" "}
                              {isVi
                                ? "đơn"
                                : c.orderCount === 1
                                  ? "order"
                                  : "orders"}
                            </>
                          ) : (
                            <span className="text-muted-foreground italic font-normal">
                              —
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-muted-foreground block text-[10.5px] font-normal uppercase tracking-wider">
                          {isVi ? "Tổng chi tiêu" : "Spend"}
                        </span>
                        <span className="font-normal tabular-nums text-foreground mt-0.5 inline-block text-xs">
                          {canReadOrders && c.lifetimeSpend !== null ? (
                            formatPrice(c.lifetimeSpend)
                          ) : (
                            <span className="text-muted-foreground italic font-normal">
                              —
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs text-muted-foreground">
                      <span className="tabular-nums font-normal text-xs">
                        {isVi ? "Gia nhập: " : "Joined: "}
                        {formatDate(c.createdAt)}
                      </span>
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-7 px-2.5 text-xs font-normal rounded-lg inline-flex items-center gap-1"
                      >
                        <Link href={`/admin/customers/${c.id}`}>
                          <span>{isVi ? "Xem" : "View"}</span>
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bounded Pagination Controls */}
            <AdminPagination
              page={page}
              limit={limit}
              totalCount={totalCount}
              hasMore={hasMore}
              locale={locale}
              itemLabelEn="customers"
              itemLabelVi="khách hàng"
            />
          </div>
        )}
      </AdminSearchResults>
    </div>
  );
}
