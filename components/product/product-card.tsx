"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Heart } from "lucide-react";
import { ProductPicture } from "@/components/product/product-picture";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatPrice } from "@/lib/utils";
import { USD_TO_VND, SCENT_CATEGORIES } from "@/lib/constants";
import { useUIStore } from "@/stores/ui-store";
import { useAppLocale } from "@/hooks/use-locale";
import { useIntersection } from "@/hooks/use-intersection";
import type { Product } from "@/types";
import styles from "./product-card.module.css";

/** Per-column delay; resets on every row via the index modulo below. */
const STAGGER_MS = 80;

interface ProductCardProps {
  product: Product;
  index?: number;
  priority?: boolean;
  /** Grid columns at the largest breakpoint, used to compute row-aware delays. */
  columns?: 2 | 3 | 4;
}

export function ProductCard({
  product,
  index = 0,
  priority,
  columns = 4,
}: ProductCardProps) {
  const currency = useUIStore((s) => s.currency);
  const locale = useAppLocale();
  const isSale =
    product.compareAtPrice && product.compareAtPrice > product.basePrice;
  // Only the first row can be above the fold (page header takes the top of
  // the viewport); preloading more would compete with the real LCP image.
  const isAboveFold = priority ?? index < 2;

  // Above-the-fold cards render in their final state so the LCP image never
  // waits for hydration. Everything below reveals as its own card enters view.
  const [revealRef, inView] = useIntersection<HTMLDivElement>({
    triggerOnce: true,
    rootMargin: "0px 0px -8% 0px",
    threshold: 0.12,
  });

  const animateEntrance = !isAboveFold;
  const revealed = !animateEntrance || inView;

  const [primaryLoaded, setPrimaryLoaded] = useState(false);
  const [secondaryLoaded, setSecondaryLoaded] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  // React's synthetic load event can fire before hydration on a cached image;
  // read `complete` once on mount so already-loaded images skip the skeleton.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const check = (
      photo: string,
      setLoaded: (loaded: boolean) => void,
    ) => {
      const img = frame.querySelector<HTMLImageElement>(
        `[data-photo="${photo}"] img`,
      );
      if (img?.complete && img.naturalWidth > 0) setLoaded(true);
    };

    check("primary", setPrimaryLoaded);
    check("secondary", setSecondaryLoaded);
  }, []);

  const heartRef = useRef<HTMLButtonElement>(null);
  const popHeart = () => {
    const heart = heartRef.current;
    if (!heart) return;
    heart.classList.remove(styles.pop);
    // Restart the keyframe if the visitor taps repeatedly.
    void heart.offsetWidth;
    heart.classList.add(styles.pop);
  };

  const fmt = (usd: number) =>
    formatPrice(
      currency === "VND" ? Math.round(usd * USD_TO_VND) : usd,
      currency,
    );

  const cat = SCENT_CATEGORIES.find((c) => c.id === product.category);
  const catName = cat ? (locale === "vi" ? cat.nameVi : cat.name) : product.category;

  const primaryImage = product.images?.[0];
  const secondaryImage = product.images?.[1];

  const sizes =
    columns === 3
      ? "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
      : columns === 2
        ? "(min-width: 640px) 50vw, 100vw"
        : "(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw";

  // The grid is 1 column below 640px, 2 columns from 640px, and `columns`
  // from 1024px. Delays are index modulo the column count, so they reset on
  // each row instead of growing with the product index.
  const delayStyle = {
    "--product-stagger": "0ms",
    "--product-stagger-sm": `${(index % Math.min(columns, 2)) * STAGGER_MS}ms`,
    "--product-stagger-lg": `${(index % columns) * STAGGER_MS}ms`,
  } as CSSProperties;

  return (
    <div
      ref={revealRef}
      className={styles.reveal}
      data-revealed={revealed ? "true" : "false"}
      data-animate={animateEntrance ? "true" : "false"}
      style={delayStyle}
    >
      <Link
        href={`/products/${product.slug}`}
        className={cn("block", styles.card)}
      >
        <div
          ref={frameRef}
          className={cn(
            styles.frame,
            "relative aspect-[3/4] mb-4 overflow-hidden rounded-2xl bg-muted",
          )}
        >
          <div className={styles.mediaReveal}>
            {primaryImage ? (
              <div
                className={styles.photo}
                data-photo="primary"
                data-loaded={primaryLoaded ? "true" : "false"}
              >
                <ProductPicture
                  src={primaryImage}
                  alt={product.name}
                  fill
                  priority={isAboveFold}
                  loading={isAboveFold ? "eager" : "lazy"}
                  sizes={sizes}
                  className={styles.photoImage}
                  onLoad={() => setPrimaryLoaded(true)}
                />
              </div>
            ) : (
              <>
                {/* Main placeholder background, replace with real Image later */}
                <div className="absolute inset-0 bg-gradient-to-br from-stone-200 to-stone-300" />

                {/* Centered candle silhouette placeholder */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-24 w-16 rounded-lg bg-black/5 backdrop-blur-sm" />
                </div>
              </>
            )}

            {secondaryImage ? (
              <div
                className={cn(styles.photo, styles.photoSecondary)}
                data-photo="secondary"
                data-loaded={secondaryLoaded ? "true" : "false"}
                aria-hidden="true"
              >
                <ProductPicture
                  src={secondaryImage}
                  alt=""
                  fill
                  loading="lazy"
                  sizes={sizes}
                  className={styles.photoImage}
                  onLoad={() => setSecondaryLoaded(true)}
                />
              </div>
            ) : null}
          </div>

          {primaryImage ? (
            <Skeleton
              className={cn(styles.skeleton, "absolute inset-0 rounded-none")}
              data-hidden={primaryLoaded ? "true" : "false"}
              aria-hidden="true"
            />
          ) : null}

          <div className={styles.shade} aria-hidden="true" />

          {/* Badges & Actions */}
          <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
            {isSale && (
              <Badge
                variant="sale"
                className={cn(
                  styles.badge,
                  "border-transparent bg-destructive text-white shadow-sm backdrop-blur-md",
                )}
                style={{ "--badge-index": "0" } as CSSProperties}
              >
                {locale === "vi" ? "Đãi ngộ" : "Sale"}
              </Badge>
            )}
            {product.isFeatured && (
              <Badge
                variant="new"
                className={cn(
                  styles.badge,
                  "border-transparent bg-amber-dark text-warm-black shadow-sm backdrop-blur-md",
                )}
                style={
                  {
                    "--badge-index": isSale ? "1" : "0",
                  } as CSSProperties
                }
              >
                {locale === "vi" ? "Tuyển chọn" : "Featured"}
              </Badge>
            )}
          </div>

          <button
            ref={heartRef}
            type="button"
            className={cn(
              styles.wishlist,
              "absolute top-3 right-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-white/75 text-warm-black shadow-sm backdrop-blur-md",
            )}
            onClick={(e) => {
              e.preventDefault();
              // Wishlist persistence is not wired yet; keep the interaction
              // purely visual so the existing behaviour is unchanged.
              popHeart();
            }}
            onAnimationEnd={() => heartRef.current?.classList.remove(styles.pop)}
            aria-label={locale === "vi" ? "Lưu vào danh sách ước" : "Add to wishlist"}
          >
            <Heart className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-1">
          <p
            className={cn(
              styles.meta,
              "text-[12px] leading-[1.5] uppercase tracking-wider text-muted-foreground",
            )}
          >
            {catName}
          </p>
          <h3 className="font-serif text-[16px] sm:text-[17px] font-normal leading-[1.35] text-foreground">
            <span className={styles.title}>{product.name}</span>
          </h3>
          <div className="flex items-center gap-2">
            <span className={cn(styles.price, "text-[13px] font-normal tabular-nums")}>
              {fmt(product.basePrice)}
            </span>
            {isSale && (
              <span className="text-[12.5px] tabular-nums text-muted-foreground line-through">
                {fmt(product.compareAtPrice!)}
              </span>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}
