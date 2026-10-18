"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { TextReveal } from "@/components/animations/text-reveal";
import { Button } from "@/components/ui/button";
import { MagneticButton } from "@/components/animations/magnetic-button";

export function Hero() {
  const t = useTranslations("hero");
  const tCommon = useTranslations("common");
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], [0, 200]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <section
      ref={containerRef}
      className="relative h-screen flex items-center justify-center overflow-hidden gradient-evanescent"
    >
      {/* Noise overlay */}
      <div className="grain-overlay absolute inset-0" />

      {/* Darken overlay for text readability against light gradient areas */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(0,0,0,0.28) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 5,
        }}
      />

      {/* Content */}
      <motion.div
        style={{ y, opacity }}
        className="relative z-10 flex flex-col items-center text-center px-4"
      >
        {/* Top label */}
        <p className="mb-4 text-[10.5px] sm:text-[11px] tracking-[0.16em] uppercase text-warm-black/90 dark:text-cream/90 font-normal animate-fade-in max-w-xl">
          {t("subtitle")}
        </p>

        {/* Brand name */}
        <TextReveal
          text="Solenne"
          as="h1"
          className="font-serif text-[clamp(2.85rem,5.5vw,4.75rem)] leading-[1.06] tracking-[-0.015em] font-normal text-cream mb-4 animate-fade-up drop-shadow-sm"
          splitBy="character"
          priority
        />

        {/* Tagline */}
        <TextReveal
          text={t("title")}
          as="p"
          className="text-[15px] sm:text-[16.5px] md:text-[18px] text-cream/90 font-normal leading-[1.65] mb-8 max-w-xl text-balance animate-fade-up drop-shadow-xs"
          splitBy="word"
          priority
        />

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-3 sm:gap-4"
        >
          <MagneticButton>
            <Button
              className="bg-cream text-warm-black hover:bg-cream/90 px-6 py-2.5 sm:px-7 sm:py-3 text-[12.5px] sm:text-[13px] font-normal tracking-[0.04em] shadow-md rounded-full h-auto"
              asChild
            >
              <Link href="/products">{tCommon("shopNow")}</Link>
            </Button>
          </MagneticButton>

          <MagneticButton>
            <Button
              variant="outline"
              className="bg-white/20 backdrop-blur-xs border-white/60 text-cream hover:bg-white/30 px-6 py-2.5 sm:px-7 sm:py-3 text-[12.5px] sm:text-[13px] font-normal tracking-[0.04em] shadow-sm rounded-full h-auto transform-gpu"
              asChild
            >
              <Link href="/about">{tCommon("readMore")}</Link>
            </Button>
          </MagneticButton>
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5"
      >
        <span className="text-[10px] tracking-[0.18em] uppercase text-cream/70 font-normal">
          {t("scroll")}
        </span>
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <ArrowDown className="h-3.5 w-3.5 text-cream/70" />
        </motion.div>
      </motion.div>
    </section>
  );
}
