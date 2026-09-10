import type { Metadata } from "next";
import { Geist, Geist_Mono, Italianno } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const italianno = Italianno({
  variable: "--font-italianno",
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
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Solenne",
    title: "Solenne — Artisan Scented Candles",
    description:
      "Illuminate your moments with hand-poured, natural soy wax candles.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${italianno.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
