"use client";

import React, {
  createContext,
  useContext,
  useState,
  useTransition,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { NextIntlClientProvider } from "next-intl";
import { setLocaleAction } from "@/app/actions/locale";
import { useUIStore } from "@/stores/ui-store";
import { useLocaleScrollRestoration } from "@/hooks/use-locale-scroll-restoration";
import { saveLocaleScrollPosition } from "@/lib/locale-scroll-restoration";
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
  const isReloadingRef = useRef(false);
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
      if (nextLocale === locale || isReloadingRef.current) return;

      // 0. Park the current scroll position before the document is replaced: the
      // visitor has to land on exactly the same spot once the new locale has
      // finished loading (see lib/locale-scroll-restoration.ts). Nothing in this
      // outgoing document may consume that payload — a restoration started here
      // would drop it before the reload could read it.
      saveLocaleScrollPosition({ from: locale, to: nextLocale });

      // 1. Reflect the new language straight away so the UI responds the moment
      // the toggle is pressed, while this is still the outgoing document.
      const nextMessages = ALL_MESSAGES[nextLocale] ?? ALL_MESSAGES.en;
      setLocaleState(nextLocale);
      setMessages(nextMessages);
      useUIStore.getState().setLocale(nextLocale);

      // 2. Write NEXT_LOCALE synchronously: the document request below must carry
      // it, otherwise the server would render the old locale all over again.
      if (typeof document !== "undefined") {
        document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`;
        document.documentElement.lang = nextLocale;
      }

      startTransition(async () => {
        // 3. Persist the cookie server-side so later requests keep the choice. A
        // failure here is not fatal: the client-side cookie written above is what
        // the reload request actually carries.
        try {
          await setLocaleAction(nextLocale);
        } catch {
          // Continue gracefully
        }

        // 4. Full page load. The server re-renders the same route, query string
        // and hash for the new locale, and the parked position is put back by
        // useLocaleScrollRestoration() once the new document has rendered.
        isReloadingRef.current = true;
        window.location.reload();
      });
    },
    [locale]
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
