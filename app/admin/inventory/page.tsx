import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { ArrowLeft, Boxes, ShieldAlert } from "lucide-react";
import { AuthError, requirePermission } from "@/lib/authz";
import {
  isRestrictedAuthError,
  isUnauthenticatedAuthError,
} from "@/lib/authz-ux";
import { AdminInventoryItem, getAdminInventory } from "@/lib/inventory";
import { ADMIN_SEARCH_MAX_LENGTH } from "@/lib/search-utils";
import { RestrictedAccountNotice } from "@/components/account";
import { Button } from "@/components/ui";
import {
  AdminBreadcrumb,
  AdminPageHeader,
  AdminStatePanel,
  InventoryTable,
} from "@/components/admin";

export const metadata: Metadata = {
  title: "Inventory — Administration",
};

interface AdminInventoryPageProps {
  searchParams: Promise<{
    q?: string;
    /** Legacy alias, still honoured for existing bookmarks. */
    search?: string;
  }>;
}

export default async function AdminInventoryPage({
  searchParams,
}: AdminInventoryPageProps) {
  const locale = await getLocale();
  const isVi = locale === "vi";
  const rawParams = await searchParams;
  const rawSearch = rawParams.q ?? rawParams.search;
  const initialSearch = (typeof rawSearch === "string" ? rawSearch : "")
    .trim()
    .slice(0, ADMIN_SEARCH_MAX_LENGTH);

  let items: AdminInventoryItem[] = [];
  let accountRestricted = false;
  let forbiddenAccess = false;
  let loadFailed = false;

  try {
    // Explicit server-side permission enforcement.
    // Never rely solely on the layout boundary.
    await requirePermission("inventory.read");
    items = await getAdminInventory();
  } catch (error) {
    if (isUnauthenticatedAuthError(error)) {
      redirect("/login");
    }

    if (isRestrictedAuthError(error)) {
      accountRestricted = true;
    } else if (error instanceof AuthError) {
      // 403 Forbidden: active actor lacking inventory.read
      forbiddenAccess = true;
    } else {
      console.error("AdminInventoryPage: Failed to load inventory:", error);
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
                ? "Quý khách không có quyền truy cập vào danh mục quản trị tồn kho."
                : "You do not have permission to view the administrative inventory."
            }
            icon={ShieldAlert}
            actions={
              <Button asChild variant="outline" size="sm" className="font-normal text-xs">
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
          title={isVi ? "Không thể tải tồn kho" : "Unable to load inventory"}
          description={
            isVi
              ? "Không thể tải danh sách tồn kho lúc này. Vui lòng làm mới trang hoặc thử lại sau."
              : "Unable to load inventory at this time. Please refresh the page or try again later."
          }
          icon={ShieldAlert}
          actions={
            <Button asChild variant="outline" size="sm" className="font-normal text-xs">
              <Link href="/admin/inventory">
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
            <Boxes className="h-3.5 w-3.5 text-amber-dark" aria-hidden="true" />
            <span>{isVi ? "Tồn kho phiên bản" : "Variant Stock"}</span>
          </div>
        }
        title={isVi ? "Quản lý tồn kho" : "Inventory"}
        description={
          isVi
            ? "Theo dõi số lượng tồn kho từng phiên bản sản phẩm và thực hiện điều chỉnh kho an toàn."
            : "Monitor variant-level stock quantities and execute atomic inventory adjustments."
        }
        meta={
          <span className="inline-flex rounded-full border border-border bg-muted/40 px-3 py-0.5 text-xs font-normal tabular-nums text-muted-foreground">
            {items.length}{" "}
            {isVi
              ? "phiên bản"
              : items.length === 1
                ? "variant"
                : "variants"}
          </span>
        }
      />

      {/* Interactive Inventory Table with KPIs, Filtering, and Adjust Controls */}
      <InventoryTable
        items={items}
        locale={locale}
        initialSearch={initialSearch}
      />
    </div>
  );
}
