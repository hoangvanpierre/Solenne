import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Flag, Info, MessageSquare, ShieldAlert, Star } from "lucide-react";
import { AuthError, requirePermission } from "@/lib/authz";
import {
  isRestrictedAuthError,
  isUnauthenticatedAuthError,
} from "@/lib/authz-ux";
import {
  REVIEW_REPORT_STATUS_FILTERS,
  countOpenReviewReports,
  getAdminReviewProductOptions,
  getAdminReviewReports,
  getAdminReviewStatusCounts,
  getAdminReviews,
  normalizeReviewReportStatusFilter,
} from "@/lib/admin-reviews";
import {
  ADMIN_REVIEW_PAGE_SIZE,
  ADMIN_REVIEW_SEARCH_MIN,
  isMissingReviewSchema,
  isReviewUuid,
  normalizeAdminReviewPage,
  normalizeAdminReviewRatingFilter,
  normalizeAdminReviewSearch,
  normalizeAdminReviewStatusFilter,
  normalizeAdminReviewView,
  reviewReportReasonKey,
} from "@/lib/reviews-core";
import {
  AdminBreadcrumb,
  AdminPageHeader,
  AdminReviewTable,
  AdminSearchProvider,
  AdminStatePanel,
  AdminStatusBadge,
  ReviewModerationControl,
} from "@/components/admin";
import { RestrictedAccountNotice } from "@/components/account";
import { StarRating } from "@/components/reviews/star-rating";
import { Button } from "@/components/ui";
import type {
  AdminReviewProductOption,
  AdminReviewQueryResult,
  AdminReviewReportEntry,
  AdminReviewStatusCounts,
} from "@/types";

export const metadata: Metadata = {
  title: "Reviews - Administration",
};

// ---------------------------------------------------------------------------
// /admin/reviews — one management area, two top-level views.
//
//   ?view=all      All Reviews      (default)  browsing / monitoring
//   ?view=reports  Review Reports              audited post-publication moderation
//
// The view parameter is the only thing that changes which data is loaded; both
// views share the same permission gate (review.manage_reports) and the same
// failure handling. A legacy bookmark such as `?status=open` predates the view
// parameter and still resolves to Review Reports.
//
// All Reviews is read-only by design: it has no hide/edit/delete/publish
// control. A review is hidden only through the audited flow in the Reports
// view, where ReviewModerationControl lives.
// ---------------------------------------------------------------------------

interface AdminReviewsPageProps {
  searchParams: Promise<{
    /** Top-level view: "all" | "reports". */
    view?: string;
    /** Report status (Reports view) — also the legacy bookmark parameter. */
    status?: string;
    /** Publication status filter (All Reviews view). */
    reviewStatus?: string;
    /** 1–5 star filter (All Reviews view). */
    rating?: string;
    /** Product id filter (All Reviews view). */
    product?: string;
    /** Search term (All Reviews view). */
    q?: string;
    /** Legacy alias for `q`. */
    search?: string;
    /** 1-based page (All Reviews view). */
    page?: string;
  }>;
}

const FILTER_LABEL_KEYS = {
  open: "filterOpen",
  resolved: "filterResolved",
  dismissed: "filterDismissed",
  all: "filterAll",
} as const;

export default async function AdminReviewsPage({
  searchParams,
}: AdminReviewsPageProps) {
  const locale = await getLocale();
  const isVi = locale === "vi";
  const t = await getTranslations("reviewsAdmin");
  const tReviews = await getTranslations("reviews");

  const rawParams = await searchParams;

  const view = normalizeAdminReviewView(rawParams.view, rawParams.status);
  const filter = normalizeReviewReportStatusFilter(rawParams.status);

  // All Reviews parameters. Every one is validated here and again inside
  // lib/admin-reviews.ts, which is the layer that issues the query.
  const reviewPage = normalizeAdminReviewPage(rawParams.page);
  const reviewStatusFilter = normalizeAdminReviewStatusFilter(
    rawParams.reviewStatus
  );
  const reviewRatingFilter = normalizeAdminReviewRatingFilter(rawParams.rating);
  const reviewSearch = normalizeAdminReviewSearch(rawParams.q ?? rawParams.search);
  const reviewProductId = isReviewUuid(rawParams.product)
    ? String(rawParams.product).trim()
    : null;

  let accountRestricted = false;
  let forbiddenAccess = false;
  let loadFailed = false;
  let schemaUnavailable = false;

  let entries: AdminReviewReportEntry[] = [];
  let openCount: number | null = null;

  let reviewResult: AdminReviewQueryResult = {
    reviews: [],
    totalCount: 0,
    page: reviewPage,
    limit: ADMIN_REVIEW_PAGE_SIZE,
    hasMore: false,
  };
  let reviewCounts: AdminReviewStatusCounts | null = null;
  let productOptions: AdminReviewProductOption[] = [];

  try {
    // Explicit server-side permission check before any review data is read.
    // lib/admin-reviews.ts repeats it so a direct call cannot bypass this page.
    await requirePermission("review.manage_reports");

    if (view === "reports") {
      entries = await getAdminReviewReports(filter);
      openCount = await countOpenReviewReports();
    } else {
      reviewResult = await getAdminReviews({
        page: reviewPage,
        status: reviewStatusFilter,
        rating: reviewRatingFilter,
        productId: reviewProductId,
        search: reviewSearch,
      });
      reviewCounts = await getAdminReviewStatusCounts();
      productOptions = await getAdminReviewProductOptions();
    }
  } catch (error) {
    if (isUnauthenticatedAuthError(error)) {
      redirect("/login?next=/admin/reviews");
    }

    if (isRestrictedAuthError(error)) {
      accountRestricted = true;
    } else if (error instanceof AuthError) {
      forbiddenAccess = true;
    } else if (
      isMissingReviewSchema(error as { code?: string; message?: string })
    ) {
      // Migration 0015 not applied (or only partially applied). Say so plainly
      // instead of pretending the list or the queue is empty.
      schemaUnavailable = true;
    } else {
      console.error("AdminReviewsPage: failed to load review data:", error);
      loadFailed = true;
    }
  }

  if (accountRestricted) {
    return (
      <div className="py-8">
        <div className="mx-auto max-w-2xl">
          <RestrictedAccountNotice locale={locale} />
        </div>
      </div>
    );
  }

  if (forbiddenAccess) {
    return (
      <div className="py-8">
        <div className="mx-auto max-w-2xl">
          <AdminStatePanel
            title={t("forbiddenTitle")}
            description={t("forbiddenDescription")}
            icon={ShieldAlert}
            actions={
              <Button asChild variant="outline" size="sm" className="font-normal text-xs">
                <Link href="/admin" className="inline-flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span>{t("returnToHub")}</span>
                </Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  if (schemaUnavailable) {
    return (
      <div className="py-8">
        <div className="mx-auto max-w-2xl">
          <AdminStatePanel
            title={t("unavailableTitle")}
            description={t("unavailableDescription")}
            icon={ShieldAlert}
            actions={
              <Button asChild variant="outline" size="sm" className="font-normal text-xs">
                <Link href="/admin">{t("returnToHub")}</Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="py-8">
        <div className="mx-auto max-w-2xl">
          <AdminStatePanel
            tone="danger"
            title={t("loadErrorTitle")}
            description={t("loadErrorDescription")}
            icon={ShieldAlert}
            actions={
              <Button asChild variant="outline" size="sm" className="font-normal text-xs">
                <Link
                  href={
                    view === "reports"
                      ? `/admin/reviews?view=reports&status=${filter}`
                      : "/admin/reviews?view=all"
                  }
                >
                  {t("retry")}
                </Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const dateFormatter = new Intl.DateTimeFormat(isVi ? "vi-VN" : "en-US", {
    dateStyle: "medium",
  });

  return (
    <div className="space-y-6 py-4">
      <AdminBreadcrumb label={isVi ? "Trung tâm quản trị" : "Admin Hub"} />

      <AdminPageHeader
        eyebrow={
          view === "reports" ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-amber/30 bg-amber/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-foreground">
              <Flag className="h-3.5 w-3.5 text-amber-dark" aria-hidden="true" />
              <span>{t("eyebrow")}</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full border border-amber/30 bg-amber/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-foreground">
              <Star className="h-3.5 w-3.5 text-amber-dark" aria-hidden="true" />
              <span>{t("allEyebrow")}</span>
            </div>
          )
        }
        title={view === "reports" ? t("title") : t("allTitle")}
        description={
          view === "reports" ? t("description") : t("allDescription")
        }
        meta={
          view === "reports" ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full border border-border bg-muted/40 px-3 py-0.5 text-xs font-normal tabular-nums text-muted-foreground">
                {t("resultCount", { count: entries.length })}
              </span>
              {openCount !== null ? (
                <span className="inline-flex rounded-full border border-amber/40 bg-amber/10 px-3 py-0.5 text-xs font-normal tabular-nums text-foreground">
                  {t("openCount", { count: openCount })}
                </span>
              ) : null}
            </span>
          ) : reviewCounts !== null ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full border border-border bg-muted/40 px-3 py-0.5 text-xs font-normal tabular-nums text-muted-foreground">
                {t("totalReviews", { count: reviewCounts.total })}
              </span>
              <span className="inline-flex rounded-full border border-sage/40 bg-sage/15 px-3 py-0.5 text-xs font-normal tabular-nums text-foreground">
                {t("publishedCount", { count: reviewCounts.published })}
              </span>
              <span className="inline-flex rounded-full border border-destructive/40 bg-destructive/15 px-3 py-0.5 text-xs font-normal tabular-nums text-destructive">
                {t("hiddenCount", { count: reviewCounts.hidden })}
              </span>
            </span>
          ) : null
        }
      />

      {/* Top-level views. All Reviews is the default; Review Reports keeps the
          moderation queue exactly as it was. */}
      <nav
        aria-label={t("viewsLabel")}
        className="flex flex-wrap items-center gap-2"
      >
        <Link
          href="/admin/reviews?view=all"
          aria-current={view === "all" ? "page" : undefined}
          className="admin-filter-pill inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors"
        >
          <Star className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t("viewAll")}</span>
        </Link>
        <Link
          href="/admin/reviews?view=reports"
          aria-current={view === "reports" ? "page" : undefined}
          className="admin-filter-pill inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors"
        >
          <Flag className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t("viewReports")}</span>
        </Link>
      </nav>

      {view === "reports" ? (
        <>
          <nav
            aria-label={t("filterLabel")}
            className="flex flex-wrap items-center gap-2"
          >
            {REVIEW_REPORT_STATUS_FILTERS.map((value) => {
              const active = filter === value;
              return (
                <Link
                  key={value}
                  href={`/admin/reviews?view=reports&status=${value}`}
                  aria-current={active ? "page" : undefined}
                  className="admin-filter-pill inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors"
                >
                  <span>{t(FILTER_LABEL_KEYS[value])}</span>
                  {value === "open" && openCount !== null ? (
                    <span className="tabular-nums">{openCount}</span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          {entries.length === 0 ? (
            <AdminStatePanel
              title={t("emptyTitle")}
              description={
                filter === "open"
                  ? t("emptyOpenDescription")
                  : t("emptyDescription")
              }
              icon={MessageSquare}
            />
          ) : (
            <ul className="space-y-4">
              {entries.map(({ report, review }) => {
                const reviewStatusLabel =
                  review?.status === "hidden"
                    ? t("reviewStatusHidden")
                    : t("reviewStatusPublished");

                return (
                  <li key={report.id}>
                    <article className="rounded-2xl border border-border bg-card p-6 sm:p-7">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <AdminStatusBadge
                            label={
                              report.status === "open"
                                ? t("reportStatusOpen")
                                : report.status === "resolved"
                                  ? t("reportStatusResolved")
                                  : t("reportStatusDismissed")
                            }
                            tone={
                              report.status === "open"
                                ? "attention"
                                : report.status === "resolved"
                                  ? "positive"
                                  : "neutral"
                            }
                            dot
                            uppercase
                          />
                          {review ? (
                            <AdminStatusBadge
                              label={reviewStatusLabel}
                              tone={
                                review.status === "hidden" ? "danger" : "positive"
                              }
                            />
                          ) : null}
                          <span className="text-xs text-muted-foreground">
                            {t("reportReason", {
                              reason: tReviews(
                                reviewReportReasonKey(report.reason)
                              ),
                            })}
                          </span>
                        </div>

                        <time
                          dateTime={report.createdAt}
                          className="text-xs tabular-nums text-muted-foreground"
                        >
                          {dateFormatter.format(new Date(report.createdAt))}
                        </time>
                      </div>

                      {review ? (
                        <div className="mt-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-serif text-2xl font-normal text-foreground">
                              {review.title}
                            </h2>
                            <StarRating
                              value={review.rating}
                              label={tReviews("ratingOutOfFive", {
                                rating: review.rating,
                              })}
                              size="sm"
                            />
                          </div>

                          <p className="mt-1 text-xs text-muted-foreground">
                            <span>
                              {review.displayName?.trim() ||
                                tReviews("anonymous")}
                            </span>
                            {review.productName ? (
                              <>
                                <span aria-hidden="true"> · </span>
                                {review.productSlug ? (
                                  <Link
                                    href={`/products/${review.productSlug}#reviews`}
                                    className="underline underline-offset-4 transition-colors hover:text-foreground"
                                  >
                                    {review.productName}
                                  </Link>
                                ) : (
                                  <span>{review.productName}</span>
                                )}
                              </>
                            ) : null}
                          </p>

                          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                            {review.body}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-4 text-sm text-muted-foreground">
                          {t("reviewUnavailable")}
                        </p>
                      )}

                      {report.details ? (
                        <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4">
                          <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
                            {t("reportDetailsLabel")}
                          </p>
                          <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-foreground">
                            {report.details}
                          </p>
                        </div>
                      ) : null}

                      <ReviewModerationControl report={report} review={review} />
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <AdminSearchProvider
          initialValue={reviewSearch}
          minLength={ADMIN_REVIEW_SEARCH_MIN}
        >
          <AdminReviewTable
            reviews={reviewResult.reviews}
            totalCount={reviewResult.totalCount}
            page={reviewResult.page}
            limit={reviewResult.limit}
            hasMore={reviewResult.hasMore}
            products={productOptions}
            locale={locale}
            initialFilters={{
              status: reviewStatusFilter,
              rating:
                reviewRatingFilter === null ? "all" : String(reviewRatingFilter),
              product: reviewProductId ?? "all",
            }}
          />
        </AdminSearchProvider>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{t("publicationNote")}</span>
      </p>
    </div>
  );
}
