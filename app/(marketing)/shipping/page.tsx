import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { CONTACT_EMAIL, SHIPPING } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Shipping & Returns — Solenne",
  description:
    "Solenne shipping and returns: dispatch times, delivery estimates, rates, and our 30-day return policy.",
};

const SHIPPING_ROWS = [
  {
    label: "Standard shipping (3-5 business days)",
    usd: formatPrice(SHIPPING.flatRateUSD, "USD"),
    vnd: formatPrice(SHIPPING.flatRateVND, "VND"),
  },
  {
    label: `Free shipping on orders over ${formatPrice(SHIPPING.freeThresholdUSD, "USD")} (${formatPrice(SHIPPING.freeThresholdVND, "VND")})`,
    usd: "Free",
    vnd: "Free",
  },
];

const RETURN_STEPS = [
  {
    title: "Contact us",
    body: `Email ${CONTACT_EMAIL} within 30 days of delivery with your order number and reason for the return. For damaged or faulty candles, please include a photo.`,
  },
  {
    title: "Prepare the candle",
    body: "Pack the candle securely in its original vessel and box. Unopened, unused candles in resalable condition are eligible for a full refund.",
  },
  {
    title: "Ship it back",
    body: "We'll reply with a return authorization and instructions. Once the candle reaches the studio, refunds are issued within 5 business days to the original payment method.",
  },
];

export default function ShippingPage() {
  return (
    <div className="py-24 lg:py-32">
      <Container className="max-w-3xl">
        <div className="mb-16">
          <h1 className="font-serif text-4xl md:text-5xl font-semibold mb-4 text-foreground">
            Shipping & Returns
          </h1>
          <p className="text-muted-foreground text-lg">
            Every order is wrapped with care in the studio and dispatched
            within 1-2 business days.
          </p>
        </div>

        <section className="mb-16">
          <h2 className="font-serif text-2xl font-semibold mb-6 text-foreground">
            Rates & Delivery
          </h2>
          <div className="overflow-hidden rounded-2xl border border-border">
            {SHIPPING_ROWS.map((row, index) => (
              <div
                key={row.label}
                className={`flex items-center justify-between gap-4 px-6 py-5 text-sm ${
                  index % 2 === 1 ? "bg-muted/50" : ""
                }`}
              >
                <span className="text-foreground">{row.label}</span>
                <span className="whitespace-nowrap font-medium text-foreground">
                  {row.usd} / {row.vnd}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            We currently ship within the United States and Vietnam. All
            packages include tracking.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-semibold mb-6 text-foreground">
            Returns
          </h2>
          <ol className="space-y-6">
            {RETURN_STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-5">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-muted font-serif text-sm font-semibold text-foreground">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-medium text-foreground">{step.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-8 text-sm text-muted-foreground">
            Gift cards and clearance items are final sale and cannot be
            returned.
          </p>
        </section>
      </Container>
    </div>
  );
}
