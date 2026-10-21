import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { ArrowLeft, ArrowRight, Package, ShieldAlert } from "lucide-react";
import { AuthError, requirePermission } from "@/lib/authz";
import {
  isRestrictedAuthError,
  isUnauthenticatedAuthError,
} from "@/lib/authz-ux";
import { getAdminOrderList, normalizeOrderStatusFilter } from "@/lib/orders";
import { formatPrice } from "@/lib/utils";
import { OrderStatusBadge, RestrictedAccountNotice } from "@/components/account";
import {
  AdminBreadcrumb,
  AdminPageHeader,
  AdminPagination,
  AdminStatePanel,
  AdminTableFrame,
  OrderFilterBar,
} from "@/components/admin";
import { Button } from "@/components/ui";
import type { AdminOrderQueryResult } from "@/types";

export const metadata: Metadata = {
  title: "Orders — Administration",
};

interface AdminOrdersPageProps {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    status?: string;
    search?: string;
  }>;
}

const EMPTY_RESULT: AdminOrderQueryResult = {
  orders: [],
  totalCount: 0,
  page: 1,
  limit: 20,
  hasMore: false,
};

export default async function AdminOrdersPage({
  searchParams,
}: AdminOrdersPageProps) {
  const locale = await getLocale();
  const isVi = locale === "vi";

  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search.trim() : "";
  const status = normalizeOrderStatusFilter(params.status) ?? "all";

  let result: AdminOrderQueryResult = EMPTY_RESULT;
  let accountRestricted = false;
  let forbiddenAccess = false;
  let loadFailed = false;

  try {
    // Explicit server-side permission enforcement.
    // Never rely solely on the layout boundary; getAdminOrderList re-checks
    // order.read before it reads anything.
    await requirePermission("order.read");

    result = await getAdminOrderList({
      page: params.page,
      limit: params.limit,
      status,
      search,
    });
  } catch (error) {
    if (isUnauthenticatedAuthError(error)) {
      redirect("/login");
    }

    if (isRestrictedAuthError(error)) {
      accountRestricted = true;
    } else if (error instanceof AuthError) {
      // 403 Forbidden: active actor lacking order.read
      forbiddenAccess = true;
    } else {
      console.error("AdminOrdersPage: Failed to load orders:", error);
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
        <AdminStatePanel
          title={isVi ? "Khu vực không khả dụng" : "Area unavailable"}
          description={
            isVi
              ? "Quý khách không có quyền truy cập vào danh sách đơn hàng quản trị."
              : "You do not have permission to view the management order list."
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
    );
  }

  if (loadFailed) {
    return (
      <div className="space-y-6 py-8">
        <AdminBreadcrumb
          label={isVi ? "Trung tâm quản trị" : "Admin Hub"}
        />

        <AdminStatePanel
          tone="danger"
          title={isVi ? "Không thể tải đơn hàng" : "Unable to load orders"}
          description={
            isVi
              ? "Không thể tải danh sách đơn hàng lúc này. Vui lòng làm mới trang hoặc thử lại sau."
              : "Unable to load orders at this time. Please refresh the page or try again later."
          }
          icon={ShieldAlert}
          actions={
            <Button asChild variant="outline" className="font-normal text-xs">
              <Link href="/admin/orders">
                {isVi ? "Thử lại" : "Try again"}
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const { orders, totalCount, page, limit, hasMore } = result;
  const hasActiveFilters = search !== "" || status !== "all";
  const requestedPageIsEmpty = orders.length === 0 && page > 1;

  return (
    <div className="space-y-6 py-4">
      <AdminBreadcrumb label={isVi ? "Trung tâm quản trị" : "Admin Hub"} />

      <AdminPageHeader
        title={isVi ? "Quản lý đơn hàng" : "Orders"}
        description={
          isVi
            ? "Danh sách đơn hàng toàn hệ thống, mới nhất trước. Tìm theo mã đơn, ID hoặc email khách hàng."
            : "System-wide order records, newest first. Search by order number, ID, or customer email."
        }
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border bg-muted/40 px-3 py-0.5 text-xs font-normal tabular-nums text-muted-foreground">
              {totalCount}{" "}
              {isVi ? "đơn hàng" : totalCount === 1 ? "order" : "orders"}
            </span>
            {hasActiveFilters && (
              <span className="rounded-full border border-amber/40 bg-amber/10 px-3 py-0.5 text-xs font-normal text-amber">
                {isVi ? "Đang lọc" : "Filtered"}
              </span>
            )}
          </div>
        }
      />

      <OrderFilterBar
        initialSearch={search}
        initialStatus={status}
        locale={locale}
      />

      {totalCount === 0 ? (
        <AdminStatePanel
          icon={Package}
          title={
            hasActiveFilters
              ? isVi
                ? "Không có đơn hàng phù hợp"
                : "No matching orders"
              : isVi
                ? "Chưa có đơn hàng nào"
                : "No orders found"
          }
          description={
            hasActiveFilters
              ? isVi
                ? "Không có đơn hàng nào khớp với từ khóa tìm kiếm hoặc trạng thái hiện tại."
                : "No orders match the current search term or status filter."
              : isVi
                ? "Khi có đơn hàng mới phát sinh, thông tin sẽ hiển thị tại đây."
                : "When new orders are placed, they will appear here."
          }
          actions={
            hasActiveFilters ? (
              <Button asChild variant="outline" className="font-normal text-xs">
                <Link href="/admin/orders">
                  {isVi ? "Xóa bộ lọc" : "Clear filters"}
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : requestedPageIsEmpty ? (
        <AdminStatePanel
          icon={Package}
          title={
            isVi ? "Trang này không có đơn hàng" : "This page has no orders"
          }
          description={
            isVi
              ? `Trang ${page} nằm ngoài phạm vi ${totalCount} đơn hàng hiện có.`
              : `Page ${page} is beyond the ${totalCount} orders that currently match.`
          }
          actions={
            <Button asChild variant="outline" className="font-normal text-xs">
              <Link
                href={
                  hasActiveFilters
                    ? `/admin/orders?${new URLSearchParams({
                        ...(search ? { search } : {}),
                        ...(status !== "all" ? { status } : {}),
                      }).toString()}`
                    : "/admin/orders"
                }
              >
                {isVi ? "Về trang đầu" : "Back to first page"}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {/* Desktop table view — the seven columns only fit once the fixed
              sidebar has been accounted for, so the card list covers the rest. */}
          <div className="hidden xl:block">
            <AdminTableFrame
              caption={isVi ? "Danh sách đơn hàng" : "Order list"}
              head={
                <>
                  <th scope="col" className="py-3.5 px-6 font-normal">
                    {isVi ? "Đơn hàng" : "Order"}
                  </th>
                  <th scope="col" className="py-3.5 px-6 font-normal">
                    {isVi ? "Ngày đặt" : "Date"}
                  </th>
                  <th scope="col" className="py-3.5 px-6 font-normal">
                    {isVi ? "Khách hàng" : "Customer"}
                  </th>
                  <th scope="col" className="py-3.5 px-6 font-normal">
                    {isVi ? "Tác phẩm" : "Items"}
                  </th>
                  <th scope="col" className="py-3.5 px-6 font-normal">
                    {isVi ? "Trạng thái" : "Status"}
                  </th>
                  <th scope="col" className="py-3.5 px-6 text-right font-normal">
                    {isVi ? "Tổng tiền" : "Total"}
                  </th>
                  <th scope="col" className="py-3.5 px-6 text-right font-normal">
                    {isVi ? "Thao tác" : "Actions"}
                  </th>
                </>
              }
            >
              <tbody className="divide-y divide-border">
                {orders.map((order) => {
                  const itemCount = order.items.reduce(
                    (sum, i) => sum + i.quantity,
                    0
                  );
                  const itemsSummary = order.items
                    .map((i) =>
                      i.variantName
                        ? `${i.productName} (${i.variantName}) ×${i.quantity}`
                        : `${i.productName} ×${i.quantity}`
                    )
                    .join(", ");

                  const customerName =
                    order.shippingAddress?.fullName?.trim() ||
                    (isVi ? "Khách vãng lai" : "Guest / Unknown");

                  const customerDetail =
                    order.shippingAddress?.email?.trim() ||
                    (order.userId ? `ID: ${order.userId.slice(0, 8)}…` : null);

                  return (
                    <tr
                      key={order.id}
                      className="transition-colors hover:bg-muted/30"
                    >
                      <td className="py-4 px-6 tabular-nums text-xs font-normal text-foreground whitespace-nowrap">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="inline-flex items-center rounded underline-offset-4 hover:text-amber hover:underline focus-visible:outline-none"
                          title={
                            isVi
                              ? `Quản lý đơn hàng ${order.orderNumber}`
                              : `Manage order ${order.orderNumber}`
                          }
                          aria-label={
                            isVi
                              ? `Quản lý đơn hàng ${order.orderNumber}`
                              : `Manage order ${order.orderNumber}`
                          }
                        >
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="py-4 px-6 text-xs text-muted-foreground whitespace-nowrap tabular-nums font-normal">
                        {new Date(order.createdAt).toLocaleDateString(
                          isVi ? "vi-VN" : "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          }
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <div className="font-normal text-foreground">
                          {customerName}
                        </div>
                        {customerDetail && (
                          <div className="text-xs text-muted-foreground truncate max-w-xs tabular-nums font-normal">
                            {customerDetail}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <div className="text-xs font-normal tabular-nums text-foreground">
                          {itemCount}{" "}
                          {isVi
                            ? "tác phẩm"
                            : itemCount === 1
                              ? "item"
                              : "items"}
                        </div>
                        {itemsSummary && (
                          <div
                            className="text-xs text-muted-foreground truncate max-w-xs font-normal"
                            title={itemsSummary}
                          >
                            {itemsSummary}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-6 whitespace-nowrap">
                        <OrderStatusBadge
                          status={order.status}
                          locale={locale}
                        />
                      </td>
                      <td className="py-4 px-6 text-right font-normal tabular-nums text-foreground whitespace-nowrap">
                        {formatPrice(order.total)}
                      </td>
                      <td className="py-4 px-6 text-right whitespace-nowrap">
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="inline-flex items-center gap-1.5 text-xs font-normal"
                        >
                          <Link href={`/admin/orders/${order.id}`}>
                            <span>{isVi ? "Quản lý" : "Manage"}</span>
                            <ArrowRight className="h-3 w-3" aria-hidden="true" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </AdminTableFrame>
          </div>

          {/* Mobile & tablet card view */}
          <div className="xl:hidden space-y-3">
            {orders.map((order) => {
              const itemCount = order.items.reduce(
                (sum, i) => sum + i.quantity,
                0
              );
              const customerName =
                order.shippingAddress?.fullName?.trim() ||
                (isVi ? "Khách vãng lai" : "Guest / Unknown");

              const customerDetail =
                order.shippingAddress?.email?.trim() ||
                (order.userId ? `ID: ${order.userId.slice(0, 8)}…` : null);

              return (
                <div
                  key={order.id}
                  className="rounded-2xl border border-border bg-card p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="tabular-nums text-xs font-normal text-foreground hover:text-amber hover:underline underline-offset-4 focus-visible:outline-none rounded"
                      title={
                        isVi
                          ? `Quản lý đơn hàng ${order.orderNumber}`
                          : `Manage order ${order.orderNumber}`
                      }
                      aria-label={
                        isVi
                          ? `Quản lý đơn hàng ${order.orderNumber}`
                          : `Manage order ${order.orderNumber}`
                      }
                    >
                      {order.orderNumber}
                    </Link>
                    <OrderStatusBadge
                      status={order.status}
                      locale={locale}
                    />
                  </div>

                  <div className="border-t border-border/60 pt-2 text-xs space-y-1">
                    <div className="font-normal text-foreground">
                      {customerName}
                    </div>
                    {customerDetail && (
                      <div className="text-muted-foreground truncate tabular-nums font-normal">
                        {customerDetail}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-border/60 pt-2.5">
                    <div>
                      <div className="text-xs text-muted-foreground tabular-nums font-normal">
                        {itemCount}{" "}
                        {isVi
                          ? "tác phẩm"
                          : itemCount === 1
                            ? "item"
                            : "items"}{" "}
                        ·{" "}
                        {new Date(order.createdAt).toLocaleDateString(
                          isVi ? "vi-VN" : "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          }
                        )}
                      </div>
                      <div className="font-normal tabular-nums text-foreground text-sm">
                        {formatPrice(order.total)}
                      </div>
                    </div>
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="inline-flex items-center gap-1.5 text-xs font-normal h-8"
                    >
                      <Link href={`/admin/orders/${order.id}`}>
                        <span>{isVi ? "Quản lý" : "Manage"}</span>
                        <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <AdminPagination
            page={page}
            limit={limit}
            totalCount={totalCount}
            hasMore={hasMore}
            locale={locale}
            itemLabelEn="orders"
            itemLabelVi="đơn hàng"
          />
        </div>
      )}
    </div>
  );
}
