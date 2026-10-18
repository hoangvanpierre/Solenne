import type { Metadata } from "next";
import { Cactus_Classical_Serif } from "next/font/google";
import { getLocale, getMessages, getTimeZone } from "next-intl/server";
import { I18nProvider } from "@/components/layout";
import { AuthzShell } from "@/components/authz-shell";
import "./globals.css";

const cactusClassicalSerif = Cactus_Classical_Serif({
  variable: "--font-cactus",
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Solenne — Artisan Scented Candles",
    template: "%s | Solenne",
  },
  description:
    "Artisan scented candles crafted with intention. Illuminate your moments with Solenne's hand-poured, natural soy wax candles.",
  keywords: [
    "scented candles",
    "artisan candles",
    "soy wax candles",
    "luxury candles",
    "hand-poured candles",
    "Solenne",
  ],
  icons: {
    icon: "/images/product/solenne_logo.png",
    apple: "/images/product/solenne_logo.png",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Solenne",
    title: "Solenne — Artisan Scented Candles",
    description:
      "Illuminate your moments with hand-poured, natural soy wax candles.",
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [locale, messages, timeZone] = await Promise.all([
    getLocale(),
    getMessages(),
    getTimeZone(),
  ]);

  return (
    <html
      lang={locale}
      className={`${cactusClassicalSerif.variable} ${cactusClassicalSerif.className} h-full antialiased`}
    >
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
