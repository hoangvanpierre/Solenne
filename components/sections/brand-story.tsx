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
    />
  );
}
