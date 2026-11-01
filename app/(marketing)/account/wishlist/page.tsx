import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, ArrowRight, Heart } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWishlistProducts } from "@/lib/wishlist";
import {
  isRestrictedAuthError,
  isUnauthenticatedAuthError,
} from "@/lib/authz-ux";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RestrictedAccountNotice } from "@/components/account";
import { WishlistItemRow, WishlistProvider } from "@/components/wishlist";

export const metadata: Metadata = {
  title: "Wishlist — Solenne",
  description: "Candles you've saved from the Solenne collection.",
};

// Guests are bounced to the login form with an internal return path, which the
// login action re-validates through sanitizeNextPath().
const WISHLIST_LOGIN_HREF = `/login?next=${encodeURIComponent(
  "/account/wishlist"
)}`;

function WishlistListSkeleton() {
  return (
    <ul className="divide-y divide-border">
      {[0, 1, 2].map((index) => (
        <li key={index} className="flex items-center gap-4 py-6 sm:gap-6">
          <Skeleton className="h-[86px] w-[68px] shrink-0 rounded-xl sm:h-24 sm:w-20" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-24 rounded-full" />
            <Skeleton className="h-4 w-48 rounded-full" />
            <Skeleton className="h-3 w-16 rounded-full" />
          </div>
        </li>
      ))}
    </ul>
  );
}

async function WishlistList({ locale }: { locale: string }) {
  const t = await getTranslations("wishlist");

  let products;
  try {
    products = await getWishlistProducts();
  } catch (error) {
    if (isUnauthenticatedAuthError(error)) redirect(WISHLIST_LOGIN_HREF);
    if (isRestrictedAuthError(error)) {
      return <RestrictedAccountNotice locale={locale} />;
    }

    console.error("Failed to load wishlist:", error);
    return (
      <div
        role="alert"
        className="rounded-2xl border border-border p-6 text-sm leading-relaxed text-muted-foreground"
      >
        <p>{t("loadError")}</p>
        <Link
          href="/contact"
          className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-normal text-foreground underline-offset-4 hover:underline"
        >
          <span>{t("contactUs")}</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border px-6 py-16 text-center">
        <Heart
          className="h-9 w-9 text-muted-foreground"
          aria-hidden="true"
          strokeWidth={1.5}
        />
        <p className="font-serif text-xl sm:text-2xl font-normal text-foreground">
          {t("emptyTitle")}
        </p>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          {t("emptyDescription")}
        </p>
        <Button asChild size="sm" className="mt-2">
          <Link href="/products" className="inline-flex items-center gap-2">
            <span>{t("emptyCta")}</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    );
  }

  // The provider is hydrated with exactly the ids of the rows it renders, so
  // every row is "saved" at first paint and a failed removal can restore it by
  // simply rolling the store back — no local per-row state involved.
  return (
    <WishlistProvider initialIds={products.map((product) => product.id)}>
      <ul className="divide-y divide-border">
        {products.map((product) => (
          <WishlistItemRow key={product.id} product={product} />
        ))}
      </ul>
    </WishlistProvider>
  );
}

export default async function WishlistPage() {
  const locale = await getLocale();
  const t = await getTranslations("wishlist");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(WISHLIST_LOGIN_HREF);
  }

  return (
    <div className="py-24 lg:py-32 account-page">
      <Container className="max-w-3xl">
        <nav
          aria-label="Breadcrumb"
          className="mb-8 text-[13px] text-muted-foreground font-normal"
        >
          <Link
            href="/account"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {t("backToAccount")}
          </Link>
        </nav>

        <div className="mb-10">
          <h1 className="font-serif text-2xl sm:text-3xl font-normal leading-[1.22] mb-3 text-foreground tracking-[0.02em]">
            {t("title")}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed font-normal">
            {t("subtitle")}
          </p>
        </div>

        <Suspense fallback={<WishlistListSkeleton />}>
          <WishlistList locale={locale} />
        </Suspense>
      </Container>
    </div>
  );
}
