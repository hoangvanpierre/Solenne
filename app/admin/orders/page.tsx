import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { ArrowLeft, Package, ShieldAlert } from "lucide-react";
import { AuthError, requirePermission } from "@/lib/authz";
import {
  isRestrictedAuthError,
  isUnauthenticatedAuthError,
} from "@/lib/authz-ux";
import { countAdminOrders, getAdminOrders } from "@/lib/orders";
import { formatPrice } from "@/lib/utils";
import { OrderStatusBadge, RestrictedAccountNotice } from "@/components/account";
import { Button } from "@/components/ui";
import type { Order } from "@/types";

export const metadata: Metadata = {
  title: "Orders — Administration",
};

const ORDERS_PAGE_LIMIT = 50;

export default async function AdminOrdersPage() {
  const locale = await getLocale();
  const isVi = locale === "vi";

  let orders: Order[] = [];
  let totalCount = 0;
  let accountRestricted = false;
  let forbiddenAccess = false;
  let loadFailed = false;

  try {
    // Explicit server-side permission enforcement.
    // Never rely solely on the layout boundary.
    await requirePermission("order.read");

    [orders, totalCount] = await Promise.all([
      getAdminOrders(ORDERS_PAGE_LIMIT),
      countAdminOrders(),
    ]);
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
        <div className="mx-auto max-w-2xl rounded-2xl border border-border p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber/10">
            <ShieldAlert className="h-6 w-6 text-amber" />
          </div>

          <h2 className="mt-5 font-serif text-2xl font-medium text-foreground">
            {isVi ? "Khu vực không khả dụng" : "Area unavailable"}
          </h2>

          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
            {isVi
              ? "Quý khách không có quyền truy cập vào danh sách đơn hàng quản trị."
              : "You do not have permission to view the management order list."}
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
      <div className="py-8 space-y-6">
        <nav aria-label="Breadcrumb">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{isVi ? "Trung tâm quản trị" : "Admin Hub"}</span>
          </Link>
        </nav>

        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
          <p className="text-sm font-medium text-destructive">
            {isVi
              ? "Không thể tải danh sách đơn hàng lúc này. Vui lòng làm mới trang hoặc thử lại sau."
              : "Unable to load orders at this time. Please refresh the page or try again later."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 py-4">
      <header className="space-y-4">
        <nav aria-label="Breadcrumb">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{isVi ? "Trung tâm quản trị" : "Admin Hub"}</span>
          </Link>
        </nav>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-3xl md:text-4xl font-semibold text-foreground">
              {isVi ? "Quản lý đơn hàng" : "Orders"}
            </h1>
            <span className="rounded-full border border-border bg-muted/40 px-3 py-0.5 text-xs font-medium text-muted-foreground">
              {totalCount}{" "}
              {isVi
                ? "đơn hàng"
                : totalCount === 1
                  ? "order"
                  : "orders"}
            </span>
          </div>
        </div>

        <p className="text-sm text-muted-foreground max-w-2xl">
          {isVi
            ? "Danh sách đơn hàng toàn hệ thống, hiển thị mới nhất trước."
            : "System-wide order records, newest first."}
        </p>
      </header>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/40">
            <Package className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="mt-4 font-serif text-xl font-medium text-foreground">
            {isVi ? "Chưa có đơn hàng nào" : "No orders found"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isVi
              ? "Khi có đơn hàng mới phát sinh, thông tin sẽ hiển thị tại đây."
              : "When new orders are placed, they will appear here."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Desktop & tablet table view */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-border bg-card/40">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-xs uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="py-3.5 px-6 font-medium">
                    {isVi ? "Đơn hàng" : "Order"}
                  </th>
                  <th scope="col" className="py-3.5 px-6 font-medium">
                    {isVi ? "Ngày đặt" : "Date"}
                  </th>
                  <th scope="col" className="py-3.5 px-6 font-medium">
                    {isVi ? "Khách hàng" : "Customer"}
                  </th>
                  <th scope="col" className="py-3.5 px-6 font-medium">
                    {isVi ? "Tác phẩm" : "Items"}
                  </th>
                  <th scope="col" className="py-3.5 px-6 font-medium">
                    {isVi ? "Trạng thái" : "Status"}
                  </th>
                  <th scope="col" className="py-3.5 px-6 text-right font-medium">
                    {isVi ? "Tổng tiền" : "Total"}
                  </th>
                </tr>
              </thead>
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
                      <td className="py-4 px-6 font-mono text-xs font-semibold text-foreground">
                        {order.orderNumber}
                      </td>
                      <td className="py-4 px-6 text-xs text-muted-foreground whitespace-nowrap">
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
                        <div className="font-medium text-foreground">
                          {customerName}
                        </div>
                        {customerDetail && (
                          <div className="text-xs text-muted-foreground truncate max-w-xs">
                            {customerDetail}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <div className="text-xs font-medium text-foreground">
                          {itemCount}{" "}
                          {isVi
                            ? "tác phẩm"
                            : itemCount === 1
                              ? "item"
                              : "items"}
                        </div>
                        {itemsSummary && (
                          <div
                            className="text-xs text-muted-foreground truncate max-w-xs"
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
                      <td className="py-4 px-6 text-right font-medium text-foreground whitespace-nowrap">
                        {formatPrice(order.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
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
                  className="rounded-xl border border-border bg-card/40 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {order.orderNumber}
                    </span>
                    <OrderStatusBadge
                      status={order.status}
                      locale={locale}
                    />
                  </div>

                  <div className="border-t border-border/60 pt-2 text-xs space-y-1">
                    <div className="font-medium text-foreground">
                      {customerName}
                    </div>
                    {customerDetail && (
                      <div className="text-muted-foreground truncate">
                        {customerDetail}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-border/60 pt-2 text-xs text-muted-foreground">
                    <span>
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
                    </span>
                    <span className="font-medium text-foreground text-sm">
                      {formatPrice(order.total)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {totalCount > orders.length && (
            <p className="pt-2 text-center text-xs text-muted-foreground">
              {isVi
                ? `Hiển thị ${orders.length} đơn hàng mới nhất trên tổng số ${totalCount} đơn.`
                : `Showing newest ${orders.length} of ${totalCount} orders.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
