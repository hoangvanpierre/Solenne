import { useMemo } from "react";
import { useCartStore } from "@/stores/cart-store";
import { SHIPPING } from "@/lib/constants";

export function useCart() {
  const store = useCartStore();

  const itemCount = useMemo(
    () => store.items.reduce((sum, item) => sum + item.quantity, 0),
    [store.items]
  );

  const subtotal = useMemo(
    () =>
      store.items.reduce(
        (sum, item) => sum + item.variant.price * item.quantity,
        0
      ),
    [store.items]
  );

  const shippingFee = useMemo(() => {
    if (subtotal === 0) return 0;
    return subtotal >= SHIPPING.freeThresholdUSD
      ? 0
      : SHIPPING.flatRateUSD;
  }, [subtotal]);

  const total = useMemo(
    () => subtotal + shippingFee,
    [subtotal, shippingFee]
  );

  return {
    ...store,
    itemCount,
    subtotal,
    shippingFee,
    total,
  };
}
