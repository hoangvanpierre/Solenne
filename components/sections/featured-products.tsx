"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { TextReveal } from "@/components/animations/text-reveal";
import { formatPrice } from "@/lib/utils";

const FEATURED_PRODUCTS = [
  {
    id: "1",
    slug: "midnight-garden",
    name: "Midnight Garden",
    category: "Floral",
    price: 42,
    color: "from-rose-200/40 to-pink-100/30",
  },
  {
    id: "2",
    slug: "cedar-sage",
    name: "Cedar & Sage",
    category: "Woody",
    price: 38,
    compareAtPrice: 45,
    color: "from-amber-200/40 to-orange-100/30",
  },
  {
    id: "3",
    slug: "ocean-breeze",
    name: "Ocean Breeze",
    category: "Fresh",
    price: 36,
    color: "from-emerald-200/40 to-teal-100/30",
  },
  {
    id: "4",
    slug: "vanilla-ember",
    name: "Vanilla Ember",
    category: "Warm",
    price: 44,
    color: "from-amber-300/40 to-yellow-100/30",
  },
];

export function FeaturedProducts() {
  return (
    <section className="py-24 lg:py-32 bg-background">
      <Container>
        {/* Section header */}
        <div className="mb-16 text-center">
          <ScrollReveal>
            <p className="text-sm tracking-[0.2em] uppercase text-muted-foreground mb-3">
              Our Collection
            </p>
          </ScrollReveal>
          <TextReveal
            text="Curated for You"
            as="h2"
            className="font-serif text-4xl md:text-5xl lg:text-6xl font-semibold text-foreground"
            splitBy="word"
          />
        </div>

        {/* Product grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {FEATURED_PRODUCTS.map((product, i) => (
            <ScrollReveal key={product.id} delay={i * 0.1}>
              <Link
                href={`/products/${product.slug}`}
                className="group block"
              >
                {/* Image placeholder */}
                <div
                  className={`relative aspect-[3/4] rounded-2xl bg-gradient-to-br ${product.color} overflow-hidden mb-4 transition-all duration-500 group-hover:shadow-xl group-hover:shadow-primary/10`}
                >
                  {/* Candle silhouette placeholder */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-16 h-24 rounded-lg bg-white/20 backdrop-blur-sm" />
                  </div>

                  {/* Sale badge */}
                  {"compareAtPrice" in product && product.compareAtPrice && (
                    <div className="absolute top-3 left-3">
                      <Badge variant="sale">Sale</Badge>
                    </div>
                  )}

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-500" />
                </div>

                {/* Product info */}
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    {product.category}
                  </p>
                  <h3 className="font-serif text-lg font-medium text-foreground group-hover:text-primary transition-colors">
                    {product.name}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {formatPrice(product.price)}
                    </span>
                    {"compareAtPrice" in product && product.compareAtPrice && (
                      <span className="text-sm text-muted-foreground line-through">
                        {formatPrice(product.compareAtPrice)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </ScrollReveal>
          ))}
        </div>

        {/* View All link */}
        <ScrollReveal>
          <div className="mt-12 text-center">
            <Link
              href="/products"
              className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors group"
            >
              View All Products
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </ScrollReveal>
      </Container>
    </section>
  );
}
