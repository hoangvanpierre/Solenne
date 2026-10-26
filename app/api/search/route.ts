import { getProducts } from "@/lib/products";
import { getOptimizedProductImage } from "@/lib/product-images";
import { SCENT_CATEGORIES, USD_TO_VND } from "@/lib/constants";
import type {
  LocalizedText,
  SearchIndex,
  SearchIndexCollection,
  SearchIndexProduct,
} from "@/lib/search";
import type { Product } from "@/types";

/**
 * Public search index for the command palette.
 *
 * This route deliberately takes no request parameters: the client sends only a
 * bare GET, so there is no user-controlled input to validate or pass to the
 * database. `getProducts()` already filters to active products; the mapping
 * below projects only public catalogue fields. Exact stock counts, costs,
 * variants, compare-at prices, timestamps and admin metadata stay server-side.
 */

export const dynamic = "force-dynamic";

const SHORT_DESCRIPTION_LENGTH = 200;

function localized(value: string | null | undefined): LocalizedText {
  // The current catalogue stores one copy per product; collection copy is
  // genuinely bilingual. Mirroring the product copy keeps both locale buckets
  // searchable without inventing translations the data layer does not own.
  const text = value?.trim() ?? "";
  return { en: text, vi: text };
}

function shortDescription(value: string | null | undefined): string {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";
  if (text.length <= SHORT_DESCRIPTION_LENGTH) return text;

  const clipped = text.slice(0, SHORT_DESCRIPTION_LENGTH - 1);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${(lastSpace > 80 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}

function thumbnailPath(product: Product): string | null {
  const source = product.images?.[0];
  if (!source) return null;

  const optimized = getOptimizedProductImage(source);
  if (!optimized) return source;

  // The generated 384px variant is enough for a 48–56px palette thumbnail and
  // avoids pulling the 640/1200px files into a small result row.
  return `/images/product/optimized/${optimized.slug}-384.webp`;
}

function mapProduct(product: Product): SearchIndexProduct {
  const category = SCENT_CATEGORIES.find(
    (entry) => entry.id === product.category,
  );

  return {
    id: product.id,
    slug: product.slug,
    name: localized(product.name),
    description: localized(shortDescription(product.description)),
    scentFamily: product.category,
    family: {
      en: category?.name ?? product.category,
      vi: category?.nameVi ?? product.category,
    },
    familyDescription: {
      en: category?.description ?? "",
      vi: category?.descriptionVi ?? "",
    },
    notes: {
      top: {
        en: [...product.scentTop],
        vi: [...product.scentTop],
      },
      heart: {
        en: [...product.scentHeart],
        vi: [...product.scentHeart],
      },
      base: {
        en: [...product.scentBase],
        vi: [...product.scentBase],
      },
    },
    price: {
      USD: product.basePrice,
      VND: Math.round(product.basePrice * USD_TO_VND),
    },
    // Stock quantity is intentionally reduced to a boolean at the boundary.
    inStock: product.variants.some((variant) => variant.stockQuantity > 0),
    image: thumbnailPath(product),
  };
}

function buildCollections(): SearchIndexCollection[] {
  const scentCollections: SearchIndexCollection[] = SCENT_CATEGORIES.map(
    (category) => ({
      slug: category.id,
      name: { en: category.name, vi: category.nameVi },
      description: {
        en: category.description,
        vi: category.descriptionVi,
      },
      scentFamily: category.id,
    }),
  );

  return [
    ...scentCollections,
    {
      slug: "gift-sets",
      name: { en: "Gift Sets", vi: "Hộp Quà Thượng Hạng" },
      description: {
        en: "Thoughtfully composed sets of our most-loved candles, ready to give.",
        vi: "Những bộ nến tuyển chọn được đóng gói trang trọng trong hộp quà lụa, sẵn sàng trao gửi tâm tình.",
      },
      scentFamily: null,
    },
  ];
}

export async function GET() {
  try {
    const products = await getProducts();

    const index: SearchIndex = {
      version: 1,
      products: products.map(mapProduct),
      collections: buildCollections(),
    };

    return Response.json(index, {
      headers: {
        "Cache-Control":
          "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("[search] Failed to build the public search index.", error);

    return Response.json(
      { error: "Search index temporarily unavailable." },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
