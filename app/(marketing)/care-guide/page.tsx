import type { Metadata } from "next";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Candle Care Guide — Solenne",
  description:
    "How to care for a Solenne candle: the first burn, wick trimming, burn length, and safe extinguishing, for the fullest scent and longest life.",
};

const STEPS = [
  {
    title: "Trim the wick",
    body: "Before every burn, trim the wick to a quarter inch. A short wick keeps the flame low and clean, prevents soot, and helps the wax melt evenly across the vessel.",
  },
  {
    title: "Let the first burn reach the edge",
    body: "Soy wax has a memory. On the first burn, let the melt pool reach the edge of the vessel, usually 2-3 hours. This prevents tunneling and sets the candle up to burn evenly for its whole life.",
  },
  {
    title: "Burn in sessions",
    body: "Keep each burn under 4 hours and let the wax cool fully before relighting. Longer sessions overheat the fragrance oil and dull the scent.",
  },
  {
    title: "Snuff, don't blow",
    body: "Snuffing the flame traps the fragrance in the wax instead of scattering it as smoke. A wick dipper or a metal spoon both work beautifully.",
  },
  {
    title: "Center and clean",
    body: "While the wax is cool, gently recenter the wick and remove any wick trimmings or debris from the melt pool. Debris can catch and flare.",
  },
  {
    title: "Know when to say goodbye",
    body: "Stop burning when a half inch of wax remains. Burning lower risks overheating the vessel. Clean it with warm, soapy water and give the jar a second life.",
  },
];

export default function CareGuidePage() {
  return (
    <div className="py-24 lg:py-32">
      <Container className="max-w-3xl">
        <div className="mb-16">
          <h1 className="font-serif text-4xl md:text-5xl font-semibold mb-4 text-foreground">
            Candle Care Guide
          </h1>
          <p className="text-muted-foreground text-lg">
            A candle cared for is a candle that lasts. Six small rituals for
            the fullest scent and the longest life.
          </p>
        </div>

        <ol className="space-y-10">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-6">
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-muted font-serif text-lg font-semibold text-foreground">
                {index + 1}
              </span>
              <div>
                <h2 className="font-serif text-xl font-semibold text-foreground">
                  {step.title}
                </h2>
                <p className="mt-2 leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <section className="mt-16 rounded-2xl border border-border p-8">
          <h2 className="font-serif text-xl font-semibold mb-3 text-foreground">
            Safety first
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Never leave a burning candle unattended or within reach of
            children, pets, drafts, or anything flammable. Burn only on a
            stable, heat-resistant surface, and keep the flame away from
            walls and curtains.
          </p>
        </section>
      </Container>
    </div>
  );
}
