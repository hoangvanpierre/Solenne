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

