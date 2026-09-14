// Seeds the products/product_variants tables with the Solenne launch catalog.
// Rerunnable: removes existing rows for these slugs before inserting.
// Usage: node scripts/seed-products.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const idx = line.indexOf("=");
    if (idx > 0 && !line.startsWith("#")) {
      env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return env;
}

const CATALOG = [
  {
    slug: "midnight-garden",
    name: "Midnight Garden",
    tagline: "A moonlit stroll through blooming jasmine",
    description:
      "Inspired by evening gardens in full bloom, Midnight Garden captures the intoxicating fragrance of jasmine and rose under a canopy of stars. Hand-poured with natural soy wax and infused with premium essential oils.",
    category: "floral",
    base_price: 42,
    compare_at_price: null,
    is_featured: true,
    scent_top: ["Bergamot", "Green Leaves"],
    scent_heart: ["Jasmine", "Rose", "Lily of the Valley"],
    scent_base: ["Musk", "Cedarwood", "Amber"],
    variants: [
      { name: "Small", size: "90g", burn_time: "25 hours", price: 28, stock_quantity: 50, sku: "MG-SM" },
      { name: "Medium", size: "200g", burn_time: "50 hours", price: 42, stock_quantity: 30, sku: "MG-MD" },
      { name: "Large", size: "350g", burn_time: "80 hours", price: 58, stock_quantity: 20, sku: "MG-LG" },
    ],
  },
  {
    slug: "cedar-sage",
    name: "Cedar & Sage",
    tagline: "A forest retreat for the soul",
    description:
      "Escape to a serene forest with Cedar & Sage. This grounding blend combines earthy cedarwood with aromatic sage, creating a calming atmosphere perfect for meditation and reflection.",
    category: "woody",
    base_price: 38,
    compare_at_price: 45,
    is_featured: true,
    scent_top: ["Eucalyptus", "Lemon"],
    scent_heart: ["Sage", "Lavender", "Pine"],
    scent_base: ["Cedarwood", "Vetiver", "Patchouli"],
    variants: [
      { name: "Small", size: "90g", burn_time: "25 hours", price: 26, stock_quantity: 40, sku: "CS-SM" },
      { name: "Medium", size: "200g", burn_time: "50 hours", price: 38, stock_quantity: 25, sku: "CS-MD" },
      { name: "Large", size: "350g", burn_time: "80 hours", price: 54, stock_quantity: 15, sku: "CS-LG" },
    ],
  },
  {
    slug: "ocean-breeze",
    name: "Ocean Breeze",
    tagline: "The calm of coastal mornings",
    description:
      "Breathe in the freshness of Ocean Breeze. This revitalizing blend captures the essence of early morning coastal walks - crisp sea salt, gentle ozone, and sun-warmed driftwood.",
    category: "fresh",
    base_price: 36,
    compare_at_price: null,
    is_featured: true,
    scent_top: ["Sea Salt", "Lemon", "Bergamot"],
    scent_heart: ["Jasmine", "Lily", "Ozone"],
    scent_base: ["Driftwood", "Musk", "Amber"],
    variants: [
      { name: "Small", size: "90g", burn_time: "25 hours", price: 24, stock_quantity: 60, sku: "OB-SM" },
      { name: "Medium", size: "200g", burn_time: "50 hours", price: 36, stock_quantity: 35, sku: "OB-MD" },
      { name: "Large", size: "350g", burn_time: "80 hours", price: 52, stock_quantity: 20, sku: "OB-LG" },
    ],
  },
  {
    slug: "vanilla-ember",
    name: "Vanilla Ember",
    tagline: "Warmth that lingers",
    description:
      "Wrap yourself in the comforting warmth of Vanilla Ember. Rich Madagascar vanilla meets smoky embers and exotic spices, creating an irresistibly cozy ambiance for cold evenings.",
    category: "warm",
    base_price: 44,
    compare_at_price: null,
    is_featured: true,
    scent_top: ["Cinnamon", "Cardamom", "Pink Pepper"],
    scent_heart: ["Vanilla", "Tonka Bean", "Caramel"],
    scent_base: ["Sandalwood", "Benzoin", "Musk"],
    variants: [
      { name: "Small", size: "90g", burn_time: "25 hours", price: 30, stock_quantity: 45, sku: "VE-SM" },
      { name: "Medium", size: "200g", burn_time: "50 hours", price: 44, stock_quantity: 28, sku: "VE-MD" },
      { name: "Large", size: "350g", burn_time: "80 hours", price: 62, stock_quantity: 12, sku: "VE-LG" },
    ],
  },
  {
    slug: "golden-hour",
    name: "Golden Hour",
    tagline: "Captured sunlight in a jar",
    description:
      "Golden Hour captures that magical moment when the sun dips low and bathes everything in warm, golden light. A luxurious blend of honey, saffron, and amber.",
    category: "warm",
    base_price: 40,
    compare_at_price: 48,
    is_featured: false,
    scent_top: ["Mandarin", "Saffron", "Ginger"],
    scent_heart: ["Honey", "Amber", "Rose Absolute"],
    scent_base: ["Sandalwood", "Vanilla", "Caramel"],
    variants: [
      { name: "Small", size: "90g", burn_time: "25 hours", price: 28, stock_quantity: 35, sku: "GH-SM" },
      { name: "Medium", size: "200g", burn_time: "50 hours", price: 40, stock_quantity: 22, sku: "GH-MD" },
      { name: "Large", size: "350g", burn_time: "80 hours", price: 56, stock_quantity: 18, sku: "GH-LG" },
    ],
  },
  {
    slug: "wild-lavender",
    name: "Wild Lavender",
    tagline: "Fields of purple serenity",
    description:
      "Transport yourself to the lavender fields of Provence. Wild Lavender is a soothing, herbaceous blend that promotes relaxation and restful sleep.",
    category: "floral",
    base_price: 36,
    compare_at_price: null,
    is_featured: false,
    scent_top: ["Lavender", "Eucalyptus", "Lemon"],
    scent_heart: ["French Lavender", "Clary Sage", "Geranium"],
    scent_base: ["Cedarwood", "Tonka Bean", "White Musk"],
    variants: [
      { name: "Small", size: "90g", burn_time: "25 hours", price: 24, stock_quantity: 55, sku: "WL-SM" },
      { name: "Medium", size: "200g", burn_time: "50 hours", price: 36, stock_quantity: 30, sku: "WL-MD" },
      { name: "Large", size: "350g", burn_time: "80 hours", price: 50, stock_quantity: 20, sku: "WL-LG" },
    ],
  },
];

async function main() {
  const env = loadEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);
  const slugs = CATALOG.map((p) => p.slug);
  const now = Date.now();

  const { data: existing, error: fetchError } = await supabase
    .from("products")
    .select("id")
    .in("slug", slugs);
  if (fetchError) throw fetchError;

  if (existing && existing.length > 0) {
    const ids = existing.map((row) => row.id);
    const { error: variantDeleteError } = await supabase
      .from("product_variants")
      .delete()
      .in("product_id", ids);
    if (variantDeleteError) throw variantDeleteError;
    const { error: productDeleteError } = await supabase
      .from("products")
      .delete()
      .in("id", ids);
    if (productDeleteError) throw productDeleteError;
  }

  const productRows = CATALOG.map((product, i) => ({
    slug: product.slug,
    name: product.name,
    tagline: product.tagline,
    description: product.description,
    category: product.category,
    base_price: product.base_price,
    compare_at_price: product.compare_at_price,
    is_active: true,
    is_featured: product.is_featured,
    scent_top: product.scent_top,
    scent_heart: product.scent_heart,
    scent_base: product.scent_base,
    images: [],
    created_at: new Date(now - i * 86_400_000).toISOString(),
    updated_at: new Date(now).toISOString(),
  }));

  const { data: inserted, error: insertError } = await supabase
    .from("products")
    .insert(productRows)
    .select("id, slug");
  if (insertError) throw insertError;

  const idBySlug = Object.fromEntries(inserted.map((row) => [row.slug, row.id]));
  const variantRows = CATALOG.flatMap((product) =>
    product.variants.map((variant) => ({ ...variant, product_id: idBySlug[product.slug] }))
  );

  const { error: variantError } = await supabase
    .from("product_variants")
    .insert(variantRows);
  if (variantError) throw variantError;

  console.log(`Seeded ${inserted.length} products and ${variantRows.length} variants.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
