"use client";

import { useTranslations } from "next-intl";
import { formatAverageRating, reviewDistributionPercent } from "@/lib/reviews-core";
import type { ReviewSummary as ReviewSummaryModel } from "@/types";
import { StarRating } from "./star-rating";

// Average, count and the 5→1 distribution. Rendered inside the interactive
// review section so it shares the same translations as the list.

export interface ReviewSummaryProps {
  summary: ReviewSummaryModel;
}

export function ReviewSummary({ summary }: ReviewSummaryProps) {
  const t = useTranslations("reviews");
  const average = formatAverageRating(summary.averageRating);

  return (
    <div className="grid gap-6 rounded-2xl border border-border bg-muted/20 p-6 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] sm:gap-10 sm:p-8">
      <div className="flex flex-col items-center justify-center text-center">
        <p className="font-serif text-5xl leading-none text-foreground tabular-nums">
          {average}
        </p>
        <StarRating
          value={summary.averageRating}
          label={t("averageLabel", { rating: average })}
          size="md"
          className="mt-3"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          {t("basedOn", { count: summary.reviewCount })}
        </p>
      </div>

      <div>
        <h3 className="sr-only">{t("distributionTitle")}</h3>
        <ul className="space-y-2">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = summary.distribution[star as 1 | 2 | 3 | 4 | 5];
            const percent = reviewDistributionPercent(count, summary.reviewCount);

            return (
              <li key={star} className="flex items-center gap-3">
                <span className="w-9 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {t("stars", { count: star })}
                </span>
                <span
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-border"
                  role="img"
                  aria-label={t("distributionRow", { stars: star, count })}
                >
                  <span
                    className="block h-full rounded-full bg-primary transition-[width] duration-300"
                    style={{ width: `${percent}%` }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                  {count}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
