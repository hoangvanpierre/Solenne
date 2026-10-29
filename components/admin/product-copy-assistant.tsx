"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Loader2, Sparkles, X } from "lucide-react";
import {
  generateProductCopyAction,
  type ProductCopyActionState,
  type ProductCopyErrorCode,
} from "@/app/actions/product-copy";
import type {
  ProductCopyLanguage,
  ProductCopyNotes,
  ProductCopyTarget,
  ProductCopyTask,
} from "@/lib/admin-assistant/product-copy";
import type { ScentCategory } from "@/types";

// ---------------------------------------------------------------------------
// "Write with assistant" for the product form (Phase 2, part B).
//
// UI only. The panel asks a server action for copy, shows it in a preview, and
// offers Apply / Copy / Discard. Apply fills the form field through a callback;
// nothing is saved until the operator presses the form's own Save button.
//
// Apply is disabled for Vietnamese output: `products` has no Vietnamese columns
// yet, so Vietnamese copy can be copied but not stored (see the Phase 2 report's
// migration proposal). Copy is always available.
// ---------------------------------------------------------------------------

export interface ProductCopyAssistantProps {
  target: ProductCopyTarget;
  /** Mirrors ProductFormProps.mode; mapped to create/update on the wire. */
  mode: "create" | "edit";
  locale: string;
  productName: string;
  category: ScentCategory;
  /** Description only. */
  currentText?: string;
  notes: ProductCopyNotes;
  disabled?: boolean;
  onApplyText?: (text: string) => void;
  onApplyNotes?: (notes: ProductCopyNotes) => void;
}

function errorMessage(code: ProductCopyErrorCode, isVi: boolean): string {
  const messages: Record<ProductCopyErrorCode, { en: string; vi: string }> = {
    unauthenticated: {
      en: "Your session has ended. Sign in again.",
      vi: "Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.",
    },
    forbidden: {
      en: "Your role cannot edit product copy.",
      vi: "Vai trò của bạn không được sửa nội dung sản phẩm.",
    },
    validation: {
      en: "That request could not be read. Please try again.",
      vi: "Yêu cầu không đọc được. Vui lòng thử lại.",
    },
    unsupported: {
      en: "Add the scent notes to the form first — the assistant will not invent them.",
      vi: "Hãy nhập nốt hương vào biểu mẫu trước — trợ lý không tự tạo nốt hương mới.",
    },
    rate_limited: {
      en: "Too many requests. Please wait a minute and try again.",
      vi: "Bạn đã yêu cầu quá nhiều lần. Vui lòng đợi một phút rồi thử lại.",
    },
    unparsed: {
      en: "The assistant's reply could not be read. Try again.",
      vi: "Không đọc được câu trả lời của trợ lý. Hãy thử lại.",
    },
    shape: {
      en: "The assistant's reply had the wrong shape. Try again.",
      vi: "Câu trả lời của trợ lý sai định dạng. Hãy thử lại.",
    },
    too_short: {
      en: "That draft is too short. Try again.",
      vi: "Bản nháp quá ngắn. Hãy thử lại.",
    },
    too_long: {
      en: "That draft is too long. Try again.",
      vi: "Bản nháp quá dài. Hãy thử lại.",
    },
    layer_mismatch: {
      en: "The draft changed the number of scent notes, so it was discarded.",
      vi: "Bản nháp làm thay đổi số nốt hương nên đã bị bỏ.",
    },
    unknown_notes: {
      en: "The draft introduced scent notes that are not in the form, so it was discarded.",
      vi: "Bản nháp thêm nốt hương không có trong biểu mẫu nên đã bị bỏ.",
    },
    unavailable: {
      en: "The assistant is unavailable right now.",
      vi: "Trợ lý tạm thời không khả dụng.",
    },
  };

  const entry = messages[code];
  return isVi ? entry.vi : entry.en;
}

function notesToText(notes: ProductCopyNotes, isVi: boolean): string {
  return [
    `${isVi ? "Hương đầu" : "Top"}: ${notes.top.join(", ")}`,
    `${isVi ? "Hương giữa" : "Heart"}: ${notes.heart.join(", ")}`,
    `${isVi ? "Hương cuối" : "Base"}: ${notes.base.join(", ")}`,
  ].join("\n");
}

export function ProductCopyAssistant({
  target,
  mode,
  locale,
  productName,
  category,
  currentText = "",
  notes,
  disabled = false,
  onApplyText,
  onApplyNotes,
}: ProductCopyAssistantProps) {
  const isVi = locale === "vi";
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ProductCopyActionState | null>(null);
  const [resultLanguage, setResultLanguage] =
    useState<ProductCopyLanguage>("en");
  const [errorCode, setErrorCode] = useState<ProductCopyErrorCode | null>(null);
  const [copied, setCopied] = useState(false);

  const hasName = productName.trim().length > 0;
  const hasNotes =
    notes.top.length > 0 || notes.heart.length > 0 || notes.base.length > 0;
  const hasCurrent = currentText.trim().length > 0;

  const run = (task: ProductCopyTask, targetLanguage: ProductCopyLanguage) => {
    if (isPending || disabled || !hasName) return;

    const sourceLanguage: ProductCopyLanguage =
      task === "translate"
        ? targetLanguage === "en"
          ? "vi"
          : "en"
        : targetLanguage;

    setErrorCode(null);
    setCopied(false);

    startTransition(async () => {
      const state = await generateProductCopyAction({
        task,
        target,
        sourceLanguage,
        targetLanguage,
        mode: mode === "create" ? "create" : "update",
        productName: productName.trim(),
        category,
        currentText: target === "description" ? currentText : "",
        scentTop: notes.top,
        scentHeart: notes.heart,
        scentBase: notes.base,
      });

      if (!state.ok) {
        setResult(null);
        setErrorCode(state.code ?? "unavailable");
        return;
      }

      setResult(state);
      setResultLanguage(targetLanguage);
    });
  };

  const draftText = result
    ? result.text ?? (result.notes ? notesToText(result.notes, isVi) : "")
    : "";

  const handleCopy = async () => {
    if (!draftText) return;
    try {
      await navigator.clipboard.writeText(draftText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard permission denied — the preview stays selectable.
    }
  };

  const handleApply = () => {
    if (!result?.applyable) return;

    if (target === "description" && result.text) {
      onApplyText?.(result.text);
    } else if (target === "scentNotes" && result.notes) {
      onApplyNotes?.(result.notes);
    }

    setResult(null);
    setErrorCode(null);
  };

  const canGenerate = target === "description" && hasName;
  const canImprove =
    hasName && (target === "description" ? hasCurrent : hasNotes);
  const canTranslate = canImprove;

  const buttonClass =
    "inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:border-amber/60 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/60 disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-transparent";

  return (
    <div className="mt-2 rounded-xl border border-dashed border-border bg-muted/20 p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.08em] text-muted-foreground">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          {isVi ? "Viết cùng trợ lý" : "Write with assistant"}
        </span>

        {isPending ? (
          <Loader2
            className="h-3 w-3 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        ) : null}
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {canGenerate ? (
          <button
            type="button"
            onClick={() => run("generate", "en")}
            disabled={isPending || disabled}
            className={buttonClass}
          >
            {isVi ? "Tạo mới" : "Generate"}
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => run("improve", "en")}
          disabled={isPending || disabled || !canImprove}
          className={buttonClass}
        >
          {target === "description"
            ? isVi
              ? "Viết lại"
              : "Improve"
            : isVi
              ? "Chuẩn hoá"
              : "Polish"}
        </button>

        <button
          type="button"
          onClick={() => run("translate", "vi")}
          disabled={isPending || disabled || !canTranslate}
          className={buttonClass}
        >
          {isVi ? "Dịch sang tiếng Việt" : "Translate to Vietnamese"}
        </button>

        <button
          type="button"
          onClick={() => run("translate", "en")}
          disabled={isPending || disabled || !canTranslate}
          className={buttonClass}
        >
          {isVi ? "Dịch sang tiếng Anh" : "Translate to English"}
        </button>
      </div>

      {!hasName ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {isVi
            ? "Nhập tên sản phẩm trước để trợ lý có ngữ cảnh."
            : "Add a product name first so the assistant has context."}
        </p>
      ) : null}

      {errorCode ? (
        <p className="mt-1.5 text-xs leading-snug text-destructive">
          {errorMessage(errorCode, isVi)}
        </p>
      ) : null}

      {result ? (
        <div className="mt-2 rounded-lg border border-border bg-card p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
              {isVi ? "Bản nháp" : "Preview"}
            </span>
            <span className="rounded-full border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
              {resultLanguage === "vi" ? "Tiếng Việt" : "English"}
            </span>
          </div>

          {result.notes ? (
            <div className="mt-1.5 space-y-0.5 text-xs text-foreground">
              <p>
                <span className="text-muted-foreground">
                  {isVi ? "Hương đầu: " : "Top: "}
                </span>
                {result.notes.top.join(", ") || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">
                  {isVi ? "Hương giữa: " : "Heart: "}
                </span>
                {result.notes.heart.join(", ") || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">
                  {isVi ? "Hương cuối: " : "Base: "}
                </span>
                {result.notes.base.join(", ") || "—"}
              </p>
            </div>
          ) : (
            <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-foreground">
              {result.text}
            </p>
          )}

          {result.warnings && result.warnings.length > 0 ? (
            <p className="mt-1.5 text-xs leading-snug text-amber-700 dark:text-amber-400">
              {isVi
                ? `Không thể áp dụng — bản nháp có: ${result.warnings.join(", ")}.`
                : `Cannot apply — the draft contains: ${result.warnings.join(", ")}.`}
            </p>
          ) : null}

          {result.applyable === false &&
          (!result.warnings || result.warnings.length === 0) ? (
            <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
              {isVi
                ? "Solenne hiện chỉ lưu nội dung tiếng Anh. Bản tiếng Việt chỉ để sao chép."
                : "Solenne stores English copy only for now, so this Vietnamese draft is copy-only."}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={handleApply}
              disabled={!result.applyable || disabled}
              className={buttonClass}
            >
              <Check className="h-3 w-3" aria-hidden="true" />
              {isVi ? "Áp dụng" : "Apply"}
            </button>

            <button type="button" onClick={handleCopy} className={buttonClass}>
              <Copy className="h-3 w-3" aria-hidden="true" />
              {copied ? (isVi ? "Đã chép" : "Copied") : isVi ? "Sao chép" : "Copy"}
            </button>

            <button
              type="button"
              onClick={() => {
                setResult(null);
                setErrorCode(null);
              }}
              className={buttonClass}
            >
              <X className="h-3 w-3" aria-hidden="true" />
              {isVi ? "Bỏ" : "Discard"}
            </button>
          </div>

          <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
            {isVi
              ? "Áp dụng chỉ điền vào biểu mẫu. Chưa có gì được lưu cho tới khi bạn bấm Lưu."
              : "Apply only fills the field. Nothing is saved until you press Save."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
