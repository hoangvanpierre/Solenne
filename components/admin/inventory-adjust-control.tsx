"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Check,
  Minus,
  Plus,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useAuthz } from "@/hooks/use-authz";
import { adjustInventoryAction } from "@/app/actions/inventory";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface InventoryAdjustControlProps {
  variantId: string;
  variantName: string;
  productName: string;
  sku?: string;
  currentStock: number;
  locale?: string;
  className?: string;
  onAdjusted?: (newStock: number) => void;
}

function getDisplayError(err: string, isVi: boolean): string {
  if (!isVi) {
    if (err.includes("INSUFFICIENT_STOCK") || err.includes("below zero")) {
      return "Insufficient stock: cannot reduce stock below zero.";
    }
    if (err.includes("INVALID_DELTA") || err.includes("cannot be zero")) {
      return "Adjustment delta cannot be zero.";
    }
    if (err.includes("REASON_REQUIRED") || err.includes("minimum 3")) {
      return "Adjustment reason is required (minimum 3 characters).";
    }
    if (err.includes("REASON_INVALID") || err.includes("exceed 255")) {
      return "Adjustment reason cannot exceed 255 characters.";
    }
    if (err.includes("VARIANT_NOT_FOUND") || err.includes("not found")) {
      return "Product variant not found.";
    }
    if (err.includes("FORBIDDEN") || err.includes("do not have permission")) {
      return "You do not have permission to adjust inventory.";
    }
    if (err.includes("UNAUTHENTICATED") || err.includes("sign in")) {
      return "Please sign in to adjust inventory.";
    }
    return err;
  }

  if (err.includes("INSUFFICIENT_STOCK") || err.includes("below zero")) {
    return "Không đủ tồn kho: không thể giảm số lượng tồn kho xuống dưới 0.";
  }
  if (err.includes("INVALID_DELTA") || err.includes("cannot be zero")) {
    return "Mức điều chỉnh tồn kho không được bằng 0.";
  }
  if (err.includes("REASON_REQUIRED") || err.includes("minimum 3")) {
    return "Bắt buộc nhập lý do điều chỉnh (tối thiểu 3 ký tự).";
  }
  if (err.includes("REASON_INVALID") || err.includes("exceed 255")) {
    return "Lý do điều chỉnh không được vượt quá 255 ký tự.";
  }
  if (err.includes("VARIANT_NOT_FOUND") || err.includes("not found")) {
    return "Không tìm thấy phiên bản sản phẩm này.";
  }
  if (err.includes("FORBIDDEN") || err.includes("do not have permission")) {
    return "Quý khách không có quyền điều chỉnh tồn kho.";
  }
  if (err.includes("UNAUTHENTICATED") || err.includes("sign in")) {
    return "Vui lòng đăng nhập để thực hiện điều chỉnh.";
  }
  return "Không thể điều chỉnh tồn kho. Vui lòng thử lại sau.";
}

export function InventoryAdjustControl({
  variantId,
  variantName,
  productName,
  sku,
  currentStock,
  locale = "en",
  className,
  onAdjusted,
}: InventoryAdjustControlProps) {
  const isVi = locale === "vi";
  const { state, can } = useAuthz();
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [delta, setDelta] = useState<number>(0);
  const [deltaInput, setDeltaInput] = useState<string>("0");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // UX-only permission check:
  // User must have active status and inventory.update permission.
  // The server action and database RPC remain authoritative.
  const canUpdate = state === "active" && can("inventory.update");

  const resultingStock = currentStock + delta;
  const isNegativeStock = resultingStock < 0;
  const isZeroDelta = delta === 0;
  const trimmedReason = reason.trim();
  const isReasonValid = trimmedReason.length >= 3 && trimmedReason.length <= 255;
  const canSubmit = !isPending && !isZeroDelta && !isNegativeStock && isReasonValid;

  // Handle escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) {
        setIsOpen(false);
        setError(null);
        setSuccessMsg(null);
        setDelta(0);
        setDeltaInput("0");
        setReason("");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isPending]);

  if (!canUpdate) {
    return null;
  }

  const handleOpen = () => {
    setDelta(0);
    setDeltaInput("0");
    setReason("");
    setError(null);
    setSuccessMsg(null);
    setIsOpen(true);
  };

  const handleClose = () => {
    if (isPending) return;
    setIsOpen(false);
    setError(null);
    setSuccessMsg(null);
    setDelta(0);
    setDeltaInput("0");
    setReason("");
  };

  const setDeltaValue = (newDelta: number) => {
    setDelta(newDelta);
    setDeltaInput(newDelta > 0 ? `+${newDelta}` : `${newDelta}`);
    setError(null);
  };

  const handleDeltaInputChange = (val: string) => {
    setDeltaInput(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed)) {
      setDelta(parsed);
      setError(null);
    } else if (val === "" || val === "+" || val === "-") {
      setDelta(0);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const result = await adjustInventoryAction({
        variantId,
        delta,
        reason: trimmedReason,
      });

      if (result.error) {
        setError(getDisplayError(result.error, isVi));
        return;
      }

      if (result.success && result.newStock !== undefined) {
        setSuccessMsg(
          isVi
            ? `Cập nhật thành công: tồn kho mới là ${result.newStock}.`
            : `Stock updated successfully: new stock is ${result.newStock}.`
        );
        onAdjusted?.(result.newStock);
        router.refresh();

        // Auto close after brief success confirmation
        setTimeout(() => {
          handleClose();
        }, 1200);
      }
    });
  };

  return (
    <div className={className}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 hover:border-amber/50 hover:bg-amber/5"
      >
        <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
        <span>{isVi ? "Điều chỉnh" : "Adjust"}</span>
      </Button>

      {/* Accessible Dialog Modal */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`adjust-title-${variantId}`}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
        >
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Modal Panel */}
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber/10 text-amber">
                    <Boxes className="h-4 w-4" />
                  </div>
                  <h2
                    id={`adjust-title-${variantId}`}
                    className="font-serif text-lg font-semibold text-foreground"
                  >
                    {isVi ? "Điều chỉnh tồn kho" : "Adjust Stock"}
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{productName}</span>
                  {" — "}
                  <span>{variantName}</span>
                  {sku && <span className="font-mono text-muted-foreground ml-1.5">({sku})</span>}
                </p>
              </div>

              <button
                type="button"
                onClick={handleClose}
                disabled={isPending}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                aria-label={isVi ? "Đóng hộp thoại" : "Close dialog"}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Current vs New Stock Preview */}
              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  {isVi ? "Biến động tồn kho" : "Stock Impact Preview"}
                </div>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <div className="space-y-0.5">
                    <span className="text-xs text-muted-foreground">
                      {isVi ? "Hiện tại" : "Current"}
                    </span>
                    <div className="font-mono text-xl font-bold text-foreground">
                      {currentStock}
                    </div>
                  </div>

                  <div className="flex flex-col items-center justify-center text-xs text-muted-foreground">
                    <span className="font-mono font-medium text-amber">
                      {delta > 0 ? `+${delta}` : delta}
                    </span>
                    <ArrowRight className="h-4 w-4 my-0.5 text-muted-foreground" />
                  </div>

                  <div className="space-y-0.5 text-right">
                    <span className="text-xs text-muted-foreground">
                      {isVi ? "Sau điều chỉnh" : "Resulting"}
                    </span>
                    <div
                      className={cn(
                        "font-mono text-xl font-bold",
                        isNegativeStock
                          ? "text-destructive"
                          : delta > 0
                            ? "text-sage"
                            : delta < 0
                              ? "text-amber"
                              : "text-foreground"
                      )}
                    >
                      {resultingStock}
                    </div>
                  </div>
                </div>

                {isNegativeStock && (
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {isVi
                        ? "Số lượng sau điều chỉnh không được nhỏ hơn 0."
                        : "Resulting stock cannot fall below zero."}
                    </span>
                  </div>
                )}
              </div>

              {/* Delta Adjustment Inputs */}
              <div className="space-y-2">
                <label
                  htmlFor={`delta-input-${variantId}`}
                  className="block text-xs font-medium text-foreground"
                >
                  {isVi ? "Mức thay đổi (Delta)" : "Adjustment Delta"}
                </label>

                {/* Quick Presets */}
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-[11px] text-muted-foreground self-center mr-1">
                    {isVi ? "Tăng:" : "Add:"}
                  </span>
                  {[1, 5, 10, 25].map((amt) => (
                    <button
                      key={`add-${amt}`}
                      type="button"
                      disabled={isPending}
                      onClick={() => setDeltaValue(amt)}
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs font-mono transition-colors",
                        delta === amt
                          ? "border-sage bg-sage/15 text-sage font-bold"
                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                      )}
                    >
                      +{amt}
                    </button>
                  ))}

                  <span className="text-[11px] text-muted-foreground self-center ml-2 mr-1">
                    {isVi ? "Giảm:" : "Deduct:"}
                  </span>
                  {[-1, -5, -10].map((amt) => (
                    <button
                      key={`sub-${amt}`}
                      type="button"
                      disabled={isPending}
                      onClick={() => setDeltaValue(amt)}
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs font-mono transition-colors",
                        delta === amt
                          ? "border-amber bg-amber/15 text-amber font-bold"
                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {amt}
                    </button>
                  ))}
                </div>

                {/* Custom numeric delta input */}
                <div className="relative mt-2">
                  <input
                    id={`delta-input-${variantId}`}
                    type="text"
                    inputMode="numeric"
                    value={deltaInput}
                    onChange={(e) => handleDeltaInputChange(e.target.value)}
                    disabled={isPending}
                    placeholder="+10 or -5"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                  />
                  <div className="absolute inset-y-0 right-2 flex items-center gap-1">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => setDeltaValue(delta - 1)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={isVi ? "Giảm 1" : "Decrease by 1"}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => setDeltaValue(delta + 1)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={isVi ? "Tăng 1" : "Increase by 1"}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Reason Field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label
                    htmlFor={`reason-input-${variantId}`}
                    className="font-medium text-foreground"
                  >
                    {isVi ? "Lý do điều chỉnh (Bắt buộc)" : "Adjustment Reason (Required)"}
                  </label>
                  <span
                    className={cn(
                      "text-[11px]",
                      trimmedReason.length > 255
                        ? "text-destructive font-medium"
                        : trimmedReason.length >= 3
                          ? "text-muted-foreground"
                          : "text-amber"
                    )}
                  >
                    {trimmedReason.length}/255{" "}
                    {trimmedReason.length < 3 && (isVi ? "(tối thiểu 3 ký tự)" : "(min 3 chars)")}
                  </span>
                </div>
                <textarea
                  id={`reason-input-${variantId}`}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setError(null);
                  }}
                  disabled={isPending}
                  rows={2}
                  maxLength={255}
                  placeholder={
                    isVi
                      ? "Ví dụ: Nhập hàng lô mới PO-102, hư hỏng trong kho, kiểm kê bù trừ..."
                      : "e.g. Received shipment PO-102, damaged in warehouse, cycle count adjustment..."
                  }
                  className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                />
              </div>

              {/* Feedback Alert Messages */}
              {error && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive leading-relaxed"
                >
                  {error}
                </div>
              )}

              {successMsg && (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-2 rounded-lg border border-sage/40 bg-sage/15 p-3 text-xs text-sage"
                >
                  <Check className="h-4 w-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Dialog Actions */}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={handleClose}
                >
                  {isVi ? "Hủy bỏ" : "Cancel"}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  isLoading={isPending}
                  disabled={!canSubmit}
                  className="bg-amber hover:bg-amber/90 text-primary-foreground font-medium"
                >
                  <span>{isVi ? "Xác nhận điều chỉnh" : "Confirm Adjustment"}</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
