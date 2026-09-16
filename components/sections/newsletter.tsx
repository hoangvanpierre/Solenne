"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Container } from "@/components/ui/container";
import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MagneticButton } from "@/components/animations/magnetic-button";
import { subscribeNewsletterAction } from "@/app/actions/newsletter";

export function Newsletter() {
  const t = useTranslations("newsletter");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await subscribeNewsletterAction({ email });
      if (res.success) {
        setFeedback({
          type: "success",
          message: t("success"),
        });
        setEmail("");
      } else {
        setFeedback({
          type: "error",
          message: t("error"),
        });
      }
    } catch {
      setFeedback({
        type: "error",
        message: t("error"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="py-24 lg:py-32 bg-warm-black text-cream">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <ScrollReveal>
            <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl font-semibold mb-4">
              {t("title")}
            </h2>
          </ScrollReveal>

          <ScrollReveal delay={0.1}>
            <p className="text-cream/70 text-lg mb-10 max-w-lg mx-auto">
              {t("description")}
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            {feedback?.type === "success" ? (
              <div className="rounded-full bg-cream/10 border border-cream/20 py-3.5 px-6 max-w-md mx-auto text-sm text-cream animate-fadeIn">
                ✨ {feedback.message}
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="flex flex-col sm:flex-row items-center gap-4 max-w-md mx-auto"
              >
                <div className="flex-1 w-full">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("placeholder")}
                    className="bg-cream/10 border-cream/20 text-cream placeholder:text-cream/40 h-12 rounded-full px-6 focus-visible:ring-cream/50"
                    required
                    disabled={isSubmitting}
                  />
                </div>
                <MagneticButton strength={0.2}>
                  <Button
                    type="submit"
                    size="lg"
                    disabled={isSubmitting}
                    className="w-full sm:w-auto bg-cream text-warm-black hover:bg-cream/90 font-medium"
                  >
                    {isSubmitting ? t("subscribing") : t("button")}
                  </Button>
                </MagneticButton>
              </form>
            )}

            {feedback?.type === "error" && (
              <p className="mt-3 text-xs text-rose-300">{feedback.message}</p>
            )}
          </ScrollReveal>
        </div>
      </Container>
    </section>
  );
}
