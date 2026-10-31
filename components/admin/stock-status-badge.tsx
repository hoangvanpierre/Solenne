import { AdminStatusBadge, type AdminStatusTone } from "./admin-status-badge";

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

const STATUS_TONES: Record<StockStatus, AdminStatusTone> = {
  in_stock: "positive",
  low_stock: "attention",
  out_of_stock: "danger",
};

const STATUS_LABELS_EN: Record<StockStatus, string> = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
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
    <AdminStatusBadge
      label={showCount ? `${labels[status]} (${stock})` : labels[status]}
      tone={STATUS_TONES[status]}
      dot
      className={className}
    />
  );
}
