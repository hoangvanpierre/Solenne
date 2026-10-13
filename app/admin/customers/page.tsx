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
import { CustomerTable } from "@/components/admin";
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
  const search = rawParams.search;
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
        <div className="mx-auto max-w-2xl rounded-2xl border border-border p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber/10">
            <ShieldAlert className="h-6 w-6 text-amber" />
          </div>

          <h2 className="mt-5 font-serif text-2xl font-medium text-foreground">
            {isVi ? "Khu vực không khả dụng" : "Area unavailable"}
          </h2>

          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
            {isVi
              ? "Quý khách không có quyền truy cập vào danh bạ khách hàng quản trị."
              : "You do not have permission to view the management customer directory."}
          </p>

          <div className="mt-7 flex justify-center">
            <Button asChild variant="outline">
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
      <div className="py-8">
        <div className="mx-auto max-w-2xl rounded-2xl border border-border p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <ShieldAlert className="h-6 w-6 text-destructive" />
          </div>

          <h2 className="mt-5 font-serif text-2xl font-medium text-foreground">
            {isVi ? "Không thể tải dữ liệu" : "Unable to load customer directory"}
          </h2>

          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
            {isVi
              ? "Đã xảy ra lỗi khi truy vấn danh sách khách hàng. Vui lòng thử lại sau."
              : "An unexpected error occurred while loading customer records. Please try again later."}
          </p>

          <div className="mt-7 flex justify-center">
            <Button asChild variant="outline">
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

  return (
    <div className="py-8 lg:py-12 space-y-8">
      {/* Header and Back Link */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
            <Link href="/admin" className="inline-flex items-center gap-1.5 text-xs">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{isVi ? "Trung tâm quản trị" : "Admin Hub"}</span>
            </Link>
          </Button>
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber/30 bg-amber/10 text-amber text-xs tracking-wider uppercase font-medium mb-3">
              <Users className="w-3.5 h-3.5" />
              <span>{isVi ? "Danh bạ khách hàng" : "Customer Directory"}</span>
            </div>
            <h1 className="font-serif text-3xl md:text-4xl font-semibold text-foreground">
              {isVi ? "Quản lý khách hàng" : "Customers"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isVi
                ? "Theo dõi hồ sơ thành viên, trạng thái tài khoản và tổng quan lịch sử mua hàng."
                : "Monitor member profiles, account status, and purchase overview."}
            </p>
          </div>
        </div>
      </div>

      {/* Interactive Customer Directory */}
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
    </div>
  );
}
