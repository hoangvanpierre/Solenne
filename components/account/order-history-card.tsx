import Link from "next/link";
import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { getOrdersForUser, countOrdersForUser } from "@/lib/orders";
import {
  isRestrictedAuthError,
  isUnauthenticatedAuthError,
} from "@/lib/authz-ux";
import { formatPrice } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderStatusBadge } from "./status-badge";
import { RestrictedAccountNotice } from "./restricted-account-notice";
import type { Order } from "@/types";

const MAX_DASHBOARD_ORDERS = 3;

export interface OrderHistoryCardProps {
  userId: string;
}

export async function OrderHistoryCard({ userId }: OrderHistoryCardProps) {
  const locale = await getLocale();
  const isVi = locale === "vi";

  let orders: Order[] = [];
  let totalOrders = 0;
  let loadFailed = false;
  let accountRestricted = false;

  try {
    [orders, totalOrders] = await Promise.all([
      getOrdersForUser(userId, MAX_DASHBOARD_ORDERS),
      countOrdersForUser(userId),
    ]);
  } catch (error) {
    if (isUnauthenticatedAuthError(error)) redirect("/login");
    if (isRestrictedAuthError(error)) {
      accountRestricted = true;
    } else {
      console.error("Failed to load order history:", error);
      loadFailed = true;
    }
  }

  if (accountRestricted) {
    return <RestrictedAccountNotice locale={locale} />;
  }

  const hasMore = totalOrders > MAX_DASHBOARD_ORDERS;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-xl sm:text-2xl font-normal text-foreground leading-[1.28]">
          {isVi ? "Lịch sử đơn hàng" : "Order history"}
        </h2>
        <span className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground tabular-nums font-normal">
          {totalOrders} {isVi ? "đơn hàng" : totalOrders === 1 ? "order" : "orders"}
        </span>
      </div>
      <p className="mt-2 text-[13.5px] sm:text-[14px] text-muted-foreground font-normal leading-relaxed">
        {isVi
          ? "Những đơn hàng gần nhất, mới nhất trước."
          : "Your most recent orders, newest first."}
      </p>

      {loadFailed ? (
        <p className="mt-8 text-sm text-muted-foreground font-normal">
          {isVi ? (
            <>
              Không thể tải lịch sử đơn hàng lúc này. Vui lòng tải lại trang, hoặc{" "}
              <Link
                href="/account/orders"
                className="underline underline-offset-4 transition-colors hover:text-foreground"
              >
                xem toàn bộ lịch sử
              </Link>
              .
            </>
          ) : (
            <>
              We couldn&apos;t load your orders right now. Please refresh the
              page, or{" "}
              <Link
                href="/account/orders"
                className="underline underline-offset-4 transition-colors hover:text-foreground"
              >
                view the full order history
              </Link>
              .
            </>
          )}
        </p>
      ) : orders.length === 0 ? (
        <div className="mt-8">
          <p className="text-sm text-muted-foreground font-normal">
            {isVi
              ? "Chưa có đơn hàng nào. Đơn hàng đầu tiên của bạn sẽ xuất hiện tại đây."
              : "No orders yet. Your first candle order will appear here."}
          </p>
          <Link
            href="/products"
            className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-normal text-foreground underline-offset-4 hover:underline"
          >
            <span>{isVi ? "Khám phá bộ sưu tập" : "Explore the collection"}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6 divide-y divide-border/60 border-y border-border/60">
            {orders.map((order) => (
              <Link
                key={order.id}
                href={`/checkout/success?number=${order.orderNumber}`}
                className="group block py-4 sm:py-5 transition-colors hover:bg-muted/30"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-serif text-base sm:text-[17px] font-normal tabular-nums text-foreground">
                        {order.orderNumber}
                      </span>
                      <span className="text-[13px] text-muted-foreground font-normal tabular-nums">
                        {order.items.length}{" "}
                        {isVi ? "sản phẩm" : order.items.length === 1 ? "item" : "items"}
                      </span>
                    </div>
                    <p className="mt-1 text-[11.5px] text-muted-foreground font-normal tabular-nums">
                      {new Date(order.createdAt).toLocaleDateString(isVi ? "vi-VN" : "en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <OrderStatusBadge status={order.status} locale={locale} />
                    <span className="text-[13.5px] font-normal tabular-nums text-foreground">
                      {formatPrice(order.total)}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {hasMore && (
            <Link
              href="/account/orders"
              className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-normal tabular-nums text-foreground underline-offset-4 hover:underline"
            >
              <span>
                {isVi ? `Xem tất cả đơn hàng (${totalOrders})` : `View all orders (${totalOrders})`}
              </span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </>
      )}
    </div>
  );
}

export interface OrderHistoryCardSkeletonProps {
  locale?: string;
}

export function OrderHistoryCardSkeleton({
  locale = "en",
}: OrderHistoryCardSkeletonProps) {
  const isVi = locale === "vi";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-xl sm:text-2xl font-normal text-foreground leading-[1.28]">
          {isVi ? "Lịch sử đơn hàng" : "Order history"}
        </h2>
      </div>
      <p className="mt-2 text-[13.5px] sm:text-[14px] text-muted-foreground font-normal leading-relaxed">
        {isVi
          ? "Những đơn hàng gần nhất, mới nhất trước."
          : "Your most recent orders, newest first."}
      </p>
      <div className="mt-6 space-y-4 border-y border-border/60 py-4">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
