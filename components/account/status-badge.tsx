import type { OrderStatus } from "@/types";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending: "border-amber/30 bg-amber/10 text-amber",
  paid: "border-sage/30 bg-sage/10 text-sage",
  processing: "border-primary/30 bg-primary/10 text-primary",
  shipped: "border-sage/30 bg-sage/10 text-sage",
  delivered: "border-sage/40 bg-sage/15 text-sage",
  cancelled: "border-destructive/30 bg-destructive/10 text-destructive",
};

const STATUS_LABELS_EN: Record<OrderStatus, string> = {
  pending: "Pending Payment",
  paid: "Paid",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_LABELS_VI: Record<OrderStatus, string> = {
  pending: "Chờ thanh toán",
  paid: "Đã thanh toán",
  processing: "Đang chế tác",
  shipped: "Đang chuyển giao",
  delivered: "Đã an nhận",
  cancelled: "Đã hủy",
};

export interface OrderStatusBadgeProps {
  status: OrderStatus;
  locale?: string;
  className?: string;
}

export function OrderStatusBadge({ status, locale = "en", className }: OrderStatusBadgeProps) {
  const labels = locale === "vi" ? STATUS_LABELS_VI : STATUS_LABELS_EN;
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-medium uppercase tracking-wider",
        STATUS_STYLES[status] ?? STATUS_STYLES.pending,
        className
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}
