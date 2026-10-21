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
import {
  AdminBreadcrumb,
  AdminPageHeader,
  AdminStatePanel,
  AuditTable,
} from "@/components/admin";
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
        <div className="mx-auto max-w-2xl">
          <AdminStatePanel
            title={isVi ? "Khu vực không khả dụng" : "Area unavailable"}
            description={
              isVi
                ? "Quý khách không có quyền truy cập vào nhật ký kiểm toán quản trị."
                : "You do not have permission to view the security audit logs."
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
            title={isVi ? "Không thể tải dữ liệu" : "Unable to load audit logs"}
            description={
              isVi
                ? "Đã xảy ra lỗi khi truy vấn nhật ký kiểm toán. Vui lòng thử lại sau."
                : "An unexpected error occurred while loading audit records. Please try again later."
            }
            icon={ShieldAlert}
            actions={
              <Button asChild variant="outline" size="sm" className="font-normal text-xs">
                <Link href="/admin/audit">
                  {isVi ? "Thử lại" : "Try again"}
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
          <div className="inline-flex items-center gap-2 rounded-full border border-amber/30 bg-amber/10 px-3 py-1 text-[11px] uppercase tracking-[0.08em] text-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-amber-dark" aria-hidden="true" />
            <span>{isVi ? "Kiểm toán bảo mật" : "Security Audit"}</span>
          </div>
        }
        title={isVi ? "Nhật ký kiểm toán" : "Audit Trail"}
        description={
          isVi
            ? "Nhật ký bất biến ghi nhận mọi hoạt động quản trị, vận hành và thay đổi trạng thái trong hệ thống."
            : "Append-only audit record of administrative, operational, and system status transitions."
        }
        meta={
          <span className="inline-flex rounded-full border border-border bg-muted/40 px-3 py-0.5 text-xs font-normal tabular-nums text-muted-foreground">
            {queryResult.totalCount}{" "}
            {isVi
              ? "bản ghi"
              : queryResult.totalCount === 1
                ? "record"
                : "records"}
          </span>
        }
      />

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
