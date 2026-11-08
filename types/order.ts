export type OrderStatus = 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

/**
 * How a row entered the status history. `backfill` is deliberately distinct:
 * it represents only the status found when the history table was introduced,
 * never a transition that was observed happening.
 */
export type OrderStatusEventSource =
  | 'creation'
  | 'transition'
  | 'cancellation'
  | 'backfill';

export interface OrderStatusEvent {
  id: string;
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorUserId?: string;
  /** Resolved only for the management timeline; customers never see actors. */
  actorName?: string;
  reason?: string;
  trackingCode?: string;
  source: OrderStatusEventSource;
  createdAt: string;
}

export interface ShippingAddress {
  fullName: string;
  phone: string;
  email?: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
  countryCode?: "VN" | "US" | string;
  provinceCode?: string;
  wardCode?: string;
  administrativeType?: string;
  provinceName?: string;
  wardName?: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  variantId: string;
  productName: string;
  variantName?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

/** URL-facing filter/pagination input for the management order list. */
export interface OrderFilterParams {
  page?: number | string;
  limit?: number | string;
  /** Exact order status, or "all"/undefined for every status. */
  status?: string;
  /** Order number, order id (uuid), customer email or customer name fragment. */
  search?: string;
}

export interface AdminOrderQueryResult {
  orders: Order[];
  totalCount: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  shippingFee: number;
  discount: number;
  total: number;
  shippingAddress: ShippingAddress;
  trackingCode?: string;
  stripeSessionId?: string;
  stripePaymentIntent?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
