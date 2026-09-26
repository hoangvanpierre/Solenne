"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Ban } from "lucide-react";
import { useAuthz } from "@/hooks/use-authz";
import { cancelOrderAction } from "@/app/actions/orders";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/types";

export interface OrderCancelControlProps {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  locale?: string;
  unitsCount?: number;
  className?: string;
}

function getDisplayError(err: string, isVi: boolean): string {
  if (!isVi) return err;
  if (err.includes("already been cancelled")) {
    return "Đơn hàng này đã được hủy trước đó.";
  }
  if (err.includes("fulfillment status")) {
    return "Không thể hủy đơn hàng này ở trạng thái hiện tại.";
  }
  if (err.includes("Order not found") || err.includes("Invalid order")) {
    return "Không tìm thấy đơn hàng.";
  }
  if (err.includes("one or more product variants no longer exist")) {
    return "Không thể hoàn lại tồn kho: một hoặc nhiều phiên bản sản phẩm không còn tồn tại.";
  }
  if (err.includes("do not have permission")) {
    return "Quý khách không có quyền hủy đơn hàng.";
  }
  if (err.includes("sign in")) {
    return "Vui lòng đăng nhập để hủy đơn hàng.";
  }
  return "Không thể hủy đơn hàng. Vui lòng thử lại sau hoặc liên hệ hỗ trợ.";
}

export function OrderCancelControl({
  orderId,
  orderNumber,
  status,
  locale = "en",
  unitsCount = 1,
  className,
}: OrderCancelControlProps) {
  const isVi = locale === "vi";
  const { state, can } = useAuthz();
  const router = useRouter();

  const [isConfirming, setIsConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // 1. Authorization visibility check (UX-only):
  // User must have an active session holding order.cancel permission.
  // The server action and database RPC remain the authoritative security boundary.
  const canCancel = state === "active" && can("order.cancel");

  // 2. Status-based visibility check (UX-only):
  // Only display the cancellation control for pending, paid, or processing orders.
  const isCancellable =
    status === "pending" || status === "paid" || status === "processing";

  if (!canCancel || !isCancellable) {
    return null;
  }

  const handleConfirmCancel = () => {
    setError(null);
    startTransition(async () => {
      const trimmedReason = reason.trim();
      const result = await cancelOrderAction(
        orderId,
        trimmedReason.length > 0 ? trimmedReason : undefined
      );

      if (result.error) {
        setError(getDisplayError(result.error, isVi));
        // If the order was already cancelled or its fulfillment status changed concurrently,
        // refresh server component state to reflect reality.
        if (
          result.error.includes("already been cancelled") ||
          result.error.includes("fulfillment status")
        ) {
          router.refresh();
        }
        return;
      }

      if (result.success) {
        setIsConfirming(false);
        router.refresh();
      }
    });
  };

  const handleClose = () => {
    if (isPending) return;
    setIsConfirming(false);
    setError(null);
    setReason("");
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card/40 p-6 space-y-4",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-border pb-4">
        <Ban className="h-5 w-5 text-muted-foreground" />
        <h2 className="font-serif text-lg font-medium text-foreground">
          {isVi ? "Thao tác quản trị" : "Management Actions"}
        </h2>
      </div>

      {!isConfirming ? (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {isVi
              ? "Hủy đơn hàng sẽ hoàn lại số lượng tồn kho tương ứng và chuyển trạng thái đơn hàng sang Đã hủy."
              : "Cancelling this order will restore its items back to inventory and transition the order status to Cancelled."}
          </p>

          <Button
            type="button"
            variant="outline"
            className="w-full text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40"
            onClick={() => setIsConfirming(true)}
          >
            <Ban className="h-4 w-4" />
            <span>{isVi ? "Hủy đơn hàng" : "Cancel Order"}</span>
          </Button>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">
                {isVi ? "Xác nhận hủy đơn hàng" : "Confirm Cancellation"}
              </h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {isVi ? (
                  <>
                    Quý khách có chắc chắn muốn hủy đơn hàng{" "}
                    <span className="font-mono font-medium text-foreground">
                      {orderNumber}
                    </span>
                    ? Tồn kho của{" "}
                    <span className="font-medium text-foreground">
                      {unitsCount}
                    </span>{" "}
                    sản phẩm sẽ được tự động hoàn trả.
                  </>
                ) : (
                  <>
                    Are you sure you want to cancel order{" "}
                    <span className="font-mono font-medium text-foreground">
                      {orderNumber}
                    </span>
                    ? Inventory for{" "}
                    <span className="font-medium text-foreground">
                      {unitsCount} {unitsCount === 1 ? "item" : "items"}
                    </span>{" "}
                    will be automatically restored.
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Optional cancellation reason */}
          <div className="space-y-1.5">
            <label
              htmlFor={`cancel-reason-${orderId}`}
              className="block text-xs font-medium text-foreground"
            >
              {isVi
                ? "Lý do hủy (không bắt buộc)"
                : "Cancellation reason (optional)"}
            </label>
            <textarea
              id={`cancel-reason-${orderId}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isPending}
              rows={2}
              maxLength={500}
              placeholder={
                isVi
                  ? "Ví dụ: Khách hàng đổi ý, hết nguyên liệu chế tác..."
                  : "e.g. Customer requested cancellation, duplicate order..."
              }
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive leading-relaxed"
            >
              {error}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={handleClose}
              className="order-2 sm:order-1"
            >
              {isVi ? "Giữ đơn hàng" : "Keep Order"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              isLoading={isPending}
              disabled={isPending}
              onClick={handleConfirmCancel}
              className="order-1 sm:order-2"
            >
              <span>{isVi ? "Xác nhận hủy" : "Confirm Cancellation"}</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
