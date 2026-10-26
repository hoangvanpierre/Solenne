"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag, Menu, Search, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/icon-button";
import { useCartStore } from "@/stores/cart-store";
import { useUIStore } from "@/stores/ui-store";
import { useAppLocale } from "@/hooks/use-locale";
import { useAuthz } from "@/hooks/use-authz";
import { useSamePageReload } from "@/hooks/use-same-page-reload";
import { NAV_LINKS } from "@/lib/constants";
import { prefetchSearchIndex } from "@/lib/search-index-client";
import { CurrencyToggle } from "@/components/layout/currency-toggle";
import { LocaleToggle } from "@/components/layout/locale-toggle";
import { BrandLogo } from "@/components/layout/brand-logo";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  // Auth state is resolved server-side once per document by AuthzShell; no
  // client-side Supabase round trip needed here.
  const { isAuthenticated } = useAuthz();
  const pathname = usePathname();
  const isHome = pathname === "/";
  const items = useCartStore((s) => s.items);
  const openCart = useCartStore((s) => s.openCart);
  const toggleMobileNav = useUIStore((s) => s.toggleMobileNav);
  const openSearch = useUIStore((s) => s.openSearch);
  const isSearchOpen = useUIStore((s) => s.isSearchOpen);
  const locale = useAppLocale();
  // A click on the link for the page we are already on reloads it at the top;
  // every other link keeps Next's normal client-side navigation.
  const handleNavClick = useSamePageReload();

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  // The transparent/cream styling is only intended for the dark home hero;
  // every other page uses the solid header from the top.
  const solid = !isHome || scrolled;

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-500",
        solid
          ? "bg-background/85 backdrop-blur-md border-b border-border shadow-xs transform-gpu"
          : "bg-transparent"
      )}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Mobile menu + Logo */}
        <div className="flex items-center gap-4 shrink-0 mr-8 lg:mr-12">
          <IconButton
            className="lg:hidden"
            onClick={toggleMobileNav}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </IconButton>

          <BrandLogo
            href="/"
            className={cn(
              "font-serif text-xl sm:text-2xl font-normal tracking-[0.04em] shrink-0 transition-colors",
              solid ? "text-foreground" : "text-cream"
            )}
          >
            Solenne
          </BrandLogo>
        </div>

        {/* Center: Navigation (desktop only) */}
        <div className="hidden lg:flex items-center justify-center gap-6 xl:gap-8 flex-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={(event) => handleNavClick(event, link.href)}
              className={cn(
                "text-[13px] font-normal tracking-[0.03em] whitespace-nowrap transition-colors relative hover:text-primary",
                "after:absolute after:bottom-0 after:left-0 after:h-px after:w-0 after:bg-primary after:transition-all after:duration-300 hover:after:w-full",
                solid
                  ? "text-foreground/75 hover:text-foreground"
                  : "text-cream/85 hover:text-cream"
              )}
            >
              {locale === "vi" ? link.labelVi : link.label}
            </Link>
          ))}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3 sm:gap-4 shrink-0 ml-6">
          <IconButton
            aria-label={locale === "vi" ? "Tìm kiếm" : "Search"}
            aria-haspopup="dialog"
            aria-expanded={isSearchOpen}
            aria-keyshortcuts="/ Control+K Meta+K"
            onClick={openSearch}
            onPointerEnter={prefetchSearchIndex}
            onFocus={prefetchSearchIndex}
            className={cn(!solid && "text-cream hover:bg-white/10")}
          >
            <Search className="h-5 w-5" />
          </IconButton>

          <CurrencyToggle
            variant={solid ? "default" : "transparent"}
            className="hidden sm:flex"
          />

          <LocaleToggle
            variant={solid ? "default" : "transparent"}
            className="hidden sm:flex"
          />

          <IconButton
            asChild
            aria-label={
              locale === "vi"
                ? isAuthenticated
                  ? "Không gian cá nhân"
                  : "Đăng nhập"
                : isAuthenticated
                ? "Account"
                : "Sign In"
            }
            className={cn(
              "hidden sm:inline-flex",
              !solid && "text-cream hover:bg-white/10"
            )}
          >
            <Link
              href={isAuthenticated ? "/account" : "/login"}
              className={cn(!solid && "text-cream")}
            >
              <User className={cn("h-5 w-5", !solid && "text-cream")} />
            </Link>
          </IconButton>

          <IconButton
            aria-label={locale === "vi" ? "Giỏ hàng" : "Cart"}
            badge={itemCount}
            onClick={openCart}
            className={cn(!solid && "text-cream hover:bg-white/10")}
          >
            <ShoppingBag className="h-5 w-5" />
          </IconButton>
        </div>
      </nav>
    </header>
  );
}
