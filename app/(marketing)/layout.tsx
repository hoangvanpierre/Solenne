"use client";

import dynamic from "next/dynamic";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { SmoothScroll } from "@/components/animations/smooth-scroll";

// Dynamically import heavy UI overlays that aren't needed on first paint
const MobileNav = dynamic(() => import("@/components/layout/mobile-nav").then(mod => mod.MobileNav), { ssr: false });
const CartDrawer = dynamic(() => import("@/components/layout/cart-drawer").then(mod => mod.CartDrawer), { ssr: false });

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SmoothScroll>
      <Navbar />
      <MobileNav />
      <CartDrawer />
      <main className="flex-1">{children}</main>
      <Footer />
    </SmoothScroll>
  );
}
