import { useMemo, useCallback } from "react";
import { useCartStore } from "@/stores/cart-store";
import { useUIStore } from "@/stores/ui-store";
import { formatPrice } from "@/lib/utils";
import { SHIPPING, USD_TO_VND } from "@/lib/constants";

export function useCart() {
  const store = useCartStore();
  const currency = useUIStore((state) => state.currency);

  const itemCount = useMemo(
    () => store.items.reduce((sum, item) => sum + item.quantity, 0),
    [store.items]
  );

  const subtotalUSD = useMemo(
    () =>
      store.items.reduce(
        (sum, item) => sum + item.variant.price * item.quantity,
        0
      ),
    [store.items]
  );

  const subtotal = useMemo(
    () =>
      currency === "VND"
        ? Math.round(subtotalUSD * USD_TO_VND)
        : subtotalUSD,
    [subtotalUSD, currency]
  );

  const shippingFee = useMemo(() => {
    if (subtotal === 0) return 0;
    if (currency === "VND") {
      return subtotal >= SHIPPING.freeThresholdVND
        ? 0
        : SHIPPING.flatRateVND;
    }
    return subtotal >= SHIPPING.freeThresholdUSD ? 0 : SHIPPING.flatRateUSD;
  }, [subtotal, currency]);

  const total = useMemo(
    () => subtotal + shippingFee,
    [subtotal, shippingFee]
  );

  // Formats a USD amount in the display currency (for per-item prices, which
  // come from product data stored in USD).
  const format = useCallback(
    (amountUSD: number) =>
      formatPrice(
        currency === "VND" ? Math.round(amountUSD * USD_TO_VND) : amountUSD,
        currency
      ),
    [currency]
  );

  // Formats an amount that is already in the display currency (for the
  // derived subtotal/shippingFee/total below).
  const formatDisplay = useCallback(
    (amount: number) => formatPrice(amount, currency),
    [currency]
  );

  return {
    ...store,
    currency,
    itemCount,
    subtotal,
    shippingFee,
    total,
    format,
    formatDisplay,
  };
}
