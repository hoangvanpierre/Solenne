"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useUIStore } from "@/stores/ui-store";
import { CURRENCIES, type CurrencyCode } from "@/lib/constants";
import { cn } from "@/lib/utils";

export interface CurrencyToggleProps {
  /** Controls colour scheme to match parent context. */
  variant?: "default" | "transparent" | "footer";
  className?: string;
}

export function CurrencyToggle({
  variant = "default",
  className,
}: CurrencyToggleProps) {
  const currency = useUIStore((s) => s.currency);
  const setCurrency = useUIStore((s) => s.setCurrency);

  const next: CurrencyCode = currency === "USD" ? "VND" : "USD";

  return (
    <button
      type="button"
      onClick={() => setCurrency(next)}
      className={cn(
        "relative flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium tracking-wide transition-colors duration-200 cursor-pointer select-none",
        variant === "default" &&
          "text-foreground/70 hover:text-foreground hover:bg-muted",
        variant === "transparent" &&
          "text-cream/80 hover:text-cream hover:bg-white/10",
        variant === "footer" &&
          "text-cream/50 hover:text-cream/80",
        className,
      )}
      aria-label={`Switch currency to ${CURRENCIES[next].name}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={currency}
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -6, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="inline-flex items-center gap-1"
        >
          <span>{CURRENCIES[currency].symbol}</span>
          <span>{currency}</span>
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
