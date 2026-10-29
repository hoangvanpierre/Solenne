"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, EyeOff, X } from "lucide-react";
import {
  hideReviewAction,
  resolveReviewReportAction,
} from "@/app/actions/review-moderation";
import { Button } from "@/components/ui";
import {
  REVIEW_MODERATION_REASON_MAX,
  REVIEW_MODERATION_REASON_MIN,
  reviewModerationErrorKey,
} from "@/lib/reviews-core";
import type { ReportedReview, ReviewReport } from "@/types";

// ---------------------------------------------------------------------------
// Post-publication moderation for ONE report.
//
// Hiding the review and closing the report are deliberately separate actions:
// a report never hides anything by itself, and hiding does not silently close
// the report that prompted it. Both actions are audited server-side; this
// control only presents the choices and maps failures onto localized copy.
//
// The buttons are a convenience, never a gate: app/actions/review-moderation.ts
// re-checks review.manage_reports, and the database re-checks it inside the
// UPDATE policies and guard trigger.
// ---------------------------------------------------------------------------

export interface ReviewModerationControlProps {
  report: ReviewReport;
  review: ReportedReview | null;
}

type ModerationMode = "hide" | "resolve" | "dismiss" | null;

export function ReviewModerationControl({
  report,
  review,
}: ReviewModerationControlProps) {
  const t = useTranslations("reviewsAdmin");
  const router = useRouter();

  const [mode, setMode] = useState<ModerationMode>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // A closed report is read-only history. The review's visibility is unchanged
  // by this state, so a resolved report can still point at a published review.
  if (report.status !== "open") {
    return (
      <div className="mt-5 rounded-xl border border-border bg-muted/20 p-4">
        <p className="text-xs font-normal uppercase tracking-[0.06em] text-muted-foreground">
          {report.status === "resolved"
            ? t("reportClosedResolved")
            : t("reportClosedDismissed")}
        </p>
        {report.resolutionNote ? (
          <p className="mt-1.5 text-sm leading-relaxed text-foreground">
            {t("resolutionNote", { note: report.resolutionNote })}
          </p>
        ) : null}
      </div>
    );
  }

  const alreadyHidden = review?.status === "hidden";

  const openMode = (next: Exclude<ModerationMode, null>) => {
    setMode(next);
    setError(null);
    setSuccess(null);
  };

  const closeMode = () => {
    if (pending) return;
    setMode(null);
    setError(null);
    setReason("");
    setNote("");
  };

  const handleHide = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const trimmed = reason.trim();
    if (trimmed.length < REVIEW_MODERATION_REASON_MIN) {
      setError(
        t("errorReasonTooShort", { min: REVIEW_MODERATION_REASON_MIN })
      );
      return;
    }

    if (trimmed.length > REVIEW_MODERATION_REASON_MAX) {
      setError(
        t("errorReasonTooLong", { max: REVIEW_MODERATION_REASON_MAX })
      );
      return;
    }

    setPending(true);
    try {
      const result = await hideReviewAction({
        reviewId: report.reviewId,
        reason: trimmed,
      });

      if (result.success) {
        setMode(null);
        setReason("");
        setSuccess(t("successHidden"));
        router.refresh();
        return;
      }

      setError(t(reviewModerationErrorKey(result)));
    } catch (hideError) {
      console.error("Review hide failed:", hideError);
      setError(t("errorGeneric"));
    } finally {
      setPending(false);
    }
  };

  const handleResolution = async (
    event: React.FormEvent<HTMLFormElement>,
    resolution: "resolved" | "dismissed"
  ) => {
    event.preventDefault();
    setError(null);

    const trimmed = note.trim();
    if (trimmed.length > REVIEW_MODERATION_REASON_MAX) {
      setError(t("errorNoteTooLong", { max: REVIEW_MODERATION_REASON_MAX }));
      return;
    }

    setPending(true);
    try {
      const result = await resolveReviewReportAction({
        reportId: report.id,
        resolution,
        note: trimmed.length > 0 ? trimmed : undefined,
      });

      if (result.success) {
        setMode(null);
        setNote("");
        setSuccess(
          resolution === "resolved"
            ? t("successResolved")
            : t("successDismissed")
        );
        router.refresh();
        return;
      }

      setError(t(reviewModerationErrorKey(result)));
    } catch (resolutionError) {
      console.error("Review report resolution failed:", resolutionError);
      setError(t("errorGeneric"));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mt-5 border-t border-border pt-4">
      {review === null ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("reviewUnavailable")}
        </p>
      ) : alreadyHidden ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("reviewAlreadyHidden")}
        </p>
      ) : null}

      {mode === null ? (
        <div className="flex flex-wrap items-center gap-2">
          {review && !alreadyHidden ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openMode("hide")}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t("hideAction")}</span>
            </Button>
          ) : null}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openMode("resolve")}
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t("resolveAction")}</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => openMode("dismiss")}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t("dismissAction")}</span>
          </Button>
        </div>
      ) : mode === "hide" ? (
        <form
          onSubmit={handleHide}
          className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
        >
          <div>
            <p className="text-sm font-normal text-foreground">
              {t("hideTitle")}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t("hideDescription")}
            </p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor={`hide-reason-${report.id}`}
              className="block text-xs font-normal text-foreground"
            >
              {t("hideReasonLabel")}
              <span className="ml-1 text-destructive" aria-hidden="true">
                *
              </span>
            </label>
            <textarea
              id={`hide-reason-${report.id}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={REVIEW_MODERATION_REASON_MAX}
              disabled={pending}
              required
              placeholder={t("hideReasonPlaceholder")}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
            <div className="flex items-start justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {t("reasonHint", {
                  min: REVIEW_MODERATION_REASON_MIN,
                  max: REVIEW_MODERATION_REASON_MAX,
                })}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {reason.trim().length}/{REVIEW_MODERATION_REASON_MAX}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              isLoading={pending}
              disabled={pending}
            >
              {t("hideConfirm")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={closeMode}
            >
              {t("cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={(event) =>
            handleResolution(event, mode === "resolve" ? "resolved" : "dismissed")
          }
          className="space-y-3 rounded-xl border border-sage/30 bg-sage/5 p-4"
        >
          <div>
            <p className="text-sm font-normal text-foreground">
              {mode === "resolve" ? t("resolveTitle") : t("dismissTitle")}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {mode === "resolve"
                ? t("resolveDescription")
                : t("dismissDescription")}
            </p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor={`resolution-note-${report.id}`}
              className="block text-xs font-normal text-foreground"
            >
              {t("resolutionNoteLabel")}
            </label>
            <textarea
              id={`resolution-note-${report.id}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              maxLength={REVIEW_MODERATION_REASON_MAX}
              disabled={pending}
              placeholder={t("resolutionNotePlaceholder")}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
            <span className="block text-xs text-muted-foreground">
              {t("resolutionNoteHint", { max: REVIEW_MODERATION_REASON_MAX })}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" isLoading={pending} disabled={pending}>
              {mode === "resolve"
                ? t("resolveConfirm")
                : t("dismissConfirm")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={closeMode}
            >
              {t("cancel")}
            </Button>
          </div>
        </form>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-xs leading-relaxed text-destructive">
          {error}
        </p>
      ) : null}

      <p role="status" aria-live="polite" className="sr-only">
        {success ?? ""}
      </p>
    </div>
  );
}
