import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { ArrowLeft, ShieldAlert, ShieldCheck } from "lucide-react";
import { AuthError, requirePermission } from "@/lib/authz";
import {
  isRestrictedAuthError,
  isUnauthenticatedAuthError,
} from "@/lib/authz-ux";
import { getAdminAuditLogs } from "@/lib/admin-audit";
import { RestrictedAccountNotice } from "@/components/account";
import { AuditTable } from "@/components/admin";
import { Button } from "@/components/ui";
import type { AuditDatePreset, AuditQueryResult } from "@/types";

export const metadata: Metadata = {
  title: "Audit Trail — Administration",
};

interface AdminAuditPageProps {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    action?: string;
    resourceType?: string;
    datePreset?: string;
  }>;
}

export default async function AdminAuditPage({ searchParams }: AdminAuditPageProps) {
  const locale = await getLocale();
  const isVi = locale === "vi";

  let accountRestricted = false;
  let forbiddenAccess = false;
  let loadFailed = false;

  let queryResult: AuditQueryResult = {
    logs: [],
    totalCount: 0,
    page: 1,
    limit: 25,
    hasMore: false,
  };

  let canReadOrders = false;
  let canManageProducts = false;

  const rawParams = await searchParams;
  const page = rawParams.page ? parseInt(rawParams.page, 10) : 1;
  const limit = rawParams.limit ? parseInt(rawParams.limit, 10) : 25;
  const action = rawParams.action;
  const resourceType = rawParams.resourceType;
  const datePreset = rawParams.datePreset as AuditDatePreset | undefined;

  try {
    // 1. Explicit server-side permission check before loading any audit data
    const actor = await requirePermission("audit.read");

    // Check underlying permissions to safely guard resource links in the table
    canReadOrders = actor.permissions.includes("order.read");
    canManageProducts = actor.permissions.some((p) =>
      ["product.read", "product.create", "product.update", "product.delete"].includes(p)
    );

    // 2. Fetch bounded audit logs with validated parameters
    queryResult = await getAdminAuditLogs({
      page: Number.isNaN(page) ? 1 : page,
      limit: Number.isNaN(limit) ? 25 : limit,
      action,
      resourceType,
      datePreset,
    });
  } catch (error) {
    if (isUnauthenticatedAuthError(error)) {
      redirect("/login");
    }

    if (isRestrictedAuthError(error)) {
      accountRestricted = true;
    } else if (error instanceof AuthError) {
      forbiddenAccess = true;
    } else {
      console.error("AdminAuditPage: Failed to load audit records:", error);
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

          <h2 className="mt-5 text-xl font-normal text-foreground">
            {isVi ? "Khu vực không khả dụng" : "Area unavailable"}
          </h2>

          <p className="mx-auto mt-3 max-w-lg text-sm font-normal leading-relaxed text-muted-foreground">
            {isVi
              ? "Quý khách không có quyền truy cập vào nhật ký kiểm toán quản trị."
              : "You do not have permission to view the security audit logs."}
          </p>

          <div className="mt-7 flex justify-center">
            <Button asChild variant="outline" size="sm" className="font-normal text-xs">
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

          <h2 className="mt-5 text-xl font-normal text-foreground">
            {isVi ? "Không thể tải dữ liệu" : "Unable to load audit logs"}
          </h2>

          <p className="mx-auto mt-3 max-w-lg text-sm font-normal leading-relaxed text-muted-foreground">
            {isVi
              ? "Đã xảy ra lỗi khi truy vấn nhật ký kiểm toán. Vui lòng thử lại sau."
              : "An unexpected error occurred while loading audit records. Please try again later."}
          </p>

          <div className="mt-7 flex justify-center">
            <Button asChild variant="outline" size="sm" className="font-normal text-xs">
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
        <nav aria-label="Breadcrumb">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-[11px] font-normal uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{isVi ? "Trung tâm quản trị" : "Admin Hub"}</span>
          </Link>
        </nav>

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber/30 bg-amber/10 text-amber text-[11px] tracking-wider uppercase font-normal mb-3">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{isVi ? "Kiểm toán bảo mật" : "Security Audit"}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-normal leading-[1.22] text-foreground">
              {isVi ? "Nhật ký kiểm toán" : "Audit Trail"}
            </h1>
            <p className="mt-1 text-sm font-normal text-muted-foreground">
              {isVi
                ? "Nhật ký bất biến ghi nhận mọi hoạt động quản trị, vận hành và thay đổi trạng thái trong hệ thống."
                : "Append-only audit record of administrative, operational, and system status transitions."}
            </p>
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <AuditTable
        logs={queryResult.logs}
        totalCount={queryResult.totalCount}
        page={queryResult.page}
        limit={queryResult.limit}
        hasMore={queryResult.hasMore}
        canReadOrders={canReadOrders}
        canManageProducts={canManageProducts}
        locale={locale}
        initialFilters={{
          action,
          resourceType,
          datePreset,
        }}
      />
    </div>
  );
}
