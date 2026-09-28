"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  PackageCheck,
  Play,
  RotateCcw,
  Truck,
} from "lucide-react";
import { useAuthz } from "@/hooks/use-authz";
import { transitionOrderStatusAction } from "@/app/actions/orders";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/types";

export interface OrderFulfillmentControlProps {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  trackingCode?: string | null;
  locale?: string;
  className?: string;
}

type ActiveAction = "ship" | "deliver" | "rollback" | null;

function getFulfillmentDisplayError(err: string, isVi: boolean): string {
  if (!isVi) {
    if (err.includes("already in") || err.includes("ORDER_ALREADY_IN_STATUS")) {
      return "The order is already in this status. The page has been refreshed to show the latest state.";
    }
    return err;
  }
  if (err.includes("already in") || err.includes("ORDER_ALREADY_IN_STATUS")) {
    return "Đơn hàng đã ở trạng thái này. Trang đã được làm mới để phản ánh trạng thái mới nhất.";
  }
  if (err.includes("ORDER_NOT_FOUND") || err.includes("Order not found")) {
    return "Không tìm thấy đơn hàng.";
  }
  if (
    err.includes("TRACKING_CODE_REQUIRED") ||
    err.includes("tracking code is required")
  ) {
    return "Bắt buộc nhập mã vận đơn hợp lệ khi đánh dấu đơn hàng đã gửi đi.";
  }
  if (
    err.includes("TRACKING_CODE_INVALID") ||
    err.includes("Tracking code must be between")
  ) {
    return "Mã vận đơn phải có độ dài từ 3 đến 100 ký tự.";
  }
  if (
    err.includes("ROLLBACK_REASON_REQUIRED") ||
    err.includes("reason is required to rollback")
  ) {
    return "Bắt buộc nhập lý do khi chuyển lùi đơn hàng về trạng thái đang chế tác.";
  }
  if (
    err.includes("ROLLBACK_REASON_INVALID") ||
    err.includes("Rollback reason cannot exceed")
  ) {
    return "Lý do chuyển lùi không được vượt quá 500 ký tự.";
  }
  if (
    err.includes("PAYMENT_STATUS_TRANSITION_DISALLOWED") ||
    err.includes("Payment status cannot be updated")
  ) {
    return "Không thể cập nhật trạng thái thanh toán qua quy trình giao vận.";
  }
  if (
    err.includes("INVALID_STATUS_TRANSITION") ||
    err.includes("transition is not permitted")
  ) {
    return "Lộ trình chuyển đổi trạng thái này không được phép.";
  }
  if (err.includes("FORBIDDEN") || err.includes("do not have permission")) {
    return "Quý khách không có quyền thực hiện thao tác chuyển trạng thái này.";
  }
  if (err.includes("UNAUTHENTICATED") || err.includes("sign in")) {
    return "Vui lòng đăng nhập để cập nhật trạng thái đơn hàng.";
  }
  return "Không thể cập nhật trạng thái đơn hàng. Vui lòng thử lại sau.";
}

export function OrderFulfillmentControl({
  orderId,
  orderNumber,
  status,
  trackingCode,
  locale = "en",
  className,
}: OrderFulfillmentControlProps) {
  const isVi = locale === "vi";
  const { state, can } = useAuthz();
  const router = useRouter();

  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [trackingInput, setTrackingInput] = useState("");
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [rollbackReason, setRollbackReason] = useState("");
  const [rollbackError, setRollbackError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  // 1. Authorization visibility check (UX-only):
  // User must have an active session holding order.update (forward transitions)
  // or order.cancel (shipped -> processing rollback).
  // The Server Action and database RPC remain the authoritative security boundary.
  const canUpdate = state === "active" && can("order.update");
  const canRollback = state === "active" && can("order.cancel");

  // Terminal cancelled orders do not accept fulfillment transitions.
  if (status === "cancelled") {
    return null;
  }

  // If the user has neither permission and there is no tracking code, hide control.
  if (!canUpdate && !canRollback && !trackingCode) {
    return null;
  }

  const handleCopyTracking = () => {
    if (!trackingCode) return;
    navigator.clipboard.writeText(trackingCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCloseAction = () => {
    if (isPending) return;
    setActiveAction(null);
    setTrackingInput("");
    setTrackingError(null);
    setRollbackReason("");
    setRollbackError(null);
    setActionError(null);
  };

  const executeTransition = (
    targetStatus: OrderStatus,
    code?: string,
    reason?: string
  ) => {
    setActionError(null);
    startTransition(async () => {
      const result = await transitionOrderStatusAction(
        orderId,
        targetStatus,
        code,
        reason
      );

      if (result.error) {
        setActionError(getFulfillmentDisplayError(result.error, isVi));
        // If concurrent update or invalid transition, refresh to reflect reality
        if (
          result.error.includes("already in") ||
          result.error.includes("ORDER_ALREADY_IN_STATUS") ||
          result.error.includes("not permitted") ||
          result.error.includes("INVALID_STATUS_TRANSITION")
        ) {
          router.refresh();
        }
        return;
      }

      if (result.success) {
        setActiveAction(null);
        setTrackingInput("");
        setTrackingError(null);
        setRollbackReason("");
        setRollbackError(null);
        setActionError(null);
        router.refresh();
      }
    });
  };

  const handleStartProcessing = () => {
    executeTransition("processing");
  };

  const handleConfirmShip = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setTrackingError(null);
    const trimmed = trackingInput.trim();
    if (!trimmed || trimmed.length < 3) {
      setTrackingError(
        isVi
          ? "Mã vận đơn phải có ít nhất 3 ký tự."
          : "Tracking code must be at least 3 characters."
      );
      return;
    }
    if (trimmed.length > 100) {
      setTrackingError(
        isVi
          ? "Mã vận đơn không được vượt quá 100 ký tự."
          : "Tracking code cannot exceed 100 characters."
      );
      return;
    }
    executeTransition("shipped", trimmed);
  };

  const handleConfirmDeliver = () => {
    executeTransition("delivered");
  };

  const handleConfirmRollback = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setRollbackError(null);
    const trimmed = rollbackReason.trim();
    if (!trimmed || trimmed.length < 3) {
      setRollbackError(
        isVi
          ? "Lý do chuyển lùi phải có ít nhất 3 ký tự."
          : "Rollback reason must be at least 3 characters."
      );
      return;
    }
    if (trimmed.length > 500) {
      setRollbackError(
        isVi
          ? "Lý do chuyển lùi không được vượt quá 500 ký tự."
          : "Rollback reason cannot exceed 500 characters."
      );
      return;
    }
    executeTransition("processing", undefined, trimmed);
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card/40 p-6 space-y-4",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border pb-4">
        <PackageCheck className="h-5 w-5 text-muted-foreground" />
        <h2 className="font-serif text-lg font-medium text-foreground">
          {isVi ? "Trạng thái giao vận" : "Fulfillment Controls"}
        </h2>
      </div>

      {/* Global Action Error Alert */}
      {actionError && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive leading-relaxed"
        >
          {actionError}
        </div>
      )}

      {/* Active Tracking Code Block (when present on shipped or delivered) */}
      {trackingCode && status !== "processing" && (
        <div className="rounded-xl border border-border bg-background/50 p-3.5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="uppercase tracking-wider">
              {isVi ? "Mã vận đơn hiện tại" : "Active Tracking Code"}
            </span>
            <button
              type="button"
              onClick={handleCopyTracking}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              aria-label={isVi ? "Sao chép mã vận đơn" : "Copy tracking code"}
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-sage" />
                  <span className="text-sage">{isVi ? "Đã chép" : "Copied"}</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>{isVi ? "Sao chép" : "Copy"}</span>
                </>
              )}
            </button>
          </div>
          <div className="font-mono text-sm font-semibold text-foreground select-all">
            {trackingCode}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STATUS: PENDING or PAID                                        */}
      {/* Action: pending/paid -> processing                           */}
      {/* ------------------------------------------------------------- */}
      {(status === "pending" || status === "paid") && (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {isVi
              ? "Bắt đầu đóng gói và xử lý tác phẩm cho đơn hàng này."
              : "Commence atelier preparation and crafting for this order."}
          </p>

          {canUpdate ? (
            <Button
              type="button"
              className="w-full"
              isLoading={isPending}
              disabled={isPending}
              onClick={handleStartProcessing}
            >
              <Play className="h-4 w-4" />
              <span>{isVi ? "Bắt đầu chế tác" : "Start Processing"}</span>
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              {isVi
                ? "Cần quyền order.update để bắt đầu xử lý."
                : "order.update permission required to process."}
            </p>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STATUS: PROCESSING                                            */}
      {/* Action: processing -> shipped (with tracking_code)            */}
      {/* ------------------------------------------------------------- */}
      {status === "processing" && (
        <div className="space-y-3">
          {activeAction !== "ship" ? (
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {isVi
                  ? "Đơn hàng đang được chuẩn bị. Khi bưu kiện sẵn sàng gửi giao, hãy nhập mã vận đơn để xác nhận chuyển giao."
                  : "Order is currently being crafted. Once the parcel is ready for dispatch, enter a tracking code to mark as shipped."}
              </p>

              {canUpdate ? (
                <Button
                  type="button"
                  className="w-full"
                  disabled={isPending}
                  onClick={() => setActiveAction("ship")}
                >
                  <Truck className="h-4 w-4" />
                  <span>{isVi ? "Xác nhận gửi hàng" : "Mark as Shipped"}</span>
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  {isVi
                    ? "Cần quyền order.update để gửi hàng."
                    : "order.update permission required to mark as shipped."}
                </p>
              )}
            </div>
          ) : (
            <form
              onSubmit={handleConfirmShip}
              className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4"
            >
              <div className="flex items-start gap-2.5">
                <Truck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    {isVi ? "Xác nhận gửi hàng" : "Dispatch Order"}
                  </h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {isVi
                      ? "Nhập mã vận đơn bưu chính / giao vận cho đơn hàng này."
                      : "Enter the courier tracking code for parcel dispatch."}
                  </p>
                </div>
              </div>

              {/* Tracking Code Input */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <label
                    htmlFor={`tracking-input-${orderId}`}
                    className="font-medium text-foreground"
                  >
                    {isVi ? "Mã vận đơn" : "Tracking Code"}
                    <span className="text-destructive ml-1">*</span>
                  </label>
                  <span className="text-muted-foreground text-[11px]">
                    {trackingInput.trim().length}/100
                  </span>
                </div>
                <input
                  id={`tracking-input-${orderId}`}
                  type="text"
                  value={trackingInput}
                  onChange={(e) => {
                    setTrackingInput(e.target.value);
                    if (trackingError) setTrackingError(null);
                  }}
                  disabled={isPending}
                  maxLength={100}
                  autoFocus
                  placeholder={
                    isVi
                      ? "Ví dụ: VN-POST-8392019, DHL-928172..."
                      : "e.g. VN-POST-8392019, DHL-928172..."
                  }
                  className={cn(
                    "w-full rounded-xl border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 disabled:opacity-50",
                    trackingError
                      ? "border-destructive focus:border-destructive focus:ring-destructive"
                      : "border-border focus:border-ring focus:ring-ring"
                  )}
                />
                {trackingError && (
                  <p className="text-xs text-destructive">{trackingError}</p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={handleCloseAction}
                  className="order-2 sm:order-1"
                >
                  {isVi ? "Hủy bỏ" : "Cancel"}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  isLoading={isPending}
                  disabled={
                    isPending ||
                    trackingInput.trim().length < 3 ||
                    trackingInput.trim().length > 100
                  }
                  className="order-1 sm:order-2"
                >
                  <span>{isVi ? "Xác nhận gửi" : "Confirm & Ship"}</span>
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STATUS: SHIPPED                                               */}
      {/* Forward: shipped -> delivered                                 */}
      {/* Rollback: shipped -> processing (requires order.cancel)       */}
      {/* ------------------------------------------------------------- */}
      {status === "shipped" && (
        <div className="space-y-3">
          {activeAction === null && (
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {isVi
                  ? "Bưu kiện đang trên đường vận chuyển. Khi khách hàng đã an nhận, xác nhận để hoàn tất quy trình."
                  : "Parcel is in transit. Once confirmed received by the client, complete the fulfillment workflow."}
              </p>

              <div className="flex flex-col gap-2">
                {canUpdate && (
                  <Button
                    type="button"
                    className="w-full"
                    disabled={isPending}
                    onClick={() => setActiveAction("deliver")}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{isVi ? "Xác nhận đã giao" : "Mark as Delivered"}</span>
                  </Button>
                )}

                {canRollback && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full text-amber border-amber/30 hover:bg-amber/10 hover:text-amber hover:border-amber/40"
                    disabled={isPending}
                    onClick={() => setActiveAction("rollback")}
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>
                      {isVi
                        ? "Chuyển lùi về Đang chế tác"
                        : "Rollback to Processing"}
                    </span>
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Forward Confirm: Deliver */}
          {activeAction === "deliver" && (
            <div className="space-y-4 rounded-xl border border-sage/30 bg-sage/5 p-4">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="h-5 w-5 text-sage shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    {isVi ? "Xác nhận đã an nhận" : "Confirm Delivery"}
                  </h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {isVi ? (
                      <>
                        Xác nhận đơn hàng{" "}
                        <span className="font-mono font-medium text-foreground">
                          {orderNumber}
                        </span>{" "}
                        đã được giao thành công tới quý khách. Đây là trạng thái hoàn tất giao vận.
                      </>
                    ) : (
                      <>
                        Confirm that order{" "}
                        <span className="font-mono font-medium text-foreground">
                          {orderNumber}
                        </span>{" "}
                        has been successfully delivered. This is a terminal fulfillment state.
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={handleCloseAction}
                  className="order-2 sm:order-1"
                >
                  {isVi ? "Hủy bỏ" : "Cancel"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  isLoading={isPending}
                  disabled={isPending}
                  onClick={handleConfirmDeliver}
                  className="order-1 sm:order-2"
                >
                  <span>{isVi ? "Xác nhận đã giao" : "Confirm Delivery"}</span>
                </Button>
              </div>
            </div>
          )}

          {/* Rollback Confirm: shipped -> processing */}
          {activeAction === "rollback" && (
            <form
              onSubmit={handleConfirmRollback}
              className="space-y-4 rounded-xl border border-amber/30 bg-amber/5 p-4"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-5 w-5 text-amber shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    {isVi ? "Chuyển lùi trạng thái" : "Rollback to Processing"}
                  </h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {isVi
                      ? "Chuyển lùi trạng thái sẽ đưa đơn hàng về Đang chế tác và xóa mã vận đơn hiện tại. Bắt buộc nhập lý do cho hồ sơ kiểm toán."
                      : "Rolling back will return this order to Processing and clear its active tracking code. A reason is required for the audit record."}
                  </p>
                </div>
              </div>

              {/* Rollback Reason Textarea */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <label
                    htmlFor={`rollback-reason-${orderId}`}
                    className="font-medium text-foreground"
                  >
                    {isVi ? "Lý do chuyển lùi" : "Rollback Reason"}
                    <span className="text-destructive ml-1">*</span>
                  </label>
                  <span className="text-muted-foreground text-[11px]">
                    {rollbackReason.trim().length}/500
                  </span>
                </div>
                <textarea
                  id={`rollback-reason-${orderId}`}
                  value={rollbackReason}
                  onChange={(e) => {
                    setRollbackReason(e.target.value);
                    if (rollbackError) setRollbackError(null);
                  }}
                  disabled={isPending}
                  rows={3}
                  maxLength={500}
                  autoFocus
                  placeholder={
                    isVi
                      ? "Ví dụ: Đơn vị giao vận làm hỏng kiện hàng, hoàn atelier kiểm tra lại..."
                      : "e.g. Courier returned damaged parcel to atelier for inspection..."
                  }
                  className={cn(
                    "w-full resize-none rounded-xl border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 disabled:opacity-50",
                    rollbackError
                      ? "border-destructive focus:border-destructive focus:ring-destructive"
                      : "border-border focus:border-ring focus:ring-ring"
                  )}
                />
                {rollbackError && (
                  <p className="text-xs text-destructive">{rollbackError}</p>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={handleCloseAction}
                  className="order-2 sm:order-1"
                >
                  {isVi ? "Giữ trạng thái" : "Keep Shipped"}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  isLoading={isPending}
                  disabled={
                    isPending ||
                    rollbackReason.trim().length < 3 ||
                    rollbackReason.trim().length > 500
                  }
                  className="order-1 sm:order-2 text-amber border-amber/40 hover:bg-amber/15 hover:text-amber"
                >
                  <span>{isVi ? "Xác nhận chuyển lùi" : "Confirm Rollback"}</span>
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STATUS: DELIVERED (Terminal Fulfillment)                      */}
      {/* ------------------------------------------------------------- */}
      {status === "delivered" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-sage font-medium">
            <CheckCircle2 className="h-4 w-4" />
            <span>
              {isVi
                ? "Đơn hàng đã được giao hoàn tất."
                : "Order fulfillment complete."}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {isVi
              ? "Tác phẩm đã được chuyển giao trọn vẹn tới quý khách."
              : "All creations have been safely received by the client."}
          </p>
        </div>
      )}
    </div>
  );
}
