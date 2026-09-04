"use client";

import { Container } from "@/components/ui/container";
import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MagneticButton } from "@/components/animations/magnetic-button";

export function Newsletter() {
  return (
    <section className="py-24 lg:py-32 bg-warm-black text-cream">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <ScrollReveal>
            <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl font-semibold mb-4">
              Stay in the Glow
            </h2>
          </ScrollReveal>
          
          <ScrollReveal delay={0.1}>
            <p className="text-cream/70 text-lg mb-10 max-w-lg mx-auto">
              Subscribe for exclusive scents, early access to new collections,
              and our candle care tips.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            <form 
              onSubmit={(e) => e.preventDefault()} 
              className="flex flex-col sm:flex-row items-center gap-4 max-w-md mx-auto"
            >
              <div className="flex-1 w-full">
                <Input
                  type="email"
                  placeholder="Your email address"
                  className="bg-cream/10 border-cream/20 text-cream placeholder:text-cream/40 h-12 rounded-full px-6 focus-visible:ring-cream/50"
                  required
                />
              </div>
              <MagneticButton strength={0.2}>
                <Button 
                  type="submit" 
                  size="lg" 
                  className="w-full sm:w-auto bg-cream text-warm-black hover:bg-cream/90 font-medium"
                >
                  Subscribe
                </Button>
              </MagneticButton>
            </form>
          </ScrollReveal>
        </div>
      </Container>
    </section>
  );
}
