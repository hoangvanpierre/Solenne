import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { getReviewableDeliveredItems } from "@/lib/reviews";

// Server-rendered "awaiting your review" list for /account/orders.
//
// Only delivered products appear, and only while the product is active, so
// every link lands on a page that exists. A failure here is supplementary: the
// order history still renders, so the section logs and disappears instead of
// turning the whole page into an error.

export async function ReviewInvitation() {
  const t = await getTranslations("reviews");

  let items: Awaited<ReturnType<typeof getReviewableDeliveredItems>> = [];

  try {
    items = await getReviewableDeliveredItems();
  } catch (error) {
    console.error("ReviewInvitation: failed to load reviewable items:", error);
    return null;
  }

  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="account-reviews-title"
      className="mt-12 rounded-2xl border border-border p-6 sm:p-8"
    >
      <h2
        id="account-reviews-title"
        className="font-serif text-xl font-normal text-foreground sm:text-2xl"
      >
        {t("account.title")}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {t("account.description")}
      </p>

      <ul className="mt-5 divide-y divide-border">
        {items.map((item) => (
          <li
            key={item.productId}
            className="flex flex-wrap items-center justify-between gap-3 py-4"
          >
            <div className="min-w-0">
              <p className="text-sm font-normal text-foreground">
                {item.productName}
              </p>
              <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                {t("account.order", { number: item.orderNumber })}
              </p>
            </div>

            {item.productSlug ? (
              <Link
                href={`/products/${item.productSlug}#reviews`}
                className="inline-flex items-center gap-1.5 rounded text-xs text-foreground underline underline-offset-4 transition-colors hover:text-amber focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span>
                  {item.reviewId ? t("account.edit") : t("account.write")}
                </span>
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
