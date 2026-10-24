"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppLocale } from "@/hooks/use-locale";
import { getLenis } from "@/components/animations/smooth-scroll";

export interface BackToTopProps {
  threshold?: number;
  className?: string;
  /** Notifies the parent whenever scroll-driven visibility changes. */
  onVisibilityChange?: (visible: boolean) => void;
}

/**
 * Ring geometry. The SVG uses a 44-unit viewBox, so the progress ring scales
 * with the button (`h-10` mobile, `h-11` desktop) without recomputing here.
 */
const RING_RADIUS = 19;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function BackToTop({ threshold = 350, className, onVisibilityChange }: BackToTopProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const locale = useAppLocale();
  const isVi = locale === "vi";
  const ringRef = useRef<SVGCircleElement>(null);
  const percentRef = useRef<HTMLSpanElement>(null);
  const progressRef = useRef(0);

  useEffect(() => {
    let ticking = false;

    const updateScrollMetrics = () => {
      const scrollY = window.scrollY;
      const totalHeight =
        document.documentElement.scrollHeight - window.innerHeight;

      const visible = scrollY > threshold;
      const progress =
        totalHeight > 0
          ? Math.round(Math.min(Math.max((scrollY / totalHeight) * 100, 0), 100))
          : 0;

      progressRef.current = progress;
      setIsVisible((prev) => (prev !== visible ? visible : prev));

      // Direct DOM update so the ring tracks scrolling at 60fps without
      // re-rendering React on every frame.
      if (ringRef.current) {
        ringRef.current.style.strokeDashoffset = `${
          RING_CIRCUMFERENCE * (1 - progress / 100)
        }`;
      }
      if (percentRef.current) {
        percentRef.current.textContent = `${progress}%`;
      }

      ticking = false;
    };

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(updateScrollMetrics);
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    updateScrollMetrics();

    return () => window.removeEventListener("scroll", handleScroll);
  }, [threshold]);

  // Notify parent of visibility changes.
  useEffect(() => {
    onVisibilityChange?.(isVisible);
  }, [isVisible, onVisibilityChange]);

  // The button remounts through AnimatePresence, so repaint the ring on mount.
  useEffect(() => {
    if (isVisible && ringRef.current) {
      ringRef.current.style.strokeDashoffset = `${
        RING_CIRCUMFERENCE * (1 - progressRef.current / 100)
      }`;
    }
  }, [isVisible]);

  useEffect(() => {
    if (isHovered && percentRef.current) {
      percentRef.current.textContent = `${progressRef.current}%`;
    }
  }, [isHovered]);

  const scrollToTop = () => {
    const lenis = getLenis();
    if (lenis) {
      lenis.scrollTo(0);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const label = isVi ? "Về đầu trang" : "Return to top";

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.85 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className={cn("relative flex items-center", className)}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Ethereal Hover Reveal Tooltip */}
          <AnimatePresence>
            {isHovered && (
              <motion.div
                initial={{ opacity: 0, x: 12, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 8, scale: 0.95 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="absolute right-full mr-3 whitespace-nowrap px-3.5 py-1.5 rounded-full bg-cream/95 backdrop-blur-md border border-amber/35 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7),0_8px_25px_rgba(0,0,0,0.12)] text-warm-black pointer-events-none flex items-center gap-2 select-none"
              >
                <span className="text-[10px] font-normal uppercase tracking-[0.2em] text-warm-black/90">
                  {label}
                </span>
                <span className="w-1 h-1 rounded-full bg-amber/70" />
                <span
                  ref={percentRef}
                  className="text-[10px] tabular-nums font-normal text-amber"
                >
                  0%
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Compact round button: scroll-progress ring around the arrow */}
          <motion.button
            type="button"
            onClick={scrollToTop}
            whileHover={{ y: -2, scale: 1.05 }}
            whileTap={{ scale: 0.94 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "group relative flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center",
              "rounded-full border border-amber/35 bg-cream/90 backdrop-blur-md text-warm-black",
              "shadow-[inset_0_1px_1px_rgba(255,255,255,0.7),0_10px_30px_rgba(0,0,0,0.1)]",
              "hover:border-amber hover:bg-cream hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),0_14px_40px_rgba(196,149,106,0.38)]",
              "transition-all duration-300 cursor-pointer select-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/50",
              "focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            )}
            aria-label={label}
            title={label}
          >
            {/* Circular scroll-progress ring */}
            <svg
              viewBox="0 0 44 44"
              className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
              aria-hidden="true"
            >
              <circle
                cx="22"
                cy="22"
                r={RING_RADIUS}
                fill="none"
                strokeWidth="1.5"
                className="stroke-warm-black/15"
              />
              <circle
                ref={ringRef}
                cx="22"
                cy="22"
                r={RING_RADIUS}
                fill="none"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={RING_CIRCUMFERENCE}
                className="stroke-amber transition-[stroke-dashoffset] duration-150 ease-out"
              />
            </svg>

            <ArrowUp
              className="relative h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5"
              strokeWidth={1.75}
            />
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
