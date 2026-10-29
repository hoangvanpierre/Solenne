"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createReviewAction,
  updateReviewAction,
} from "@/app/actions/reviews";
import {
  REVIEW_BODY_MAX,
  REVIEW_BODY_MIN,
  REVIEW_TITLE_MAX,
  REVIEW_TITLE_MIN,
  isValidReviewRating,
  reviewErrorKey,
} from "@/lib/reviews-core";
import type { ProductReview } from "@/types";
import { StarRatingInput } from "./star-rating-input";

// Write / edit form. The rating, title and body are the only values sent; the
// server action derives identity and verification from the session and the
// database. Server-side field errors are mapped back onto localized copy so the
// English fallback string is never rendered to a customer.

export interface ReviewFormProps {
  productId: string;
  mode: "create" | "edit";
  initialReview?: ProductReview | null;
  onCancel: () => void;
  onSuccess: (mode: "create" | "edit") => void;
}

interface FormErrors {
  rating?: string;
  title?: string;
  body?: string;
}

export function ReviewForm({
  productId,
  mode,
  initialReview,
  onCancel,
  onSuccess,
}: ReviewFormProps) {
  const t = useTranslations("reviews");

  const [rating, setRating] = useState<number>(initialReview?.rating ?? 0);
  const [title, setTitle] = useState(initialReview?.title ?? "");
  const [body, setBody] = useState(initialReview?.body ?? "");
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isEdit = mode === "edit";

  const validate = (): FormErrors => {
    const next: FormErrors = {};

    if (!isValidReviewRating(rating)) next.rating = t("errorRating");

    const trimmedTitle = title.trim();
    if (
      trimmedTitle.length < REVIEW_TITLE_MIN ||
      trimmedTitle.length > REVIEW_TITLE_MAX
    ) {
      next.title = t("errorTitle");
    }

    const trimmedBody = body.trim();
    if (
      trimmedBody.length < REVIEW_BODY_MIN ||
      trimmedBody.length > REVIEW_BODY_MAX
    ) {
      next.body = t("errorBody");
    }

    return next;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError(null);

    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setPending(true);

    try {
      const payload = { productId, rating, title, body };
      const result = isEdit
        ? await updateReviewAction(payload)
        : await createReviewAction(payload);

      if (result.success) {
        onSuccess(mode);
        return;
      }

      // Map server field errors onto localized messages by field name.
      const fieldErrors = result.fieldErrors ?? {};
      const mapped: FormErrors = {};
      if (fieldErrors.rating?.length) mapped.rating = t("errorRating");
      if (fieldErrors.title?.length) mapped.title = t("errorTitle");
      if (fieldErrors.body?.length) mapped.body = t("errorBody");
      if (Object.keys(mapped).length > 0) setErrors(mapped);

      setServerError(t(reviewErrorKey(result)));
    } catch (error) {
      console.error("Review submit failed:", error);
      setServerError(t("errorSubmit"));
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-border bg-card p-6 sm:p-8"
      aria-labelledby="review-form-title"
    >
      <h3
        id="review-form-title"
        className="font-serif text-xl font-normal text-foreground"
      >
        {isEdit ? t("formEditTitle") : t("formCreateTitle")}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {t("formIntro")}
      </p>

      <div className="mt-6 space-y-5">
        <div>
          <p className="mb-2 text-[13px] font-normal text-foreground">
            {t("ratingLabel")}
          </p>
          <StarRatingInput
            value={rating}
            onChange={(next) => {
              setRating(next);
              setErrors((current) => ({ ...current, rating: undefined }));
            }}
            label={t("ratingLabel")}
            starLabel={(star) => t("starLabel", { count: star })}
            disabled={pending}
            error={errors.rating}
          />
        </div>

        <Input
          id="review-title"
          name="title"
          label={t("titleLabel")}
          placeholder={t("titlePlaceholder")}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setErrors((current) => ({ ...current, title: undefined }));
          }}
          maxLength={REVIEW_TITLE_MAX}
          disabled={pending}
          error={errors.title}
          autoComplete="off"
        />

        <div className="space-y-1.5">
          <label
            htmlFor="review-body"
            className="block text-[13px] font-normal text-foreground"
          >
            {t("bodyLabel")}
          </label>
          <textarea
            id="review-body"
            name="body"
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              setErrors((current) => ({ ...current, body: undefined }));
            }}
            placeholder={t("bodyPlaceholder")}
            maxLength={REVIEW_BODY_MAX}
            rows={5}
            disabled={pending}
            aria-invalid={errors.body ? true : undefined}
            aria-describedby={errors.body ? "review-body-error" : undefined}
            className="w-full rounded-lg border border-border bg-transparent px-3.5 py-2.5 text-[13.5px] leading-relaxed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
          />
          <div className="flex items-start justify-between gap-3">
            {errors.body ? (
              <p
                id="review-body-error"
                role="alert"
                className="text-xs text-destructive"
              >
                {errors.body}
              </p>
            ) : (
              <span className="text-xs text-muted-foreground">
                {t("bodyHint", {
                  min: REVIEW_BODY_MIN,
                  max: REVIEW_BODY_MAX,
                })}
              </span>
            )}
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {body.length}/{REVIEW_BODY_MAX}
            </span>
          </div>
        </div>

        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending
              ? isEdit
                ? t("updating")
                : t("submitting")
              : isEdit
                ? t("update")
                : t("submit")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={onCancel}
          >
            {t("cancel")}
          </Button>
        </div>
      </div>
    </form>
  );
}
