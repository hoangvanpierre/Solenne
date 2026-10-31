import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { ArrowLeft, ShieldAlert, Users } from "lucide-react";
import { AuthError, requirePermission } from "@/lib/authz";
import {
  isRestrictedAuthError,
  isUnauthenticatedAuthError,
} from "@/lib/authz-ux";
import { getAdminCustomers } from "@/lib/admin-customers";
import { AdminBreadcrumb, AdminPageHeader, AdminStatePanel, AdminSearchProvider, CustomerTable } from "@/components/admin";
import { RestrictedAccountNotice } from "@/components/account";
import { Button } from "@/components/ui";
import type { CustomerQueryResult } from "@/types";

export const metadata: Metadata = {
  title: "Customers — Administration",
};

interface AdminCustomersPageProps {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    q?: string;
    /** Legacy alias, still honoured for existing bookmarks. */
    search?: string;
    status?: string;
  }>;
}

export default async function AdminCustomersPage({
  searchParams,
}: AdminCustomersPageProps) {
  const locale = await getLocale();
  const isVi = locale === "vi";

  let accountRestricted = false;
  let forbiddenAccess = false;
  let loadFailed = false;

  let queryResult: CustomerQueryResult = {
    customers: [],
    totalCount: 0,
    page: 1,
    limit: 25,
    hasMore: false,
  };

  let canReadOrders = false;

  const rawParams = await searchParams;
  const page = rawParams.page ? parseInt(rawParams.page, 10) : 1;
  const limit = rawParams.limit ? parseInt(rawParams.limit, 10) : 25;
  const rawSearch = rawParams.q ?? rawParams.search;
  const search = typeof rawSearch === "string" ? rawSearch : undefined;
  const status = rawParams.status;

  try {
    // 1. Explicit server-side permission check before querying any data
    const actor = await requirePermission("customer.read");

    // 2. Check if actor holds order.read to conditionally enable order navigation
    canReadOrders = actor.permissions.includes("order.read");

    // 3. Fetch bounded customer directory with validated parameters
    queryResult = await getAdminCustomers({
      page: Number.isNaN(page) ? 1 : page,
      limit: Number.isNaN(limit) ? 25 : limit,
      search,
      status,
    });
  } catch (error) {
    if (isUnauthenticatedAuthError(error)) {
      redirect("/login?next=/admin/customers");
    }

    if (isRestrictedAuthError(error)) {
      accountRestricted = true;
    } else if (error instanceof AuthError) {
      forbiddenAccess = true;
    } else {
      console.error("AdminCustomersPage: Failed to load customer directory:", error);
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
                ? "Không có quyền xem danh bạ khách hàng."
                : "You don't have permission to view the customer directory."
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
      <div className="py-8">
        <div className="mx-auto max-w-2xl">
          <AdminStatePanel
            tone="danger"
            title={
              isVi ? "Không thể tải dữ liệu" : "Unable to load customer directory"
            }
            description={
              isVi
                ? "Đã xảy ra lỗi khi truy vấn danh sách khách hàng. Vui lòng thử lại sau."
                : "An unexpected error occurred while loading customer records. Please try again later."
            }
            icon={ShieldAlert}
            actions={
              <Button asChild variant="outline" size="sm" className="font-normal text-xs">
                <Link href="/admin/customers" className="inline-flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span>{isVi ? "Thử lại" : "Try again"}</span>
                </Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4">
      <AdminBreadcrumb label={isVi ? "Trung tâm quản trị" : "Admin Hub"} />

      <AdminPageHeader
        eyebrow={
          <div className="inline-flex items-center gap-2 rounded-full border border-amber/30 bg-amber/10 px-3 py-1 text-xs uppercase tracking-[0.08em] text-foreground">
            <Users className="h-3.5 w-3.5 text-amber-dark" aria-hidden="true" />
            <span>{isVi ? "Danh bạ khách hàng" : "Customer directory"}</span>
          </div>
        }
        title={isVi ? "Quản lý khách hàng" : "Customers"}
        description={
          isVi
            ? "Theo dõi hồ sơ thành viên, trạng thái tài khoản và tổng quan lịch sử mua hàng."
            : "Monitor member profiles, account status, and purchase overview."
        }
        meta={
          <span className="inline-flex rounded-full border border-border bg-muted/40 px-3 py-0.5 text-xs font-normal tabular-nums text-muted-foreground">
            {queryResult.totalCount}{" "}
            {isVi
              ? "khách hàng"
              : queryResult.totalCount === 1
                ? "customer"
                : "customers"}
          </span>
        }
      />

      {/* Interactive Customer directory */}
      <AdminSearchProvider initialValue={search} minLength={2}>
        <CustomerTable
          customers={queryResult.customers}
          totalCount={queryResult.totalCount}
          page={queryResult.page}
          limit={queryResult.limit}
          hasMore={queryResult.hasMore}
          canReadOrders={canReadOrders}
          locale={locale}
          initialFilters={{
            search,
            status,
          }}
        />
      </AdminSearchProvider>
    </div>
  );
}
