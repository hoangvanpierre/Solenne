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
import { ADMIN_SEARCH_MAX_LENGTH } from "@/lib/search-utils";
import { RestrictedAccountNotice } from "@/components/account";
import { Button } from "@/components/ui";
import {
  AdminBreadcrumb,
  AdminPageHeader,
  AdminStatePanel,
  ProductTable,
} from "@/components/admin";
import type { Product } from "@/types";

export const metadata: Metadata = {
  title: "Products — Administration",
};

interface AdminProductsPageProps {
  searchParams: Promise<{
    q?: string;
    /** Legacy alias, still honoured for existing bookmarks. */
    search?: string;
  }>;
}

export default async function AdminProductsPage({
  searchParams,
}: AdminProductsPageProps) {
  const locale = await getLocale();
  const isVi = locale === "vi";
  const rawParams = await searchParams;
  const rawSearch = rawParams.q ?? rawParams.search;
  const initialSearch = (typeof rawSearch === "string" ? rawSearch : "")
    .trim()
    .slice(0, ADMIN_SEARCH_MAX_LENGTH);

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
        <div className="mx-auto max-w-2xl">
          <AdminStatePanel
            title={isVi ? "Khu vực không khả dụng" : "Area unavailable"}
            description={
              isVi
                ? "Không có quyền xem sản phẩm."
                : "You don't have permission to view products."
            }
            icon={ShieldAlert}
            actions={
              <Button asChild variant="outline" className="font-normal text-xs">
                <Link href="/admin" className="inline-flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {isVi ? "Về Trung tâm quản trị" : "Return to Admin Hub"}
                  </span>
                </Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="space-y-6 py-8">
        <AdminBreadcrumb label={isVi ? "Trung tâm quản trị" : "Admin Hub"} />

        <AdminStatePanel
          tone="danger"
          title={isVi ? "Không thể tải sản phẩm" : "Unable to load products"}
          description={
            isVi
              ? "Không thể tải danh sách sản phẩm lúc này. Vui lòng làm mới trang hoặc thử lại sau."
              : "Unable to load products at this time. Please refresh the page or try again later."
          }
          icon={ShieldAlert}
          actions={
            <Button asChild variant="outline" className="font-normal text-xs">
              <Link href="/admin/products">
                {isVi ? "Thử lại" : "Try again"}
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4">
      <AdminBreadcrumb label={isVi ? "Trung tâm quản trị" : "Admin Hub"} />

      <AdminPageHeader
        eyebrow={
          <div className="inline-flex items-center gap-2 rounded-full border border-amber/30 bg-amber/10 px-3 py-1 text-xs uppercase tracking-[0.08em] text-foreground">
            <Layers className="h-3.5 w-3.5 text-amber-dark" aria-hidden="true" />
            <span>{isVi ? "Danh mục sản phẩm" : "Product catalog"}</span>
          </div>
        }
        title={isVi ? "Quản lý sản phẩm" : "Products"}
        description={
          isVi
            ? "Theo dõi toàn bộ danh mục nến thơm, trạng thái hiển thị, nhóm hương và cơ cấu phiên bản."
            : "Monitor all candle creations, publication statuses, scent families, and variant structures."
        }
        meta={
          <span className="inline-flex rounded-full border border-border bg-muted/40 px-3 py-0.5 text-xs font-normal tabular-nums text-muted-foreground">
            {products.length}{" "}
            {isVi
              ? "sản phẩm"
              : products.length === 1
                ? "product"
                : "products"}
          </span>
        }
        actions={
          canCreateProduct ? (
            <Button
              asChild
              size="sm"
              className="inline-flex items-center gap-1.5 bg-amber text-primary-foreground hover:bg-amber/90 font-normal text-xs"
            >
              <Link href="/admin/products/new">
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>{isVi ? "Thêm sản phẩm" : "Add product"}</span>
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* Interactive Product Table with Search, Filtering, and Sorting */}
      <ProductTable
        products={products}
        locale={locale}
        initialSearch={initialSearch}
      />
    </div>
  );
}
