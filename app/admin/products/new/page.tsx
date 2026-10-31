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
import {
  AdminBreadcrumb,
  AdminPageHeader,
  AdminStatePanel,
  ProductForm,
} from "@/components/admin";

export const metadata: Metadata = {
  title: "New product — Administration",
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
        <div className="mx-auto max-w-2xl">
          <AdminStatePanel
            title={isVi ? "Khu vực không khả dụng" : "Creation restricted"}
            description={
              isVi
                ? "Không có quyền tạo sản phẩm."
                : "You do not hold administrative permission to create new products."
            }
            icon={ShieldAlert}
            actions={
              <Button asChild variant="outline" className="font-normal text-xs">
                <Link
                  href="/admin/products"
                  className="inline-flex items-center gap-2"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {isVi ? "Về Danh mục sản phẩm" : "Return to Products"}
                  </span>
                </Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-4">
      <AdminBreadcrumb
        href="/admin/products"
        label={isVi ? "Danh mục sản phẩm" : "Products"}
      />

      <AdminPageHeader
        eyebrow={
          <div className="inline-flex items-center gap-2 rounded-full border border-amber/30 bg-amber/10 px-3 py-1 text-xs uppercase tracking-[0.08em] text-foreground">
            <PlusCircle className="h-3.5 w-3.5 text-amber-dark" aria-hidden="true" />
            <span>{isVi ? "Sản phẩm mới" : "New product"}</span>
          </div>
        }
        title={isVi ? "Tạo sản phẩm" : "Create product"}
        description={
          isVi
            ? "Định hình sáng tạo nến thơm, cấu trúc hương thơm và quy cách phiên bản mở bán ban đầu."
            : "Craft a new luxury candle creation, olfactory narrative, and initial variants."
        }
      />

      {/* Product Creation Workspace */}
      <ProductForm mode="create" locale={locale} />
    </div>
  );
}
