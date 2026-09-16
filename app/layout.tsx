import type { Metadata } from "next";
import { Birthstone } from "next/font/google";
import { getLocale, getMessages, getTimeZone } from "next-intl/server";
import { I18nProvider } from "@/components/layout";
import "./globals.css";

const birthstone = Birthstone({
  variable: "--font-birthstone",
  subsets: ["latin"],
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
  const locale = await getLocale();
  const messages = await getMessages();
  const timeZone = await getTimeZone();

  return (
    <html
      lang={locale}
      className={`${birthstone.variable} ${birthstone.className} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <I18nProvider
          initialLocale={locale as "en" | "vi"}
          initialMessages={messages}
          timeZone={timeZone}
        >
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
