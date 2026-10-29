import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Flag, Info, MessageSquare, ShieldAlert } from "lucide-react";
import { AuthError, requirePermission } from "@/lib/authz";
import {
  isRestrictedAuthError,
  isUnauthenticatedAuthError,
} from "@/lib/authz-ux";
import {
  REVIEW_REPORT_STATUS_FILTERS,
  countOpenReviewReports,
  getAdminReviewReports,
  normalizeReviewReportStatusFilter,
} from "@/lib/admin-reviews";
import { isMissingReviewSchema, reviewReportReasonKey } from "@/lib/reviews-core";
import {
  AdminBreadcrumb,
  AdminPageHeader,
  AdminStatePanel,
  AdminStatusBadge,
  ReviewModerationControl,
} from "@/components/admin";
import { RestrictedAccountNotice } from "@/components/account";
import { StarRating } from "@/components/reviews/star-rating";
import { Button } from "@/components/ui";
import type { AdminReviewReportEntry } from "@/types";

export const metadata: Metadata = {
  title: "Review Reports - Administration",
};

interface AdminReviewsPageProps {
  searchParams: Promise<{ status?: string }>;
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
  const filter = normalizeReviewReportStatusFilter(rawParams.status);

  let accountRestricted = false;
  let forbiddenAccess = false;
  let loadFailed = false;
  let schemaUnavailable = false;

  let entries: AdminReviewReportEntry[] = [];
  let openCount: number | null = null;

  try {
    // Explicit server-side permission check before any review data is read.
    // lib/admin-reviews.ts repeats it so a direct call cannot bypass this page.
    await requirePermission("review.manage_reports");

    entries = await getAdminReviewReports(filter);
    openCount = await countOpenReviewReports();
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
      // instead of pretending the queue is empty.
      schemaUnavailable = true;
    } else {
      console.error("AdminReviewsPage: failed to load review reports:", error);
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
                <Link href={`/admin/reviews?status=${filter}`}>
                  {t("retry")}
                </Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const dateFormatter = new Intl.DateTimeFormat(
    isVi ? "vi-VN" : "en-US",
    { dateStyle: "medium" }
  );

  return (
    <div className="space-y-6 py-4">
      <AdminBreadcrumb label={isVi ? "Trung tâm quản trị" : "Admin Hub"} />

      <AdminPageHeader
        eyebrow={
          <div className="inline-flex items-center gap-2 rounded-full border border-amber/30 bg-amber/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-foreground">
            <Flag className="h-3.5 w-3.5 text-amber-dark" aria-hidden="true" />
            <span>{t("eyebrow")}</span>
          </div>
        }
        title={t("title")}
        description={t("description")}
        meta={
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
        }
      />

      <nav aria-label={t("filterLabel")} className="flex flex-wrap items-center gap-2">
        {REVIEW_REPORT_STATUS_FILTERS.map((value) => {
          const active = filter === value;
          return (
            <Link
              key={value}
              href={`/admin/reviews?status=${value}`}
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
            filter === "open" ? t("emptyOpenDescription") : t("emptyDescription")
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

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{t("publicationNote")}</span>
      </p>
    </div>
  );
}
