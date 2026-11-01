// ============================================
// SOLENNE — Site Constants & Configuration
// ============================================

export const SITE_NAME = "Solenne";
export const SITE_DESCRIPTION =
  "Hand-poured scented candles made in small batches with natural soy wax. Light for the moments that matter.";
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://solenne.com";

export const CONTACT_EMAIL = "dangvohoangvan@gmail.com";

// --- Navigation Links ---
export const NAV_LINKS = [
  { label: "Home", labelVi: "Trang chủ", href: "/" },
  { label: "Shop", labelVi: "Sản phẩm", href: "/products" },
  { label: "Collections", labelVi: "Bộ sưu tập", href: "/collections" },
  { label: "About", labelVi: "Giới thiệu", href: "/about" },
  { label: "Journal", labelVi: "Tạp chí", href: "/journal" },
  { label: "Contact", labelVi: "Liên hệ", href: "/contact" },
] as const;

// --- Footer Links ---
export const FOOTER_LINKS = {
  shop: {
    title: "Shop",
    titleVi: "Sản phẩm",
    links: [
      { label: "All Products", labelVi: "Tất cả sản phẩm", href: "/products" },
      { label: "Collections", labelVi: "Bộ sưu tập", href: "/collections" },
      { label: "New Arrivals", labelVi: "Sản phẩm mới", href: "/products?sort=newest" },
      { label: "Best Sellers", labelVi: "Bán chạy", href: "/products?sort=popular" },
      { label: "Gift Sets", labelVi: "Bộ quà tặng", href: "/collections/gift-sets" },
    ],
  },
  about: {
    title: "About",
    titleVi: "Giới thiệu",
    links: [
      { label: "Our Story", labelVi: "Câu chuyện của Solenne", href: "/about" },
      { label: "Craftsmanship", labelVi: "Cách chúng tôi làm", href: "/about#craft" },
      { label: "Ingredients", labelVi: "Nguyên liệu", href: "/about#ingredients" },
      { label: "Sustainability", labelVi: "Môi trường", href: "/about#sustainability" },
    ],
  },
  support: {
    title: "Support",
    titleVi: "Hỗ trợ",
    links: [
      { label: "Contact Us", labelVi: "Liên hệ", href: "/contact" },
      { label: "FAQ", labelVi: "Câu hỏi thường gặp", href: "/faq" },
      { label: "Shipping & Returns", labelVi: "Giao hàng & Đổi trả", href: "/shipping" },
      { label: "Candle Care Guide", labelVi: "Cách chăm sóc nến", href: "/care-guide" },
    ],
  },
} as const;

// --- Social Links ---
export const SOCIAL_LINKS = [
  {
    label: "Instagram",
    href: "https://www.instagram.com/w.vennn/",
    icon: "instagram",
  },
  {
    label: "Facebook",
    href: "https://www.facebook.com/to.van.374",
    icon: "facebook",
  },
  {
    label: "Pinterest",
    href: "https://pin.it/2KLHbLCl4",
    icon: "pinterest",
  },
  {
    label: "TikTok",
    href: "https://www.tiktok.com/@imabigpig4",
    icon: "tiktok",
  },
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

export const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";

// --- Scent Categories ---
export const SCENT_CATEGORIES = [
  {
    id: "floral" as const,
    name: "Floral",
    nameVi: "Hoa",
    description: "Soft blooms and fresh-cut petals",
    descriptionVi: "Hoa mềm và cánh hoa vừa cắt",
    color: "#D4A5A5",
    bgColor: "bg-blush/20",
    icon: "flower",
  },
  {
    id: "woody" as const,
    name: "Woody",
    nameVi: "Gỗ",
    description: "Cedar, sandalwood and dry earth",
    descriptionVi: "Tuyết tùng, đàn hương và hương đất khô",
    color: "#8B7355",
    bgColor: "bg-amber/20",
    icon: "tree",
  },
  {
    id: "fresh" as const,
    name: "Fresh",
    nameVi: "Tươi mát",
    description: "Citrus peel, sea air and morning dew",
    descriptionVi: "Vỏ cam chanh, gió biển và sương mai",
    color: "#8B9A82",
    bgColor: "bg-sage/20",
    icon: "wind",
  },
  {
    id: "warm" as const,
    name: "Warm",
    nameVi: "Ấm áp",
    description: "Vanilla, amber and warm spice",
    descriptionVi: "Vani, hổ phách và gia vị ấm",
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

// Product prices are stored in USD; VND display amounts are derived via this rate.
export const USD_TO_VND = 25_000;

// --- Announcement Messages ---
export const ANNOUNCEMENTS = [
  "Free shipping on orders over $50",
  "Hand-poured with natural soy wax",
  "New: Summer Bloom collection",
  "Gift wrapping available at checkout",
] as const;

