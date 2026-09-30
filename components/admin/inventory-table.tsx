"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertOctagon,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ExternalLink,
  Package,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import type { AdminInventoryItem } from "@/lib/inventory";
import type { ScentCategory } from "@/types";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui";
import {
  getStockStatus,
  LOW_STOCK_THRESHOLD,
  StockStatus,
  StockStatusBadge,
} from "./stock-status-badge";
import { InventoryAdjustControl } from "./inventory-adjust-control";

export interface InventoryTableProps {
  items: AdminInventoryItem[];
  locale?: string;
}

type SortOption = "default" | "stock-asc" | "stock-desc" | "name-asc";

const CATEGORY_MAP: Record<
  ScentCategory,
  { labelEn: string; labelVi: string; className: string }
> = {
  floral: {
    labelEn: "Floral",
    labelVi: "Hương Hoa",
    className: "border-blush/40 bg-blush/15 text-blush",
  },
  woody: {
    labelEn: "Woody",
    labelVi: "Hương Gỗ",
    className: "border-amber/40 bg-amber/15 text-amber",
  },
  fresh: {
    labelEn: "Fresh",
    labelVi: "Tươi Mát",
    className: "border-sage/40 bg-sage/15 text-sage",
  },
  warm: {
    labelEn: "Warm",
    labelVi: "Ấm Áp",
    className: "border-amber/40 bg-amber/15 text-amber",
  },
};

export function InventoryTable({ items, locale = "en" }: InventoryTableProps) {
  const isVi = locale === "vi";

  // Immediate optimistic overrides keyed by variant ID
  const [stockOverrides, setStockOverrides] = useState<Record<string, number>>({});

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ScentCategory | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StockStatus | "all">("all");
  const [sortBy, setSortBy] = useState<SortOption>("default");

  // Summary Metrics calculated from the full dataset with active overrides
  const metrics = useMemo(() => {
    let healthyCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    for (const item of items) {
      const stock = stockOverrides[item.id] ?? item.stockQuantity;
      const status = getStockStatus(stock);
      if (status === "in_stock") healthyCount++;
      else if (status === "low_stock") lowStockCount++;
      else if (status === "out_of_stock") outOfStockCount++;
    }

    return {
      total: items.length,
      healthy: healthyCount,
      lowStock: lowStockCount,
      outOfStock: outOfStockCount,
    };
  }, [items, stockOverrides]);

  // Filtered & Sorted items
  const filteredItems = useMemo(() => {
    let result = items.map((item) => {
      const override = stockOverrides[item.id];
      return override !== undefined ? { ...item, stockQuantity: override } : item;
    });

    // Search query: matches product name, variant name, or SKU
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter(
        (item) =>
          item.productName.toLowerCase().includes(query) ||
          item.name.toLowerCase().includes(query) ||
          (item.sku && item.sku.toLowerCase().includes(query))
      );
    }

    // Category filter
    if (categoryFilter !== "all") {
      result = result.filter((item) => item.category === categoryFilter);
    }

    // Stock Status filter
    if (statusFilter !== "all") {
      result = result.filter(
        (item) => getStockStatus(item.stockQuantity) === statusFilter
      );
    }

    // Sorting
    if (sortBy === "stock-asc") {
      result.sort((a, b) => a.stockQuantity - b.stockQuantity);
    } else if (sortBy === "stock-desc") {
      result.sort((a, b) => b.stockQuantity - a.stockQuantity);
    } else if (sortBy === "name-asc") {
      result.sort((a, b) => a.productName.localeCompare(b.productName));
    }

    return result;
  }, [items, stockOverrides, searchQuery, categoryFilter, statusFilter, sortBy]);

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    categoryFilter !== "all" ||
    statusFilter !== "all" ||
    sortBy !== "default";

  const handleResetFilters = () => {
    setSearchQuery("");
    setCategoryFilter("all");
    setStatusFilter("all");
    setSortBy("default");
  };

  const handleVariantAdjusted = (variantId: string, newStock: number) => {
    setStockOverrides((prev) => ({
      ...prev,
      [variantId]: newStock,
    }));
  };

  return (
    <div className="space-y-6">
      {/* KPI Summary Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Variants */}
        <button
          type="button"
          onClick={() => setStatusFilter("all")}
          className={`rounded-2xl border p-4 text-left transition-all ${
            statusFilter === "all"
              ? "border-foreground/30 bg-card shadow-sm"
              : "border-border bg-card/40 hover:border-foreground/20 hover:bg-card/70"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {isVi ? "Tổng phiên bản" : "Total Variants"}
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Boxes className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-foreground">
            {metrics.total}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {isVi ? "Toàn bộ danh mục" : "All catalog variants"}
          </span>
        </button>

        {/* Healthy / In Stock */}
        <button
          type="button"
          onClick={() =>
            setStatusFilter(statusFilter === "in_stock" ? "all" : "in_stock")
          }
          className={`rounded-2xl border p-4 text-left transition-all ${
            statusFilter === "in_stock"
              ? "border-sage bg-sage/10 shadow-sm"
              : "border-border bg-card/40 hover:border-sage/40 hover:bg-card/70"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-sage uppercase tracking-wider">
              {isVi ? "Dồi dào (>10)" : "In Stock (>10)"}
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sage/15 text-sage">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-foreground">
            {metrics.healthy}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {isVi ? "Tồn kho an toàn" : "Healthy inventory levels"}
          </span>
        </button>

        {/* Low Stock */}
        <button
          type="button"
          onClick={() =>
            setStatusFilter(statusFilter === "low_stock" ? "all" : "low_stock")
          }
          className={`rounded-2xl border p-4 text-left transition-all ${
            statusFilter === "low_stock"
              ? "border-amber bg-amber/10 shadow-sm"
              : "border-border bg-card/40 hover:border-amber/40 hover:bg-card/70"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber uppercase tracking-wider">
              {isVi ? `Sắp hết (≤${LOW_STOCK_THRESHOLD})` : `Low Stock (≤${LOW_STOCK_THRESHOLD})`}
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber/15 text-amber">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-foreground">
            {metrics.lowStock}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {isVi ? "Cần lên kế hoạch nhập" : "Needs replenishment"}
          </span>
        </button>

        {/* Out of Stock */}
        <button
          type="button"
          onClick={() =>
            setStatusFilter(statusFilter === "out_of_stock" ? "all" : "out_of_stock")
          }
          className={`rounded-2xl border p-4 text-left transition-all ${
            statusFilter === "out_of_stock"
              ? "border-destructive bg-destructive/10 shadow-sm"
              : "border-border bg-card/40 hover:border-destructive/40 hover:bg-card/70"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-destructive uppercase tracking-wider">
              {isVi ? "Hết hàng (0)" : "Out of Stock (0)"}
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
              <AlertOctagon className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-foreground">
            {metrics.outOfStock}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {isVi ? "Không thể đặt hàng" : "Unavailable for purchase"}
          </span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-border bg-card/40 p-4 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                isVi
                  ? "Tìm kiếm theo tên sản phẩm, phiên bản hoặc SKU..."
                  : "Search by product name, variant, or SKU..."
              }
              className="w-full rounded-xl border border-border bg-background pl-9 pr-9 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                aria-label={isVi ? "Xóa tìm kiếm" : "Clear search"}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Quick Filter Controls: Category, Status, Sort */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Category Filter */}
            <div className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground hidden sm:inline mr-1">
                {isVi ? "Nhóm hương:" : "Category:"}
              </span>
              <select
                value={categoryFilter}
                onChange={(e) =>
                  setCategoryFilter(e.target.value as ScentCategory | "all")
                }
                className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                aria-label={isVi ? "Lọc theo nhóm hương" : "Filter by category"}
              >
                <option value="all">{isVi ? "Tất cả nhóm hương" : "All Categories"}</option>
                <option value="floral">{isVi ? "Hương Hoa" : "Floral"}</option>
                <option value="woody">{isVi ? "Hương Gỗ" : "Woody"}</option>
                <option value="fresh">{isVi ? "Tươi Mát" : "Fresh"}</option>
                <option value="warm">{isVi ? "Ấm Áp" : "Warm"}</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground hidden sm:inline mr-1">
                {isVi ? "Tồn kho:" : "Stock:"}
              </span>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as StockStatus | "all")
                }
                className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                aria-label={isVi ? "Lọc theo trạng thái tồn kho" : "Filter by stock status"}
              >
                <option value="all">{isVi ? "Tất cả trạng thái" : "All Stock"}</option>
                <option value="in_stock">{isVi ? "Dồi dào (>10)" : "In Stock (>10)"}</option>
                <option value="low_stock">
                  {isVi ? `Sắp hết (≤${LOW_STOCK_THRESHOLD})` : `Low Stock (≤${LOW_STOCK_THRESHOLD})`}
                </option>
                <option value="out_of_stock">{isVi ? "Hết hàng (0)" : "Out of Stock (0)"}</option>
              </select>
            </div>

            {/* Sort Selector */}
            <div className="flex items-center gap-1 text-xs">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                aria-label={isVi ? "Sắp xếp danh sách" : "Sort list"}
              >
                <option value="default">{isVi ? "Mặc định (Mới nhất)" : "Default (Newest)"}</option>
                <option value="stock-asc">{isVi ? "Tồn kho: Ít đến nhiều" : "Stock: Low to High"}</option>
                <option value="stock-desc">{isVi ? "Tồn kho: Nhiều đến ít" : "Stock: High to Low"}</option>
                <option value="name-asc">{isVi ? "Tên sản phẩm: A–Z" : "Product Name: A–Z"}</option>
              </select>
            </div>

            {/* Reset Filters button */}
            {hasActiveFilters && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" />
                <span>{isVi ? "Đặt lại" : "Reset"}</span>
              </Button>
            )}
          </div>
        </div>

        {/* Filter Summary Results */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
          <span>
            {isVi
              ? `Hiển thị ${filteredItems.length} trên tổng số ${metrics.total} phiên bản`
              : `Showing ${filteredItems.length} of ${metrics.total} variants`}
          </span>

          {hasActiveFilters && (
            <span className="text-[11px] text-amber font-medium">
              {isVi ? "Bộ lọc đang kích hoạt" : "Filters active"}
            </span>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border py-16 text-center bg-card/20">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/40">
            <Package className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 font-serif text-lg font-medium text-foreground">
            {metrics.total === 0
              ? isVi
                ? "Chưa có dữ liệu tồn kho"
                : "No inventory items found"
              : isVi
                ? "Không tìm thấy phiên bản phù hợp"
                : "No matching variants"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm">
            {metrics.total === 0
              ? isVi
                ? "Chưa có phiên bản sản phẩm nào trong hệ thống."
                : "There are currently no product variants in the catalog."
              : isVi
                ? "Không có tác phẩm nào thỏa mãn các điều kiện lọc và tìm kiếm đã chọn."
                : "Try adjusting your search terms or filters to find what you're looking for."}
          </p>
          {hasActiveFilters && (
            <div className="mt-5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{isVi ? "Xóa bộ lọc" : "Clear filters"}</span>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Desktop & Tablet Table */}
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-border bg-card/40">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-xs uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="py-3.5 px-6 font-medium">
                    {isVi ? "Tác phẩm & Phiên bản" : "Product & Variant"}
                  </th>
                  <th scope="col" className="py-3.5 px-4 font-medium">
                    {isVi ? "Nhóm hương" : "Category"}
                  </th>
                  <th scope="col" className="py-3.5 px-4 font-medium">
                    {isVi ? "Đơn giá" : "Price"}
                  </th>
                  <th scope="col" className="py-3.5 px-6 font-medium">
                    {isVi ? "Tồn kho" : "Stock Quantity"}
                  </th>
                  <th scope="col" className="py-3.5 px-6 text-right font-medium">
                    {isVi ? "Thao tác" : "Actions"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredItems.map((item) => {
                  const categoryMeta =
                    CATEGORY_MAP[item.category] ?? CATEGORY_MAP.floral;
                  return (
                    <tr
                      key={item.id}
                      className="transition-colors hover:bg-muted/30"
                    >
                      {/* Product & Variant */}
                      <td className="py-4 px-6">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">
                              {item.productName}
                            </span>
                            {item.productSlug && (
                              <Link
                                href={`/products/${item.productSlug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground inline-flex items-center"
                                title={isVi ? "Xem trang sản phẩm" : "View product page"}
                              >
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            )}
                            {!item.isProductActive && (
                              <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-medium">
                                {isVi ? "Ẩn" : "Draft"}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-serif italic text-foreground/80">
                              {item.name}
                            </span>
                            {item.size && <span>· {item.size}</span>}
                            {item.sku && (
                              <span className="font-mono text-[11px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                                {item.sku}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${categoryMeta.className}`}
                        >
                          {isVi ? categoryMeta.labelVi : categoryMeta.labelEn}
                        </span>
                      </td>

                      {/* Price */}
                      <td className="py-4 px-4 font-mono text-xs font-semibold text-foreground whitespace-nowrap">
                        {formatPrice(item.price)}
                      </td>

                      {/* Stock Quantity & Badge */}
                      <td className="py-4 px-6 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm font-bold text-foreground min-w-[2.5rem]">
                            {item.stockQuantity}
                          </span>
                          <StockStatusBadge
                            stock={item.stockQuantity}
                            locale={locale}
                          />
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right whitespace-nowrap">
                        <InventoryAdjustControl
                          variantId={item.id}
                          variantName={item.name}
                          productName={item.productName}
                          sku={item.sku}
                          currentStock={item.stockQuantity}
                          locale={locale}
                          onAdjusted={(newStock) =>
                            handleVariantAdjusted(item.id, newStock)
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {filteredItems.map((item) => {
              const categoryMeta =
                CATEGORY_MAP[item.category] ?? CATEGORY_MAP.floral;
              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-border bg-card/40 p-4 space-y-3"
                >
                  {/* Card Header: Product name & Category */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-medium text-sm text-foreground">
                          {item.productName}
                        </h4>
                        {!item.isProductActive && (
                          <span className="rounded-md border border-border bg-muted px-1.5 py-0.2 text-[10px] text-muted-foreground font-medium">
                            {isVi ? "Ẩn" : "Draft"}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="font-serif italic text-foreground/80">
                          {item.name}
                        </span>
                        {item.size && <span>· {item.size}</span>}
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium shrink-0 ${categoryMeta.className}`}
                    >
                      {isVi ? categoryMeta.labelVi : categoryMeta.labelEn}
                    </span>
                  </div>

                  {/* SKU and Price */}
                  <div className="flex items-center justify-between text-xs border-t border-border/50 pt-2">
                    <div className="font-mono text-muted-foreground">
                      {item.sku ? item.sku : "—"}
                    </div>
                    <div className="font-mono font-semibold text-foreground">
                      {formatPrice(item.price)}
                    </div>
                  </div>

                  {/* Stock and Adjustment */}
                  <div className="flex items-center justify-between border-t border-border/50 pt-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-bold text-foreground">
                        {item.stockQuantity}
                      </span>
                      <StockStatusBadge
                        stock={item.stockQuantity}
                        locale={locale}
                      />
                    </div>

                    <InventoryAdjustControl
                      variantId={item.id}
                      variantName={item.name}
                      productName={item.productName}
                      sku={item.sku}
                      currentStock={item.stockQuantity}
                      locale={locale}
                      onAdjusted={(newStock) =>
                        handleVariantAdjusted(item.id, newStock)
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
