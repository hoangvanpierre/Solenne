"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { reportReviewAction } from "@/app/actions/reviews";
import {
  REVIEW_REPORT_REASONS,
  reviewErrorKey,
  reviewReportReasonKey,
} from "@/lib/reviews-core";
import type { ReviewReportReason } from "@/types";

// Post-publication reporting. A report only opens a moderation case — it never
// hides the review. The control disappears once the customer has reported this
// review, and the server enforces the same one-report-per-customer rule.

export interface ReviewReportControlProps {
  reviewId: string;
  onReported?: (reviewId: string) => void;
}

export function ReviewReportControl({
  reviewId,
  onReported,
}: ReviewReportControlProps) {
  const t = useTranslations("reviews");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReviewReportReason | "">("");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState(false);

  if (reported) {
    return <p className="text-xs text-muted-foreground">{t("reported")}</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Flag className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{t("report")}</span>
      </button>
    );
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!reason) {
      setError(t("errorReportReason"));
      return;
    }

    setPending(true);

    try {
      const result = await reportReviewAction({ reviewId, reason, details });

      if (result.success || result.code === "already_reported") {
        setReported(true);
        setOpen(false);
        setDetails("");
        setReason("");
        onReported?.(reviewId);
        return;
      }

      setError(t(reviewErrorKey(result)));
    } catch (reportError) {
      console.error("Review report failed:", reportError);
      setError(t("errorReport"));
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 space-y-3 rounded-xl border border-border bg-muted/20 p-4"
    >
      <p className="text-xs font-medium text-foreground">{t("reportTitle")}</p>

      <div className="space-y-1.5">
        <label
          htmlFor={`report-reason-${reviewId}`}
          className="block text-[13px] font-normal text-foreground"
        >
          {t("reportReasonLabel")}
        </label>
        <select
          id={`report-reason-${reviewId}`}
          value={reason}
          onChange={(event) =>
            setReason(event.target.value as ReviewReportReason | "")
          }
          disabled={pending}
          required
          className="h-10 w-full rounded-lg border border-border bg-transparent px-3 text-[13.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">{t("reportReasonPlaceholder")}</option>
          {REVIEW_REPORT_REASONS.map((value) => (
            <option key={value} value={value}>
              {t(reviewReportReasonKey(value))}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor={`report-details-${reviewId}`}
          className="block text-[13px] font-normal text-foreground"
        >
          {t("reportDetailsLabel")}
        </label>
        <textarea
          id={`report-details-${reviewId}`}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          maxLength={1000}
          rows={3}
          disabled={pending}
          placeholder={t("reportDetailsPlaceholder")}
          className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-[13.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t("reportSubmitting") : t("reportSubmit")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          {t("reportCancel")}
        </Button>
      </div>
    </form>
  );
}
