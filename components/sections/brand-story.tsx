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
      // Weight: 400 (font-normal) for crisp, classical serif strokes without faux-bold
      // Palette: Muted warm stone -> radiant amber wavefront -> deep, solid espresso charcoal
      fontWeight="font-normal"
      textSize="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl"
      mutedColor="var(--brand-story-muted, #B0A8A0)"
      activeColor="var(--brand-story-active, #14100E)"
      accentColor="var(--brand-story-accent, #C4956A)"
    />
  );
}
