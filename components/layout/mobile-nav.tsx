"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { X, User } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { useAppLocale } from "@/hooks/use-locale";
import { useLockedBody } from "@/hooks/use-locked-body";
import { NAV_LINKS, SOCIAL_LINKS } from "@/lib/constants";
import { CurrencyToggle } from "@/components/layout/currency-toggle";
import { LocaleToggle } from "@/components/layout/locale-toggle";

export function MobileNav() {
  const isOpen = useUIStore((s) => s.isMobileNavOpen);
  const closeMobileNav = useUIStore((s) => s.closeMobileNav);
  const locale = useAppLocale();

  useLockedBody(isOpen);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[60] bg-black/60"
            onClick={closeMobileNav}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-[70] w-full max-w-sm bg-background"
          >
            <div className="flex h-full flex-col px-8 py-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-12">
                <span className="font-serif text-2xl font-bold">Solenne</span>
                <button
                  onClick={closeMobileNav}
                  className="p-2 hover:bg-muted rounded-full transition-colors"
                  aria-label={locale === "vi" ? "Đóng bảng điều hướng" : "Close menu"}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Navigation links */}
              <nav className="flex-1 space-y-2">
                {NAV_LINKS.map((link, i) => (
                  <motion.div
                    key={link.href}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.05 }}
                  >
                    <Link
                      href={link.href}
                      onClick={closeMobileNav}
                      className="block py-3 font-serif text-3xl font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {locale === "vi" ? link.labelVi : link.label}
                    </Link>
                  </motion.div>
                ))}

                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + NAV_LINKS.length * 0.05 }}
                  className="pt-4 border-t border-border/50"
                >
                  <Link
                    href="/account"
                    onClick={closeMobileNav}
                    className="inline-flex items-center gap-2.5 py-2 text-sm uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <User className="w-4 h-4" />
                    <span>
                      {locale === "vi" ? "Không gian cá nhân" : "My Account"}
                    </span>
                  </Link>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + NAV_LINKS.length * 0.05 }}
                  className="pt-2 flex items-center gap-3"
                >
                  <CurrencyToggle className="text-sm text-muted-foreground hover:text-foreground" />
                  <span className="text-border">·</span>
                  <LocaleToggle className="text-sm text-muted-foreground hover:text-foreground" />
                </motion.div>
              </nav>

              {/* Social links */}
              <div className="border-t border-border pt-6">
                <div className="flex gap-6">
                  {SOCIAL_LINKS.map((social) => (
                    <a
                      key={social.label}
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {social.label}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
