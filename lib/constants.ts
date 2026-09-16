// ============================================
// SOLENNE — Site Constants & Configuration
// ============================================

export const SITE_NAME = "Solenne";
export const SITE_DESCRIPTION =
  "Artisan scented candles crafted with intention. Illuminate your moments with Solenne's hand-poured, natural soy wax candles.";
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://solenne.com";

export const CONTACT_EMAIL = "dangvohoangvan@gmail.com";

// --- Navigation Links ---
export const NAV_LINKS = [
  { label: "Home", labelVi: "Trang chủ", href: "/" },
  { label: "Shop", labelVi: "Cửa hàng", href: "/products" },
  { label: "Collections", labelVi: "Bộ sưu tập", href: "/collections" },
  { label: "About", labelVi: "Câu chuyện Solenne", href: "/about" },
  { label: "Journal", labelVi: "Nhật ký hương", href: "/journal" },
  { label: "Contact", labelVi: "Liên hệ", href: "/contact" },
] as const;

// --- Footer Links ---
export const FOOTER_LINKS = {
  shop: {
    title: "Shop",
    titleVi: "Tác phẩm của Nhà hương",
    links: [
      { label: "All Products", labelVi: "Tất cả sáng tạo", href: "/products" },
      { label: "Collections", labelVi: "Bộ sưu tập", href: "/collections" },
      { label: "New Arrivals", labelVi: "Tác phẩm mới", href: "/products?sort=newest" },
      { label: "Best Sellers", labelVi: "Được trân quý nhất", href: "/products?sort=popular" },
      { label: "Gift Sets", labelVi: "Hộp quà thượng hạng", href: "/collections/gift-sets" },
    ],
  },
  about: {
    title: "About",
    titleVi: "Di sản Solenne",
    links: [
      { label: "Our Story", labelVi: "Câu chuyện Nhà hương", href: "/about" },
      { label: "Craftsmanship", labelVi: "Nghệ thuật chế tác", href: "/about#craft" },
      { label: "Ingredients", labelVi: "Nguyên liệu tự nhiên", href: "/about#ingredients" },
      { label: "Sustainability", labelVi: "Cam kết bền vững", href: "/about#sustainability" },
    ],
  },
  support: {
    title: "Support",
    titleVi: "Chăm sóc tri âm",
    links: [
      { label: "Contact Us", labelVi: "Liên hệ chúng tôi", href: "/contact" },
      { label: "FAQ", labelVi: "Câu hỏi thường gặp", href: "/faq" },
      { label: "Shipping & Returns", labelVi: "Giao hàng & Đổi trả", href: "/shipping" },
      { label: "Candle Care Guide", labelVi: "Nghi thức chăm sóc nến", href: "/care-guide" },
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

export const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";

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

// Product prices are stored in USD; VND display amounts are derived via this rate.
export const USD_TO_VND = 25_000;

// --- Announcement Messages ---
export const ANNOUNCEMENTS = [
  "Free shipping on orders over $50",
  "Handcrafted with natural soy wax",
  "New: Summer Bloom Collection ✨",
  "Gift wrapping available at checkout",
] as const;

