"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  CheckCircle2,
  Flame,
  Layers,
  Plus,
  RefreshCw,
  Sparkles,
  Tag,
  Trash2,
} from "lucide-react";
import { useAuthz } from "@/hooks/use-authz";
import {
  createProductAction,
  updateProductAction,
  deleteProductAction,
} from "@/app/actions/products";
import type { CreateVariantInput } from "@/lib/validations/product";
import { slugify } from "@/lib/utils";
import { Button, Input } from "@/components/ui";
import { ScentNotesInput } from "./scent-notes-input";
import type { Product, ScentCategory } from "@/types";

export interface ProductFormProps {
  mode: "create" | "edit";
  product?: Product;
  locale?: string;
  className?: string;
}

interface DraftVariant {
  id: string; // temporary client ID
  name: string;
  size: string;
  burnTime: string;
  price: string;
  sku: string;
  initialStock: string;
}

const CATEGORY_OPTIONS: {
  value: ScentCategory;
  labelEn: string;
  labelVi: string;
  descEn: string;
  descVi: string;
}[] = [
  {
    value: "floral",
    labelEn: "Floral",
    labelVi: "Hương Hoa",
    descEn: "Delicate blooms, jasmine, rose, neroli",
    descVi: "Hoa nhài, hoa hồng, hoa cam thanh tao",
  },
  {
    value: "woody",
    labelEn: "Woody",
    labelVi: "Hương Gỗ",
    descEn: "Sandalwood, cedar, vetiver, amber",
    descVi: "Gỗ đàn hương, tuyết tùng, cỏ hương bài",
  },
  {
    value: "fresh",
    labelEn: "Fresh",
    labelVi: "Tươi Mát",
    descEn: "Citrus, bergamot, sea salt, green tea",
    descVi: "Cam bergamot, muối biển, trà xanh tươi mát",
  },
  {
    value: "warm",
    labelEn: "Warm",
    labelVi: "Ấm Áp",
    descEn: "Vanilla, tonka, cinnamon, spiced amber",
    descVi: "Vani, đậu tonka, quế, hổ phách nồng ấm",
  },
];

export function ProductForm({
  mode,
  product,
  locale = "en",
  className,
}: ProductFormProps) {
  const isVi = locale === "vi";
  const router = useRouter();
  const { can } = useAuthz();

  const canCreate = can("product.create");
  const canUpdate = can("product.update");
  const canDelete = can("product.delete");

  // Metadata form state
  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(
    mode === "edit"
  );
  const [tagline, setTagline] = useState(product?.tagline ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [category, setCategory] = useState<ScentCategory>(
    product?.category ?? "floral"
  );
  const [basePrice, setBasePrice] = useState<string>(
    product ? product.basePrice.toString() : "65.00"
  );
  const [compareAtPrice, setCompareAtPrice] = useState<string>(
    product?.compareAtPrice ? product.compareAtPrice.toString() : ""
  );
  const [isActive, setIsActive] = useState<boolean>(
    product ? product.isActive : true
  );
  const [isFeatured, setIsFeatured] = useState<boolean>(
    product ? product.isFeatured : false
  );

  // Scent notes
  const [scentTop, setScentTop] = useState<string[]>(
    product?.scentTop ?? []
  );
  const [scentHeart, setScentHeart] = useState<string[]>(
    product?.scentHeart ?? []
  );
  const [scentBase, setScentBase] = useState<string[]>(
    product?.scentBase ?? []
  );

  // Initial variants for CREATE mode only
  const [draftVariants, setDraftVariants] = useState<DraftVariant[]>([
    {
      id: "var-1",
      name: "Standard 220g",
      size: "220g / 7.7 oz",
      burnTime: "50-55 hours",
      price: product ? product.basePrice.toString() : "65.00",
      sku: "",
      initialStock: "0",
    },
  ]);

  // Feedback states
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string[] | undefined>
  >({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Delete modal state (Edit mode)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Auto-sync slug from name in create mode if user hasn't manually edited slug
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setName(newName);
    if (!isSlugManuallyEdited && mode === "create") {
      setSlug(slugify(newName));
    }
  };

  const handleRegenerateSlug = () => {
    setSlug(slugify(name));
    setIsSlugManuallyEdited(false);
  };

  // Draft variant handlers (Create mode)
  const handleAddDraftVariant = () => {
    const nextIdx = draftVariants.length + 1;
    setDraftVariants((prev) => [
      ...prev,
      {
        id: `var-${Date.now()}`,
        name: nextIdx === 2 ? "Grand 450g" : `Variant ${nextIdx}`,
        size: nextIdx === 2 ? "450g / 15.8 oz" : "",
        burnTime: nextIdx === 2 ? "100-110 hours" : "",
        price: basePrice || "65.00",
        sku: "",
        initialStock: "0",
      },
    ]);
  };

  const handleUpdateDraftVariant = (
    id: string,
    field: keyof DraftVariant,
    val: string
  ) => {
    setDraftVariants((prev) =>
      prev.map((v) => (v.id === id ? { ...v, [field]: val } : v))
    );
  };

  const handleRemoveDraftVariant = (id: string) => {
    if (draftVariants.length <= 1) return;
    setDraftVariants((prev) => prev.filter((v) => v.id !== id));
  };

  // Form submission handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    setFieldErrors({});

    const basePriceNum = parseFloat(basePrice);
    if (isNaN(basePriceNum) || basePriceNum < 0) {
      setFieldErrors((prev) => ({
        ...prev,
        basePrice: [
          isVi
            ? "Giá cơ bản phải là số không âm."
            : "Base price must be a non-negative number.",
        ],
      }));
      return;
    }

    let compareAtPriceNum: number | null = null;
    if (compareAtPrice.trim()) {
      const parsed = parseFloat(compareAtPrice);
      if (isNaN(parsed) || parsed < 0) {
        setFieldErrors((prev) => ({
          ...prev,
          compareAtPrice: [
            isVi
              ? "Giá so sánh phải là số không âm."
              : "Compare-at price must be non-negative.",
          ],
        }));
        return;
      }
      compareAtPriceNum = parsed;
    }

    if (mode === "create") {
      // Validate draft variants
      const preparedVariants: CreateVariantInput[] = [];
      for (let i = 0; i < draftVariants.length; i++) {
        const v = draftVariants[i];
        if (!v.name.trim()) {
          setGeneralError(
            isVi
              ? `Phiên bản #${i + 1} chưa có tên.`
              : `Variant #${i + 1} requires a name.`
          );
          return;
        }
        const vPrice = parseFloat(v.price);
        if (isNaN(vPrice) || vPrice < 0) {
          setGeneralError(
            isVi
              ? `Giá của phiên bản "${v.name}" không hợp lệ.`
              : `Price for variant "${v.name}" must be non-negative.`
          );
          return;
        }
        const vStock = parseInt(v.initialStock, 10);
        if (isNaN(vStock) || vStock < 0) {
          setGeneralError(
            isVi
              ? `Tồn kho ban đầu của "${v.name}" phải là số nguyên không âm.`
              : `Initial stock for "${v.name}" must be a non-negative integer.`
          );
          return;
        }
        preparedVariants.push({
          name: v.name.trim(),
          size: v.size.trim() || null,
          burnTime: v.burnTime.trim() || null,
          price: vPrice,
          sku: v.sku.trim() || null,
          initialStock: vStock,
        });
      }

      startTransition(async () => {
        const result = await createProductAction({
          slug: slug.trim(),
          name: name.trim(),
          tagline: tagline.trim() || null,
          description: description.trim() || null,
          category,
          basePrice: basePriceNum,
          compareAtPrice: compareAtPriceNum,
          isActive,
          isFeatured,
          scentTop,
          scentHeart,
          scentBase,
          images: [],
          variants: preparedVariants,
        });

        if (result.error) {
          setGeneralError(result.error);
          if (result.fieldErrors) {
            setFieldErrors(result.fieldErrors);
          }
          return;
        }

        if (result.success && result.productId) {
          setSuccessMessage(
            isVi
              ? "Tạo sản phẩm thành công! Đang chuyển hướng..."
              : "Product created successfully! Redirecting..."
          );
          router.push(`/admin/products/${result.productId}`);
        }
      });
    } else {
      // Edit Mode
      if (!product) return;

      startTransition(async () => {
        const result = await updateProductAction(product.id, {
          slug: slug.trim(),
          name: name.trim(),
          tagline: tagline.trim() || null,
          description: description.trim() || null,
          category,
          basePrice: basePriceNum,
          compareAtPrice: compareAtPriceNum,
          isActive,
          isFeatured,
          scentTop,
          scentHeart,
          scentBase,
          images: product.images ?? [],
        });

        if (result.error) {
          setGeneralError(result.error);
          if (result.fieldErrors) {
            setFieldErrors(result.fieldErrors);
          }
          return;
        }

        if (result.success) {
          setSuccessMessage(
            isVi
              ? "Đã lưu cập nhật thông tin sản phẩm thành công."
              : "Product details saved successfully."
          );
          router.refresh();
          setTimeout(() => setSuccessMessage(null), 3500);
        }
      });
    }
  };

  // Product Delete Handler
  const handleDeleteProduct = () => {
    if (!product) return;
    setDeleteError(null);

    startTransition(async () => {
      const result = await deleteProductAction(product.id);

      if (result.error) {
        setDeleteError(result.error);
        return;
      }

      if (result.success) {
        setIsDeleteModalOpen(false);
        router.push("/admin/products");
      }
    });
  };

  return (
    <div className={className}>
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Global Feedback Banner */}
        {generalError && (
          <div className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive animate-in fade-in duration-200">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">
                {isVi ? "Không thể lưu sản phẩm:" : "Failed to save product:"}
              </p>
              <p>{generalError}</p>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="flex items-center gap-2.5 rounded-xl border border-sage/40 bg-sage/10 p-4 text-xs text-sage animate-in fade-in duration-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="font-medium">{successMessage}</span>
          </div>
        )}

        {/* Section 1: Core Identity */}
        <section className="rounded-2xl border border-border bg-card/40 p-6 space-y-6">
          <div className="flex items-center gap-2.5 border-b border-border pb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber/10 text-amber">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-semibold text-foreground">
                {isVi ? "Thông tin cơ bản" : "Core Information"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isVi
                  ? "Tên, định danh URL và mô tả nghệ thuật của sáng tạo nến thơm."
                  : "Name, URL slug, and artistic descriptions for the candle creation."}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label={isVi ? "Tên sản phẩm *" : "Product Name *"}
                value={name}
                onChange={handleNameChange}
                placeholder={isVi ? "Ví dụ: Solenne Aura" : "e.g. Solenne Aura"}
                error={fieldErrors.name?.[0]}
                required
                disabled={isPending}
              />

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="product-slug"
                    className="text-sm font-medium text-foreground"
                  >
                    {isVi ? "Đường dẫn định danh (Slug) *" : "URL Slug *"}
                  </label>
                  {mode === "create" && (
                    <button
                      type="button"
                      onClick={handleRegenerateSlug}
                      className="text-xs text-amber hover:underline inline-flex items-center gap-1"
                      title={
                        isVi
                          ? "Tạo lại slug từ tên"
                          : "Regenerate slug from product name"
                      }
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>{isVi ? "Tạo tự động" : "Auto-generate"}</span>
                    </button>
                  )}
                </div>
                <input
                  id="product-slug"
                  type="text"
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setIsSlugManuallyEdited(true);
                  }}
                  placeholder="solenne-aura"
                  className="flex h-11 w-full rounded-lg border border-border bg-transparent px-4 py-2 font-mono text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent disabled:opacity-50 transition-colors"
                  required
                  disabled={isPending}
                />
                {fieldErrors.slug?.[0] ? (
                  <p className="text-xs text-destructive">
                    {fieldErrors.slug[0]}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground font-mono">
                    /products/{slug || "slug"}
                  </p>
                )}
              </div>
            </div>

            <Input
              label={isVi ? "Khẩu hiệu / Giới thiệu ngắn" : "Tagline / Short Hook"}
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder={
                isVi
                  ? "Ví dụ: Ánh sáng trầm mặc, gợi mở những chiều hoài niệm"
                  : "e.g. A serene warmth that evokes quiet nostalgia"
              }
              error={fieldErrors.tagline?.[0]}
              disabled={isPending}
            />

            <div className="space-y-1.5">
              <label
                htmlFor="product-description"
                className="text-sm font-medium text-foreground"
              >
                {isVi ? "Mô tả chi tiết" : "Detailed Description"}
              </label>
              <textarea
                id="product-description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  isVi
                    ? "Mô tả nguồn cảm hứng, tầng hương và không gian phù hợp để thưởng thức..."
                    : "Describe the artistic inspiration, atmospheric qualities, and sensory journey..."
                }
                className="flex w-full rounded-lg border border-border bg-transparent px-4 py-2.5 text-sm transition-colors duration-200 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isPending}
              />
              {fieldErrors.description?.[0] && (
                <p className="text-xs text-destructive">
                  {fieldErrors.description[0]}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Section 2: Category & Publication */}
        <section className="rounded-2xl border border-border bg-card/40 p-6 space-y-6">
          <div className="flex items-center gap-2.5 border-b border-border pb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber/10 text-amber">
              <Tag className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-semibold text-foreground">
                {isVi ? "Nhóm hương & Trạng thái" : "Scent Family & Publication"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isVi
                  ? "Chọn nhóm hương đại diện và trạng thái hiển thị tại cửa hàng."
                  : "Select the primary fragrance family and catalog visibility states."}
              </p>
            </div>
          </div>

          {/* Scent Category Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {isVi ? "Nhóm hương chính *" : "Fragrance Category *"}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {CATEGORY_OPTIONS.map((opt) => {
                const isSelected = category === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCategory(opt.value)}
                    disabled={isPending}
                    className={`rounded-xl border p-3.5 text-left transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? "border-amber bg-amber/10 ring-1 ring-amber shadow-sm"
                        : "border-border bg-card/40 hover:border-amber/40 hover:bg-card/70"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-foreground">
                        {isVi ? opt.labelVi : opt.labelEn}
                      </span>
                      {isSelected && (
                        <CheckCircle2 className="h-4 w-4 text-amber" />
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                      {isVi ? opt.descVi : opt.descEn}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pricing Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <Input
              label={isVi ? "Giá cơ bản (USD) *" : "Base Price (USD) *"}
              type="number"
              step="0.01"
              min="0"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
              placeholder="65.00"
              error={fieldErrors.basePrice?.[0]}
              required
              disabled={isPending}
            />

            <Input
              label={
                isVi
                  ? "Giá so sánh / Giá gốc (USD)"
                  : "Compare-at Price (USD)"
              }
              type="number"
              step="0.01"
              min="0"
              value={compareAtPrice}
              onChange={(e) => setCompareAtPrice(e.target.value)}
              placeholder="75.00"
              error={fieldErrors.compareAtPrice?.[0]}
              disabled={isPending}
            />
          </div>

          {/* Publication Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {/* Active Toggle */}
            <div className="flex items-start gap-3 rounded-xl border border-border bg-card/60 p-4">
              <input
                id="is-active-toggle"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={isPending}
                className="mt-1 h-4 w-4 rounded border-border text-amber focus:ring-amber"
              />
              <label htmlFor="is-active-toggle" className="cursor-pointer space-y-0.5">
                <span className="text-sm font-medium text-foreground block">
                  {isVi ? "Đang mở bán (Active)" : "Active in Boutique"}
                </span>
                <span className="text-xs text-muted-foreground block leading-relaxed">
                  {isVi
                    ? "Hiển thị công khai trong danh mục và cho phép khách mua sắm."
                    : "Publicly visible in boutique collections and available to purchase."}
                </span>
              </label>
            </div>

            {/* Featured Toggle */}
            <div className="flex items-start gap-3 rounded-xl border border-border bg-card/60 p-4">
              <input
                id="is-featured-toggle"
                type="checkbox"
                checked={isFeatured}
                onChange={(e) => setIsFeatured(e.target.checked)}
                disabled={isPending}
                className="mt-1 h-4 w-4 rounded border-border text-amber focus:ring-amber"
              />
              <label htmlFor="is-featured-toggle" className="cursor-pointer space-y-0.5">
                <span className="text-sm font-medium text-foreground block">
                  {isVi ? "Sản phẩm nổi bật (Featured)" : "Featured Collection"}
                </span>
                <span className="text-xs text-muted-foreground block leading-relaxed">
                  {isVi
                    ? "Ghim tại vị trí trang trọng trên trang chủ và bộ sưu tập tiêu biểu."
                    : "Prominently featured on the storefront homepage and curated showcases."}
                </span>
              </label>
            </div>
          </div>
        </section>

        {/* Section 3: Scent Architecture */}
        <section className="rounded-2xl border border-border bg-card/40 p-6 space-y-6">
          <div className="flex items-center gap-2.5 border-b border-border pb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber/10 text-amber">
              <Flame className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-semibold text-foreground">
                {isVi ? "Cấu trúc tầng hương" : "Scent Architecture"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isVi
                  ? "Từng lớp hương đầu, hương giữa và hương cuối theo chuẩn nước hoa xa xỉ."
                  : "Top, heart, and base notes composing the olfactive narrative."}
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <ScentNotesInput
              label={isVi ? "Hương đầu (Top Notes)" : "Top Notes"}
              description={
                isVi
                  ? "Ấn tượng ban đầu khi thắp sáng (ví dụ: Bergamot, Yuzu)"
                  : "First luminous impression (e.g. Bergamot, Yuzu)"
              }
              notes={scentTop}
              onChange={setScentTop}
              locale={locale}
              noteColor="sage"
              placeholder={isVi ? "Thêm nốt hương đầu..." : "Add a top note..."}
              error={fieldErrors.scentTop?.[0]}
            />

            <ScentNotesInput
              label={isVi ? "Hương giữa (Heart Notes)" : "Heart Notes"}
              description={
                isVi
                  ? "Trọng tâm linh hồn của mùi hương (ví dụ: Hoa nhài, Hoa huệ)"
                  : "Core sensory soul of the candle (e.g. Jasmine, Violet)"
              }
              notes={scentHeart}
              onChange={setScentHeart}
              locale={locale}
              noteColor="blush"
              placeholder={
                isVi ? "Thêm nốt hương giữa..." : "Add a heart note..."
              }
              error={fieldErrors.scentHeart?.[0]}
            />

            <ScentNotesInput
              label={isVi ? "Hương cuối (Base Notes)" : "Base Notes"}
              description={
                isVi
                  ? "Dư âm sâu lắng đọng lại trong không gian (ví dụ: Đàn hương, Hổ phách)"
                  : "Long-lasting lingering warmth (e.g. Sandalwood, Amber)"
              }
              notes={scentBase}
              onChange={setScentBase}
              locale={locale}
              noteColor="amber"
              placeholder={
                isVi ? "Thêm nốt hương cuối..." : "Add a base note..."
              }
              error={fieldErrors.scentBase?.[0]}
            />
          </div>
        </section>

        {/* Section 4: Initial Variants (CREATE MODE ONLY) */}
        {mode === "create" && (
          <section className="rounded-2xl border border-border bg-card/40 p-6 space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber/10 text-amber">
                  <Layers className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-serif text-lg font-semibold text-foreground">
                    {isVi
                      ? "Khởi tạo phiên bản sản phẩm"
                      : "Initial Product Variants"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {isVi
                      ? "Thiết lập một hoặc nhiều phiên bản kèm tồn kho khởi tạo."
                      : "Configure one or more variants with creation-time initial stock."}
                  </p>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddDraftVariant}
                className="inline-flex items-center gap-1.5 self-start sm:self-auto text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{isVi ? "Thêm quy cách" : "Add Another Variant"}</span>
              </Button>
            </div>

            {/* Creation-time stock boundary notice */}
            <div className="rounded-xl border border-amber/30 bg-amber/5 p-3.5 flex items-start gap-2.5">
              <Boxes className="h-4 w-4 text-amber shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground leading-relaxed">
                <span className="font-medium text-foreground">
                  {isVi
                    ? "Nguyên tắc quản lý kho: "
                    : "Inventory Management Policy: "}
                </span>
                {isVi
                  ? "Tồn kho ban đầu (Initial Stock) chỉ được thiết lập ngay tại bước tạo mới này. Sau khi sản phẩm được tạo, mọi điều chỉnh số lượng tồn kho chỉ được thực hiện thông qua trang Quản lý kho."
                  : "Initial stock is set once during product creation. Once created, all inventory changes must be processed through the dedicated Inventory Management workspace."}
              </div>
            </div>

            <div className="space-y-4">
              {draftVariants.map((v, index) => (
                <div
                  key={v.id}
                  className="rounded-xl border border-border bg-card/60 p-4 space-y-4"
                >
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {isVi
                        ? `Phiên bản #${index + 1}`
                        : `Variant #${index + 1}`}
                    </span>
                    {draftVariants.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveDraftVariant(v.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                        aria-label={
                          isVi ? "Xóa phiên bản này" : "Remove this variant"
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <Input
                      label={isVi ? "Tên phiên bản *" : "Variant Name *"}
                      value={v.name}
                      onChange={(e) =>
                        handleUpdateDraftVariant(v.id, "name", e.target.value)
                      }
                      placeholder="Standard 220g"
                      required
                      disabled={isPending}
                    />

                    <Input
                      label={isVi ? "Trọng lượng / Dung tích" : "Size"}
                      value={v.size}
                      onChange={(e) =>
                        handleUpdateDraftVariant(v.id, "size", e.target.value)
                      }
                      placeholder="220g / 7.7 oz"
                      disabled={isPending}
                    />

                    <Input
                      label={isVi ? "Thời gian cháy" : "Burn Time"}
                      value={v.burnTime}
                      onChange={(e) =>
                        handleUpdateDraftVariant(
                          v.id,
                          "burnTime",
                          e.target.value
                        )
                      }
                      placeholder="50-55 hours"
                      disabled={isPending}
                    />

                    <Input
                      label={isVi ? "Đơn giá (USD) *" : "Price (USD) *"}
                      type="number"
                      step="0.01"
                      min="0"
                      value={v.price}
                      onChange={(e) =>
                        handleUpdateDraftVariant(v.id, "price", e.target.value)
                      }
                      required
                      disabled={isPending}
                    />

                    <Input
                      label={isVi ? "Mã SKU" : "SKU"}
                      value={v.sku}
                      onChange={(e) =>
                        handleUpdateDraftVariant(v.id, "sku", e.target.value)
                      }
                      placeholder="SLN-AURA-220"
                      disabled={isPending}
                    />

                    <Input
                      label={
                        isVi ? "Tồn kho ban đầu *" : "Initial Stock *"
                      }
                      type="number"
                      step="1"
                      min="0"
                      value={v.initialStock}
                      onChange={(e) =>
                        handleUpdateDraftVariant(
                          v.id,
                          "initialStock",
                          e.target.value
                        )
                      }
                      required
                      disabled={isPending}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Section 5: Form Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border pt-6">
          <Button asChild variant="outline" size="sm">
            <Link
              href="/admin/products"
              className="inline-flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>
                {isVi ? "Trở về danh sách" : "Back to Products"}
              </span>
            </Link>
          </Button>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button
              type="submit"
              disabled={isPending || (mode === "create" ? !canCreate : !canUpdate)}
              className="w-full sm:w-auto bg-amber text-primary-foreground hover:bg-amber/90"
            >
              {isPending
                ? isVi
                  ? "Đang lưu..."
                  : "Saving..."
                : mode === "create"
                  ? isVi
                    ? "Tạo sản phẩm"
                    : "Create Product"
                  : isVi
                    ? "Lưu thay đổi"
                    : "Save Product Details"}
            </Button>
          </div>
        </div>
      </form>

      {/* ------------------------------------------------------------- */}
      {/* DANGER ZONE: PRODUCT DELETION (EDIT MODE ONLY)                */}
      {/* ------------------------------------------------------------- */}
      {mode === "edit" && product && (
        <div className="mt-12 rounded-2xl border border-destructive/30 bg-destructive/5 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-serif text-lg font-semibold text-destructive">
                {isVi ? "Vùng nguy hiểm: Xóa sản phẩm" : "Danger Zone: Delete Product"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-xl leading-relaxed">
                {isVi
                  ? "Hệ thống bảo vệ lịch sử đơn hàng của khách. Nếu sản phẩm hoặc phiên bản đã từng được đặt mua, việc xóa sẽ bị ngăn chặn hoàn toàn trên máy chủ. Trong trường hợp đó, quý khách vui lòng chọn trạng thái ẩn (Inactive)."
                  : "Historical customer order data is strictly protected. If this product or any of its variants are referenced in past orders, server-side validation will reject deletion. In that case, deactivate the product instead."}
              </p>
            </div>

            {canDelete && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => {
                  setDeleteError(null);
                  setIsDeleteModalOpen(true);
                }}
                className="self-start sm:self-auto shrink-0"
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                <span>{isVi ? "Xóa sản phẩm" : "Delete Product"}</span>
              </Button>
            )}
          </div>

          {/* Delete Confirmation Modal */}
          {isDeleteModalOpen && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-product-title"
              className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
            >
              <div
                className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
                onClick={() => !isPending && setIsDeleteModalOpen(false)}
                aria-hidden="true"
              />

              <div className="relative w-full max-w-lg rounded-2xl border border-destructive/40 bg-card p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h3
                      id="delete-product-title"
                      className="font-serif text-lg font-semibold text-foreground"
                    >
                      {isVi ? "Xác nhận xóa sản phẩm?" : "Delete this product?"}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {product.name}
                      </span>{" "}
                      ({product.slug})
                    </p>
                  </div>
                </div>

                {deleteError && (
                  <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{deleteError}</span>
                  </div>
                )}

                <div className="rounded-xl border border-border bg-muted/20 p-3.5 text-xs text-muted-foreground space-y-2 leading-relaxed">
                  <p>
                    {isVi
                      ? "Hành động này sẽ xóa vĩnh viễn sản phẩm cùng tất cả các phiên bản trực thuộc."
                      : "This action will permanently delete the product and all of its associated variants."}
                  </p>
                  <p className="font-medium text-foreground">
                    {isVi
                      ? "Lưu ý: Nếu sản phẩm đã phát sinh đơn hàng, máy chủ sẽ từ chối xóa và yêu cầu chuyển sang trạng thái Ẩn."
                      : "Notice: If any variant has appeared in customer orders, the server will block deletion and require deactivation instead."}
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsDeleteModalOpen(false)}
                    disabled={isPending}
                  >
                    {isVi ? "Hủy bỏ" : "Cancel"}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteProduct}
                    disabled={isPending}
                  >
                    {isPending
                      ? isVi
                        ? "Đang xóa..."
                        : "Deleting..."
                      : isVi
                        ? "Xác nhận xóa vĩnh viễn"
                        : "Confirm Delete"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
