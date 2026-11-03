import type { Metadata } from "next";
import { Cactus_Classical_Serif } from "next/font/google";
import { getLocale, getMessages, getTimeZone } from "next-intl/server";
import { I18nProvider } from "@/components/layout";
import { AuthzShell } from "@/components/authz-shell";
import { INTRO_GUARD_SCRIPT } from "@/components/experience/solenne-intro/solenne-intro-config";
import "./globals.css";

const cactusClassicalSerif = Cactus_Classical_Serif({
  variable: "--font-cactus",
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Solenne — Hand-poured scented candles",
    template: "%s | Solenne",
  },
  description:
    "Hand-poured scented candles made in small batches with natural soy wax, cotton wicks and phthalate-free fragrance oils.",
  keywords: [
    "scented candles",
    "hand-poured candles",
    "soy wax candles",
    "small batch candles",
    "Solenne",
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Solenne",
    title: "Solenne — Hand-poured scented candles",
    description:
      "Hand-poured scented candles in small batches, made with natural soy wax.",
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [locale, messages, timeZone] = await Promise.all([
    getLocale(),
    getMessages(),
    getTimeZone(),
  ]);

  return (
    /*
     * `suppressHydrationWarning` is for the homepage's inline intro guard, which
     * marks <html> before hydration (that is the point of it) so the ivory
     * backdrop exists on the first paint. It silences the expected attribute
     * difference on this element only; nothing else here is client-only.
     */
    <html
      lang={locale}
      className={`${cactusClassicalSerif.variable} ${cactusClassicalSerif.className} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Pre-paint intro guard. Rendering it here (never in a page) keeps it
            out of client-navigation payloads, where a script would never run. */}
        <script dangerouslySetInnerHTML={{ __html: INTRO_GUARD_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <I18nProvider
          initialLocale={locale as "en" | "vi"}
          initialMessages={messages}
          timeZone={timeZone}
        >
          <AuthzShell>{children}</AuthzShell>
        </I18nProvider>
      </body>
    </html>
  );
}
