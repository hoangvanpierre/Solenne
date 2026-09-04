"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/container";
import { ScrollReveal } from "@/components/animations/scroll-reveal";

export function CraftSection() {
  return (
    <section className="py-24 lg:py-32 bg-muted/30">
      <Container>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Image side */}
          <ScrollReveal direction="left">
            <div className="relative aspect-[4/5] rounded-2xl overflow-hidden bg-gradient-to-br from-stone-300/50 to-amber-200/30">
              {/* Decorative elements */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-32 h-40 rounded-xl bg-white/30 backdrop-blur-sm shadow-lg" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/20 to-transparent" />
            </div>
          </ScrollReveal>

          {/* Text side */}
          <div className="lg:py-8">
            <ScrollReveal>
              <p className="text-sm tracking-[0.2em] uppercase text-muted-foreground mb-4">
                Our Craft
              </p>
            </ScrollReveal>

            <ScrollReveal delay={0.1}>
              <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl font-semibold text-foreground mb-6 leading-tight">
                Every candle tells a story
              </h2>
            </ScrollReveal>

            <ScrollReveal delay={0.2}>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Each Solenne candle begins its journey with the finest natural
                soy wax, sourced from sustainable farms. We believe that what
                you bring into your home matters — which is why every ingredient
                is carefully chosen for both quality and environmental
                responsibility.
              </p>
            </ScrollReveal>

            <ScrollReveal delay={0.3}>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Our master chandlers hand-pour each candle with precision and
                care, infusing premium fragrance oils that have been developed
                in collaboration with perfumers from Grasse, France. The result
                is a scent experience that evolves beautifully from the first
                light to the last.
              </p>
            </ScrollReveal>

            <ScrollReveal delay={0.4}>
              <p className="text-muted-foreground leading-relaxed mb-8">
                Finished with hand-applied labels and nestled in recyclable
                packaging, each candle is a small work of art — ready to
                transform any space into a sanctuary.
              </p>
            </ScrollReveal>

            <ScrollReveal delay={0.5}>
              <Link
                href="/about"
                className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors group"
              >
                Learn More About Our Process
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </ScrollReveal>
          </div>
        </div>
      </Container>
    </section>
  );
}
