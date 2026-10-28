"use client";

import Link from "next/link";
import { Heart, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { ProductPicture } from "@/components/product/product-picture";
import { useUIStore } from "@/stores/ui-store";
import { useAppLocale } from "@/hooks/use-locale";
import { SCENT_CATEGORIES, USD_TO_VND } from "@/lib/constants";
import { cn, formatPrice } from "@/lib/utils";
import { useWishlist } from "./wishlist-provider";
import type { Product } from "@/types";

// ---------------------------------------------------------------------------
// One saved product on /account/wishlist.
//
// Visibility is derived from the shared store — never from local state — so
// removing here and removing from a product card are the same action: the id
// leaves the store, every heart for that product flips to "unsaved", and this
// row disappears. If the server rejects the removal the store rolls back and
// the row returns, because the server-rendered list is still the same list.
//
// The parent provider is hydrated with exactly the ids of the products it
// renders, so a row is saved at first paint and no ref/effect is needed.
// ---------------------------------------------------------------------------

export interface WishlistItemRowProps {
  product: Product;
}

export function WishlistItemRow({ product }: WishlistItemRowProps) {
  const t = useTranslations("wishlist");
  const currency = useUIStore((s) => s.currency);
  const locale = useAppLocale();
  const { isSaved, isPending, remove } = useWishlist();

  const saved = isSaved(product.id);
  const pending = isPending(product.id);

  if (!saved) return null;

  const category = SCENT_CATEGORIES.find((c) => c.id === product.category);
  const categoryName = category
    ? locale === "vi"
      ? category.nameVi
      : category.name
    : product.category;

  const price = formatPrice(
    currency === "VND"
      ? Math.round(product.basePrice * USD_TO_VND)
      : product.basePrice,
    currency
  );

  const image = product.images?.[0];

  return (
    <li className="flex items-center gap-4 py-6 sm:gap-6">
      <Link
        href={`/products/${product.slug}`}
        className="group shrink-0"
        tabIndex={-1}
        aria-hidden="true"
      >
        <div className="relative h-[86px] w-[68px] overflow-hidden rounded-xl bg-muted sm:h-24 sm:w-20">
          {image ? (
            <ProductPicture
              src={image}
              alt=""
              fill
              sizes="80px"
              className="transition-transform duration-500 group-hover:scale-[1.04]"
            />
          ) : null}
        </div>
      </Link>

      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-normal">
          {categoryName}
        </p>
        <h3 className="mt-1 font-serif text-[15px] sm:text-base font-normal leading-[1.3] text-foreground">
          <Link
            href={`/products/${product.slug}`}
            className="underline-offset-4 transition-colors hover:underline"
          >
            {product.name}
          </Link>
        </h3>
        <p className="mt-1.5 text-[13px] tabular-nums text-foreground font-normal">
          {price}
        </p>
      </div>

      <button
        type="button"
        onClick={() => remove(product.id)}
        disabled={pending}
        aria-label={t("removeLabel", { name: product.name })}
        aria-busy={pending || undefined}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full px-1 text-[12.5px] font-normal text-muted-foreground",
          "transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-progress disabled:opacity-70"
        )}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Heart className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
        )}
        <span>{t("removeAction")}</span>
      </button>
    </li>
  );
}
