import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import {
  ArrowLeft,
  Boxes,
  Calendar,
  ExternalLink,
  Eye,
  EyeOff,
  Layers,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { AuthError, requireAnyPermission } from "@/lib/authz";
import {
  isRestrictedAuthError,
  isUnauthenticatedAuthError,
} from "@/lib/authz-ux";
import { getAdminProductById } from "@/lib/admin-products";
import { formatPrice } from "@/lib/utils";
import { RestrictedAccountNotice } from "@/components/account";
import { Button } from "@/components/ui";
import {
  ProductForm,
  StockStatusBadge,
  VariantManager,
} from "@/components/admin";
import type { Product, ScentCategory } from "@/types";

export const metadata: Metadata = {
  title: "Product Workspace — Administration",
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

interface AdminProductDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminProductDetailPage({
  params,
}: AdminProductDetailPageProps) {
  const { id } = await params;
  const locale = await getLocale();
  const isVi = locale === "vi";

  let product: Product | null = null;
  let accountRestricted = false;
  let forbiddenAccess = false;
  let loadFailed = false;
  let productNotFound = false;

  if (!UUID_REGEX.test(id)) {
    productNotFound = true;
  } else {
    try {
      // Explicit server-side authorization check:
      // Must hold at least one administrative product management permission.
      await requireAnyPermission([
        "product.create",
        "product.update",
        "product.delete",
      ]);

      product = await getAdminProductById(id);
      if (!product) {
        productNotFound = true;
      }
    } catch (error) {
      if (isUnauthenticatedAuthError(error)) {
        redirect(`/login?next=/admin/products/${id}`);
      }

      if (isRestrictedAuthError(error)) {
        accountRestricted = true;
      } else if (error instanceof AuthError) {
        // 403 Forbidden: user has session but lacks product management permissions
        forbiddenAccess = true;
      } else {
        console.error("AdminProductDetailPage: Failed to load product:", error);
        loadFailed = true;
      }
    }
  }

  if (accountRestricted) {
    return (
      <div className="py-8">
        <div className="mx-auto max-w-2xl">
          <RestrictedAccountNotice locale={locale} />
        </div>
      </div>
    );
  }

  if (forbiddenAccess) {
    return (
      <div className="py-8">
        <div className="mx-auto max-w-2xl rounded-2xl border border-border p-10 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber/10">
            <ShieldAlert className="h-6 w-6 text-amber" />
          </div>

          <h2 className="font-serif text-2xl font-medium text-foreground">
            {isVi ? "Khu vực không khả dụng" : "Access Restricted"}
          </h2>

          <p className="mx-auto max-w-lg text-sm leading-relaxed text-muted-foreground">
            {isVi
              ? "Quý khách không có quyền quản trị hoặc xem chi tiết sản phẩm này."
              : "You do not have permission to view or manage this administrative product record."}
          </p>

          <div className="pt-4 flex justify-center">
            <Button asChild variant="outline">
              <Link href="/admin/products" className="inline-flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                <span>
                  {isVi ? "Về Danh mục sản phẩm" : "Return to Products"}
                </span>
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (productNotFound || loadFailed || !product) {
    return (
      <div className="py-8 space-y-6 max-w-2xl mx-auto">
        <nav aria-label="Breadcrumb">
          <Link
            href="/admin/products"
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{isVi ? "Quay lại Sản phẩm" : "Back to Products"}</span>
          </Link>
        </nav>

        <div className="rounded-2xl border border-border bg-card/40 p-10 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted/40 text-muted-foreground">
            <Layers className="h-6 w-6" />
          </div>

          <h2 className="font-serif text-2xl font-medium text-foreground">
            {isVi ? "Không tìm thấy sản phẩm" : "Product Not Found"}
          </h2>

          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {isVi
              ? "Sản phẩm yêu cầu không tồn tại trong hệ thống hoặc đã bị xóa."
              : "The requested product does not exist in the administrative database or has been deleted."}
          </p>

          <div className="pt-4 flex justify-center">
            <Button asChild variant="outline">
              <Link href="/admin/products">
                {isVi ? "Về Danh mục sản phẩm" : "Return to Product Catalog"}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const categoryMeta =
    CATEGORY_MAP[product.category] ?? CATEGORY_MAP.floral;
  const totalStock = (product.variants ?? []).reduce(
    (sum, v) => sum + v.stockQuantity,
    0
  );

  const formattedCreated = new Date(product.createdAt).toLocaleDateString(
    isVi ? "vi-VN" : "en-US",
    {
      year: "numeric",
      month: "short",
      day: "numeric",
    }
  );

  return (
    <div className="space-y-8 py-4">
      {/* Header & Breadcrumb */}
      <header className="space-y-4">
        <nav aria-label="Breadcrumb">
          <Link
            href="/admin/products"
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded"
            aria-label={
              isVi ? "Quay lại danh sách sản phẩm" : "Back to products list"
            }
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{isVi ? "Quay lại sản phẩm" : "Back to Products"}</span>
          </Link>
        </nav>

        {/* Product Identity Banner */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-border pb-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-serif text-3xl md:text-4xl font-semibold text-foreground">
                {product.name}
              </h1>

              {/* Category Badge */}
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${categoryMeta.className}`}
              >
                {isVi ? categoryMeta.labelVi : categoryMeta.labelEn}
              </span>

              {/* Status Badge */}
              {product.isActive ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-sage/40 bg-sage/15 px-2.5 py-0.5 text-xs font-medium text-sage">
                  <Eye className="h-3 w-3" />
                  <span>{isVi ? "Đang mở bán" : "Active"}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  <EyeOff className="h-3 w-3" />
                  <span>{isVi ? "Tạm ẩn" : "Inactive"}</span>
                </span>
              )}

              {/* Featured Badge */}
              {product.isFeatured && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber/40 bg-amber/15 px-2.5 py-0.5 text-xs font-medium text-amber">
                  <Sparkles className="h-3 w-3" />
                  <span>{isVi ? "Nổi bật" : "Featured"}</span>
                </span>
              )}
            </div>

            <p className="text-xs font-mono text-muted-foreground">
              /products/{product.slug}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="sm">
              <Link
                href={`/products/${product.slug}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs"
              >
                <span>{isVi ? "Xem tại cửa hàng" : "View in Storefront"}</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Quick Stats Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-card/40 p-3.5 space-y-1">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider block">
              {isVi ? "Giá cơ bản" : "Base Price"}
            </span>
            <div className="font-serif text-lg font-semibold text-foreground">
              {formatPrice(product.basePrice, "USD")}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card/40 p-3.5 space-y-1">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider block">
              {isVi ? "Tổng số phiên bản" : "Total Variants"}
            </span>
            <div className="font-serif text-lg font-semibold text-foreground">
              {product.variants?.length ?? 0}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card/40 p-3.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider block">
                {isVi ? "Tổng tồn kho" : "Total Stock"}
              </span>
              <StockStatusBadge stock={totalStock} locale={locale} />
            </div>
            <div className="font-mono text-lg font-semibold text-foreground">
              {totalStock}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card/40 p-3.5 space-y-1">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider block">
              {isVi ? "Ngày khởi tạo" : "Created On"}
            </span>
            <div className="text-xs text-foreground font-medium flex items-center gap-1.5 pt-1">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{formattedCreated}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Two-Column Editorial Composition */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Product Metadata Editor */}
        <div className="lg:col-span-7 space-y-8">
          <ProductForm
            mode="edit"
            product={product}
            locale={locale}
          />
        </div>

        {/* Right Column: Variant Manager & Inventory Workspace */}
        <div className="lg:col-span-5 space-y-6">
          {/* Variant Manager */}
          <section className="rounded-2xl border border-border bg-card/40 p-6">
            <VariantManager
              productId={product.id}
              productName={product.name}
              productSlug={product.slug}
              basePrice={product.basePrice}
              variants={product.variants ?? []}
              locale={locale}
            />
          </section>

          {/* Read-Only Inventory Link Card */}
          <div className="rounded-2xl border border-amber/30 bg-amber/5 p-6 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber/10 text-amber">
                <Boxes className="h-4 w-4" />
              </div>
              <h3 className="font-serif text-base font-semibold text-foreground">
                {isVi ? "Quản lý kho tập trung" : "Centralized Inventory"}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {isVi
                ? "Theo kiến trúc của Solenne, số lượng tồn kho của các phiên bản hiện có được cập nhật độc quyền tại trang Quản lý kho với đầy đủ lý do kiểm kê."
                : "Under the Solenne architecture, stock levels for existing variants are exclusively adjusted through the Inventory Management workspace with mandatory audit reasons."}
            </p>
            <div className="pt-1">
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link
                  href="/admin/inventory"
                  className="inline-flex items-center justify-center gap-2 text-xs text-amber"
                >
                  <Boxes className="h-3.5 w-3.5" />
                  <span>
                    {isVi ? "Mở Không gian Quản lý kho" : "Open Inventory Workspace"}
                  </span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
