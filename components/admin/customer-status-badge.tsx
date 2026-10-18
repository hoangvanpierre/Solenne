import type { AccountStatus } from "@/types";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<AccountStatus, string> = {
  active: "border-sage/30 bg-sage/10 text-sage",
  suspended: "border-amber/30 bg-amber/10 text-amber",
  banned: "border-destructive/30 bg-destructive/10 text-destructive",
  pending: "border-border bg-muted/60 text-muted-foreground",
};

const STATUS_LABELS_EN: Record<AccountStatus, string> = {
  active: "Active",
  suspended: "Suspended",
  banned: "Banned",
  pending: "Pending",
};

const STATUS_LABELS_VI: Record<AccountStatus, string> = {
  active: "Hoạt động",
  suspended: "Tạm khóa",
  banned: "Cấm truy cập",
  pending: "Chờ kích hoạt",
};

export interface CustomerStatusBadgeProps {
  status: AccountStatus;
  locale?: string;
  className?: string;
}

export function CustomerStatusBadge({
  status,
  locale = "en",
  className,
}: CustomerStatusBadgeProps) {
  const isVi = locale === "vi";
  const labels = isVi ? STATUS_LABELS_VI : STATUS_LABELS_EN;
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  const label = labels[status] ?? status;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wider uppercase",
        style,
        className
      )}
    >
      {label}
    </span>
  );
}
