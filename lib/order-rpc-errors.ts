/**
 * Pure mapping between errors raised by public.create_order() (migration
 * 0016) and user-facing checkout messages.
 *
 * The database encodes failures as `CODE||human readable detail`. Keeping this
 * parser free of Next/Supabase imports lets the unit tests exercise every
 * branch without a database.
 */

export interface CreateOrderRpcError {
  code: string;
  detail?: string;
}

const FRIENDLY_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Please sign in to place an order.",
  ACCOUNT_INACTIVE: "This account is not active. Please contact support.",
  FORBIDDEN: "You do not have permission to place orders.",
  INVALID_EMAIL: "Please enter a valid email address.",
  INVALID_ADDRESS: "Please check your shipping details.",
  INVALID_NOTES: "Order notes cannot exceed 500 characters.",
  EMPTY_CART: "Your cart is empty.",
  TOO_MANY_ITEMS: "Your cart contains too many items.",
  INVALID_ITEMS: "Your cart contains an invalid item.",
  INVALID_VARIANT_ID: "One of the items in your cart is no longer available.",
  INVALID_QUANTITY: "Quantity must be a whole number between 1 and 99.",
  DUPLICATE_VARIANT:
    "Your cart contains duplicate items. Please refresh and try again.",
  VARIANT_NOT_FOUND: "One of the items in your cart is no longer available.",
  PRODUCT_UNAVAILABLE: "An item in your cart is no longer available.",
  INSUFFICIENT_STOCK:
    "One of the items in your cart no longer has enough stock. Please adjust your cart and try again.",
  IDEMPOTENCY_KEY_REQUIRED:
    "We could not verify this checkout. Please refresh the page and try again.",
  IDEMPOTENCY_KEY_INVALID:
    "We could not verify this checkout. Please refresh the page and try again.",
  IDEMPOTENCY_CONFLICT:
    "This checkout was already submitted with different details. Please refresh your cart and try again.",
  ORDER_NUMBER_GENERATION_FAILED:
    "We could not reserve an order number. Please try again.",
};

/** Codes whose database detail is already a complete, user-facing sentence. */
const DETAIL_MESSAGES = new Set([
  "PRODUCT_UNAVAILABLE",
  "INSUFFICIENT_STOCK",
  "VARIANT_NOT_FOUND",
  "IDEMPOTENCY_CONFLICT",
]);

export const GENERIC_CREATE_ORDER_MESSAGE =
  "We couldn't place your order. Please try again, or contact us if the problem persists.";

export function parseCreateOrderRpcError(
  message: string | null | undefined
): CreateOrderRpcError {
  const raw = (message ?? "").trim();
  if (!raw) return { code: "UNKNOWN" };

  const separator = raw.indexOf("||");
  if (separator === -1) {
    return { code: "UNKNOWN", detail: raw };
  }

  const code = raw.slice(0, separator).trim();
  const detail = raw.slice(separator + 2).trim();

  return {
    code: code || "UNKNOWN",
    detail: detail || undefined,
  };
}

export function createOrderErrorMessage(
  message: string | null | undefined
): string {
  const { code, detail } = parseCreateOrderRpcError(message);

  if (detail && DETAIL_MESSAGES.has(code)) {
    return detail;
  }

  return FRIENDLY_MESSAGES[code] ?? GENERIC_CREATE_ORDER_MESSAGE;
}
