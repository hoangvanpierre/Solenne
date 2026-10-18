"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Lock,
  PauseCircle,
  ShieldAlert,
} from "lucide-react";
import { useAuthz } from "@/hooks/use-authz";
import {
  manageCustomerStatusAction,
  reinstateCustomerAction,
} from "@/app/actions/customers";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { AccountStatus } from "@/types";

export interface CustomerStatusControlProps {
  customerId: string;
  currentStatus: AccountStatus;
  customerName?: string | null;
  locale?: string;
  className?: string;
}

function getDisplayError(err: string, isVi: boolean): string {
  if (!isVi) {
    if (err.includes("CUSTOMER_NOT_FOUND") || err.includes("not found")) {
      return "Customer profile not found.";
    }
    if (err.includes("INVALID_TARGET_ROLE")) {
      return "Only customer accounts can be managed through this interface.";
    }
    if (err.includes("SELF_REINSTATEMENT_FORBIDDEN")) {
      return "You cannot reinstate your own account.";
    }
    if (err.includes("SELF_STATUS_CHANGE_FORBIDDEN")) {
      return "You cannot change the status of your own account.";
    }
    if (err.includes("CUSTOMER_NOT_BANNED")) {
      return "Only banned customer accounts can be reinstated.";
    }
    if (err.includes("NOOP_TRANSITION") || err.includes("already in")) {
      return "Customer is already in the requested status.";
    }
    if (err.includes("BANNED_STATUS_TERMINAL") || err.includes("terminal")) {
      return "Banned accounts cannot be reactivated or modified.";
    }
    if (err.includes("PENDING_STATUS_UNSUPPORTED")) {
      return "Pending accounts cannot be transitioned with this action.";
    }
    if (err.includes("INVALID_STATUS_TRANSITION")) {
      return "This status transition is not permitted.";
    }
    if (
      err.includes("INVALID_REASON") ||
      err.includes("REASON_REQUIRED") ||
      err.includes("least 5")
    ) {
      return "A valid reason between 5 and 255 characters is required.";
    }
    if (err.includes("FORBIDDEN") || err.includes("do not have permission")) {
      return "You do not have permission to manage customer accounts.";
    }
    if (err.includes("UNAUTHENTICATED") || err.includes("sign in")) {
      return "Please sign in to manage customer accounts.";
    }
    return err;
  }

  if (err.includes("CUSTOMER_NOT_FOUND") || err.includes("not found")) {
    return "Không tìm thấy hồ sơ khách hàng.";
  }
  if (err.includes("INVALID_TARGET_ROLE")) {
    return "Chỉ có thể quản lý trạng thái của tài khoản khách hàng.";
  }
  if (err.includes("SELF_REINSTATEMENT_FORBIDDEN")) {
    return "Quý khách không thể tự kích hoạt lại tài khoản của chính mình.";
  }
  if (err.includes("SELF_STATUS_CHANGE_FORBIDDEN")) {
    return "Quý khách không thể tự thay đổi trạng thái tài khoản của chính mình.";
  }
  if (err.includes("CUSTOMER_NOT_BANNED")) {
    return "Chỉ tài khoản đang bị cấm mới có thể được kích hoạt lại.";
  }
  if (err.includes("NOOP_TRANSITION") || err.includes("already in")) {
    return "Khách hàng đã ở trạng thái này từ trước.";
  }
  if (err.includes("BANNED_STATUS_TERMINAL") || err.includes("terminal")) {
    return "Tài khoản bị cấm không thể kích hoạt lại hoặc chỉnh sửa trong phiên bản hiện tại.";
  }
  if (err.includes("PENDING_STATUS_UNSUPPORTED")) {
    return "Không hỗ trợ thay đổi trạng thái cho tài khoản đang chờ kích hoạt.";
  }
  if (err.includes("INVALID_STATUS_TRANSITION")) {
    return "Thao tác chuyển đổi trạng thái này không được phép.";
  }
  if (
    err.includes("INVALID_REASON") ||
    err.includes("REASON_REQUIRED") ||
    err.includes("least 5")
  ) {
    return "Bắt buộc nhập lý do thay đổi trạng thái (từ 5 đến 255 ký tự).";
  }
  if (err.includes("FORBIDDEN") || err.includes("do not have permission")) {
    return "Quý khách không có quyền quản lý tài khoản khách hàng.";
  }
  if (err.includes("UNAUTHENTICATED") || err.includes("sign in")) {
    return "Vui lòng đăng nhập để thực hiện thao tác.";
  }
  return "Không thể cập nhật trạng thái khách hàng. Vui lòng thử lại sau.";
}

export function CustomerStatusControl({
  customerId,
  currentStatus,
  customerName,
  locale = "en",
  className,
}: CustomerStatusControlProps) {
  const isVi = locale === "vi";
  const { state, can } = useAuthz();
  const router = useRouter();

  const [targetAction, setTargetAction] = useState<
    "active" | "suspended" | "banned" | "reinstate" | null
  >(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Authorization check (UX-only): must have active session holding staff.manage (admin only)
  // Server action and database RPC remain authoritative boundary.
  const canManage = state === "active" && can("staff.manage");

  if (!canManage) {
    return null;
  }

  const handleOpenAction = (
    action: "active" | "suspended" | "banned" | "reinstate"
  ) => {
    setError(null);
    setReason("");
    setTargetAction(action);
  };

  const handleClose = () => {
    if (isPending) return;
    setTargetAction(null);
    setError(null);
    setReason("");
  };

  const handleConfirm = () => {
    if (!targetAction) return;

    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      setError(
        isVi
          ? "Vui lòng nhập lý do tối thiểu 5 ký tự."
          : "Please enter a reason of at least 5 characters."
      );
      return;
    }

    if (trimmed.length > 255) {
      setError(
        isVi
          ? "Lý do không được vượt quá 255 ký tự."
          : "Reason cannot exceed 255 characters."
      );
      return;
    }

    setError(null);
    startTransition(async () => {
      const result =
        targetAction === "reinstate"
          ? await reinstateCustomerAction({
              customerId,
              reason: trimmed,
            })
          : await manageCustomerStatusAction({
              customerId,
              currentStatus,
              targetStatus: targetAction,
              reason: trimmed,
            });

      if (result.error) {
        setError(getDisplayError(result.error, isVi));
        return;
      }

      if (result.success) {
        setTargetAction(null);
        setReason("");
        router.refresh();
      }
    });
  };

  const displayName = customerName?.trim() || customerId;

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card/40 p-6 space-y-4",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-border pb-4">
        <ShieldAlert className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-normal text-foreground">
          {isVi ? "Quản lý trạng thái tài khoản" : "Account Status Management"}
        </h2>
      </div>

      {targetAction === null ? (
        <div className="space-y-4">
          {currentStatus === "banned" ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-destructive font-normal text-xs">
                <Ban className="h-4 w-4 shrink-0" />
                <span>
                  {isVi ? "Tài khoản bị cấm" : "Account Banned"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-normal leading-relaxed">
                {isVi
                  ? "Tài khoản này đã bị cấm truy cập. Thao tác thông thường không thể thay đổi trạng thái này. Quản trị viên có thể kích hoạt lại tài khoản có kiểm soát với lý do giải trình bắt buộc."
                  : "This customer account is currently banned from accessing the store. Normal status transitions cannot reverse this state. An authorized administrator may reinstate the account with a mandatory audit reason."}
              </p>
              <div className="pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start text-sage border-sage/30 hover:bg-sage/10 hover:text-sage hover:border-sage/40 text-xs font-normal h-9"
                  onClick={() => handleOpenAction("reinstate")}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2 shrink-0" />
                  <span>
                    {isVi
                      ? "Kích hoạt lại tài khoản bị cấm"
                      : "Reinstate Banned Customer"}
                  </span>
                </Button>
              </div>
            </div>
          ) : currentStatus === "pending" ? (
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground font-normal text-xs">
                <Lock className="h-4 w-4 shrink-0" />
                <span>
                  {isVi ? "Tài khoản chờ kích hoạt" : "Pending Activation"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-normal leading-relaxed">
                {isVi
                  ? "Tài khoản đang chờ xác thực email ban đầu. Thao tác quản trị trạng thái không áp dụng cho tài khoản này."
                  : "This account is awaiting email activation. Administrative status transitions cannot be performed on pending accounts."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-muted-foreground font-normal">
                {isVi
                  ? "Thực hiện thay đổi trạng thái khách hàng có hiệu lực tức thì và được lưu vết kiểm toán đầy đủ."
                  : "Status transitions take effect immediately and are permanently recorded in the audit trail."}
              </p>

              <div className="flex flex-col gap-2">
                {currentStatus === "active" && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start text-amber border-amber/30 hover:bg-amber/10 hover:text-amber hover:border-amber/40 text-xs font-normal h-9"
                      onClick={() => handleOpenAction("suspended")}
                    >
                      <PauseCircle className="h-4 w-4 mr-2 shrink-0" />
                      <span>
                        {isVi ? "Tạm khóa tài khoản" : "Suspend Account"}
                      </span>
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 text-xs font-normal h-9"
                      onClick={() => handleOpenAction("banned")}
                    >
                      <Ban className="h-4 w-4 mr-2 shrink-0" />
                      <span>{isVi ? "Cấm tài khoản" : "Ban Account"}</span>
                    </Button>
                  </>
                )}

                {currentStatus === "suspended" && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start text-sage border-sage/30 hover:bg-sage/10 hover:text-sage hover:border-sage/40 text-xs font-normal h-9"
                      onClick={() => handleOpenAction("active")}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2 shrink-0" />
                      <span>
                        {isVi
                          ? "Kích hoạt lại tài khoản"
                          : "Reactivate Account"}
                      </span>
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 text-xs font-normal h-9"
                      onClick={() => handleOpenAction("banned")}
                    >
                      <Ban className="h-4 w-4 mr-2 shrink-0" />
                      <span>{isVi ? "Cấm tài khoản" : "Ban Account"}</span>
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div
          className={cn(
            "space-y-4 rounded-xl border p-4",
            targetAction === "banned"
              ? "border-destructive/30 bg-destructive/5"
              : targetAction === "suspended"
              ? "border-amber/30 bg-amber/5"
              : "border-sage/30 bg-sage/5"
          )}
        >
          <div className="flex items-start gap-2.5">
            {targetAction === "banned" ? (
              <Ban className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            ) : targetAction === "suspended" ? (
              <AlertTriangle className="h-5 w-5 text-amber shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-sage shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <h3 className="text-sm font-normal text-foreground">
                {targetAction === "reinstate"
                  ? isVi
                    ? "Xác nhận kích hoạt lại tài khoản bị cấm"
                    : "Confirm Reinstatement of Banned Customer"
                  : targetAction === "banned"
                  ? isVi
                    ? "Xác nhận cấm tài khoản vĩnh viễn"
                    : "Confirm Account Ban"
                  : targetAction === "suspended"
                  ? isVi
                    ? "Xác nhận tạm khóa tài khoản"
                    : "Confirm Account Suspension"
                  : isVi
                  ? "Xác nhận kích hoạt lại tài khoản"
                  : "Confirm Account Reactivation"}
              </h3>
              <p className="text-xs leading-relaxed text-muted-foreground font-normal">
                {targetAction === "reinstate"
                  ? isVi ? (
                      <>
                        Quý khách có chắc chắn muốn kích hoạt lại tài khoản bị cấm của{" "}
                        <span className="font-normal text-foreground">
                          {displayName}
                        </span>
                        ? Trạng thái tài khoản sẽ được chuyển thành hoạt động (Active), khôi phục quyền đăng nhập và đặt hàng. Thao tác này được lưu vết kiểm toán vĩnh viễn.
                      </>
                    ) : (
                      <>
                        Are you sure you want to reinstate the banned account for{" "}
                        <span className="font-normal text-foreground">
                          {displayName}
                        </span>
                        ? The account status will be restored to Active, restoring sign-in and checkout abilities. This executive action is permanently recorded in the audit log.
                      </>
                    )
                  : targetAction === "banned"
                  ? isVi ? (
                      <>
                        Quý khách có chắc chắn muốn cấm tài khoản của{" "}
                        <span className="font-normal text-foreground">
                          {displayName}
                        </span>
                        ? Cấm tài khoản là vĩnh viễn trong luồng quản lý thông thường.
                      </>
                    ) : (
                      <>
                        Are you sure you want to ban the account of{" "}
                        <span className="font-normal text-foreground">
                          {displayName}
                        </span>
                        ? Banning is permanent within the normal status-management workflow.
                      </>
                    )
                  : targetAction === "suspended"
                  ? isVi ? (
                      <>
                        Tài khoản của{" "}
                        <span className="font-normal text-foreground">
                          {displayName}
                        </span>{" "}
                        sẽ bị chặn đăng nhập và đặt đơn mới. Lịch sử đơn hàng vẫn được lưu giữ.
                      </>
                    ) : (
                      <>
                        Account for{" "}
                        <span className="font-normal text-foreground">
                          {displayName}
                        </span>{" "}
                        will be blocked from signing in and placing new orders. Order history remains preserved.
                      </>
                    )
                  : isVi ? (
                      <>
                        Tài khoản của{" "}
                        <span className="font-normal text-foreground">
                          {displayName}
                        </span>{" "}
                        sẽ được mở khóa và có thể đăng nhập bình thường.
                      </>
                    ) : (
                      <>
                        Account for{" "}
                        <span className="font-normal text-foreground">
                          {displayName}
                        </span>{" "}
                        will be restored and able to sign in normally.
                      </>
                    )}
              </p>
            </div>
          </div>

          {/* Reason input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor={`status-reason-${customerId}`}
                className="block text-xs font-normal text-foreground"
              >
                {isVi ? "Lý do thay đổi trạng thái" : "Reason for status change"}
                <span className="text-destructive ml-1">*</span>
              </label>
              <span className="text-xs text-muted-foreground tabular-nums font-normal">
                {reason.trim().length}/255
              </span>
            </div>

            <textarea
              id={`status-reason-${customerId}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isPending}
              rows={2}
              maxLength={255}
              placeholder={
                targetAction === "reinstate"
                  ? isVi
                    ? "Ví dụ: Ban quản trị đã phê duyệt kích hoạt lại tài khoản sau khi xem xét và xác minh thông tin..."
                    : "e.g. Executive approval to reinstate customer account following formal review and verification..."
                  : targetAction === "banned"
                  ? isVi
                    ? "Ví dụ: Vi phạm nghiêm trọng điều khoản sử dụng, gian lận thanh toán..."
                    : "e.g. Terms of service violation, fraudulent payment attempt..."
                  : targetAction === "suspended"
                  ? isVi
                    ? "Ví dụ: Tạm khóa do phát hiện hoạt động đăng nhập bất thường..."
                    : "e.g. Temporary hold due to suspicious account activity..."
                  : isVi
                  ? "Ví dụ: Đã giải quyết xong xác minh danh tính khách hàng..."
                  : "e.g. Customer identity verification successfully resolved..."
              }
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-[13px] font-normal text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            />
            <p className="text-xs text-muted-foreground font-normal">
              {isVi
                ? "Tối thiểu 5 ký tự, tối đa 255 ký tự. Được lưu trữ bảo mật trong nhật ký kiểm toán."
                : "Between 5 and 255 characters. Recorded securely in the audit log."}
            </p>
          </div>

          {/* Error display */}
          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs font-normal text-destructive leading-relaxed"
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
              className="order-2 sm:order-1 text-xs font-normal"
            >
              {isVi ? "Hủy bỏ" : "Cancel"}
            </Button>
            <Button
              type="button"
              variant={targetAction === "banned" ? "destructive" : "default"}
              size="sm"
              isLoading={isPending}
              disabled={isPending}
              onClick={handleConfirm}
              className={cn(
                "order-1 sm:order-2 text-xs font-normal",
                targetAction === "suspended" &&
                  "bg-amber hover:bg-amber/90 text-primary-foreground",
                (targetAction === "active" || targetAction === "reinstate") &&
                  "bg-sage hover:bg-sage/90 text-primary-foreground"
              )}
            >
              <span>
                {targetAction === "reinstate"
                  ? isVi
                    ? "Xác nhận kích hoạt lại"
                    : "Confirm Reinstatement"
                  : targetAction === "banned"
                  ? isVi
                    ? "Xác nhận cấm"
                    : "Confirm Ban"
                  : targetAction === "suspended"
                  ? isVi
                    ? "Xác nhận tạm khóa"
                    : "Confirm Suspension"
                  : isVi
                  ? "Xác nhận kích hoạt"
                  : "Confirm Reactivation"}
              </span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
