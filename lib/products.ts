import { createClient } from "@/lib/supabase/server";
import type { Product, ProductVariant, ScentCategory } from "@/types";

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  category: string;
  base_price: number | string;
  compare_at_price: number | string | null;
  is_active: boolean;
  is_featured: boolean;
  scent_top: string[];
  scent_heart: string[];
  scent_base: string[];
  images: string[];
  created_at: string;
  updated_at: string;
  product_variants: VariantRow[] | null;
}

interface VariantRow {
  id: string;
  product_id: string;
  name: string;
  size: string | null;
  burn_time: string | null;
  price: number | string;
  stock_quantity: number;
  sku: string | null;
}

const PRODUCTS_SELECT = "*, product_variants(*)";

// PostgREST returns numeric columns as strings
function toNumber(value: number | string): number {
  return typeof value === "string" ? Number(value) : value;
}

function mapVariant(row: VariantRow): ProductVariant {
  return {
    id: row.id,
    productId: row.product_id,
    name: row.name,
    size: row.size ?? undefined,
    burnTime: row.burn_time ?? undefined,
    price: toNumber(row.price),
    stockQuantity: row.stock_quantity,
    sku: row.sku ?? undefined,
  };
}

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline ?? undefined,
    description: row.description ?? undefined,
    category: row.category as ScentCategory,
    basePrice: toNumber(row.base_price),
    compareAtPrice:
      row.compare_at_price === null ? undefined : toNumber(row.compare_at_price),
    isActive: row.is_active,
    isFeatured: row.is_featured,
    scentTop: row.scent_top,
    scentHeart: row.scent_heart,
    scentBase: row.scent_base,
    images: row.images,
    variants: (row.product_variants ?? []).map(mapVariant),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getProducts(): Promise<Product[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCTS_SELECT)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .order("price", { ascending: true, referencedTable: "product_variants" });

  if (error) throw new Error(`Failed to fetch products: ${error.message}`);

  return (data as unknown as ProductRow[]).map(mapProduct);
}

export async function getProductsByCategory(
  category: ScentCategory
): Promise<Product[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCTS_SELECT)
    .eq("is_active", true)
    .eq("category", category)
    .order("created_at", { ascending: false })
    .order("price", { ascending: true, referencedTable: "product_variants" });

  if (error) {
    throw new Error(`Failed to fetch products by category: ${error.message}`);
  }

  return (data as unknown as ProductRow[]).map(mapProduct);
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCTS_SELECT)
    .eq("slug", slug)
    .eq("is_active", true)
    .order("price", { ascending: true, referencedTable: "product_variants" })
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch product: ${error.message}`);

  return data ? mapProduct(data as unknown as ProductRow) : null;
}

export async function getFeaturedProducts(): Promise<Product[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCTS_SELECT)
    .eq("is_active", true)
    .eq("is_featured", true)
    .order("created_at", { ascending: true })
    .limit(4);

  if (error) throw new Error(`Failed to fetch featured products: ${error.message}`);

  return (data as unknown as ProductRow[]).map(mapProduct);
}
