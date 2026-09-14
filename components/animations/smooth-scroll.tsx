"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface SmoothScrollProps {
  children: React.ReactNode;
}

export function SmoothScroll({ children }: SmoothScrollProps) {
  const lenisRef = useRef<Lenis | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    // Respect reduced motion preference
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReducedMotion) return;

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      touchMultiplier: 2,
      infinite: false,
    });

    lenisRef.current = lenis;

    // Official Lenis <-> GSAP ScrollTrigger integration: drive the raf loop
    // from the gsap ticker and keep ScrollTrigger in sync with Lenis scrolls.
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.lagSmoothing(1, 500);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  // Lenis lives in the shared marketing layout, so it survives client-side
  // route changes. Its internal scroll limit is computed from the previous
  // page's height; without a forced recompute, wheel scrolling clamps to the
  // stale limit and the page appears stuck. Recompute on every route change.
  useEffect(() => {
    const lenis = lenisRef.current;
    if (!lenis) return;

    const frame = requestAnimationFrame(() => {
      lenis.scrollTo(0, { immediate: true });
      lenis.resize();
      ScrollTrigger.refresh();
    });

    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return <>{children}</>;
}
