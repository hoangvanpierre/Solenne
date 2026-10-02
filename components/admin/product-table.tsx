"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  ExternalLink,
  EyeOff,
  Layers,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import type { Product, ScentCategory } from "@/types";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui";

export interface ProductTableProps {
  products: Product[];
  locale?: string;
}

type SortOption =
  | "newest"
  | "name-asc"
  | "name-desc"
  | "price-asc"
  | "price-desc"
  | "stock-desc"
  | "stock-asc";

type StatusFilter = "all" | "active" | "inactive";

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

export function ProductTable({ products, locale = "en" }: ProductTableProps) {
  const isVi = locale === "vi";

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ScentCategory | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  // Summary Metrics calculated from the full dataset
  const metrics = useMemo(() => {
    let activeCount = 0;
    let inactiveCount = 0;
    let featuredCount = 0;
    let totalStockCount = 0;

    for (const product of products) {
      if (product.isActive) {
        activeCount++;
      } else {
        inactiveCount++;
      }
      if (product.isFeatured) {
        featuredCount++;
      }
      for (const variant of product.variants ?? []) {
        totalStockCount += variant.stockQuantity;
      }
    }

    return {
      total: products.length,
      active: activeCount,
      inactive: inactiveCount,
      featured: featuredCount,
      totalStock: totalStockCount,
    };
  }, [products]);

  // Filtered & Sorted products
  const filteredProducts = useMemo(() => {
    let result = [...products];

    // 1. Search Query: matches product name, slug, or any variant SKU
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter((product) => {
        const matchesName = product.name.toLowerCase().includes(query);
        const matchesSlug = product.slug.toLowerCase().includes(query);
        const matchesTagline =
          product.tagline?.toLowerCase().includes(query) ?? false;
        const matchesSku = (product.variants ?? []).some(
          (v) => v.sku && v.sku.toLowerCase().includes(query)
        );
        return matchesName || matchesSlug || matchesTagline || matchesSku;
      });
    }

    // 2. Category Filter
    if (categoryFilter !== "all") {
      result = result.filter((p) => p.category === categoryFilter);
    }

    // 3. Status Filter (Active / Inactive via is_active)
    if (statusFilter === "active") {
      result = result.filter((p) => p.isActive);
    } else if (statusFilter === "inactive") {
      result = result.filter((p) => !p.isActive);
    }

    // 4. Sorting
    if (sortBy === "newest") {
      result.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } else if (sortBy === "name-asc") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "name-desc") {
      result.sort((a, b) => b.name.localeCompare(a.name));
    } else if (sortBy === "price-asc") {
      result.sort((a, b) => a.basePrice - b.basePrice);
    } else if (sortBy === "price-desc") {
      result.sort((a, b) => b.basePrice - a.basePrice);
    } else if (sortBy === "stock-desc") {
      result.sort((a, b) => {
        const stockA = (a.variants ?? []).reduce(
          (sum, v) => sum + v.stockQuantity,
          0
        );
        const stockB = (b.variants ?? []).reduce(
          (sum, v) => sum + v.stockQuantity,
          0
        );
        return stockB - stockA;
      });
    } else if (sortBy === "stock-asc") {
      result.sort((a, b) => {
        const stockA = (a.variants ?? []).reduce(
          (sum, v) => sum + v.stockQuantity,
          0
        );
        const stockB = (b.variants ?? []).reduce(
          (sum, v) => sum + v.stockQuantity,
          0
        );
        return stockA - stockB;
      });
    }

    return result;
  }, [products, searchQuery, categoryFilter, statusFilter, sortBy]);

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    categoryFilter !== "all" ||
    statusFilter !== "all" ||
    sortBy !== "newest";

  const handleResetFilters = () => {
    setSearchQuery("");
    setCategoryFilter("all");
    setStatusFilter("all");
    setSortBy("newest");
  };

  return (
    <div className="space-y-6">
      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Products */}
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
              {isVi ? "Tổng sản phẩm" : "Total Products"}
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-foreground">
            {metrics.total}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {isVi ? "Toàn bộ danh mục nến" : "All candle creations"}
          </span>
        </button>

        {/* Active Products */}
        <button
          type="button"
          onClick={() =>
            setStatusFilter(statusFilter === "active" ? "all" : "active")
          }
          className={`rounded-2xl border p-4 text-left transition-all ${
            statusFilter === "active"
              ? "border-sage bg-sage/10 shadow-sm"
              : "border-border bg-card/40 hover:border-sage/40 hover:bg-card/70"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-sage uppercase tracking-wider">
              {isVi ? "Đang mở bán" : "Active / Live"}
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sage/15 text-sage">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-foreground">
            {metrics.active}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {isVi ? "Hiển thị trên tiệm nến" : "Visible in storefront"}
          </span>
        </button>

        {/* Inactive / Draft Products */}
        <button
          type="button"
          onClick={() =>
            setStatusFilter(statusFilter === "inactive" ? "all" : "inactive")
          }
          className={`rounded-2xl border p-4 text-left transition-all ${
            statusFilter === "inactive"
              ? "border-amber bg-amber/10 shadow-sm"
              : "border-border bg-card/40 hover:border-amber/40 hover:bg-card/70"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber uppercase tracking-wider">
              {isVi ? "Tạm ẩn / Bản nháp" : "Inactive / Draft"}
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber/15 text-amber">
              <EyeOff className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-foreground">
            {metrics.inactive}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {isVi ? "Ẩn khỏi cửa hàng" : "Hidden from storefront"}
          </span>
        </button>

        {/* Featured Products */}
        <div className="rounded-2xl border border-border bg-card/40 p-4 text-left">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {isVi ? "Nổi bật" : "Featured"}
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber/15 text-amber">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-foreground">
            {metrics.featured}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {isVi ? "Trang chủ & Bộ sưu tập" : "Homepage showcase"}
          </span>
        </div>
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
                  ? "Tìm theo tên tác phẩm, slug hoặc SKU..."
                  : "Search by product name, slug, or SKU..."
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

          {/* Quick Filter Controls */}
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
                <option value="all">
                  {isVi ? "Tất cả nhóm hương" : "All Categories"}
                </option>
                <option value="floral">{isVi ? "Hương Hoa" : "Floral"}</option>
                <option value="woody">{isVi ? "Hương Gỗ" : "Woody"}</option>
                <option value="fresh">{isVi ? "Tươi Mát" : "Fresh"}</option>
                <option value="warm">{isVi ? "Ấm Áp" : "Warm"}</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground hidden sm:inline mr-1">
                {isVi ? "Trạng thái:" : "Status:"}
              </span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                aria-label={isVi ? "Lọc theo trạng thái" : "Filter by status"}
              >
                <option value="all">
                  {isVi ? "Tất cả trạng thái" : "All Status"}
                </option>
                <option value="active">
                  {isVi ? "Đang mở bán" : "Active"}
                </option>
                <option value="inactive">
                  {isVi ? "Tạm ẩn / Bản nháp" : "Inactive / Draft"}
                </option>
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
                <option value="newest">
                  {isVi ? "Mới nhất trước" : "Newest First"}
                </option>
                <option value="name-asc">
                  {isVi ? "Tên: A–Z" : "Product Name: A–Z"}
                </option>
                <option value="name-desc">
                  {isVi ? "Tên: Z–A" : "Product Name: Z–A"}
                </option>
                <option value="price-asc">
                  {isVi ? "Giá: Thấp đến cao" : "Price: Low to High"}
                </option>
                <option value="price-desc">
                  {isVi ? "Giá: Cao đến thấp" : "Price: High to Low"}
                </option>
                <option value="stock-desc">
                  {isVi ? "Tồn kho: Nhiều đến ít" : "Total Stock: High to Low"}
                </option>
                <option value="stock-asc">
                  {isVi ? "Tồn kho: Ít đến nhiều" : "Total Stock: Low to High"}
                </option>
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
              ? `Hiển thị ${filteredProducts.length} trên tổng số ${metrics.total} tác phẩm`
              : `Showing ${filteredProducts.length} of ${metrics.total} products`}
          </span>

          {hasActiveFilters && (
            <span className="text-[11px] text-amber font-medium">
              {isVi ? "Bộ lọc đang kích hoạt" : "Filters active"}
            </span>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border py-16 text-center bg-card/20">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/40">
            <Layers className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 font-serif text-lg font-medium text-foreground">
            {metrics.total === 0
              ? isVi
                ? "Chưa có sản phẩm nào"
                : "No products in catalog"
              : isVi
                ? "Không tìm thấy tác phẩm phù hợp"
                : "No matching products found"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm">
            {metrics.total === 0
              ? isVi
                ? "Chưa có tác phẩm nến nào trong danh mục quản trị."
                : "There are currently no products recorded in the system."
              : isVi
                ? "Không có tác phẩm nào thỏa mãn điều kiện lọc và từ khóa tìm kiếm đã chọn."
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
                    {isVi ? "Tác phẩm" : "Product"}
                  </th>
                  <th scope="col" className="py-3.5 px-4 font-medium">
                    {isVi ? "Nhóm hương" : "Category"}
                  </th>
                  <th scope="col" className="py-3.5 px-4 font-medium">
                    {isVi ? "Phiên bản" : "Variants"}
                  </th>
                  <th scope="col" className="py-3.5 px-4 font-medium">
                    {isVi ? "Giá cơ bản" : "Base Price"}
                  </th>
                  <th scope="col" className="py-3.5 px-6 font-medium">
                    {isVi ? "Tổng tồn kho" : "Total Stock"}
                  </th>
                  <th scope="col" className="py-3.5 px-4 font-medium">
                    {isVi ? "Ngày tạo" : "Created"}
                  </th>
                  <th
                    scope="col"
                    className="py-3.5 px-6 text-right font-medium"
                  >
                    {isVi ? "Thao tác" : "Actions"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredProducts.map((product) => {
                  const categoryMeta =
                    CATEGORY_MAP[product.category] ?? CATEGORY_MAP.floral;
                  const variantCount = product.variants?.length ?? 0;
                  const totalStock = (product.variants ?? []).reduce(
                    (sum, v) => sum + v.stockQuantity,
                    0
                  );
                  const sizes = (product.variants ?? [])
                    .map((v) => v.size)
                    .filter(Boolean)
                    .join(", ");

                  const formattedDate = new Date(
                    product.createdAt
                  ).toLocaleDateString(isVi ? "vi-VN" : "en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });

                  return (
                    <tr
                      key={product.id}
                      className="transition-colors hover:bg-muted/30"
                    >
                      {/* Product Name, Slug, Status */}
                      <td className="py-4 px-6">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground text-sm">
                              {product.name}
                            </span>

                            {/* Storefront Link */}
                            <Link
                              href={`/products/${product.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground inline-flex items-center"
                              title={
                                isVi
                                  ? "Xem trang tác phẩm trên cửa hàng"
                                  : "View product on storefront"
                              }
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Link>

                            {/* Status Badge */}
                            {product.isActive ? (
                              <span className="inline-flex items-center rounded-md border border-sage/40 bg-sage/10 px-1.5 py-0.5 text-[10px] font-medium text-sage">
                                {isVi ? "Mở bán" : "Active"}
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                {isVi ? "Tạm ẩn" : "Draft"}
                              </span>
                            )}

                            {/* Featured Badge */}
                            {product.isFeatured && (
                              <span className="inline-flex items-center gap-0.5 rounded-md border border-amber/40 bg-amber/10 px-1.5 py-0.5 text-[10px] font-medium text-amber">
                                <Sparkles className="h-2.5 w-2.5" />
                                <span>{isVi ? "Nổi bật" : "Featured"}</span>
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-muted-foreground font-mono">
                            /{product.slug}
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

                      {/* Variants */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="text-xs">
                          <span className="font-medium text-foreground">
                            {variantCount}{" "}
                            {isVi
                              ? "phiên bản"
                              : variantCount === 1
                                ? "variant"
                                : "variants"}
                          </span>
                          {sizes && (
                            <div className="text-[11px] text-muted-foreground truncate max-w-[12rem]">
                              {sizes}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Base Price */}
                      <td className="py-4 px-4 font-mono text-xs font-semibold text-foreground whitespace-nowrap">
                        <div>{formatPrice(product.basePrice)}</div>
                        {product.compareAtPrice && (
                          <div className="text-[10px] text-muted-foreground line-through">
                            {formatPrice(product.compareAtPrice)}
                          </div>
                        )}
                      </td>

                      {/* Total Stock */}
                      <td className="py-4 px-6 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono text-sm font-bold ${
                              totalStock === 0
                                ? "text-destructive"
                                : totalStock <= 10
                                  ? "text-amber"
                                  : "text-foreground"
                            }`}
                          >
                            {totalStock}
                          </span>
                          <Link
                            href="/admin/inventory"
                            className="text-muted-foreground hover:text-amber inline-flex items-center p-1 rounded hover:bg-muted/40 transition-colors"
                            title={
                              isVi
                                ? "Xem trong quản lý tồn kho"
                                : "View in inventory management"
                            }
                          >
                            <Boxes className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </td>

                      {/* Created Date */}
                      <td className="py-4 px-4 text-xs text-muted-foreground whitespace-nowrap">
                        {formattedDate}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right whitespace-nowrap">
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="inline-flex items-center gap-1.5 text-xs"
                        >
                          <Link href={`/admin/products/${product.id}`}>
                            <span>{isVi ? "Chi tiết" : "Manage"}</span>
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {filteredProducts.map((product) => {
              const categoryMeta =
                CATEGORY_MAP[product.category] ?? CATEGORY_MAP.floral;
              const variantCount = product.variants?.length ?? 0;
              const totalStock = (product.variants ?? []).reduce(
                (sum, v) => sum + v.stockQuantity,
                0
              );

              return (
                <div
                  key={product.id}
                  className="rounded-2xl border border-border bg-card/40 p-4 space-y-3"
                >
                  {/* Card Header: Product name & Badges */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="font-medium text-sm text-foreground">
                          {product.name}
                        </h4>
                        {product.isActive ? (
                          <span className="rounded-md border border-sage/40 bg-sage/10 px-1.5 py-0.2 text-[10px] text-sage font-medium">
                            {isVi ? "Mở bán" : "Active"}
                          </span>
                        ) : (
                          <span className="rounded-md border border-border bg-muted px-1.5 py-0.2 text-[10px] text-muted-foreground font-medium">
                            {isVi ? "Tạm ẩn" : "Draft"}
                          </span>
                        )}
                        {product.isFeatured && (
                          <span className="rounded-md border border-amber/40 bg-amber/10 px-1.5 py-0.2 text-[10px] text-amber font-medium inline-flex items-center gap-0.5">
                            <Sparkles className="h-2.5 w-2.5" />
                            <span>{isVi ? "Nổi bật" : "Featured"}</span>
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        /{product.slug}
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium shrink-0 ${categoryMeta.className}`}
                    >
                      {isVi ? categoryMeta.labelVi : categoryMeta.labelEn}
                    </span>
                  </div>

                  {/* Pricing and Variants count */}
                  <div className="flex items-center justify-between text-xs border-t border-border/50 pt-2">
                    <div className="text-muted-foreground">
                      {variantCount}{" "}
                      {isVi
                        ? "phiên bản"
                        : variantCount === 1
                          ? "variant"
                          : "variants"}
                    </div>
                    <div className="font-mono font-semibold text-foreground">
                      {formatPrice(product.basePrice)}
                    </div>
                  </div>

                  {/* Stock and Link */}
                  <div className="flex items-center justify-between border-t border-border/50 pt-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {isVi ? "Tồn kho:" : "Stock:"}
                      </span>
                      <span
                        className={`font-mono font-bold ${
                          totalStock === 0
                            ? "text-destructive"
                            : totalStock <= 10
                              ? "text-amber"
                              : "text-foreground"
                        }`}
                      >
                        {totalStock}
                      </span>
                      <Link
                        href="/admin/inventory"
                        className="text-muted-foreground hover:text-amber text-[11px] underline underline-offset-2 ml-1"
                      >
                        {isVi ? "Kho hàng" : "Inventory"}
                      </Link>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link
                        href={`/products/${product.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground p-1"
                        title={isVi ? "Xem trang sản phẩm" : "View live product"}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>

                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="inline-flex items-center gap-1 text-xs py-1 h-7"
                      >
                        <Link href={`/admin/products/${product.id}`}>
                          <span>{isVi ? "Chi tiết" : "Manage"}</span>
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </Button>
                    </div>
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
