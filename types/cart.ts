import type { Product, ProductVariant } from '@/types/product';

export interface CartItem {
  product: Product;
  variant: ProductVariant;
  quantity: number;
}

export interface Cart {
  items: CartItem[];
  subtotal: number;
  shippingFee: number;
  discount: number;
  total: number;
}
