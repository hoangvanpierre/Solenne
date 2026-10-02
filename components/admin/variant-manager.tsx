"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  Pencil,
  Plus,
  Scale,
  Trash2,
  X,
} from "lucide-react";
import { useAuthz } from "@/hooks/use-authz";
import {
  createVariantAction,
  updateVariantAction,
  deleteVariantAction,
} from "@/app/actions/products";
import { formatPrice } from "@/lib/utils";
import { Button, Input } from "@/components/ui";
import { StockStatusBadge } from "./stock-status-badge";
import type { ProductVariant } from "@/types";

export interface VariantManagerProps {
  productId: string;
  productName: string;
  productSlug?: string;
  basePrice: number;
  variants: ProductVariant[];
  locale?: string;
  className?: string;
}

interface NewVariantFormState {
  name: string;
  size: string;
  burnTime: string;
  price: string;
  sku: string;
  initialStock: string;
}

interface EditVariantFormState {
  name: string;
  size: string;
  burnTime: string;
  price: string;
  sku: string;
}

export function VariantManager({
  productId,
  productName,
  basePrice,
  variants,
  locale = "en",
  className,
}: VariantManagerProps) {
  const isVi = locale === "vi";
  const router = useRouter();
  const { can } = useAuthz();

  const canUpdate = can("product.update");
  const canDelete = can("product.delete");

  // Dialog states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState<ProductVariant | null>(
    null
  );
  const [deletingVariant, setDeletingVariant] = useState<ProductVariant | null>(
    null
  );

  // Form states
  const [newForm, setNewForm] = useState<NewVariantFormState>({
    name: "",
    size: "",
    burnTime: "",
    price: basePrice.toString(),
    sku: "",
    initialStock: "0",
  });

  const [editForm, setEditForm] = useState<EditVariantFormState>({
    name: "",
    size: "",
    burnTime: "",
    price: "",
    sku: "",
  });

  // Error and feedback states
  const [modalError, setModalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string[] | undefined>
  >({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Reset errors
  const clearFeedback = () => {
    setModalError(null);
    setFieldErrors({});
  };

  // Open Add Dialog
  const handleOpenAdd = () => {
    clearFeedback();
    setNewForm({
      name: "",
      size: "220g / 7.7 oz",
      burnTime: "50-55 hours",
      price: basePrice.toString(),
      sku: "",
      initialStock: "0",
    });
    setIsAddOpen(true);
  };

  // Open Edit Dialog
  const handleOpenEdit = (variant: ProductVariant) => {
    clearFeedback();
    setEditingVariant(variant);
    setEditForm({
      name: variant.name,
      size: variant.size ?? "",
      burnTime: variant.burnTime ?? "",
      price: variant.price.toString(),
      sku: variant.sku ?? "",
    });
  };

  // Open Delete Dialog
  const handleOpenDelete = (variant: ProductVariant) => {
    clearFeedback();
    setDeletingVariant(variant);
  };

  // Submit New Variant
  const handleCreateVariant = (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();

    const priceNum = parseFloat(newForm.price);
    if (isNaN(priceNum) || priceNum < 0) {
      setFieldErrors({
        price: [isVi ? "Giá phải là số không âm." : "Price must be non-negative."],
      });
      return;
    }

    const stockNum = parseInt(newForm.initialStock, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      setFieldErrors({
        initialStock: [
          isVi
            ? "Tồn kho ban đầu phải là số nguyên không âm."
            : "Initial stock must be a non-negative integer.",
        ],
      });
      return;
    }

    startTransition(async () => {
      const result = await createVariantAction(productId, {
        name: newForm.name.trim(),
        size: newForm.size.trim() || null,
        burnTime: newForm.burnTime.trim() || null,
        price: priceNum,
        sku: newForm.sku.trim() || null,
        initialStock: stockNum,
      });

      if (result.error) {
        setModalError(result.error);
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
        return;
      }

      if (result.success) {
        setIsAddOpen(false);
        setSuccessMessage(
          isVi
            ? "Đã thêm phiên bản sản phẩm thành công."
            : "Variant created successfully."
        );
        router.refresh();
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    });
  };

  // Submit Update Variant (Metadata only — Stock is strictly prohibited)
  const handleUpdateVariant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVariant) return;
    clearFeedback();

    const priceNum = parseFloat(editForm.price);
    if (isNaN(priceNum) || priceNum < 0) {
      setFieldErrors({
        price: [isVi ? "Giá phải là số không âm." : "Price must be non-negative."],
      });
      return;
    }

    startTransition(async () => {
      const result = await updateVariantAction(editingVariant.id, {
        name: editForm.name.trim(),
        size: editForm.size.trim() || null,
        burnTime: editForm.burnTime.trim() || null,
        price: priceNum,
        sku: editForm.sku.trim() || null,
      });

      if (result.error) {
        setModalError(result.error);
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
        return;
      }

      if (result.success) {
        setEditingVariant(null);
        setSuccessMessage(
          isVi
            ? "Đã cập nhật thông tin phiên bản."
            : "Variant updated successfully."
        );
        router.refresh();
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    });
  };

  // Submit Delete Variant
  const handleDeleteVariant = () => {
    if (!deletingVariant) return;
    clearFeedback();

    startTransition(async () => {
      const result = await deleteVariantAction(deletingVariant.id);

      if (result.error) {
        setModalError(result.error);
        return;
      }

      if (result.success) {
        setDeletingVariant(null);
        setSuccessMessage(
          isVi
            ? "Đã xóa phiên bản sản phẩm."
            : "Variant deleted successfully."
        );
        router.refresh();
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    });
  };

  return (
    <div className={className}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-xl font-semibold text-foreground">
                {isVi ? "Cơ cấu phiên bản" : "Product Variants"}
              </h2>
              <span className="rounded-full border border-border bg-muted/30 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {variants.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {isVi
                ? "Quản lý kích cỡ, giá và quy cách. Tồn kho của phiên bản hiện có được cập nhật qua trang Quản lý kho."
                : "Manage size, price, and specs. Existing stock quantities are updated via Inventory Management."}
            </p>
          </div>

          {canUpdate && (
            <Button
              type="button"
              size="sm"
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1.5 self-start sm:self-auto bg-amber text-primary-foreground hover:bg-amber/90"
            >
              <Plus className="h-4 w-4" />
              <span>{isVi ? "Thêm phiên bản" : "Add Variant"}</span>
            </Button>
          )}
        </div>

        {/* Global Feedback Banner */}
        {successMessage && (
          <div className="flex items-center gap-2 rounded-xl border border-sage/40 bg-sage/10 p-3 text-xs text-sage">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Variant List */}
        {variants.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center space-y-3">
            <Layers className="mx-auto h-8 w-8 text-muted-foreground/60" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                {isVi ? "Chưa có phiên bản nào" : "No variants defined"}
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {isVi
                  ? "Sản phẩm cần có ít nhất một phiên bản để khách hàng có thể đặt mua tại boutique."
                  : "Every product needs at least one variant before it can be purchased in the boutique."}
              </p>
            </div>
            {canUpdate && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenAdd}
                className="inline-flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{isVi ? "Tạo phiên bản đầu tiên" : "Add First Variant"}</span>
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {variants.map((variant) => (
              <div
                key={variant.id}
                className="group rounded-xl border border-border bg-card/60 p-4 transition-all duration-200 hover:border-amber/30 hover:bg-card/90"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {/* Variant info */}
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground truncate">
                        {variant.name}
                      </h3>
                      {variant.sku && (
                        <span className="font-mono text-xs text-muted-foreground rounded bg-muted/40 px-1.5 py-0.5">
                          {variant.sku}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {variant.size && (
                        <span className="inline-flex items-center gap-1">
                          <Scale className="h-3 w-3 text-muted-foreground/70" />
                          <span>{variant.size}</span>
                        </span>
                      )}
                      {variant.burnTime && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground/70" />
                          <span>{variant.burnTime}</span>
                        </span>
                      )}
                      <span className="font-medium text-foreground">
                        {formatPrice(variant.price, "USD")}
                      </span>
                    </div>
                  </div>

                  {/* Stock Display & Inventory Boundary */}
                  <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    <div className="flex items-center gap-2">
                      <StockStatusBadge
                        stock={variant.stockQuantity}
                        locale={locale}
                        showCount={true}
                      />
                      <Link
                        href="/admin/inventory"
                        title={
                          isVi
                            ? "Điều chỉnh tồn kho tại mục Quản lý kho"
                            : "Adjust stock via Inventory Management"
                        }
                        className="inline-flex items-center gap-1 text-xs text-amber hover:underline hover:text-amber/80 font-medium whitespace-nowrap"
                      >
                        <Boxes className="h-3 w-3" />
                        <span>{isVi ? "Kho hàng" : "Inventory"}</span>
                        <ArrowRight className="h-2.5 w-2.5" />
                      </Link>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 border-l border-border pl-2 sm:pl-3">
                      {canUpdate && (
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(variant)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          aria-label={
                            isVi
                              ? `Sửa thông tin ${variant.name}`
                              : `Edit ${variant.name}`
                          }
                          title={isVi ? "Chỉnh sửa quy cách" : "Edit metadata"}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleOpenDelete(variant)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          aria-label={
                            isVi
                              ? `Xóa phiên bản ${variant.name}`
                              : `Delete ${variant.name}`
                          }
                          title={isVi ? "Xóa phiên bản" : "Delete variant"}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* ADD VARIANT MODAL                                             */}
      {/* ------------------------------------------------------------- */}
      {isAddOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-variant-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
        >
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
            onClick={() => !isPending && setIsAddOpen(false)}
            aria-hidden="true"
          />

          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber/10 text-amber">
                    <Plus className="h-4 w-4" />
                  </div>
                  <h3
                    id="add-variant-title"
                    className="font-serif text-lg font-semibold text-foreground"
                  >
                    {isVi ? "Thêm phiên bản mới" : "Add New Variant"}
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  {productName}
                </p>
              </div>

              <button
                type="button"
                onClick={() => !isPending && setIsAddOpen(false)}
                disabled={isPending}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                aria-label={isVi ? "Đóng" : "Close"}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Error Banner */}
            {modalError && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateVariant} className="space-y-4">
              <Input
                label={isVi ? "Tên phiên bản *" : "Variant Name *"}
                value={newForm.name}
                onChange={(e) =>
                  setNewForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder={isVi ? "Ví dụ: Standard 220g" : "e.g. Standard 220g"}
                error={fieldErrors.name?.[0]}
                required
                disabled={isPending}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label={isVi ? "Kích cỡ / Trọng lượng" : "Size / Weight"}
                  value={newForm.size}
                  onChange={(e) =>
                    setNewForm((prev) => ({ ...prev, size: e.target.value }))
                  }
                  placeholder={isVi ? "220g / 7.7 oz" : "220g / 7.7 oz"}
                  error={fieldErrors.size?.[0]}
                  disabled={isPending}
                />
                <Input
                  label={isVi ? "Thời gian cháy" : "Burn Time"}
                  value={newForm.burnTime}
                  onChange={(e) =>
                    setNewForm((prev) => ({ ...prev, burnTime: e.target.value }))
                  }
                  placeholder={isVi ? "50-55 hours" : "50-55 hours"}
                  error={fieldErrors.burnTime?.[0]}
                  disabled={isPending}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label={isVi ? "Đơn giá (USD) *" : "Price (USD) *"}
                  type="number"
                  step="0.01"
                  min="0"
                  value={newForm.price}
                  onChange={(e) =>
                    setNewForm((prev) => ({ ...prev, price: e.target.value }))
                  }
                  error={fieldErrors.price?.[0]}
                  required
                  disabled={isPending}
                />
                <Input
                  label={isVi ? "Mã SKU" : "SKU"}
                  value={newForm.sku}
                  onChange={(e) =>
                    setNewForm((prev) => ({ ...prev, sku: e.target.value }))
                  }
                  placeholder="SLN-XXX-220"
                  error={fieldErrors.sku?.[0]}
                  disabled={isPending}
                />
              </div>

              {/* Initial Stock (Creation-time ONLY) */}
              <div className="rounded-xl border border-amber/30 bg-amber/5 p-3.5 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber">
                  <Boxes className="h-3.5 w-3.5" />
                  <span>
                    {isVi
                      ? "Tồn kho ban đầu (Chỉ thiết lập khi tạo mới)"
                      : "Initial Stock (Creation-time only)"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {isVi
                    ? "Số lượng này sẽ được ghi nhận làm tồn kho khởi tạo. Mọi điều chỉnh sau khi tạo cần thực hiện thông qua mục Quản lý kho."
                    : "This establishes the initial stock quantity for the new variant. Subsequent stock adjustments must be performed through Inventory Management."}
                </p>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={newForm.initialStock}
                  onChange={(e) =>
                    setNewForm((prev) => ({
                      ...prev,
                      initialStock: e.target.value,
                    }))
                  }
                  error={fieldErrors.initialStock?.[0]}
                  disabled={isPending}
                />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddOpen(false)}
                  disabled={isPending}
                >
                  {isVi ? "Hủy" : "Cancel"}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isPending || !newForm.name.trim()}
                  className="bg-amber text-primary-foreground hover:bg-amber/90"
                >
                  {isPending
                    ? isVi
                      ? "Đang lưu..."
                      : "Creating..."
                    : isVi
                      ? "Tạo phiên bản"
                      : "Create Variant"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* EDIT VARIANT MODAL (NO STOCK FIELDS PER CONTRACT)             */}
      {/* ------------------------------------------------------------- */}
      {editingVariant && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-variant-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
        >
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
            onClick={() => !isPending && setEditingVariant(null)}
            aria-hidden="true"
          />

          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber/10 text-amber">
                    <Pencil className="h-4 w-4" />
                  </div>
                  <h3
                    id="edit-variant-title"
                    className="font-serif text-lg font-semibold text-foreground"
                  >
                    {isVi ? "Chỉnh sửa phiên bản" : "Edit Variant Details"}
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {editingVariant.name}
                  </span>
                  {" — "}
                  <span>{productName}</span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => !isPending && setEditingVariant(null)}
                disabled={isPending}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                aria-label={isVi ? "Đóng" : "Close"}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Error Banner */}
            {modalError && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateVariant} className="space-y-4">
              <Input
                label={isVi ? "Tên phiên bản *" : "Variant Name *"}
                value={editForm.name}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, name: e.target.value }))
                }
                error={fieldErrors.name?.[0]}
                required
                disabled={isPending}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label={isVi ? "Kích cỡ / Trọng lượng" : "Size / Weight"}
                  value={editForm.size}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, size: e.target.value }))
                  }
                  placeholder="220g / 7.7 oz"
                  error={fieldErrors.size?.[0]}
                  disabled={isPending}
                />
                <Input
                  label={isVi ? "Thời gian cháy" : "Burn Time"}
                  value={editForm.burnTime}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      burnTime: e.target.value,
                    }))
                  }
                  placeholder="50-55 hours"
                  error={fieldErrors.burnTime?.[0]}
                  disabled={isPending}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label={isVi ? "Đơn giá (USD) *" : "Price (USD) *"}
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.price}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, price: e.target.value }))
                  }
                  error={fieldErrors.price?.[0]}
                  required
                  disabled={isPending}
                />
                <Input
                  label={isVi ? "Mã SKU" : "SKU"}
                  value={editForm.sku}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, sku: e.target.value }))
                  }
                  error={fieldErrors.sku?.[0]}
                  disabled={isPending}
                />
              </div>

              {/* Explicit Stock Boundary Notice (READ ONLY) */}
              <div className="rounded-xl border border-border bg-muted/20 p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <Boxes className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{isVi ? "Tồn kho hiện tại:" : "Current Stock:"}</span>
                    <span className="font-mono font-bold">
                      {editingVariant.stockQuantity}
                    </span>
                  </div>
                  <StockStatusBadge
                    stock={editingVariant.stockQuantity}
                    locale={locale}
                  />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {isVi
                    ? "Tồn kho không thể chỉnh sửa trực tiếp tại mục này. Để điều chỉnh số lượng tồn kho hoặc nhập lý do điều chỉnh, vui lòng dùng trang Quản lý kho."
                    : "Stock cannot be altered here. To adjust stock or log restock reasons, please use Inventory Management."}
                </p>
                <div className="pt-1">
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link
                      href="/admin/inventory"
                      className="inline-flex items-center justify-center gap-1.5 text-xs text-amber"
                    >
                      <Boxes className="h-3.5 w-3.5" />
                      <span>
                        {isVi ? "Đến Quản lý kho" : "Go to Inventory Management"}
                      </span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingVariant(null)}
                  disabled={isPending}
                >
                  {isVi ? "Hủy" : "Cancel"}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isPending || !editForm.name.trim()}
                  className="bg-amber text-primary-foreground hover:bg-amber/90"
                >
                  {isPending
                    ? isVi
                      ? "Đang lưu..."
                      : "Saving..."
                    : isVi
                      ? "Lưu thay đổi"
                      : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* DELETE VARIANT CONFIRMATION MODAL                             */}
      {/* ------------------------------------------------------------- */}
      {deletingVariant && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-variant-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
        >
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
            onClick={() => !isPending && setDeletingVariant(null)}
            aria-hidden="true"
          />

          <div className="relative w-full max-w-md rounded-2xl border border-destructive/40 bg-card p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3
                  id="delete-variant-title"
                  className="font-serif text-lg font-semibold text-foreground"
                >
                  {isVi ? "Xóa phiên bản này?" : "Delete Variant?"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {deletingVariant.name}
                  </span>{" "}
                  {deletingVariant.sku && `(${deletingVariant.sku})`}
                </p>
              </div>
            </div>

            {/* Error Banner */}
            {modalError && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{modalError}</span>
              </div>
            )}

            <p className="text-xs text-muted-foreground leading-relaxed">
              {isVi
                ? "Hành động này không thể hoàn tác. Các phiên bản đã từng phát sinh đơn hàng từ khách không thể xóa khỏi hệ thống. Nếu không muốn bán nữa, vui lòng cập nhật trạng thái sản phẩm cha thành ẩn."
                : "This action cannot be undone. Variants referenced in customer order history cannot be deleted. If you no longer wish to offer it, deactivate the parent product instead."}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDeletingVariant(null)}
                disabled={isPending}
              >
                {isVi ? "Hủy" : "Cancel"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDeleteVariant}
                disabled={isPending}
              >
                {isPending
                  ? isVi
                    ? "Đang xóa..."
                    : "Deleting..."
                  : isVi
                    ? "Xác nhận xóa"
                    : "Confirm Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
