"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/components/layout/i18n-provider";
import { useAppLocale } from "@/hooks/use-locale";
import { cn } from "@/lib/utils";

export interface LocaleToggleProps {
  variant?: "default" | "transparent" | "footer";
  className?: string;
}

export function LocaleToggle({
  variant = "default",
  className,
}: LocaleToggleProps) {
  const i18n = useI18n();
  const locale = useAppLocale();

  const nextLocale = locale === "en" ? "vi" : "en";
  const label = locale.toUpperCase();
  const isPending = i18n?.isPending ?? false;

  const handleToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isPending) return;

    if (i18n) {
      i18n.setLocale(nextLocale);
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isPending}
      className={cn(
        "relative flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium tracking-wide transition-colors duration-200 cursor-pointer select-none",
        variant === "default" &&
          "text-foreground/70 hover:text-foreground hover:bg-muted",
        variant === "transparent" &&
          "text-cream/80 hover:text-cream hover:bg-white/10",
        variant === "footer" &&
          "text-cream/50 hover:text-cream/80",
        isPending && "opacity-60 cursor-wait",
        className
      )}
      aria-label={`Switch language to ${nextLocale === "en" ? "English" : "Tiếng Việt"}`}
      aria-current="true"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={locale}
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -6, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="inline-flex items-center gap-1 uppercase font-semibold"
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
