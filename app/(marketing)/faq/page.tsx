import type { Metadata } from "next";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "FAQ — Solenne",
  description:
    "Answers to common questions about Solenne candles: orders, shipping, returns, candle care, and wholesale.",
};

const FAQS = [
  {
    question: "How long do Solenne candles burn?",
    answer:
      "Burn time depends on the size of the vessel, ranging from roughly 25 hours for our smallest to 60 hours for our largest. Each product page lists the exact burn time. With proper care, a candle should burn cleanly to its final hour.",
  },
  {
    question: "Why should I trim the wick before each burn?",
    answer:
      "Trimming the wick to about a quarter inch keeps the flame low and steady, prevents soot, and helps the wax melt evenly. A long wick burns too hot, which shortens the life of the candle and dulls the scent.",
  },
  {
    question: "How long does shipping take?",
    answer:
      "Orders are prepared within 1-2 business days. Domestic delivery typically takes 3-5 business days after dispatch. You'll receive a tracking link as soon as your order leaves the studio.",
  },
  {
    question: "What is your return policy?",
    answer:
      "Unopened candles may be returned within 30 days of delivery for a full refund. If a candle arrives damaged or seems faulty, contact us with a photo and your order number and we'll make it right.",
  },
  {
    question: "Do you offer gift wrapping?",
    answer:
      "Yes. Gift wrapping is available at checkout for a small fee, and you can include a handwritten note with your gift order at no extra charge.",
  },
  {
    question: "Are your candles safe around pets?",
    answer:
      "Our candles use natural soy wax and phthalate-free fragrance oils, but no scented candle should be left burning unattended near pets. Always burn in a ventilated room, keep flames out of reach, and never leave a candle lit while away.",
  },
  {
    question: "Do you ship internationally?",
    answer:
      "We currently ship within the United States and Vietnam. Sign up for our newsletter to hear when we add new regions.",
  },
];

export default function FaqPage() {
  return (
    <div className="py-24 lg:py-32">
      <Container className="max-w-3xl">
        <div className="mb-16">
          <h1 className="font-serif text-4xl md:text-5xl font-semibold mb-4 text-foreground">
            Frequently Asked Questions
          </h1>
          <p className="text-muted-foreground text-lg">
            Everything we&apos;re most often asked. Can&apos;t find your
            answer? <a href="/contact" className="underline underline-offset-4 hover:text-foreground">Write to us</a>.
          </p>
        </div>

        <div className="divide-y divide-border">
          {FAQS.map((faq) => (
            <details key={faq.question} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-foreground [&::-webkit-details-marker]:hidden">
                {faq.question}
                <span className="text-muted-foreground transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </Container>
    </div>
  );
}
