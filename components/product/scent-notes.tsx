"use client";

import { ScrollReveal } from "@/components/animations/scroll-reveal";

interface ScentNotesProps {
  top: string[];
  heart: string[];
  base: string[];
}

export function ScentNotes({ top, heart, base }: ScentNotesProps) {
  const tiers = [
    { label: "Top Notes", notes: top, bg: "bg-stone-50" },
    { label: "Heart Notes", notes: heart, bg: "bg-stone-100" },
    { label: "Base Notes", notes: base, bg: "bg-stone-200" },
  ];

  return (
    <div className="flex flex-col gap-2 my-8">
      {tiers.map((tier, i) => (
        <ScrollReveal key={tier.label} delay={i * 0.1}>
          <div className={`p-5 rounded-xl ${tier.bg} border border-stone-200/50`}>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              {tier.label}
            </p>
            <p className="font-serif text-lg text-foreground">
              {tier.notes.join(", ")}
            </p>
          </div>
        </ScrollReveal>
      ))}
    </div>
  );
}
