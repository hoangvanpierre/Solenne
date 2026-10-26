"use client";

import { useId, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, RotateCcw, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Input } from "@/components/ui";
import { ADMIN_SEARCH_MAX_LENGTH } from "@/lib/search-utils";
import { useAdminSearch } from "./admin-search-provider";

// ---------------------------------------------------------------------------
// The one search field used by every management list.
//
// Typing is debounced (the controller owns the timer); Enter and the Search
// button commit immediately. The form also works without JavaScript: it is a
// plain GET form that submits `q` plus the other current filters.
//
// The input is always mounted and only its value is controlled locally, so a
// navigation cannot steal focus or move the caret.
// ---------------------------------------------------------------------------

export interface AdminSearchInputProps {
  /** Visible label is not rendered; this is the accessible name. */
  label: string;
  placeholder: string;
  /** Number of rows the server currently matches, announced politely. */
  resultCount: number;
  /** Optional extra classes for the form element. */
  className?: string;
  /** Keep the visible Search button (orders/customers) or only a hidden one. */
  showSubmitButton?: boolean;
}

export function AdminSearchInput({
  label,
  placeholder,
  resultCount,
  className,
  showSubmitButton = true,
}: AdminSearchInputProps) {
  const t = useTranslations("adminSearch");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    value,
    isPending,
    param,
    legacyParam,
    minLength,
    handleChange,
    handleCompositionStart,
    handleCompositionEnd,
    submitNow,
    clearSearch,
  } = useAdminSearch();

  const hasValue = value.length > 0;
  const showLengthHint =
    minLength > 1 && hasValue && value.trim().length < minLength;

  const hiddenFields = Array.from(searchParams.entries()).filter(
    ([key]) => key !== param && key !== legacyParam && key !== "page"
  );

  return (
    <form
      role="search"
      action={pathname}
      method="get"
      onSubmit={(event) => {
        event.preventDefault();
        submitNow();
      }}
      className={cn("flex flex-1 items-center gap-2 max-w-xl", className)}
      aria-label={label}
    >
      {hiddenFields.map(([key, hiddenValue], index) => (
        <input
          key={`${key}-${index}`}
          type="hidden"
          name={key}
          value={hiddenValue}
        />
      ))}

      <div className="relative flex-1">
        <label htmlFor={inputId} className="sr-only">
          {label}
        </label>
        <Search
          className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          ref={inputRef}
          id={inputId}
          type="text"
          name={param}
          value={value}
          onChange={(event) =>
            handleChange(event.target.value, {
              isComposing: (event.nativeEvent as InputEvent).isComposing,
            })
          }
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onKeyDown={(event) => {
            if (
              event.key === "Escape" &&
              hasValue &&
              !(event.nativeEvent as KeyboardEvent).isComposing
            ) {
              event.preventDefault();
              clearSearch();
            }
          }}
          placeholder={placeholder}
          aria-label={label}
          aria-describedby={showLengthHint ? hintId : undefined}
          maxLength={ADMIN_SEARCH_MAX_LENGTH}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className={cn(
            "admin-quiet-field h-10 rounded-xl pl-9.5 text-[13px]",
            hasValue ? "pr-16" : "pr-10"
          )}
        />

        {showLengthHint ? (
          <span id={hintId} className="sr-only">
            {t("minLength", { count: minLength })}
          </span>
        ) : null}

        {isPending ? (
          <Loader2
            aria-hidden="true"
            data-admin-search-spinner="true"
            className={cn(
              "pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground motion-reduce:animate-none",
              hasValue ? "right-9" : "right-3"
            )}
          />
        ) : null}

        {hasValue ? (
          <button
            type="button"
            onClick={() => {
              clearSearch();
              inputRef.current?.focus();
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none"
            aria-label={t("clear")}
            title={t("clear")}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {showSubmitButton ? (
        <Button
          type="submit"
          size="sm"
          className="h-10 px-4 rounded-xl text-xs font-normal"
        >
          <span>{t("search")}</span>
        </Button>
      ) : (
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
          {t("search")}
        </button>
      )}

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {isPending ? t("searching") : t("resultsCount", { count: resultCount })}
      </p>
    </form>
  );
}

export interface AdminClearSearchButtonProps {
  /** "search" keeps the other filters; "all" clears the whole toolbar. */
  mode?: "search" | "all";
  /** Optional full reset for surfaces that also keep local filters. */
  onResetAll?: () => void;
  variant?: "default" | "outline" | "ghost";
  className?: string;
}

export function AdminClearSearchButton({
  mode = "search",
  onResetAll,
  variant = "outline",
  className,
}: AdminClearSearchButtonProps) {
  const t = useTranslations("adminSearch");
  const { clearSearch, resetAll } = useAdminSearch();

  const label = mode === "all" ? t("clearFilters") : t("clear");

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      onClick={() => {
        if (mode === "all") {
          if (onResetAll) onResetAll();
          else resetAll();
        } else {
          clearSearch();
        }
      }}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-normal",
        className
      )}
    >
      {mode === "all" ? (
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span>{label}</span>
    </Button>
  );
}
