import { cn } from "@/lib/utils";

/**
 * UI-only display threshold for distinguishing low-stock items in the management view.
 * This is an editorial / presentation constant and NOT a database constraint or business rule.
 */
export const LOW_STOCK_THRESHOLD = 10;

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

export function getStockStatus(stock: number): StockStatus {
  if (stock <= 0) return "out_of_stock";
  if (stock <= LOW_STOCK_THRESHOLD) return "low_stock";
  return "in_stock";
}

const STATUS_STYLES: Record<StockStatus, string> = {
  in_stock: "border-sage/40 bg-sage/15 text-sage",
  low_stock: "border-amber/40 bg-amber/15 text-amber",
  out_of_stock: "border-destructive/40 bg-destructive/15 text-destructive",
};

const STATUS_LABELS_EN: Record<StockStatus, string> = {
  in_stock: "In Stock",
  low_stock: "Low Stock",
  out_of_stock: "Out of Stock",
};

const STATUS_LABELS_VI: Record<StockStatus, string> = {
  in_stock: "Còn hàng",
  low_stock: "Sắp hết hàng",
  out_of_stock: "Hết hàng",
};

export interface StockStatusBadgeProps {
  stock: number;
  locale?: string;
  showCount?: boolean;
  className?: string;
}

export function StockStatusBadge({
  stock,
  locale = "en",
  showCount = false,
  className,
}: StockStatusBadgeProps) {
  const isVi = locale === "vi";
  const status = getStockStatus(stock);
  const labels = isVi ? STATUS_LABELS_VI : STATUS_LABELS_EN;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide",
        STATUS_STYLES[status],
        className
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "in_stock" && "bg-sage",
          status === "low_stock" && "bg-amber",
          status === "out_of_stock" && "bg-destructive"
        )}
        aria-hidden="true"
      />
      <span>
        {showCount ? `${labels[status]} (${stock})` : labels[status]}
      </span>
    </span>
  );
}
