import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { ArrowLeft, PlusCircle, ShieldAlert } from "lucide-react";
import { AuthError, requirePermission } from "@/lib/authz";
import {
  isRestrictedAuthError,
  isUnauthenticatedAuthError,
} from "@/lib/authz-ux";
import { RestrictedAccountNotice } from "@/components/account";
import { Button } from "@/components/ui";
import { ProductForm } from "@/components/admin";

export const metadata: Metadata = {
  title: "New Product — Administration",
};

export default async function AdminNewProductPage() {
  const locale = await getLocale();
  const isVi = locale === "vi";

  let accountRestricted = false;
  let forbiddenAccess = false;

  try {
    // Explicit server-side permission check:
    // Creation workspace strictly requires product.create
    await requirePermission("product.create");
  } catch (error) {
    if (isUnauthenticatedAuthError(error)) {
      redirect("/login?next=/admin/products/new");
    }

    if (isRestrictedAuthError(error)) {
      accountRestricted = true;
    } else if (error instanceof AuthError) {
      // 403 Forbidden: user has session but lacks product.create
      forbiddenAccess = true;
    } else {
      console.error("AdminNewProductPage: Auth check failed:", error);
      forbiddenAccess = true;
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
            {isVi ? "Khu vực không khả dụng" : "Creation Restricted"}
          </h2>

          <p className="mx-auto max-w-lg text-sm leading-relaxed text-muted-foreground">
            {isVi
              ? "Quý khách không có quyền tạo sản phẩm mới trong hệ thống quản trị."
              : "You do not hold administrative permission to create new products."}
          </p>

          <div className="pt-4 flex justify-center gap-3">
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

  return (
    <div className="space-y-8 py-4 max-w-5xl mx-auto">
      {/* Header & Breadcrumb */}
      <header className="space-y-4">
        <nav aria-label="Breadcrumb">
          <ol className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <li>
              <Link
                href="/admin"
                className="transition-colors hover:text-foreground"
              >
                {isVi ? "Trung tâm quản trị" : "Admin Hub"}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                href="/admin/products"
                className="transition-colors hover:text-foreground"
              >
                {isVi ? "Sản phẩm" : "Products"}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-foreground font-semibold">
              {isVi ? "Thêm mới" : "New Creation"}
            </li>
          </ol>
        </nav>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber/10 text-amber">
              <PlusCircle className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-serif text-3xl md:text-4xl font-semibold text-foreground">
                {isVi ? "Tạo sản phẩm mới" : "Create New Product"}
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                {isVi
                  ? "Định hình sáng tạo nến thơm, cấu trúc hương thơm và quy cách phiên bản mở bán ban đầu."
                  : "Craft a new luxury candle creation, olfactory narrative, and initial variants."}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Product Creation Workspace */}
      <ProductForm mode="create" locale={locale} />
    </div>
  );
}
