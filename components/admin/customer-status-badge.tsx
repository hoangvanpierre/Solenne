import type { AccountStatus } from "@/types";
import { AdminStatusBadge, type AdminStatusTone } from "./admin-status-badge";

// Customer account state delegates to the shared status pill so the same
// meaning ("this is healthy") reads identically here, in inventory and in the
// audit trail. Labels stay local because they are account-specific copy.

const STATUS_TONES: Record<AccountStatus, AdminStatusTone> = {
  active: "positive",
  suspended: "attention",
  banned: "danger",
  pending: "neutral",
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

  return (
    <AdminStatusBadge
      label={labels[status] ?? status}
      tone={STATUS_TONES[status] ?? "neutral"}
      uppercase
      className={className}
    />
  );
}
