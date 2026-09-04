// ============================================
// SOLENNE — Site Constants & Configuration
// ============================================

export const SITE_NAME = "Solenne";
export const SITE_DESCRIPTION =
  "Artisan scented candles crafted with intention. Illuminate your moments with Solenne's hand-poured, natural soy wax candles.";
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://solenne.com";

// --- Navigation Links ---
export const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Shop", href: "/products" },
  { label: "Collections", href: "/collections" },
  { label: "About", href: "/about" },
  { label: "Journal", href: "/journal" },
  { label: "Contact", href: "/contact" },
] as const;

// --- Footer Links ---
export const FOOTER_LINKS = {
  shop: {
    title: "Shop",
    links: [
      { label: "All Products", href: "/products" },
      { label: "Collections", href: "/collections" },
      { label: "New Arrivals", href: "/products?sort=newest" },
      { label: "Best Sellers", href: "/products?sort=popular" },
      { label: "Gift Sets", href: "/collections/gift-sets" },
    ],
  },
  about: {
    title: "About",
    links: [
      { label: "Our Story", href: "/about" },
      { label: "Craftsmanship", href: "/about#craft" },
      { label: "Ingredients", href: "/about#ingredients" },
      { label: "Sustainability", href: "/about#sustainability" },
    ],
  },
  support: {
    title: "Support",
    links: [
      { label: "Contact Us", href: "/contact" },
      { label: "FAQ", href: "/faq" },
      { label: "Shipping & Returns", href: "/shipping" },
      { label: "Candle Care Guide", href: "/care-guide" },
    ],
  },
} as const;

// --- Social Links ---
export const SOCIAL_LINKS = [
  {
    label: "Instagram",
    href: "https://instagram.com/solenne",
    icon: "instagram",
  },
  {
    label: "Facebook",
    href: "https://facebook.com/solenne",
    icon: "facebook",
  },
  {
    label: "Pinterest",
    href: "https://pinterest.com/solenne",
    icon: "pinterest",
  },
  { label: "TikTok", href: "https://tiktok.com/@solenne", icon: "tiktok" },
] as const;

// --- Currency Configuration ---
export const CURRENCIES = {
  USD: {
    code: "USD" as const,
    symbol: "$",
    locale: "en-US",
    name: "US Dollar",
  },
  VND: {
    code: "VND" as const,
    symbol: "₫",
    locale: "vi-VN",
    name: "Vietnamese Dong",
  },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

// --- Scent Categories ---
export const SCENT_CATEGORIES = [
  {
    id: "floral" as const,
    name: "Floral",
    nameVi: "Hoa",
    description: "Delicate blooms and garden-fresh petals",
    descriptionVi: "Hương hoa tinh tế và cánh hoa tươi mát",
    color: "#D4A5A5",
    bgColor: "bg-blush/20",
    icon: "flower",
  },
  {
    id: "woody" as const,
    name: "Woody",
    nameVi: "Gỗ",
    description: "Warm cedar, sandalwood, and earthy tones",
    descriptionVi: "Gỗ tuyết tùng ấm áp, đàn hương và hương đất",
    color: "#8B7355",
    bgColor: "bg-amber/20",
    icon: "tree",
  },
  {
    id: "fresh" as const,
    name: "Fresh",
    nameVi: "Tươi mát",
    description: "Crisp citrus, ocean breeze, and morning dew",
    descriptionVi: "Cam chanh tươi mát, gió biển và sương mai",
    color: "#8B9A82",
    bgColor: "bg-sage/20",
    icon: "wind",
  },
  {
    id: "warm" as const,
    name: "Warm",
    nameVi: "Ấm áp",
    description: "Rich vanilla, amber, and spiced comfort",
    descriptionVi: "Vanilla nồng nàn, hổ phách và hương gia vị",
    color: "#C4956A",
    bgColor: "bg-amber/20",
    icon: "flame",
  },
] as const;

// --- Shipping Configuration ---
export const SHIPPING = {
  freeThresholdUSD: 50,
  freeThresholdVND: 1_000_000,
  flatRateUSD: 5.99,
  flatRateVND: 30_000,
} as const;

// --- Announcement Messages ---
export const ANNOUNCEMENTS = [
  "Free shipping on orders over $50",
  "Handcrafted with natural soy wax",
  "New: Summer Bloom Collection ✨",
  "Gift wrapping available at checkout",
] as const;

import type { Product } from "@/types";

// --- Placeholder Product Data ---
export const PLACEHOLDER_PRODUCTS: Product[] = [
  {
    id: "1",
    slug: "midnight-garden",
    name: "Midnight Garden",
    tagline: "A moonlit stroll through blooming jasmine",
    category: "floral" as const,
    basePrice: 42,
    compareAtPrice: undefined,
    isFeatured: true,
    isActive: true,
    scentTop: ["Bergamot", "Green Leaves"],
    scentHeart: ["Jasmine", "Rose", "Lily of the Valley"],
    scentBase: ["Musk", "Cedarwood", "Amber"],
    images: [],
    description:
      "Inspired by evening gardens in full bloom, Midnight Garden captures the intoxicating fragrance of jasmine and rose under a canopy of stars. Hand-poured with natural soy wax and infused with premium essential oils.",
    variants: [
      {
        id: "1a",
        productId: "1",
        name: "Small",
        size: "90g",
        burnTime: "25 hours",
        price: 28,
        stockQuantity: 50,
        sku: "MG-SM",
      },
      {
        id: "1b",
        productId: "1",
        name: "Medium",
        size: "200g",
        burnTime: "50 hours",
        price: 42,
        stockQuantity: 30,
        sku: "MG-MD",
      },
      {
        id: "1c",
        productId: "1",
        name: "Large",
        size: "350g",
        burnTime: "80 hours",
        price: 58,
        stockQuantity: 20,
        sku: "MG-LG",
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "2",
    slug: "cedar-sage",
    name: "Cedar & Sage",
    tagline: "A forest retreat for the soul",
    category: "woody" as const,
    basePrice: 38,
    compareAtPrice: 45,
    isFeatured: true,
    isActive: true,
    scentTop: ["Eucalyptus", "Lemon"],
    scentHeart: ["Sage", "Lavender", "Pine"],
    scentBase: ["Cedarwood", "Vetiver", "Patchouli"],
    images: [],
    description:
      "Escape to a serene forest with Cedar & Sage. This grounding blend combines earthy cedarwood with aromatic sage, creating a calming atmosphere perfect for meditation and reflection.",
    variants: [
      {
        id: "2a",
        productId: "2",
        name: "Small",
        size: "90g",
        burnTime: "25 hours",
        price: 26,
        stockQuantity: 40,
        sku: "CS-SM",
      },
      {
        id: "2b",
        productId: "2",
        name: "Medium",
        size: "200g",
        burnTime: "50 hours",
        price: 38,
        stockQuantity: 25,
        sku: "CS-MD",
      },
      {
        id: "2c",
        productId: "2",
        name: "Large",
        size: "350g",
        burnTime: "80 hours",
        price: 54,
        stockQuantity: 15,
        sku: "CS-LG",
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "3",
    slug: "ocean-breeze",
    name: "Ocean Breeze",
    tagline: "The calm of coastal mornings",
    category: "fresh" as const,
    basePrice: 36,
    compareAtPrice: undefined,
    isFeatured: true,
    isActive: true,
    scentTop: ["Sea Salt", "Lemon", "Bergamot"],
    scentHeart: ["Jasmine", "Lily", "Ozone"],
    scentBase: ["Driftwood", "Musk", "Amber"],
    images: [],
    description:
      "Breathe in the freshness of Ocean Breeze. This revitalizing blend captures the essence of early morning coastal walks — crisp sea salt, gentle ozone, and sun-warmed driftwood.",
    variants: [
      {
        id: "3a",
        productId: "3",
        name: "Small",
        size: "90g",
        burnTime: "25 hours",
        price: 24,
        stockQuantity: 60,
        sku: "OB-SM",
      },
      {
        id: "3b",
        productId: "3",
        name: "Medium",
        size: "200g",
        burnTime: "50 hours",
        price: 36,
        stockQuantity: 35,
        sku: "OB-MD",
      },
      {
        id: "3c",
        productId: "3",
        name: "Large",
        size: "350g",
        burnTime: "80 hours",
        price: 52,
        stockQuantity: 20,
        sku: "OB-LG",
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "4",
    slug: "vanilla-ember",
    name: "Vanilla Ember",
    tagline: "Warmth that lingers",
    category: "warm" as const,
    basePrice: 44,
    compareAtPrice: undefined,
    isFeatured: true,
    isActive: true,
    scentTop: ["Cinnamon", "Cardamom", "Pink Pepper"],
    scentHeart: ["Vanilla", "Tonka Bean", "Caramel"],
    scentBase: ["Sandalwood", "Benzoin", "Musk"],
    images: [],
    description:
      "Wrap yourself in the comforting warmth of Vanilla Ember. Rich Madagascar vanilla meets smoky embers and exotic spices, creating an irresistibly cozy ambiance for cold evenings.",
    variants: [
      {
        id: "4a",
        productId: "4",
        name: "Small",
        size: "90g",
        burnTime: "25 hours",
        price: 30,
        stockQuantity: 45,
        sku: "VE-SM",
      },
      {
        id: "4b",
        productId: "4",
        name: "Medium",
        size: "200g",
        burnTime: "50 hours",
        price: 44,
        stockQuantity: 28,
        sku: "VE-MD",
      },
      {
        id: "4c",
        productId: "4",
        name: "Large",
        size: "350g",
        burnTime: "80 hours",
        price: 62,
        stockQuantity: 12,
        sku: "VE-LG",
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "5",
    slug: "golden-hour",
    name: "Golden Hour",
    tagline: "Captured sunlight in a jar",
    category: "warm" as const,
    basePrice: 40,
    compareAtPrice: 48,
    isFeatured: false,
    isActive: true,
    scentTop: ["Mandarin", "Saffron", "Ginger"],
    scentHeart: ["Honey", "Amber", "Rose Absolute"],
    scentBase: ["Sandalwood", "Vanilla", "Caramel"],
    images: [],
    description:
      "Golden Hour captures that magical moment when the sun dips low and bathes everything in warm, golden light. A luxurious blend of honey, saffron, and amber.",
    variants: [
      {
        id: "5a",
        productId: "5",
        name: "Small",
        size: "90g",
        burnTime: "25 hours",
        price: 28,
        stockQuantity: 35,
        sku: "GH-SM",
      },
      {
        id: "5b",
        productId: "5",
        name: "Medium",
        size: "200g",
        burnTime: "50 hours",
        price: 40,
        stockQuantity: 22,
        sku: "GH-MD",
      },
      {
        id: "5c",
        productId: "5",
        name: "Large",
        size: "350g",
        burnTime: "80 hours",
        price: 56,
        stockQuantity: 18,
        sku: "GH-LG",
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "6",
    slug: "wild-lavender",
    name: "Wild Lavender",
    tagline: "Fields of purple serenity",
    category: "floral" as const,
    basePrice: 36,
    compareAtPrice: undefined,
    isFeatured: false,
    isActive: true,
    scentTop: ["Lavender", "Eucalyptus", "Lemon"],
    scentHeart: ["French Lavender", "Clary Sage", "Geranium"],
    scentBase: ["Cedarwood", "Tonka Bean", "White Musk"],
    images: [],
    description:
      "Transport yourself to the lavender fields of Provence. Wild Lavender is a soothing, herbaceous blend that promotes relaxation and restful sleep.",
    variants: [
      {
        id: "6a",
        productId: "6",
        name: "Small",
        size: "90g",
        burnTime: "25 hours",
        price: 24,
        stockQuantity: 55,
        sku: "WL-SM",
      },
      {
        id: "6b",
        productId: "6",
        name: "Medium",
        size: "200g",
        burnTime: "50 hours",
        price: 36,
        stockQuantity: 30,
        sku: "WL-MD",
      },
      {
        id: "6c",
        productId: "6",
        name: "Large",
        size: "350g",
        burnTime: "80 hours",
        price: 50,
        stockQuantity: 20,
        sku: "WL-LG",
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];
