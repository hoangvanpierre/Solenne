import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { ArrowLeft, Layers, Plus, ShieldAlert } from "lucide-react";
import { AuthError, requireAnyPermission } from "@/lib/authz";
import {
  isRestrictedAuthError,
  isUnauthenticatedAuthError,
} from "@/lib/authz-ux";
import { getAdminProducts } from "@/lib/admin-products";
import { RestrictedAccountNotice } from "@/components/account";
import { Button } from "@/components/ui";
import { ProductTable } from "@/components/admin";
import type { Product } from "@/types";

export const metadata: Metadata = {
  title: "Products — Administration",
};

export default async function AdminProductsPage() {
  const locale = await getLocale();
  const isVi = locale === "vi";

  let products: Product[] = [];
  let canCreateProduct = false;
  let accountRestricted = false;
  let forbiddenAccess = false;
  let loadFailed = false;

  try {
    // Explicit server-side permission enforcement.
    // Management boundary: Customer also has product.read, so admin product management
    // requires holding at least one product management permission.
    const actor = await requireAnyPermission([
      "product.create",
      "product.update",
      "product.delete",
    ]);

    canCreateProduct = actor.permissions.includes("product.create");
    products = await getAdminProducts();
  } catch (error) {
    if (isUnauthenticatedAuthError(error)) {
      redirect("/login?next=/admin/products");
    }

    if (isRestrictedAuthError(error)) {
      accountRestricted = true;
    } else if (error instanceof AuthError) {
      // 403 Forbidden: active actor lacking product management permissions
      forbiddenAccess = true;
    } else {
      console.error("AdminProductsPage: Failed to load products:", error);
      loadFailed = true;
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
        <div className="mx-auto max-w-2xl rounded-2xl border border-border p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber/10">
            <ShieldAlert className="h-6 w-6 text-amber" />
          </div>

          <h2 className="mt-5 text-2xl font-normal text-foreground">
            {isVi ? "Khu vực không khả dụng" : "Area unavailable"}
          </h2>

          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground font-normal">
            {isVi
              ? "Quý khách không có quyền truy cập vào danh mục quản trị sản phẩm."
              : "You do not have permission to view the administrative product catalog."}
          </p>

          <div className="mt-7 flex justify-center">
            <Button asChild variant="outline" className="font-normal text-xs">
              <Link href="/admin" className="inline-flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                <span>
                  {isVi ? "Về Trung tâm quản trị" : "Return to Admin Hub"}
                </span>
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="py-8 space-y-6">
        <nav aria-label="Breadcrumb">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground font-normal"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{isVi ? "Trung tâm quản trị" : "Admin Hub"}</span>
          </Link>
        </nav>

        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
          <p className="text-sm font-normal text-destructive">
            {isVi
              ? "Không thể tải danh sách sản phẩm lúc này. Vui lòng làm mới trang hoặc thử lại sau."
              : "Unable to load products at this time. Please refresh the page or try again later."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 py-4">
      {/* Header */}
      <header className="space-y-4">
        <nav aria-label="Breadcrumb">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground font-normal"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{isVi ? "Trung tâm quản trị" : "Admin Hub"}</span>
          </Link>
        </nav>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber/10 text-amber">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-normal leading-[1.22] text-foreground">
                  {isVi ? "Quản lý sản phẩm" : "Products"}
                </h1>
                <span className="rounded-full border border-border bg-muted/40 px-3 py-0.5 text-xs font-normal tabular-nums text-muted-foreground">
                  {products.length}{" "}
                  {isVi
                    ? "sản phẩm"
                    : products.length === 1
                      ? "product"
                      : "products"}
                </span>
              </div>
            </div>
          </div>

          {canCreateProduct && (
            <Button
              asChild
              size="sm"
              className="inline-flex items-center gap-1.5 self-start sm:self-auto bg-amber text-primary-foreground hover:bg-amber/90 font-normal text-xs"
            >
              <Link href="/admin/products/new">
                <Plus className="h-4 w-4" />
                <span>{isVi ? "Thêm sản phẩm" : "Add Product"}</span>
              </Link>
            </Button>
          )}
        </div>

        <p className="text-sm text-muted-foreground max-w-2xl font-normal">
          {isVi
            ? "Theo dõi toàn bộ danh mục nến thơm, trạng thái hiển thị, nhóm hương và cơ cấu phiên bản."
            : "Monitor all candle creations, publication statuses, scent families, and variant structures."}
        </p>
      </header>

      {/* Interactive Product Table with Search, Filtering, and Sorting */}
      <ProductTable products={products} locale={locale} />
    </div>
  );
}
