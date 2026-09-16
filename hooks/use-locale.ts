"use client";

import { useLocale } from "next-intl";
import { useI18n } from "@/components/layout/i18n-provider";

export function useAppLocale(): "en" | "vi" {
  const i18n = useI18n();
  const nextIntlLocale = useLocale();

  if (i18n?.locale) {
    return i18n.locale;
  }
  return nextIntlLocale === "vi" ? "vi" : "en";
}
