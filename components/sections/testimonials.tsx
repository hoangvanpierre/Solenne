"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star } from "lucide-react";
import { Container } from "@/components/ui/container";
import { ScrollReveal } from "@/components/animations/scroll-reveal";

const TESTIMONIALS = [
  {
    id: 1,
    quote:
      "The Midnight Garden candle completely transformed my evening routine. It's not just a scent; it's an experience that brings absolute peace to my space.",
    author: "Elena R.",
    location: "New York",
    rating: 5,
  },
  {
    id: 2,
    quote:
      "I've tried luxury candles from all the major brands, but the throw and complex notes of Cedar & Sage are unmatched. A true work of art.",
    author: "Michael T.",
    location: "London",
    rating: 5,
  },
  {
    id: 3,
    quote:
      "Beautiful packaging, even more beautiful fragrance. Vanilla Ember makes my entire home feel incredibly warm and inviting.",
    author: "Sophie M.",
    location: "Paris",
    rating: 5,
  },
];

export function Testimonials() {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % TESTIMONIALS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="py-24 lg:py-32 bg-[#F5F2EC]">
      <Container>
        <ScrollReveal>
          <div className="mx-auto max-w-4xl text-center">
            <div className="relative min-h-[300px] flex flex-col items-center justify-center">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentIndex}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.95 }}
                  transition={{ duration: 0.6, ease: [0.25, 0.4, 0.25, 1] }}
                  className="flex flex-col items-center"
                >
                  <div className="flex gap-1 mb-8 text-primary">
                    {[...Array(TESTIMONIALS[currentIndex].rating)].map((_, i) => (
                      <Star key={i} className="h-5 w-5 fill-current" />
                    ))}
                  </div>

                  <blockquote className="font-serif text-2xl md:text-3xl lg:text-4xl font-medium leading-tight text-foreground mb-8 italic">
                    &ldquo;{TESTIMONIALS[currentIndex].quote}&rdquo;
                  </blockquote>

                  <div>
                    <p className="font-medium text-foreground">
                      {TESTIMONIALS[currentIndex].author}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1 uppercase tracking-wider">
                      {TESTIMONIALS[currentIndex].location}
                    </p>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Navigation Dots */}
            <div className="flex justify-center gap-3 mt-8">
              {TESTIMONIALS.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    idx === currentIndex
                      ? "w-8 bg-primary"
                      : "w-2 bg-primary/20 hover:bg-primary/50"
                  }`}
                  aria-label={`Go to testimonial ${idx + 1}`}
                />
              ))}
            </div>
          </div>
        </ScrollReveal>
      </Container>
    </section>
  );
}
