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
import enMessages from "@/messages/en.json";
import viMessages from "@/messages/vi.json";

export type SupportedLocale = "en" | "vi";

const ALL_MESSAGES: Record<SupportedLocale, Record<string, any>> = {
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
  initialMessages: Record<string, any>;
  children: React.ReactNode;
}

export function I18nProvider({
  initialLocale,
  initialMessages,
  children,
}: I18nProviderProps) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<SupportedLocale>(initialLocale);
  const [messages, setMessages] = useState<Record<string, any>>(initialMessages);
  const [isPending, startTransition] = useTransition();

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
      });
    },
    [locale, router]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, isPending }}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    </I18nContext.Provider>
  );
}
