import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import type { ScentCategory } from "@/types";

export interface AdminInventoryItem {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  category: ScentCategory;
  isProductActive: boolean;
  name: string;
  size?: string;
  burnTime?: string;
  sku?: string;
  price: number;
  stockQuantity: number;
  createdAt: string;
}

interface VariantWithProductRow {
  id: string;
  product_id: string;
  name: string;
  size: string | null;
  burn_time: string | null;
  sku: string | null;
  price: number | string;
  stock_quantity: number;
  created_at: string;
  products: {
    id: string;
    name: string;
    slug: string;
    category: string;
    is_active: boolean;
  } | null;
}

function toNumber(value: number | string): number {
  return typeof value === "string" ? Number(value) : value;
}

/**
 * Fetch all product variants with associated product metadata for administrative inventory management.
 * Strictly READ-ONLY. Gated by inventory.read.
 */
export async function getAdminInventory(): Promise<AdminInventoryItem[]> {
  await requirePermission("inventory.read");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_variants")
    .select(
      `
      id,
      product_id,
      name,
      size,
      burn_time,
      sku,
      price,
      stock_quantity,
      created_at,
      products (
        id,
        name,
        slug,
        category,
        is_active
      )
    `
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch inventory: ${error.message}`);
  }

  const rows = (data as unknown as VariantWithProductRow[]) ?? [];

  return rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: row.products?.name ?? "Unknown Product",
    productSlug: row.products?.slug ?? "",
    category: (row.products?.category as ScentCategory) ?? "floral",
    isProductActive: row.products?.is_active ?? false,
    name: row.name,
    size: row.size ?? undefined,
    burnTime: row.burn_time ?? undefined,
    sku: row.sku ?? undefined,
    price: toNumber(row.price),
    stockQuantity: row.stock_quantity,
    createdAt: row.created_at,
  }));
}
