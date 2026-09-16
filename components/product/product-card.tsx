"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils";
import { USD_TO_VND, SCENT_CATEGORIES } from "@/lib/constants";
import { useUIStore } from "@/stores/ui-store";
import { useAppLocale } from "@/hooks/use-locale";
import { ScrollReveal } from "@/components/animations/scroll-reveal";
import type { Product } from "@/types";

interface ProductCardProps {
  product: Product;
  index?: number;
}

export function ProductCard({ product, index = 0 }: ProductCardProps) {
  const currency = useUIStore((s) => s.currency);
  const locale = useAppLocale();
  const isSale = product.compareAtPrice && product.compareAtPrice > product.basePrice;

  const fmt = (usd: number) =>
    formatPrice(
      currency === "VND" ? Math.round(usd * USD_TO_VND) : usd,
      currency,
    );

  const cat = SCENT_CATEGORIES.find((c) => c.id === product.category);
  const catName = cat ? (locale === "vi" ? cat.nameVi : cat.name) : product.category;

  return (
    <ScrollReveal delay={index * 0.1}>
      <Link href={`/products/${product.slug}`} className="group block">
        <div className="relative aspect-[3/4] mb-4 overflow-hidden rounded-2xl bg-muted transition-all duration-500 group-hover:shadow-xl group-hover:shadow-primary/10">
          {/* Main placeholder background, replace with real Image later */}
          <div className="absolute inset-0 bg-gradient-to-br from-stone-200 to-stone-300 transition-transform duration-700 group-hover:scale-105" />
          
          {/* Centered candle silhouette placeholder */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-24 rounded-lg bg-black/5 backdrop-blur-sm transition-transform duration-700 group-hover:scale-105" />
          </div>

          {/* Badges & Actions */}
          <div className="absolute top-3 left-3 flex flex-col gap-2 z-10">
            {isSale && (
              <Badge variant="sale">
                {locale === "vi" ? "Đãi ngộ" : "Sale"}
              </Badge>
            )}
            {product.isFeatured && (
              <Badge variant="new">
                {locale === "vi" ? "Tuyển chọn" : "Featured"}
              </Badge>
            )}
          </div>

          <button 
            className="absolute top-3 right-3 z-10 p-2 rounded-full bg-white/50 backdrop-blur-md opacity-0 translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 hover:bg-white hover:text-destructive"
            onClick={(e) => {
              e.preventDefault();
              // Wishlist logic
            }}
            aria-label={locale === "vi" ? "Lưu vào danh sách ước" : "Add to wishlist"}
          >
            <Heart className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {catName}
          </p>
          <h3 className="font-serif text-lg font-medium text-foreground group-hover:text-primary transition-colors">
            {product.name}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {fmt(product.basePrice)}
            </span>
            {isSale && (
              <span className="text-sm text-muted-foreground line-through">
                {fmt(product.compareAtPrice!)}
              </span>
            )}
          </div>
        </div>
      </Link>
    </ScrollReveal>
  );
}
