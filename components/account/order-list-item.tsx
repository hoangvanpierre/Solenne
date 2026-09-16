import Link from "next/link";
import type { Order } from "@/types";
import { formatPrice } from "@/lib/utils";
import { OrderStatusBadge } from "./status-badge";

export interface OrderListItemProps {
  order: Order;
  locale?: string;
}

export function OrderListItem({ order, locale = "en" }: OrderListItemProps) {
  const isVi = locale === "vi";
  return (
    <Link
      href={`/checkout/success?number=${order.orderNumber}`}
      className="block rounded-xl border border-border/60 p-4 transition-colors hover:border-foreground/20"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-serif text-sm font-medium text-foreground">
          {order.orderNumber}
        </span>
        <span className="text-sm text-foreground">
          {formatPrice(order.total)}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <OrderStatusBadge status={order.status} locale={locale} />
        <span className="text-xs text-muted-foreground">
          {order.items.length}{" "}
          {isVi ? "tác phẩm" : order.items.length === 1 ? "item" : "items"} ·{" "}
          {new Date(order.createdAt).toLocaleDateString(isVi ? "vi-VN" : "en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      </div>
    </Link>
  );
}
