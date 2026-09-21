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
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import enMessages from "@/messages/en.json";
import viMessages from "@/messages/vi.json";

export type SupportedLocale = "en" | "vi";

type IntlMessages = NonNullable<
  React.ComponentProps<typeof NextIntlClientProvider>["messages"]
>;

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const output: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source)) {
    const sVal = source[key];
    const tVal = target[key];
    if (sVal !== null && typeof sVal === "object" && !Array.isArray(sVal)) {
      if (tVal !== null && typeof tVal === "object" && !Array.isArray(tVal)) {
        output[key] = deepMerge(
          tVal as Record<string, unknown>,
          sVal as Record<string, unknown>
        );
      } else {
        output[key] = sVal;
      }
    } else if (sVal !== undefined && sVal !== "") {
      output[key] = sVal;
    }
  }
  return output;
}

const ALL_MESSAGES: Record<SupportedLocale, IntlMessages> = {
  en: enMessages,
  vi: deepMerge(enMessages, viMessages),
};

/**
 * Computes the target URL for a locale switch, preserving pathname,
 * dynamic route segments, search params, and hash without redirecting
 * to the homepage.
 */
export function getLocalizedUrl(nextLocale: SupportedLocale): string {
  if (typeof window === "undefined") return `/${nextLocale}`;

  const pathname = window.location.pathname;
  const search = window.location.search || "";
  const hash = window.location.hash || "";

  // Check if pathname currently has an /en or /vi prefix
  const match = pathname.match(/^\/(en|vi)(?:\/(.*))?$/);

  let newPath: string;
  if (match) {
    const rest = match[2] ? `/${match[2]}` : "";
    newPath = `/${nextLocale}${rest}`;
  } else {
    // Prefix-free route: keep same path or prepend prefix
    if (pathname === "/") {
      newPath = `/${nextLocale}`;
    } else {
      newPath = `/${nextLocale}${pathname}`;
    }
  }

  return `${newPath}${search}${hash}`;
}

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
  const [messages, setMessages] = useState<IntlMessages>(() => {
    return ALL_MESSAGES[initialLocale] ?? initialMessages;
  });
  const [prevInitialLocale, setPrevInitialLocale] = useState(initialLocale);
  if (initialLocale !== prevInitialLocale) {
    setPrevInitialLocale(initialLocale);
    setLocaleState(initialLocale);
    setMessages(ALL_MESSAGES[initialLocale] ?? ALL_MESSAGES.en);
  }
  const [isPending, startTransition] = useTransition();

  // Keep ui-store and html lang in sync with the current locale
  useEffect(() => {
    useUIStore.getState().setLocale(locale);
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  // Handle browser back / forward buttons when traversing between localized URLs
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePopState = () => {
      const match = window.location.pathname.match(/^\/(en|vi)(?:\/.*)?$/);
      if (match) {
        const urlLocale = match[1] as SupportedLocale;
        if (urlLocale !== locale) {
          setLocaleState(urlLocale);
          setMessages(ALL_MESSAGES[urlLocale] ?? ALL_MESSAGES.en);
          useUIStore.getState().setLocale(urlLocale);
          document.cookie = `NEXT_LOCALE=${urlLocale}; path=/; max-age=31536000; SameSite=Lax`;
          document.documentElement.lang = urlLocale;
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [locale]);

  const setLocale = useCallback(
    async (nextLocale: SupportedLocale) => {
      // If already on nextLocale and URL matches, do nothing
      if (
        nextLocale === locale &&
        typeof window !== "undefined" &&
        window.location.pathname.startsWith(`/${nextLocale}`)
      ) {
        return;
      }

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

      // 3. Compute target localized URL preserving current route, query parameters, and hash
      const targetUrl = getLocalizedUrl(nextLocale);

      // 4. Persist server-side cookie and smoothly transition client route
      startTransition(async () => {
        try {
          await setLocaleAction(nextLocale);
        } catch {
          // Continue gracefully
        }
        // Client navigation with scroll: false preserves scroll position and prevents hard reload
        router.replace(targetUrl, { scroll: false });
      });
    },
    [locale, router]
  );

  // Fallback function for any key missing at runtime: looks up English message
  const getMessageFallback = useCallback(
    ({ key, namespace }: { key: string; namespace?: string }) => {
      const fullPath = namespace ? `${namespace}.${key}` : key;
      const parts = fullPath.split(".");
      let current: unknown = ALL_MESSAGES.en;
      for (const part of parts) {
        if (
          current !== null &&
          typeof current === "object" &&
          part in (current as Record<string, unknown>)
        ) {
          current = (current as Record<string, unknown>)[part];
        } else {
          current = undefined;
          break;
        }
      }
      return typeof current === "string" ? current : key;
    },
    []
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, isPending }}>
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        timeZone={timeZone}
        getMessageFallback={getMessageFallback}
      >
        {children}
      </NextIntlClientProvider>
    </I18nContext.Provider>
  );
}

