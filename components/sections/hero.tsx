"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowDown } from "lucide-react";
import { TextReveal } from "@/components/animations/text-reveal";
import { Button } from "@/components/ui/button";
import { MagneticButton } from "@/components/animations/magnetic-button";

export function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], [0, 200]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.1]);

  return (
    <section
      ref={containerRef}
      className="relative h-screen flex items-center justify-center overflow-hidden"
    >
      {/* Background */}
      <motion.div
        style={{ scale }}
        className="absolute inset-0 bg-gradient-to-br from-amber-950/95 via-stone-900/98 to-black"
      >
        {/* Grain overlay */}
        <div className="grain-overlay absolute inset-0" />

        {/* Decorative gradient orbs */}
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-amber/10 blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 h-80 w-80 rounded-full bg-blush/10 blur-3xl" />
      </motion.div>

      {/* Content */}
      <motion.div
        style={{ y, opacity }}
        className="relative z-10 flex flex-col items-center text-center px-4"
      >
        {/* Top label */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mb-6 text-xs tracking-[0.3em] uppercase text-cream/60"
        >
          Artisan Scented Candles
        </motion.p>

        {/* Brand name */}
        <TextReveal
          text="Solenne"
          as="h1"
          className="font-serif text-7xl md:text-8xl lg:text-9xl font-bold text-cream mb-4"
          splitBy="character"
          delay={0.5}
        />

        {/* Tagline */}
        <TextReveal
          text="Illuminate your moments"
          as="p"
          className="text-xl md:text-2xl text-cream/70 font-light mb-10 max-w-md"
          splitBy="word"
          delay={1}
        />

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.4 }}
          className="flex flex-col sm:flex-row gap-4"
        >
          <MagneticButton>
            <Button
              size="lg"
              className="bg-cream text-warm-black hover:bg-cream/90 px-8"
              asChild
            >
              <Link href="/products">Explore Collection</Link>
            </Button>
          </MagneticButton>

          <MagneticButton>
            <Button
              size="lg"
              variant="outline"
              className="border-cream/30 text-cream hover:bg-cream/10 px-8"
              asChild
            >
              <Link href="/about">Our Story</Link>
            </Button>
          </MagneticButton>
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
      >
        <span className="text-xs tracking-widest uppercase text-cream/40">
          Scroll
        </span>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <ArrowDown className="h-4 w-4 text-cream/40" />
        </motion.div>
      </motion.div>
    </section>
  );
}
