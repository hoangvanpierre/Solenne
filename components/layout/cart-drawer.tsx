"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { X, Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/use-cart";
import { useLockedBody } from "@/hooks/use-locked-body";

export function CartDrawer() {
  const {
    items,
    isCartOpen,
    closeCart,
    removeItem,
    updateQuantity,
    itemCount,
    subtotal,
    shippingFee,
    total,
  } = useCart();

  useLockedBody(isCartOpen);

  return (
    <AnimatePresence>
      {isCartOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[60] bg-black/60"
            onClick={closeCart}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-[70] w-full max-w-md bg-background shadow-2xl"
          >
            <div className="flex h-full flex-col">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <h2 className="font-serif text-xl font-semibold">
                  Your Cart ({itemCount})
                </h2>
                <button
                  onClick={closeCart}
                  className="p-2 hover:bg-muted rounded-full transition-colors"
                  aria-label="Close cart"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Cart items */}
              {items.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                    <ShoppingBag className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-serif text-foreground">
                    Your cart is empty
                  </p>
                  <p className="text-sm text-muted-foreground text-center">
                    Discover our collection of artisan scented candles
                  </p>
                  <Button onClick={closeCart} variant="default" asChild>
                    <Link href="/products">Shop Now</Link>
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                    {items.map((item) => (
                      <motion.div
                        key={`${item.product.id}-${item.variant.id}`}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: 50 }}
                        className="flex gap-4"
                      >
                        {/* Product image placeholder */}
                        <div className="h-24 w-24 flex-shrink-0 rounded-lg bg-muted" />

                        <div className="flex flex-1 flex-col justify-between">
                          <div>
                            <h3 className="font-serif text-sm font-medium">
                              {item.product.name}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              {item.variant.name}
                              {item.variant.size && ` · ${item.variant.size}`}
                            </p>
                          </div>

                          <div className="flex items-center justify-between">
                            {/* Quantity controls */}
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() =>
                                  updateQuantity(
                                    item.product.id,
                                    item.variant.id,
                                    item.quantity - 1
                                  )
                                }
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-border hover:bg-muted transition-colors"
                                aria-label="Decrease quantity"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="w-6 text-center text-sm">
                                {item.quantity}
                              </span>
                              <button
                                onClick={() =>
                                  updateQuantity(
                                    item.product.id,
                                    item.variant.id,
                                    item.quantity + 1
                                  )
                                }
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-border hover:bg-muted transition-colors"
                                aria-label="Increase quantity"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>

                            {/* Price + Remove */}
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium">
                                {formatPrice(
                                  item.variant.price * item.quantity
                                )}
                              </span>
                              <button
                                onClick={() =>
                                  removeItem(item.product.id, item.variant.id)
                                }
                                className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                                aria-label="Remove item"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {/* Footer */}
                  <div className="border-t border-border px-6 py-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>{formatPrice(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Shipping</span>
                      <span>
                        {shippingFee === 0 ? "Free" : formatPrice(shippingFee)}
                      </span>
                    </div>
                    <div className="flex justify-between text-base font-semibold border-t border-border pt-3">
                      <span>Total</span>
                      <span>{formatPrice(total)}</span>
                    </div>

                    <Button className="w-full" size="lg">
                      Checkout
                    </Button>

                    <button
                      onClick={closeCart}
                      className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Continue Shopping
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
