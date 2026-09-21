"use client";

import { useTranslations } from "next-intl";
import { TextFillAnimation } from "@/components/animations/text-fill-animation";

export function BrandStory() {
  const t = useTranslations("brandStory");

  return (
    <TextFillAnimation
      text={t("description")}
      scrollDistance="220vh"
      scrub={0.8}
      // Apple-inspired bold, solid typography treatment:
      // Weight: 600 (font-semibold) for dense, full glyph bodies
      // Palette: Muted warm stone -> radiant amber wavefront -> deep, solid espresso charcoal
      fontWeight="font-semibold"
      mutedColor="var(--brand-story-muted, #B0A8A0)"
      activeColor="var(--brand-story-active, #14100E)"
      accentColor="var(--brand-story-accent, #C4956A)"
    />
  );
}
