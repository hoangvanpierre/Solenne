"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  ExternalLink,
  Filter,
  Package,
  RotateCcw,
  ShieldCheck,
  User,
} from "lucide-react";
import type { AuditDatePreset, AuditLog } from "@/types";
import { formatAuditSummary, isValidUuid } from "@/lib/audit-utils";
import { Button } from "@/components/ui";

export interface AuditTableProps {
  logs: AuditLog[];
  totalCount: number;
  page: number;
  limit: number;
  hasMore: boolean;
  canReadOrders: boolean;
  canManageProducts: boolean;
  locale?: string;
  initialFilters?: {
    action?: string;
    resourceType?: string;
    datePreset?: AuditDatePreset;
  };
}

const ACTION_OPTIONS = [
  { value: "all", labelEn: "All Actions", labelVi: "Tất cả hành động" },
  { value: "order", labelEn: "Category: Orders", labelVi: "Nhóm: Đơn hàng" },
  { value: "order.created", labelEn: "Order Created", labelVi: "Tạo đơn hàng" },
  {
    value: "order.status_transition",
    labelEn: "Order Status Transition",
    labelVi: "Chuyển trạng thái đơn",
  },
  {
    value: "order.cancelled",
    labelEn: "Order Cancelled",
    labelVi: "Hủy đơn hàng",
  },
  {
    value: "order.fulfillment_rollback",
    labelEn: "Order Fulfillment Rollback",
    labelVi: "Hoàn tác vận đơn",
  },
  {
    value: "order.create_rolled_back",
    labelEn: "Order Creation Rolled Back",
    labelVi: "Hoàn tác tạo đơn",
  },
  {
    value: "order.stock_conflict",
    labelEn: "Order Stock Conflict",
    labelVi: "Xung đột tồn kho",
  },
  {
    value: "inventory",
    labelEn: "Category: Inventory",
    labelVi: "Nhóm: Tồn kho",
  },
  {
    value: "inventory.adjusted",
    labelEn: "Inventory Adjusted",
    labelVi: "Điều chỉnh tồn kho",
  },
  {
    value: "product",
    labelEn: "Category: Products",
    labelVi: "Nhóm: Sản phẩm",
  },
  {
    value: "product.created",
    labelEn: "Product Created",
    labelVi: "Tạo sản phẩm",
  },
  {
    value: "product.updated",
    labelEn: "Product Updated",
    labelVi: "Cập nhật sản phẩm",
  },
  {
    value: "product.deleted",
    labelEn: "Product Deleted",
    labelVi: "Xóa sản phẩm",
  },
  {
    value: "product_variant.created",
    labelEn: "Variant Created",
    labelVi: "Tạo phiên bản",
  },
  {
    value: "product_variant.updated",
    labelEn: "Variant Updated",
    labelVi: "Cập nhật phiên bản",
  },
  {
    value: "product_variant.deleted",
    labelEn: "Variant Deleted",
    labelVi: "Xóa phiên bản",
  },
  { value: "user", labelEn: "Category: Users", labelVi: "Nhóm: Người dùng" },
  {
    value: "user.role_changed",
    labelEn: "User Role Changed",
    labelVi: "Thay đổi vai trò",
  },
];

const RESOURCE_TYPE_OPTIONS = [
  { value: "all", labelEn: "All Resources", labelVi: "Tất cả tài nguyên" },
  { value: "order", labelEn: "Order", labelVi: "Đơn hàng" },
  { value: "product", labelEn: "Product", labelVi: "Sản phẩm" },
  { value: "product_variant", labelEn: "Product Variant", labelVi: "Phiên bản" },
  { value: "profile", labelEn: "User Profile", labelVi: "Hồ sơ người dùng" },
];

const DATE_PRESET_OPTIONS: {
  value: AuditDatePreset;
  labelEn: string;
  labelVi: string;
}[] = [
  { value: "all", labelEn: "All Time", labelVi: "Toàn bộ thời gian" },
  { value: "today", labelEn: "Today", labelVi: "Hôm nay" },
  { value: "7d", labelEn: "Last 7 Days", labelVi: "7 ngày qua" },
  { value: "30d", labelEn: "Last 30 Days", labelVi: "30 ngày qua" },
];

function getActionBadgeStyle(action: string): string {
  if (action.startsWith("order")) {
    return "border-amber/40 bg-amber/15 text-amber";
  }
  if (action.startsWith("inventory")) {
    return "border-blush/40 bg-blush/15 text-blush";
  }
  if (action.startsWith("product")) {
    return "border-sage/40 bg-sage/15 text-sage";
  }
  if (action.startsWith("user")) {
    return "border-primary/30 bg-primary/10 text-primary";
  }
  return "border-border bg-muted/40 text-muted-foreground";
}

export function AuditTable({
  logs,
  totalCount,
  page,
  limit,
  hasMore,
  canReadOrders,
  canManageProducts,
  locale = "en",
  initialFilters = {},
}: AuditTableProps) {
  const isVi = locale === "vi";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Current active filter values
  const currentAction = searchParams.get("action") ?? initialFilters.action ?? "all";
  const currentResourceType =
    searchParams.get("resourceType") ?? initialFilters.resourceType ?? "all";
  const currentDatePreset =
    (searchParams.get("datePreset") as AuditDatePreset) ??
    initialFilters.datePreset ??
    "all";

  const hasActiveFilters = useMemo(() => {
    return (
      (currentAction && currentAction !== "all") ||
      (currentResourceType && currentResourceType !== "all") ||
      (currentDatePreset && currentDatePreset !== "all")
    );
  }, [currentAction, currentResourceType, currentDatePreset]);

  const updateSearchParam = (paramsToUpdate: Record<string, string | null>) => {
    const current = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(paramsToUpdate)) {
      if (value === null || value === "" || value === "all") {
        current.delete(key);
      } else {
        current.set(key, value);
      }
    }
    const queryString = current.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  };

  const handleActionChange = (action: string) => {
    updateSearchParam({ action, page: "1" });
  };

  const handleResourceTypeChange = (resourceType: string) => {
    updateSearchParam({ resourceType, page: "1" });
  };

  const handleDatePresetChange = (datePreset: string) => {
    updateSearchParam({ datePreset, page: "1" });
  };

  const handleResetFilters = () => {
    router.push(pathname);
  };

  const handlePreviousPage = () => {
    if (page > 1) {
      updateSearchParam({ page: String(page - 1) });
    }
  };

  const handleNextPage = () => {
    if (hasMore) {
      updateSearchParam({ page: String(page + 1) });
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString(isVi ? "vi-VN" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const renderTargetEntity = (log: AuditLog) => {
    if (!log.resourceType) {
      return <span className="text-muted-foreground">–</span>;
    }

    if (log.resourceType === "order" && log.resourceId) {
      const rawOrderNumber =
        log.metadata?.orderNumber ?? log.metadata?.order_number;
      const orderNumber = rawOrderNumber ? String(rawOrderNumber) : null;
      const label = orderNumber ? `#${orderNumber}` : `${log.resourceId.slice(0, 8)}…`;

      // Only link if destination authorization succeeds and ID is a valid UUID
      if (canReadOrders && isValidUuid(log.resourceId)) {
        return (
          <Link
            href={`/admin/orders/${encodeURIComponent(log.resourceId)}`}
            className="inline-flex items-center gap-1 tabular-nums font-normal text-xs text-amber hover:underline transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber"
            title={`View order details: ${log.resourceId}`}
          >
            <span>{label}</span>
            <ExternalLink className="h-3 w-3 opacity-70" />
          </Link>
        );
      }

      return (
        <span
          className="tabular-nums font-normal text-xs text-foreground/80"
          title={`Order ID: ${log.resourceId}`}
        >
          {label}
        </span>
      );
    }

    if (log.resourceType === "product" && log.resourceId) {
      const rawProductName =
        log.metadata?.name ?? log.metadata?.product_name;
      const productName = rawProductName
        ? String(rawProductName)
        : `${log.resourceId.slice(0, 8)}…`;

      // Only link if product management permission succeeds and ID is a valid UUID
      if (canManageProducts && isValidUuid(log.resourceId)) {
        return (
          <Link
            href={`/admin/products/${encodeURIComponent(log.resourceId)}`}
            className="inline-flex items-center gap-1 font-normal text-xs text-sage hover:underline transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sage"
            title={`View product: ${log.resourceId}`}
          >
            <span>{productName}</span>
            <ExternalLink className="h-3 w-3 opacity-70" />
          </Link>
        );
      }

      return (
        <span
          className="font-normal text-xs text-foreground/80"
          title={`Product ID: ${log.resourceId}`}
        >
          {productName}
        </span>
      );
    }

    if (log.resourceType === "product_variant" && log.resourceId) {
      const rawProductId = (log.metadata?.productId ?? log.metadata?.product_id) as
        | string
        | undefined;
      const sku = log.metadata?.sku ? String(log.metadata.sku) : null;
      const label = sku ? `SKU: ${sku}` : `${log.resourceId.slice(0, 8)}…`;

      // Link to parent product only when valid parent UUID is present and permission is held
      if (canManageProducts && isValidUuid(rawProductId)) {
        return (
          <Link
            href={`/admin/products/${encodeURIComponent(rawProductId)}`}
            className="inline-flex items-center gap-1 tabular-nums font-normal text-xs text-sage hover:underline transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sage"
            title={`View parent product: ${rawProductId}`}
          >
            <span>{label}</span>
            <ExternalLink className="h-3 w-3 opacity-70" />
          </Link>
        );
      }

      return (
        <span
          className="tabular-nums font-normal text-xs text-foreground/80"
          title={`Variant ID: ${log.resourceId}`}
        >
          {label}
        </span>
      );
    }

    if (log.resourceType === "profile" && log.resourceId) {
      return (
        <span
          className="tabular-nums font-normal text-xs text-muted-foreground"
          title={`User Profile: ${log.resourceId}`}
        >
          {log.actorName ? log.actorName : `User: ${log.resourceId.slice(0, 8)}…`}
        </span>
      );
    }

    return (
      <span className="tabular-nums font-normal text-xs text-muted-foreground">
        {log.resourceId ? `${log.resourceType}:${log.resourceId.slice(0, 8)}…` : log.resourceType}
      </span>
    );
  };

  const renderActor = (log: AuditLog) => {
    if (!log.actorId) {
      return (
        <span className="inline-flex items-center gap-1 text-xs italic font-normal text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 opacity-60" />
          <span>{isVi ? "Hệ thống" : "System"}</span>
        </span>
      );
    }

    if (log.actorName) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-normal text-foreground">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{log.actorName}</span>
        </span>
      );
    }

    return (
      <span
        className="inline-flex items-center gap-1 tabular-nums font-normal text-xs text-muted-foreground"
        title={`Actor UUID: ${log.actorId}`}
      >
        <User className="h-3.5 w-3.5 opacity-60" />
        <span>{`ID: ${log.actorId.slice(0, 8)}…`}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Filters and Controls */}
      <div className="rounded-2xl border border-border bg-card/40 p-4 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            {/* Action / Category Filter */}
            <div className="flex items-center gap-1.5 text-xs font-normal">
              <label htmlFor="audit-action-filter" className="sr-only">
                {isVi ? "Lọc theo hành động" : "Filter by action"}
              </label>
              <select
                id="audit-action-filter"
                value={currentAction}
                onChange={(e) => handleActionChange(e.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-normal text-foreground focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber"
              >
                {ACTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {isVi ? opt.labelVi : opt.labelEn}
                  </option>
                ))}
              </select>
            </div>

            {/* Resource Type Filter */}
            <div className="flex items-center gap-1.5 text-xs font-normal">
              <label htmlFor="audit-resource-filter" className="sr-only">
                {isVi ? "Lọc theo tài nguyên" : "Filter by resource"}
              </label>
              <select
                id="audit-resource-filter"
                value={currentResourceType}
                onChange={(e) => handleResourceTypeChange(e.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-normal text-foreground focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber"
              >
                {RESOURCE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {isVi ? opt.labelVi : opt.labelEn}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Preset Filter */}
            <div className="flex items-center gap-1.5 text-xs font-normal">
              <label htmlFor="audit-date-filter" className="sr-only">
                {isVi ? "Lọc theo thời gian" : "Filter by date"}
              </label>
              <select
                id="audit-date-filter"
                value={currentDatePreset}
                onChange={(e) => handleDatePresetChange(e.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-normal text-foreground focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber"
              >
                {DATE_PRESET_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {isVi ? opt.labelVi : opt.labelEn}
                  </option>
                ))}
              </select>
            </div>

            {/* Reset Filters button */}
            {hasActiveFilters && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 text-xs font-normal text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{isVi ? "Đặt lại" : "Reset"}</span>
              </Button>
            )}
          </div>

          {/* Active Filter Indicator */}
          <div className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
            {hasActiveFilters && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber/30 bg-amber/10 px-2.5 py-0.5 text-[11px] font-normal text-amber">
                <Filter className="h-3 w-3" />
                <span>{isVi ? "Bộ lọc đang kích hoạt" : "Filters active"}</span>
              </span>
            )}
            <span className="tabular-nums">
              {isVi
                ? `Trang ${page} • ${logs.length} bản ghi${totalCount > 0 ? ` (tổng ${totalCount})` : ""}`
                : `Page ${page} • ${logs.length} records${totalCount > 0 ? ` (${totalCount} total)` : ""}`}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border py-16 text-center bg-card/20">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/40">
            <Package className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-lg font-normal text-foreground">
            {isVi ? "Không tìm thấy nhật ký kiểm toán" : "No audit records found"}
          </h3>
          <p className="mt-1 text-[13.5px] leading-[1.6] font-normal text-muted-foreground max-w-sm">
            {hasActiveFilters
              ? isVi
                ? "Không có bản ghi nào thỏa mãn điều kiện lọc. Vui lòng thử thay đổi tiêu chí hoặc đặt lại bộ lọc."
                : "No audit events match your selected filters. Try broadening your criteria or reset filters."
              : isVi
                ? "Chưa có sự kiện kiểm toán nào được ghi nhận."
                : "No audit events have been recorded yet."}
          </p>
          {hasActiveFilters && (
            <div className="mt-5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 text-xs font-normal"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{isVi ? "Xóa bộ lọc" : "Clear filters"}</span>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Table View (lg and up) */}
          <div className="hidden lg:block overflow-hidden rounded-2xl border border-border bg-card/40">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/20 text-[11px] font-normal text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="px-5 py-3.5 font-normal">
                      {isVi ? "Thời gian" : "Timestamp"}
                    </th>
                    <th scope="col" className="px-5 py-3.5 font-normal">
                      {isVi ? "Hành động" : "Action"}
                    </th>
                    <th scope="col" className="px-5 py-3.5 font-normal">
                      {isVi ? "Người thực hiện" : "Actor"}
                    </th>
                    <th scope="col" className="px-5 py-3.5 font-normal">
                      {isVi ? "Đối tượng" : "Target"}
                    </th>
                    <th scope="col" className="px-5 py-3.5 font-normal">
                      {isVi ? "Nội dung tóm tắt" : "Summary"}
                    </th>
                    <th scope="col" className="px-5 py-3.5 text-right font-normal">
                      {isVi ? "Chi tiết" : "Details"}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {logs.map((log) => {
                    const isExpanded = expandedIds.has(log.id);
                    const metadataEntries = Object.entries(log.metadata);
                    const hasMetadata = metadataEntries.length > 0;

                    return (
                      <tr
                        key={log.id}
                        className="group hover:bg-muted/10 transition-colors"
                      >
                        {/* Timestamp */}
                        <td className="px-5 py-4 whitespace-nowrap text-xs text-muted-foreground">
                          <span
                            className="inline-flex items-center gap-1 tabular-nums font-normal"
                            title={log.createdAt}
                          >
                            <Clock className="h-3.5 w-3.5 opacity-60" />
                            <span>{formatDate(log.createdAt)}</span>
                          </span>
                        </td>

                        {/* Action Badge */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-normal ${getActionBadgeStyle(
                              log.action
                            )}`}
                          >
                            {log.action}
                          </span>
                        </td>

                        {/* Actor */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          {renderActor(log)}
                        </td>

                        {/* Target Entity */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          {renderTargetEntity(log)}
                        </td>

                        {/* Human-readable Summary */}
                        <td className="px-5 py-4 text-xs font-normal text-foreground/90 max-w-md">
                          <div>
                            <span>
                              {formatAuditSummary(log.action, log.metadata, locale)}
                            </span>
                          </div>

                          {/* Expanded Metadata Disclosure */}
                          {isExpanded && (
                            <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2">
                              <span className="text-[10.5px] font-normal uppercase tracking-wider text-muted-foreground">
                                {isVi ? "Siêu dữ liệu được phê duyệt" : "Approved Metadata"}
                              </span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs tabular-nums font-normal">
                                {metadataEntries.map(([key, val]) => (
                                  <div
                                    key={key}
                                    className="flex flex-col bg-background/60 p-2 rounded-lg border border-border/40"
                                  >
                                    <span className="text-[10.5px] font-normal text-muted-foreground uppercase">
                                      {key}
                                    </span>
                                    <span
                                      className="text-foreground truncate select-all"
                                      title={String(val)}
                                    >
                                      {val === null
                                        ? "null"
                                        : typeof val === "object"
                                        ? JSON.stringify(val)
                                        : String(val)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Details Expand Toggle */}
                        <td className="px-5 py-4 whitespace-nowrap text-right">
                          {hasMetadata ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => toggleExpand(log.id)}
                              aria-expanded={isExpanded}
                              className="inline-flex items-center gap-1 text-xs font-normal"
                            >
                              <span>{isExpanded ? (isVi ? "Thu gọn" : "Hide") : (isVi ? "Xem" : "Inspect")}</span>
                              {isExpanded ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">–</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card Layout (below lg) */}
          <div className="block lg:hidden space-y-3">
            {logs.map((log) => {
              const isExpanded = expandedIds.has(log.id);
              const metadataEntries = Object.entries(log.metadata);
              const hasMetadata = metadataEntries.length > 0;

              return (
                <div
                  key={log.id}
                  className="rounded-2xl border border-border bg-card/40 p-4 space-y-3 hover:border-amber/40 transition-colors"
                >
                  {/* Top Bar: Action Badge & Timestamp */}
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-normal ${getActionBadgeStyle(
                        log.action
                      )}`}
                    >
                      {log.action}
                    </span>
                    <span
                      className="inline-flex items-center gap-1 tabular-nums font-normal text-xs text-muted-foreground"
                      title={log.createdAt}
                    >
                      <Clock className="h-3 w-3 opacity-60" />
                      <span>{formatDate(log.createdAt)}</span>
                    </span>
                  </div>

                  {/* Summary */}
                  <p className="text-xs font-normal text-foreground leading-relaxed">
                    {formatAuditSummary(log.action, log.metadata, locale)}
                  </p>

                  {/* Actor and Target Details */}
                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border/40">
                    <div>
                      <span className="text-[10.5px] font-normal uppercase text-muted-foreground block">
                        {isVi ? "Người thực hiện" : "Actor"}
                      </span>
                      <div className="mt-0.5">{renderActor(log)}</div>
                    </div>
                    <div>
                      <span className="text-[10.5px] font-normal uppercase text-muted-foreground block">
                        {isVi ? "Đối tượng" : "Target"}
                      </span>
                      <div className="mt-0.5">{renderTargetEntity(log)}</div>
                    </div>
                  </div>

                  {/* Expandable Metadata for Mobile */}
                  {hasMetadata && (
                    <div className="pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => toggleExpand(log.id)}
                        aria-expanded={isExpanded}
                        className="w-full inline-flex items-center justify-center gap-1 text-xs font-normal"
                      >
                        <span>
                          {isExpanded
                            ? isVi
                              ? "Thu gọn chi tiết"
                              : "Hide Details"
                            : isVi
                              ? "Xem chi tiết dữ liệu"
                              : "Inspect Details"}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </Button>

                      {isExpanded && (
                        <div className="mt-2.5 rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2">
                          <span className="text-[10.5px] font-normal uppercase tracking-wider text-muted-foreground">
                            {isVi ? "Siêu dữ liệu được phê duyệt" : "Approved Metadata"}
                          </span>
                          <div className="space-y-1.5 text-xs tabular-nums font-normal">
                            {metadataEntries.map(([key, val]) => (
                              <div
                                key={key}
                                className="flex flex-col bg-background/60 p-2 rounded-lg border border-border/40"
                              >
                                <span className="text-[10.5px] font-normal text-muted-foreground uppercase">
                                  {key}
                                </span>
                                <span
                                  className="text-foreground break-all select-all"
                                  title={String(val)}
                                >
                                  {val === null
                                    ? "null"
                                    : typeof val === "object"
                                    ? JSON.stringify(val)
                                    : String(val)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <span className="text-xs font-normal tabular-nums text-muted-foreground">
              {isVi
                ? `Đang xem trang ${page} (${limit} bản ghi/trang)`
                : `Viewing page ${page} (${limit} per page)`}
            </span>

            <div className="inline-flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePreviousPage}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 text-xs font-normal"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>{isVi ? "Trang trước" : "Previous"}</span>
              </Button>

              <span className="px-2 text-xs font-normal tabular-nums text-foreground">
                {page}
              </span>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={!hasMore}
                className="inline-flex items-center gap-1 text-xs font-normal"
              >
                <span>{isVi ? "Trang sau" : "Next"}</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
