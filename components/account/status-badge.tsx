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

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending Payment",
  paid: "Paid",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export interface OrderStatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-medium uppercase tracking-wider",
        STATUS_STYLES[status] ?? STATUS_STYLES.pending,
        className
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
