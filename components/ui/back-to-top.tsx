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
}

export function BackToTop({ threshold = 350, className }: BackToTopProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const locale = useAppLocale();
  const isVi = locale === "vi";
  const waxRef = useRef<HTMLDivElement>(null);
  const emberRef = useRef<HTMLDivElement>(null);
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

      // Direct DOM updates for butter-smooth 60fps animations without React re-renders
      if (waxRef.current) {
        waxRef.current.style.height = `${progress}%`;
      }
      if (emberRef.current) {
        const emberBottom = Math.min(Math.max(progress, 5), 95);
        emberRef.current.style.bottom = `calc(${emberBottom}% - 4px)`;
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

  // Synchronize initial DOM metrics upon capsule mount
  useEffect(() => {
    if (isVisible) {
      if (waxRef.current) {
        waxRef.current.style.height = `${progressRef.current}%`;
      }
      if (emberRef.current) {
        const emberBottom = Math.min(Math.max(progressRef.current, 5), 95);
        emberRef.current.style.bottom = `calc(${emberBottom}% - 4px)`;
      }
    }
  }, [isVisible]);

  // Synchronize tooltip percent text upon tooltip hover reveal
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

  return (
    <AnimatePresence>
      {isVisible && (
        <div
          className={cn(
            "fixed bottom-6 right-6 sm:bottom-8 sm:right-8 z-40 flex items-center",
            className
          )}
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
                  {isVi ? "Về đầu trang" : "Return to Top"}
                </span>
                <span className="w-1 h-1 rounded-full bg-amber/70" />
                <span ref={percentRef} className="text-[10px] tabular-nums font-normal text-amber">
                  0%
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Architectural Whisper Capsule with Beveled Crystal Finish */}
          <motion.button
            type="button"
            onClick={scrollToTop}
            initial={{ opacity: 0, y: 25, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            whileHover={{ y: -3, scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "relative flex flex-col items-center justify-between",
              "w-9 sm:w-10 py-3.5 px-1 rounded-full",
              "bg-cream/90 backdrop-blur-md text-warm-black",
              "border border-amber/35",
              "shadow-[inset_0_1px_1px_rgba(255,255,255,0.7),0_10px_30px_rgba(0,0,0,0.1)]",
              "hover:border-amber hover:bg-cream hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),0_14px_40px_rgba(196,149,106,0.38)]",
              "transition-all duration-300 group cursor-pointer select-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/50"
            )}
            aria-label={isVi ? "Về đầu trang" : "Return to top"}
            title={isVi ? "Về đầu trang" : "Return to top"}
          >
            {/* Subtle Upward Arrow */}
            <span className="flex items-center justify-center w-5 h-5 rounded-full text-warm-black/80 group-hover:text-amber transition-colors">
              <ArrowUp
                className="w-3.5 h-3.5 transition-transform duration-300 group-hover:-translate-y-0.5"
                strokeWidth={2}
              />
            </span>

            {/* Candle-wick architectural line with dynamic liquid wax fill & Ember Pip */}
            <div
              className="relative w-4 h-12 my-1 flex justify-center items-center"
              aria-hidden="true"
            >
              {/* Background Track Line */}
              <div className="absolute inset-y-0 w-[2px] bg-warm-black/15 rounded-full" />

              {/* Rising Liquid Wax Bar */}
              <div
                ref={waxRef}
                className="absolute bottom-0 w-[2px] bg-gradient-to-t from-amber/90 via-amber to-amber/80 rounded-full transition-all duration-150 ease-out"
                style={{ height: "0%" }}
              />

              {/* Glowing Ember Pip riding the wax crest */}
              <motion.div
                ref={emberRef}
                className="absolute w-2 h-2 rounded-full bg-amber shadow-[0_0_8px_#C4956A] transition-all duration-150 ease-out flex items-center justify-center pointer-events-none"
                style={{
                  bottom: "calc(5% - 4px)",
                }}
                animate={
                  isHovered
                    ? {
                        scale: [1, 1.35, 1],
                        boxShadow: [
                          "0 0 6px #C4956A",
                          "0 0 14px #E6B87D, 0 0 20px rgba(196,149,106,0.6)",
                          "0 0 6px #C4956A",
                        ],
                      }
                    : { scale: 1 }
                }
                transition={{
                  repeat: isHovered ? Infinity : 0,
                  duration: 1.5,
                  ease: "easeInOut",
                }}
              >
                {/* Hot White/Cream Candle Core */}
                <div className="w-1 h-1 rounded-full bg-cream shadow-sm" />
              </motion.div>
            </div>

            {/* Minimalist vertical label */}
            <span className="text-[9px] font-medium tracking-[0.2em] uppercase text-warm-black/75 group-hover:text-amber transition-colors">
              Top
            </span>
          </motion.button>
        </div>
      )}
    </AnimatePresence>
  );
}
