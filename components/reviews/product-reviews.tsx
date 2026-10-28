"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Check, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  REVIEW_SORTS,
  normalizeReviewSort,
  sortReviews,
} from "@/lib/reviews-core";
import type {
  ProductReview,
  ProductReviewsPageData,
  ReviewSort,
} from "@/types";
import { ReviewForm } from "./review-form";
import { ReviewReportControl } from "./review-report-control";
import { ReviewSummary } from "./review-summary";
import { StarRating } from "./star-rating";

// ---------------------------------------------------------------------------
// Product-detail reviews section.
//
// Server data arrives in one pass (getProductReviewsPageData): published
// reviews, the aggregate, the viewer's own review, eligibility and the reviews
// they already reported. Sorting happens client-side over that window, so
// changing the order never costs a round trip.
//
// Publication is immediate — there is no "pending approval" state anywhere in
// this UI, because there is none in the schema.
// ---------------------------------------------------------------------------

export interface ProductReviewsProps {
  productId: string;
  productName: string;
  data: ProductReviewsPageData;
  /** `/login?next=…` for guests who want to write a review. */
  loginHref: string;
}

const SORT_LABEL_KEYS: Record<ReviewSort, string> = {
  newest: "sortNewest",
  oldest: "sortOldest",
  highest: "sortHighest",
  lowest: "sortLowest",
};

export function ProductReviews({
  productId,
  productName,
  data,
  loginHref,
}: ProductReviewsProps) {
  const t = useTranslations("reviews");
  const locale = useLocale();
  const router = useRouter();

  const [sort, setSort] = useState<ReviewSort>("newest");
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const sorted = useMemo(
    () => sortReviews(data.reviews, normalizeReviewSort(sort)),
    [data.reviews, sort]
  );

  const { eligibility, ownReview, isAuthenticated } = data;

  const dateFormatter = new Intl.DateTimeFormat(
    locale === "vi" ? "vi-VN" : "en-US",
    { year: "numeric", month: "short", day: "numeric" }
  );

  const handleSuccess = (mode: "create" | "edit") => {
    setFormMode(null);
    setAnnouncement(
      mode === "create" ? t("reviewPublished") : t("reviewUpdated")
    );
    router.refresh();
  };

  const renderHeaderAction = () => {
    if (!isAuthenticated) {
      return (
        <Button asChild variant="outline">
          <Link href={loginHref}>{t("writeReview")}</Link>
        </Button>
      );
    }

    if (eligibility.canWrite) {
      return (
        <Button type="button" onClick={() => setFormMode("create")}>
          {t("writeReview")}
        </Button>
      );
    }

    if (eligibility.canEdit && ownReview) {
      return (
        <Button type="button" onClick={() => setFormMode("edit")}>
          {t("editYourReview")}
        </Button>
      );
    }

    if (!eligibility.hasDeliveredPurchase) {
      return (
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          {t("verifiedOnly")}
        </p>
      );
    }

    return null;
  };

  return (
    <section aria-labelledby="reviews-title" className="scroll-mt-28">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2
            id="reviews-title"
            className="font-serif text-2xl font-normal text-foreground sm:text-3xl"
          >
            {t("title")}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>

        {formMode === null && data.available ? renderHeaderAction() : null}
      </div>

      {!data.available ? (
        <div className="mt-8 rounded-2xl border border-border bg-muted/20 p-6 text-sm leading-relaxed text-muted-foreground">
          {t("reviewsUnavailable")}
        </div>
      ) : (
        <>
          {ownReview?.status === "hidden" && (
            <div
              role="status"
              className="mt-6 rounded-xl border border-amber/40 bg-amber/10 p-4 text-sm"
            >
              <p className="font-medium text-foreground">
                {t("hiddenReviewTitle")}
              </p>
              <p className="mt-1 leading-relaxed text-muted-foreground">
                {t("hiddenNotice", {
                  reason:
                    ownReview.hiddenReason?.trim() || t("hiddenReasonFallback"),
                })}
              </p>
            </div>
          )}

          {formMode !== null && (
            <div className="mt-8">
              <ReviewForm
                productId={productId}
                mode={formMode}
                initialReview={formMode === "edit" ? ownReview : null}
                onCancel={() => setFormMode(null)}
                onSuccess={handleSuccess}
              />
            </div>
          )}

          {data.summary.reviewCount > 0 && (
            <div className="mt-8">
              <ReviewSummary summary={data.summary} />
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-foreground">
              {t("listTitle", { name: productName })}
            </h3>

            {data.reviews.length > 1 && (
              <div className="flex items-center gap-2">
                <label
                  htmlFor="review-sort"
                  className="text-xs text-muted-foreground"
                >
                  {t("sortLabel")}
                </label>
                <select
                  id="review-sort"
                  value={sort}
                  onChange={(event) =>
                    setSort(normalizeReviewSort(event.target.value))
                  }
                  className="h-9 rounded-lg border border-border bg-transparent px-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {REVIEW_SORTS.map((value) => (
                    <option key={value} value={value}>
                      {t(SORT_LABEL_KEYS[value])}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {sorted.length === 0 ? (
            <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
              <MessageSquare
                className="h-8 w-8 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="font-serif text-lg font-normal text-foreground">
                {t("noReviewsTitle")}
              </p>
              <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                {t("noReviewsDescription")}
              </p>
            </div>
          ) : (
            <div className="mt-2">
              {sorted.map((review) => (
                <ReviewCard
                  key={review.id}
                  review={review}
                  isOwn={review.id === ownReview?.id}
                  isAuthenticated={isAuthenticated}
                  alreadyReported={data.reportedReviewIds.includes(review.id)}
                  dateFormatter={dateFormatter}
                  onReported={() => setAnnouncement(t("reportSuccess"))}
                />
              ))}
            </div>
          )}

          <p className="sr-only" role="status" aria-live="polite">
            {announcement}
          </p>
        </>
      )}
    </section>
  );
}

interface ReviewCardProps {
  review: ProductReview;
  isOwn: boolean;
  isAuthenticated: boolean;
  alreadyReported: boolean;
  dateFormatter: Intl.DateTimeFormat;
  onReported: () => void;
}

function ReviewCard({
  review,
  isOwn,
  isAuthenticated,
  alreadyReported,
  dateFormatter,
  onReported,
}: ReviewCardProps) {
  const t = useTranslations("reviews");
  const displayName = review.displayName?.trim() || t("anonymous");

  return (
    <article className="border-b border-border py-6 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">
              {displayName}
            </p>
            <Badge variant="outline" className="gap-1">
              <Check className="h-3 w-3" aria-hidden="true" />
              {t("verifiedPurchase")}
            </Badge>
            {isOwn && <Badge>{t("yourReview")}</Badge>}
          </div>

          <div className="mt-1.5 flex items-center gap-2">
            <StarRating
              value={review.rating}
              label={t("ratingOutOfFive", { rating: review.rating })}
              size="sm"
            />
            <time
              dateTime={review.createdAt}
              className="text-xs tabular-nums text-muted-foreground"
            >
              {dateFormatter.format(new Date(review.createdAt))}
            </time>
          </div>
        </div>
      </div>

      <h4 className="mt-3 font-serif text-lg font-normal text-foreground">
        {review.title}
      </h4>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
        {review.body}
      </p>

      {isAuthenticated && !isOwn && (
        <div className="mt-4">
          {alreadyReported ? (
            <p className="text-xs text-muted-foreground">{t("reported")}</p>
          ) : (
            <ReviewReportControl
              reviewId={review.id}
              onReported={onReported}
            />
          )}
        </div>
      )}
    </article>
  );
}
