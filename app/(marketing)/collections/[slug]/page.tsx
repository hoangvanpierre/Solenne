import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { ProductGrid } from "@/components/product";
import { SCENT_CATEGORIES } from "@/lib/constants";
import {
  getFeaturedProducts,
  getProductsByCategory,
} from "@/lib/products";
import type { ScentCategory } from "@/types";

interface CollectionPageProps {
  params: Promise<{ slug: string }>;
}

function isScentCategory(slug: string): slug is ScentCategory {
  return SCENT_CATEGORIES.some((category) => category.id === slug);
}

async function getCollection(slug: string) {
  if (isScentCategory(slug)) {
    const category = SCENT_CATEGORIES.find((item) => item.id === slug);
    if (!category) return null;

    return {
      title: `${category.name} Collection`,
      description: category.description,
      products: await getProductsByCategory(slug),
    };
  }

  if (slug === "gift-sets") {
    return {
      title: "Gift Sets",
      description:
        "Thoughtfully composed sets of our most-loved candles, ready to give.",
      products: await getFeaturedProducts(),
    };
  }

  return null;
}

export async function generateMetadata({
  params,
}: CollectionPageProps): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getCollection(slug);

  if (!collection) return { title: "Collection not found — Solenne" };

  return {
    title: `${collection.title} — Solenne`,
    description: collection.description,
  };
}

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { slug } = await params;
  const collection = await getCollection(slug);

  if (!collection) notFound();

  return (
    <div className="py-24 lg:py-32">
      <Container>
        <nav
          aria-label="Breadcrumb"
          className="mb-8 text-sm text-muted-foreground"
        >
          <Link
            href="/collections"
            className="transition-colors hover:text-foreground"
          >
            Collections
          </Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{collection.title}</span>
        </nav>

        <div className="mb-12">
          <h1 className="font-serif text-4xl md:text-5xl font-semibold mb-4 text-foreground">
            {collection.title}
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            {collection.description}
          </p>
        </div>

        <ProductGrid products={collection.products} columns={3} />
      </Container>
    </div>
  );
}
