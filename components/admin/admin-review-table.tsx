"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, Filter, MessageSquare, RotateCcw } from "lucide-react";
import type { AdminReviewEntry, AdminReviewProductOption } from "@/types";
import { StarRating } from "@/components/reviews/star-rating";
import { Button } from "@/components/ui";
import { AdminStatusBadge } from "./admin-status-badge";
import { AdminTableFrame } from "./admin-table-frame";
import { AdminPagination } from "./admin-pagination";
import { AdminStatePanel } from "./admin-state-panel";
import { AdminClearSearchButton, AdminSearchInput } from "./admin-search-input";
import { AdminSearchResults, useAdminSearch } from "./admin-search-provider";

// ---------------------------------------------------------------------------
// All Reviews list (monitoring only).
//
// This table is a browsing surface, not a moderation one: it renders no hide,
// edit, delete, publish or unpublish control. A review's visibility changes
// only through the audited moderation flow in the Reports view, which is where
// ReviewModerationControl lives.
//
// Every filter, the search term and the page number live in the URL, so the
// server re-runs the same authorized query and the view stays shareable,
// reload-safe and Back-button correct. Nothing is filtered in the browser.
// ---------------------------------------------------------------------------

export interface AdminReviewTableProps {
  reviews: AdminReviewEntry[];
  /** Exact number of rows matching the active filters. */
  totalCount: number;
  page: number;
  limit: number;
  hasMore: boolean;
  /** Product filter options, already bounded server-side. */
  products: AdminReviewProductOption[];
  locale: string;
  initialFilters: {
    status: string;
    rating: string;
    product: string;
  };
}

export function AdminReviewTable({
  reviews,
  totalCount,
  page,
  limit,
  hasMore,
  products,
  locale,
  initialFilters,
}: AdminReviewTableProps) {
  const t = useTranslations("reviewsAdmin");
  const tReviews = useTranslations("reviews");
  const isVi = locale === "vi";
  const searchParams = useSearchParams();
  const { term, updateParams, resetAll } = useAdminSearch();

  const currentStatus =
    searchParams.get("reviewStatus") ?? initialFilters.status ?? "all";
  const currentRating = searchParams.get("rating") ?? initialFilters.rating ?? "all";
  const currentProduct =
    searchParams.get("product") ?? initialFilters.product ?? "all";

  const hasActiveFilters =
    term.trim() !== "" ||
    currentStatus !== "all" ||
    currentRating !== "all" ||
    currentProduct !== "all";

  const statusOptions = [
    { value: "all", label: t("statusAll") },
    { value: "published", label: t("reviewStatusPublished") },
    { value: "hidden", label: t("reviewStatusHidden") },
  ];

  const ratingOptions = [
    { value: "all", label: t("ratingAll") },
    ...[5, 4, 3, 2, 1].map((rating) => ({
      value: String(rating),
      label: t("ratingOption", { rating }),
    })),
  ];

  const dateFormatter = new Intl.DateTimeFormat(isVi ? "vi-VN" : "en-US", {
    dateStyle: "medium",
  });

  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
  };

  const reviewerName = (review: AdminReviewEntry) =>
    review.displayName?.trim() || tReviews("anonymous");

  const statusBadge = (review: AdminReviewEntry) => (
    <AdminStatusBadge
      label={
        review.status === "hidden"
          ? t("reviewStatusHidden")
          : t("reviewStatusPublished")
      }
      tone={review.status === "hidden" ? "danger" : "positive"}
    />
  );

  const productLabel = (review: AdminReviewEntry) => {
    if (!review.productName) {
      return (
        <span className="text-xs italic text-muted-foreground">
          {t("productUnknown")}
        </span>
      );
    }

    if (review.productSlug && review.status === "published") {
      return (
        <Link
          href={`/products/${review.productSlug}#reviews`}
          className="admin-text-link text-sm underline-offset-4"
        >
          {review.productName}
        </Link>
      );
    }

    return <span className="text-sm text-foreground">{review.productName}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Search + filters. Every control writes to the URL. */}
      <div className="space-y-4 rounded-2xl border border-border bg-card/40 p-4 sm:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <AdminSearchInput
            label={t("searchLabel")}
            placeholder={t("searchPlaceholder")}
            resultCount={totalCount}
          />

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
            <div className="inline-flex items-center gap-1.5">
              <Filter
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <label
                htmlFor="review-status-filter"
                className="whitespace-nowrap text-sm font-normal text-muted-foreground"
              >
                {t("statusFilterLabel")}
              </label>
              <span className="relative inline-flex items-center">
                <select
                  id="review-status-filter"
                  value={currentStatus}
                  onChange={(event) =>
                    updateParams({ reviewStatus: event.target.value })
                  }
                  className="admin-inline-select peer max-w-[11rem] cursor-pointer appearance-none truncate rounded-md bg-transparent py-1 pl-1 pr-5 text-sm font-normal text-foreground transition-colors hover:bg-muted/60 focus-visible:text-foreground"
                >
                  {statusOptions.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      className="bg-background text-foreground"
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  aria-hidden="true"
                  className="pointer-events-none absolute right-1 h-3 w-3 text-muted-foreground transition-colors peer-focus-visible:text-foreground"
                />
              </span>
            </div>

            <div className="inline-flex items-center gap-1.5">
              <label
                htmlFor="review-rating-filter"
                className="whitespace-nowrap text-sm font-normal text-muted-foreground"
              >
                {t("ratingFilterLabel")}
              </label>
              <span className="relative inline-flex items-center">
                <select
                  id="review-rating-filter"
                  value={currentRating}
                  onChange={(event) =>
                    updateParams({ rating: event.target.value })
                  }
                  className="admin-inline-select peer max-w-[11rem] cursor-pointer appearance-none truncate rounded-md bg-transparent py-1 pl-1 pr-5 text-sm font-normal text-foreground transition-colors hover:bg-muted/60 focus-visible:text-foreground"
                >
                  {ratingOptions.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      className="bg-background text-foreground"
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  aria-hidden="true"
                  className="pointer-events-none absolute right-1 h-3 w-3 text-muted-foreground transition-colors peer-focus-visible:text-foreground"
                />
              </span>
            </div>

            <div className="inline-flex min-w-0 items-center gap-1.5">
              <label
                htmlFor="review-product-filter"
                className="whitespace-nowrap text-sm font-normal text-muted-foreground"
              >
                {t("productFilterLabel")}
              </label>
              <span className="relative inline-flex min-w-0 items-center">
                <select
                  id="review-product-filter"
                  value={currentProduct}
                  onChange={(event) =>
                    updateParams({ product: event.target.value })
                  }
                  className="admin-inline-select peer max-w-[13rem] cursor-pointer appearance-none truncate rounded-md bg-transparent py-1 pl-1 pr-5 text-sm font-normal text-foreground transition-colors hover:bg-muted/60 focus-visible:text-foreground"
                >
                  <option value="all" className="bg-background text-foreground">
                    {t("productAll")}
                  </option>
                  {products.map((product) => (
                    <option
                      key={product.id}
                      value={product.id}
                      className="bg-background text-foreground"
                    >
                      {product.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  aria-hidden="true"
                  className="pointer-events-none absolute right-1 h-3 w-3 text-muted-foreground transition-colors peer-focus-visible:text-foreground"
                />
              </span>
            </div>

            {hasActiveFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetAll}
                className="inline-flex h-9 items-center gap-1.5 px-2.5 text-xs font-normal text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t("resetFilters")}</span>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <AdminSearchResults>
        {reviews.length === 0 ? (
          <AdminStatePanel
            icon={MessageSquare}
            title={
              hasActiveFilters ? t("emptyFilteredTitle") : t("emptyAllTitle")
            }
            description={
              hasActiveFilters
                ? t("emptyFilteredDescription")
                : t("emptyAllDescription")
            }
            actions={
              hasActiveFilters ? (
                <AdminClearSearchButton
                  mode="all"
                  className="text-xs font-normal"
                />
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-4">
            {/* Desktop table */}
            <div className="hidden md:block">
              <AdminTableFrame
                caption={t("tableCaption")}
                head={
                  <>
                    <th scope="col" className="w-[22%] px-6 py-3.5 font-normal">
                      {t("columnProduct")}
                    </th>
                    <th scope="col" className="px-6 py-3.5 font-normal">
                      {t("columnReview")}
                    </th>
                    <th scope="col" className="px-6 py-3.5 font-normal">
                      {t("columnRating")}
                    </th>
                    <th scope="col" className="px-6 py-3.5 font-normal">
                      {t("columnReviewer")}
                    </th>
                    <th scope="col" className="px-6 py-3.5 font-normal">
                      {t("columnStatus")}
                    </th>
                    <th
                      scope="col"
                      className="whitespace-nowrap px-6 py-3.5 font-normal"
                    >
                      {t("columnSubmitted")}
                    </th>
                  </>
                }
              >
                <tbody className="divide-y divide-border/60">
                  {reviews.map((review) => (
                    <tr
                      key={review.id}
                      className="align-top transition-colors hover:bg-muted/30"
                    >
                      <td className="px-6 py-4">{productLabel(review)}</td>

                      <td className="px-6 py-4">
                        <p className="line-clamp-1 text-sm font-medium text-foreground">
                          {review.title}
                        </p>
                        <p className="mt-1 line-clamp-2 max-w-prose whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                          {review.body}
                        </p>
                      </td>

                      <td className="whitespace-nowrap px-6 py-4">
                        <StarRating
                          value={review.rating}
                          label={t("ratingLabel", { rating: review.rating })}
                          size="sm"
                        />
                      </td>

                      <td className="px-6 py-4">
                        <span className="line-clamp-2 text-sm text-foreground">
                          {reviewerName(review)}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-6 py-4">
                        {statusBadge(review)}
                      </td>

                      <td className="whitespace-nowrap px-6 py-4 text-xs tabular-nums text-muted-foreground">
                        <time dateTime={review.createdAt}>
                          {formatDate(review.createdAt)}
                        </time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </AdminTableFrame>
            </div>

            {/* Mobile cards */}
            <ul className="space-y-3 md:hidden">
              {reviews.map((review) => (
                <li
                  key={review.id}
                  className="space-y-3 rounded-2xl border border-border bg-card/40 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {review.title}
                      </p>
                      <div className="mt-1 text-xs">{productLabel(review)}</div>
                    </div>
                    {statusBadge(review)}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <StarRating
                      value={review.rating}
                      label={t("ratingLabel", { rating: review.rating })}
                      size="sm"
                    />
                    <span className="text-xs text-muted-foreground">
                      {reviewerName(review)}
                    </span>
                  </div>

                  <p className="line-clamp-4 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                    {review.body}
                  </p>

                  <p className="border-t border-border/60 pt-2 text-xs tabular-nums text-muted-foreground">
                    <time dateTime={review.createdAt}>
                      {formatDate(review.createdAt)}
                    </time>
                  </p>
                </li>
              ))}
            </ul>

            <AdminPagination
              page={page}
              limit={limit}
              totalCount={totalCount}
              hasMore={hasMore}
              locale={locale}
              itemLabelEn={t("paginationItem")}
              itemLabelVi={t("paginationItem")}
              labels={{
                navigation: t("paginationNavigation"),
                previous: t("paginationPrevious"),
                next: t("paginationNext"),
                // These two are TEMPLATES, not finished sentences: the
                // pagination component substitutes {page}/{total} and
                // {start}/{end}/{item} from the numbers the server returned.
                // They must be read with t.raw() — plain t() would run ICU
                // formatting here, and formatting a message whose variables
                // are supplied later throws FORMATTING_ERROR.
                pageOf: t.raw("paginationPageOf") as string,
                summary: t.raw("paginationSummary") as string,
              }}
            />
          </div>
        )}
      </AdminSearchResults>
    </div>
  );
}
