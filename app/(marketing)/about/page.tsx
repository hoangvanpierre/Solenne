import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "About — Solenne",
  description:
    "The story behind Solenne: small-batch artisan candles crafted with intention, honest ingredients, and a lighter footprint.",
};

const SECTIONS = [
  {
    id: "craft",
    title: "Our Craft",
    paragraphs: [
      "Every Solenne candle begins in our studio, where small batches are poured by hand. We work slowly and deliberately, because a candle made in a hurry is easy to smell.",
      "From wick trimming to cure time, each step follows the same ritual: slow pours, careful temperature control, and two full weeks of curing before a candle is good enough to leave our hands.",
    ],
  },
  {
    id: "ingredients",
    title: "Our Ingredients",
    paragraphs: [
      "We use 100% natural soy wax, cotton wicks, and premium fragrance oils blended without phthalates. Nothing you wouldn't want burning in your own home.",
      "Each scent is composed in three movements: top notes that greet you, heart notes that linger, and base notes that stay long after the flame is out.",
    ],
  },
  {
    id: "sustainability",
    title: "Our Footprint",
    paragraphs: [
      "Our vessels are designed to be relished, then reused. Every jar, tin, and box is recyclable, and our soy wax is sourced from renewable, American-grown soybeans.",
      "We offset shipping emissions and keep packaging minimal, because the luxury we're after has nothing to hide.",
    ],
  },
];

export default function AboutPage() {
  return (
    <div className="py-24 lg:py-32">
      <Container className="max-w-3xl">
        <header className="mb-20">
          <p className="mb-4 text-sm uppercase tracking-[0.3em] text-muted-foreground">
            Our Story
          </p>
          <h1 className="font-serif text-4xl md:text-6xl font-semibold mb-6 text-foreground">
            Crafted with intention. Born from nature.
          </h1>
          <p className="text-lg leading-relaxed text-muted-foreground">
            Solenne began with a simple belief: that a candle should be more
            than a scent. It should be a moment of peace, made honestly, from
            materials that respect the home it burns in and the world it comes
            from.
          </p>
        </header>

        <div className="space-y-20">
          {SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <h2 className="font-serif text-3xl font-semibold mb-6 text-foreground">
                {section.title}
              </h2>
              {section.paragraphs.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 24)}
                  className="mb-4 text-base leading-relaxed text-muted-foreground"
                >
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>

        <div className="mt-20 border-t border-border pt-10 text-center">
          <p className="mb-6 font-serif text-2xl text-foreground">
            Ready to find your scent?
          </p>
          <Button size="lg" asChild>
            <Link href="/products">Shop the Collection</Link>
          </Button>
        </div>
      </Container>
    </div>
  );
}
