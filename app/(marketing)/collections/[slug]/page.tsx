import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { ProductGrid } from "@/components/product";
import { WishlistProvider } from "@/components/wishlist";
import { SCENT_CATEGORIES } from "@/lib/constants";
import { getWishlistProductIdsForViewer } from "@/lib/wishlist";
import {
  getFeaturedProducts,
  getProductsByCategory,
} from "@/lib/products";
import type { ScentCategory } from "@/types";

import { getLocale } from "next-intl/server";

interface CollectionPageProps {
  params: Promise<{ slug: string }>;
}

function isScentCategory(slug: string): slug is ScentCategory {
  return SCENT_CATEGORIES.some((category) => category.id === slug);
}

async function getCollection(slug: string, isVi: boolean = false) {
  if (isScentCategory(slug)) {
    const category = SCENT_CATEGORIES.find((item) => item.id === slug);
    if (!category) return null;

    return {
      title: isVi
        ? `Bộ sưu tập ${category.nameVi.toLowerCase()}`
        : `${category.name} collection`,
      description: isVi ? category.descriptionVi : category.description,
      products: await getProductsByCategory(slug),
    };
  }

  if (slug === "gift-sets") {
    return {
      title: isVi ? "Bộ quà tặng" : "Gift sets",
      description: isVi
        ? "Bộ nến đóng hộp sẵn để tặng, gồm những mùi hương được yêu thích nhất."
        : "Boxed sets of our most-loved candles, ready to give.",
      products: await getFeaturedProducts(),
    };
  }

  return null;
}

export async function generateMetadata({
  params,
}: CollectionPageProps): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const collection = await getCollection(slug, locale === "vi");

  if (!collection) return { title: "Collection not found — Solenne" };

  return {
    title: `${collection.title} — Solenne`,
    description: collection.description,
  };
}

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { slug } = await params;
  const locale = await getLocale();
  const isVi = locale === "vi";
  const collection = await getCollection(slug, isVi);

  if (!collection) notFound();

  // One server-rendered fetch hydrates every heart in the grid; the cards
  // themselves never query the wishlist.
  const wishlistIds = await getWishlistProductIdsForViewer();

  return (
    <div className="py-24 lg:py-32">
      <Container>
        <nav
          aria-label={isVi ? "Đường dẫn" : "Breadcrumb"}
          className="mb-8 text-[13px] text-muted-foreground font-normal"
        >
          <Link
            href="/collections"
            className="transition-colors hover:text-foreground"
          >
            {isVi ? "Bộ sưu tập" : "Collections"}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{collection.title}</span>
        </nav>

        <div className="mb-12">
          <h1 className="font-serif text-2xl sm:text-3xl font-normal leading-[1.22] mb-3 text-foreground tracking-[0.02em]">
            {collection.title}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base max-w-2xl font-normal leading-relaxed">
            {collection.description}
          </p>
        </div>

        <WishlistProvider initialIds={wishlistIds}>
          <ProductGrid products={collection.products} columns={3} />
        </WishlistProvider>
      </Container>
    </div>
  );
}
