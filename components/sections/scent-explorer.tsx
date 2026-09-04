"use client";

import Link from "next/link";
import { Leaf, Wind, Flame, Sparkles } from "lucide-react";
import { Container } from "@/components/ui/container";
import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { TextReveal } from "@/components/animations/text-reveal";
import { SCENT_CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";

const ICONS: Record<string, React.ReactNode> = {
  flower: <Leaf className="h-6 w-6" />,
  tree: <Sparkles className="h-6 w-6" />,
  wind: <Wind className="h-6 w-6" />,
  flame: <Flame className="h-6 w-6" />,
};

export function ScentExplorer() {
  return (
    <section className="py-24 lg:py-32 bg-background">
      <Container>
        <div className="mb-16 text-center">
          <TextReveal
            text="Find Your Scent"
            as="h2"
            className="font-serif text-4xl md:text-5xl lg:text-6xl font-semibold text-foreground"
            splitBy="word"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
          {SCENT_CATEGORIES.map((category, i) => (
            <ScrollReveal key={category.id} delay={i * 0.1}>
              <Link
                href={`/collections/${category.id}`}
                className={cn(
                  "group relative flex flex-col justify-end overflow-hidden rounded-2xl p-8 lg:p-12 transition-all duration-500",
                  "aspect-square md:aspect-[4/3] lg:aspect-[3/2]",
                  category.bgColor
                )}
              >
                {/* Background overlay that darkens slightly on hover */}
                <div className="absolute inset-0 bg-black/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                
                {/* Icon positioned top right */}
                <div className="absolute top-8 right-8 lg:top-12 lg:right-12 p-3 rounded-full bg-white/20 backdrop-blur-md text-foreground transition-transform duration-500 group-hover:scale-110">
                  {ICONS[category.icon]}
                </div>

                {/* Content */}
                <div className="relative z-10 transition-transform duration-500 group-hover:-translate-y-2">
                  <h3 className="font-serif text-3xl md:text-4xl lg:text-5xl font-medium text-foreground mb-3">
                    {category.name}
                  </h3>
                  <p className="text-foreground/80 max-w-sm">
                    {category.description}
                  </p>
                </div>
              </Link>
            </ScrollReveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
