import type { Metadata } from "next";
import { Mail, MapPin, Clock } from "lucide-react";
import { Container } from "@/components/ui/container";
import { ContactForm } from "@/components/sections";
import { CONTACT_EMAIL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Contact — Solenne",
  description:
    "Questions about an order, a scent, or a gift? Write to the Solenne studio and we'll reply within two business days.",
};

export default function ContactPage() {
  return (
    <div className="py-24 lg:py-32">
      <Container className="max-w-5xl">
        <div className="mb-16">
          <h1 className="font-serif text-4xl md:text-5xl font-semibold mb-4 text-foreground">
            Contact
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Whether it&apos;s a question about an order, a scent you&apos;re
            searching for, or a gift you&apos;d like help choosing, we&apos;d
            love to hear from you.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-5">
          <div className="space-y-8 lg:col-span-2">
            {[
              {
                icon: Mail,
                title: "Email",
                lines: [CONTACT_EMAIL, "We reply within two business days."],
              },
              {
                icon: MapPin,
                title: "Studio",
                lines: ["Solenne Studio", "By appointment only."],
              },
              {
                icon: Clock,
                title: "Hours",
                lines: ["Monday to Friday", "9:00 – 17:00 (GMT+7)"],
              },
            ].map(({ icon: Icon, title, lines }) => (
              <div key={title} className="flex gap-4">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-muted">
                  <Icon className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <h2 className="font-serif text-lg font-semibold text-foreground">
                    {title}
                  </h2>
                  {lines.map((line) => (
                    <p key={line} className="text-sm text-muted-foreground">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-sm text-muted-foreground">
              For order-specific questions, please include your order number
              so we can help you faster.
            </p>
          </div>

          <div className="lg:col-span-3">
            <ContactForm />
          </div>
        </div>
      </Container>
    </div>
  );
}
