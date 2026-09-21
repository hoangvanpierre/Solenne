"use client";

import React, {
  createContext,
  useContext,
  useState,
  useTransition,
  useCallback,
  useEffect,
} from "react";
import { NextIntlClientProvider } from "next-intl";
import { useRouter } from "next/navigation";
import { setLocaleAction } from "@/app/actions/locale";
import { useUIStore } from "@/stores/ui-store";
import { useLocaleScrollRestoration } from "@/hooks/use-locale-scroll-restoration";
import {
  restoreLocaleScrollPosition,
  saveLocaleScrollPosition,
} from "@/lib/locale-scroll-restoration";
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import enMessages from "@/messages/en.json";
import viMessages from "@/messages/vi.json";

export type SupportedLocale = "en" | "vi";

type IntlMessages = NonNullable<
  React.ComponentProps<typeof NextIntlClientProvider>["messages"]
>;

const ALL_MESSAGES: Record<SupportedLocale, IntlMessages> = {
  en: enMessages,
  vi: viMessages,
};

interface I18nContextValue {
  locale: SupportedLocale;
  setLocale: (nextLocale: SupportedLocale) => Promise<void>;
  isPending: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function useI18n() {
  return useContext(I18nContext);
}

export interface I18nProviderProps {
  initialLocale: SupportedLocale;
  initialMessages: IntlMessages;
  timeZone?: string;
  children: React.ReactNode;
}

export function I18nProvider({
  initialLocale,
  initialMessages,
  timeZone = DEFAULT_TIMEZONE,
  children,
}: I18nProviderProps) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<SupportedLocale>(initialLocale);
  const [messages, setMessages] = useState<IntlMessages>(initialMessages);
  const [isPending, startTransition] = useTransition();

  // A language switch parks the visitor's scroll position; this puts them back
  // on it once the new locale has rendered — including after a full page load.
  useLocaleScrollRestoration();

  // Keep ui-store and html lang in sync with the current locale
  useEffect(() => {
    useUIStore.getState().setLocale(locale);
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const setLocale = useCallback(
    async (nextLocale: SupportedLocale) => {
      if (nextLocale === locale) return;

      // 0. Park the current scroll position before anything re-renders: the
      // visitor must stay exactly where they were across the locale change
      // (see lib/locale-scroll-restoration.ts).
      saveLocaleScrollPosition({ from: locale, to: nextLocale });

      // 1. Immediately switch client translations and locale without full-page reload
      const nextMessages = ALL_MESSAGES[nextLocale] ?? ALL_MESSAGES.en;
      setLocaleState(nextLocale);
      setMessages(nextMessages);
      useUIStore.getState().setLocale(nextLocale);

      // 2. Set document cookie immediately so subsequent client fetches and navigations send NEXT_LOCALE
      if (typeof document !== "undefined") {
        document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`;
        document.documentElement.lang = nextLocale;
      }

      // 3. Persist server-side cookie and refresh Server Components in-place
      // preserving the current route, query parameters, filters, and scroll position
      startTransition(async () => {
        try {
          await setLocaleAction(nextLocale);
        } catch {
          // Continue gracefully
        }
        // router.refresh() re-renders active Server Components with the new NEXT_LOCALE cookie
        router.refresh();

        // Re-rendering for the new locale can shift or reset the viewport, so
        // return the visitor to the position parked in step 0 once the
        // translated content has settled.
        restoreLocaleScrollPosition();
      });
    },
    [locale, router]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, isPending }}>
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        timeZone={timeZone}
      >
        {children}
      </NextIntlClientProvider>
    </I18nContext.Provider>
  );
}
