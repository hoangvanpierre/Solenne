"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Container } from "@/components/ui/container";
import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { useAppLocale } from "@/hooks/use-locale";
import { useIntersection } from "@/hooks/use-intersection";

interface CraftSlide {
  readonly id: number;
  readonly src: string;
  readonly alt: string;
  readonly altVi: string;
  readonly title: string;
  readonly titleVi: string;
}

/**
 * Strict 7-image sequential presentation for Solenne atelier craft storytelling.
 * Order strictly preserves user specification:
 * 1. Ba Mươi Năm Ánh Sáng Và Hương Thơm
 * 2. Khu vườn nửa đêm dưới ánh nến
 * 3. Nến Cedar & Sage giữa rừng giấy mộng mơ
 * 4. Hương biển dịu êm Solenne
 * 5. Nến Vanilla Ember giữa khung cảnh giấy ấm áp
 * 6. Nến Solenne trong ánh hoàng hôn vàng ấm
 * 7. Nến Oải Hương Giữa Đồng Hoa Tím
 */
const CRAFT_SLIDES: readonly CraftSlide[] = [
  {
    id: 1,
    src: "/images/product/Ba Mươi Năm Ánh Sáng Và Hương Thơm.png",
    alt: "Thirty Years of Light & Scent — Solenne artisanal candle atelier",
    altVi: "Ba Mươi Năm Ánh Sáng Và Hương Thơm — Xưởng nến thủ công Solenne",
    title: "Thirty Years of Light & Scent",
    titleVi: "Ba Mươi Năm Ánh Sáng Và Hương Thơm",
  },
  {
    id: 2,
    src: "/images/product/Khu vườn nửa đêm dưới ánh nến.png",
    alt: "Midnight Garden candle glow under soft evening light",
    altVi: "Khu vườn nửa đêm dưới ánh nến lung linh",
    title: "Midnight Garden",
    titleVi: "Khu Vườn Nửa Đêm",
  },
  {
    id: 3,
    src: "/images/product/Nến Cedar & Sage giữa rừng giấy mộng mơ.png",
    alt: "Cedar & Sage candle amidst a dreamy papercraft forest",
    altVi: "Nến Cedar & Sage giữa rừng giấy mộng mơ",
    title: "Cedar & Sage",
    titleVi: "Cedar & Sage Rừng Mộng Mơ",
  },
  {
    id: 4,
    src: "/images/product/Hương biển dịu êm Solenne.png",
    alt: "Solenne Ocean Breeze candle in a serene marine papercraft setting",
    altVi: "Hương biển dịu êm Solenne",
    title: "Ocean Breeze",
    titleVi: "Hương Biển Dịu Êm",
  },
  {
    id: 5,
    src: "/images/product/Nến Vanilla Ember giữa khung cảnh giấy ấm áp.png",
    alt: "Vanilla Ember candle surrounded by a warm papercraft scene",
    altVi: "Nến Vanilla Ember giữa khung cảnh giấy ấm áp",
    title: "Vanilla Ember",
    titleVi: "Vanilla Ember Ấm Áp",
  },
  {
    id: 6,
    src: "/images/product/Nến Solenne trong ánh hoàng hôn vàng ấm.png",
    alt: "Solenne candle basking in warm golden sunset radiance",
    altVi: "Nến Solenne trong ánh hoàng hôn vàng ấm",
    title: "Golden Hours",
    titleVi: "Ánh Hoàng Hôn Vàng",
  },
  {
    id: 7,
    src: "/images/product/Nến Oải Hương Giữa Đồng Hoa Tím.png",
    alt: "Lavender Serenity candle resting amidst artisan purple blooms",
    altVi: "Nến Oải Hương Giữa Đồng Hoa Tím",
    title: "Lavender Serenity",
    titleVi: "Oải Hương Giữa Đồng Hoa Tím",
  },
] as const;

export function CraftSection() {
  const t = useTranslations("craft");
  const locale = useAppLocale();
  const shouldReduceMotion = useReducedMotion();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Lifecycle optimization: pause animation when section is scrolled out of viewport
  const [containerRef, isIntersecting] = useIntersection<HTMLDivElement>({
    threshold: 0.1,
  });

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % CRAFT_SLIDES.length);
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + CRAFT_SLIDES.length) % CRAFT_SLIDES.length);
  }, []);

  // Sequential autoplay looping (5000ms), matching components/sections/testimonials.tsx
  useEffect(() => {
    if (shouldReduceMotion || isPaused || !isIntersecting) return;

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      nextSlide();
    }, 5000);

    return () => clearInterval(interval);
  }, [shouldReduceMotion, isPaused, isIntersecting, nextSlide]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      prevSlide();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      nextSlide();
    }
  };

  const currentSlide = CRAFT_SLIDES[currentIndex];

  return (
    <section className="py-24 lg:py-32 bg-muted/30">
      <Container>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Image Slideshow side */}
          <ScrollReveal direction="left">
            <div
              ref={containerRef}
              className="relative flex flex-col items-center group/showcase focus:outline-none"
              onMouseEnter={() => setIsPaused(true)}
              onMouseLeave={() => setIsPaused(false)}
              onFocus={() => setIsPaused(true)}
              onBlur={() => setIsPaused(false)}
              onKeyDown={handleKeyDown}
              tabIndex={0}
              role="region"
              aria-roledescription="carousel"
              aria-label={
                locale === "vi"
                  ? "Trình chiếu hình ảnh chế tác thủ công Solenne"
                  : "Solenne artisanal craft image showcase"
              }
            >
              {/* Slideshow Frame with strict 4:5 aspect ratio */}
              <div className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden bg-gradient-to-br from-stone-300/40 via-amber-100/20 to-stone-200/40 dark:from-stone-900/60 dark:to-stone-950/60 shadow-xl shadow-stone-900/5 select-none">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentIndex}
                    initial={
                      shouldReduceMotion
                        ? { opacity: 0 }
                        : { opacity: 0, y: 20, scale: 0.95 }
                    }
                    animate={
                      shouldReduceMotion
                        ? { opacity: 1 }
                        : { opacity: 1, y: 0, scale: 1 }
                    }
                    exit={
                      shouldReduceMotion
                        ? { opacity: 0 }
                        : { opacity: 0, y: -20, scale: 0.95 }
                    }
                    transition={{
                      duration: shouldReduceMotion ? 0.01 : 0.6,
                      ease: [0.25, 0.4, 0.25, 1],
                    }}
                    className="absolute inset-0 h-full w-full"
                  >
                    <Image
                      src={encodeURI(currentSlide.src)}
                      alt={locale === "vi" ? currentSlide.altVi : currentSlide.alt}
                      fill
                      sizes="(max-width: 640px) 92vw, (max-width: 1024px) 45vw, 560px"
                      className="object-cover"
                      loading={currentIndex === 0 ? "eager" : "lazy"}
                      unoptimized
                    />
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Navigation Dots — exactly styled as components/sections/testimonials.tsx */}
              <div
                className="flex justify-center items-center gap-2.5 mt-5"
                role="tablist"
                aria-label={
                  locale === "vi"
                    ? "Chuyển ảnh bộ sưu tập thủ công"
                    : "Craft showcase slide controls"
                }
              >
                {CRAFT_SLIDES.map((slide, idx) => (
                  <button
                    key={slide.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-2 rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                      idx === currentIndex
                        ? "w-8 bg-primary"
                        : "w-2 bg-primary/20 hover:bg-primary/50"
                    }`}
                    aria-label={`${locale === "vi" ? "Đến ảnh" : "Go to slide"} ${idx + 1}: ${
                      locale === "vi" ? slide.titleVi : slide.title
                    }`}
                    aria-selected={idx === currentIndex}
                    role="tab"
                  />
                ))}
              </div>
            </div>
          </ScrollReveal>

          {/* Text side */}
          <div className="lg:py-8">
            <ScrollReveal>
              <p className="text-[10.5px] sm:text-[11px] tracking-[0.16em] uppercase text-muted-foreground font-normal mb-3">
                {t("label")}
              </p>
            </ScrollReveal>

            <ScrollReveal delay={0.1}>
              <h2 className="font-serif text-2xl sm:text-3xl font-normal text-foreground mb-6 leading-[1.25] text-balance">
                {t("title")}
              </h2>
            </ScrollReveal>

            <ScrollReveal delay={0.2}>
              <p className="text-muted-foreground leading-relaxed mb-4">
                {t("p1")}
              </p>
            </ScrollReveal>

            <ScrollReveal delay={0.3}>
              <p className="text-muted-foreground leading-relaxed mb-4">
                {t("p2")}
              </p>
            </ScrollReveal>

            <ScrollReveal delay={0.4}>
              <p className="text-muted-foreground leading-relaxed mb-8">
                {t("p3")}
              </p>
            </ScrollReveal>

            <ScrollReveal delay={0.5}>
              <Link
                href="/about"
                className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors group"
              >
                {t("cta")}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </ScrollReveal>
          </div>
        </div>
      </Container>
    </section>
  );
}
