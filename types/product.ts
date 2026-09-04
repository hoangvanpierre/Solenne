export type ScentCategory = 'floral' | 'woody' | 'fresh' | 'warm';

export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  size?: string;
  burnTime?: string;
  price: number;
  stockQuantity: number;
  sku?: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  tagline?: string;
  description?: string;
  category: ScentCategory;
  basePrice: number;
  compareAtPrice?: number;
  isActive: boolean;
  isFeatured: boolean;
  scentTop: string[];
  scentHeart: string[];
  scentBase: string[];
  images: string[];
  variants: ProductVariant[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductFilters {
  category?: ScentCategory;
  priceRange?: [number, number];
  sortBy?: 'newest' | 'price-asc' | 'price-desc' | 'popular';
  search?: string;
}
