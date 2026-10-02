import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAnyPermission } from "@/lib/authz";
import type { Product, ProductVariant, ScentCategory } from "@/types";

// ---------------------------------------------------------------------------
// Admin Product Management — Read-Only Data Access Layer (Phase 1)
//
// Gated by management permissions:
//   requireAnyPermission(["product.create", "product.update", "product.delete"])
//
// Read-only boundary:
//   - Uses user-scoped server client (createClient from @/lib/supabase/server)
//   - Retrieves active and inactive/draft products
//   - Includes product variants with stock_quantity for display only
//   - NEVER mutates product, variant, or stock data
//   - Stock movements remain strictly restricted to adjust_inventory_stock RPC
// ---------------------------------------------------------------------------

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
  scent_top: string[] | null;
  scent_heart: string[] | null;
  scent_base: string[] | null;
  images: string[] | null;
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
  created_at: string;
}

const ADMIN_PRODUCTS_SELECT = "*, product_variants(*)";

const uuidSchema = z.string().uuid("Invalid product identifier.");

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
    scentTop: row.scent_top ?? [],
    scentHeart: row.scent_heart ?? [],
    scentBase: row.scent_base ?? [],
    images: row.images ?? [],
    variants: (row.product_variants ?? []).map(mapVariant),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Fetch all products with their variants for administrative management.
 * Includes both active and inactive/draft products.
 *
 * Strictly READ ONLY.
 * Gated by: requireAnyPermission(["product.create", "product.update", "product.delete"]).
 * Ordered by newest first using products.created_at.
 */
export async function getAdminProducts(): Promise<Product[]> {
  // Authorization gate: must hold at least one product management permission
  await requireAnyPermission([
    "product.create",
    "product.update",
    "product.delete",
  ]);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select(ADMIN_PRODUCTS_SELECT)
    .order("created_at", { ascending: false })
    .order("price", { ascending: true, referencedTable: "product_variants" });

  if (error) {
    throw new Error(`Failed to fetch admin products: ${error.message}`);
  }

  return ((data as unknown as ProductRow[]) ?? []).map(mapProduct);
}

/**
 * Fetch a single product by its primary key ID with all variants for administrative management.
 * Includes inactive/draft products.
 *
 * Strictly READ ONLY.
 * The authorization check occurs independently and prior to ID evaluation.
 * Safe UUID validation ensures malformed input never reaches the database.
 * Gated by: requireAnyPermission(["product.create", "product.update", "product.delete"]).
 */
export async function getAdminProductById(id: string): Promise<Product | null> {
  // Authorization check must occur independently of the ID
  await requireAnyPermission([
    "product.create",
    "product.update",
    "product.delete",
  ]);

  if (!id || typeof id !== "string") {
    return null;
  }

  // Safe UUID validation consistent with existing codebase
  const parsed = uuidSchema.safeParse(id.trim());
  if (!parsed.success) {
    return null;
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select(ADMIN_PRODUCTS_SELECT)
    .eq("id", parsed.data)
    .order("price", { ascending: true, referencedTable: "product_variants" })
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch admin product: ${error.message}`);
  }

  return data ? mapProduct(data as unknown as ProductRow) : null;
}
