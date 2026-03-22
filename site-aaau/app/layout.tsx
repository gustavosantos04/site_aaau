import type { Metadata } from "next";
import { Barlow_Condensed, Sora } from "next/font/google";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ScrollProgressIndicator } from "@/components/layout/scroll-progress-indicator";
import { CartSheet } from "@/components/store/cart-sheet";
import { Providers } from "@/app/providers";
import { siteConfig } from "@/lib/site";

import "./globals.css";

const displayFont = Barlow_Condensed({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const bodyFont = Sora({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: "AAAU Uniritter",
    template: "%s | AAAU Uniritter",
  },
  description: siteConfig.description,
  openGraph: {
    title: "AAAU Uniritter",
    description: siteConfig.description,
    url: siteConfig.url,
    siteName: "AAAU Uniritter",
    locale: "pt_BR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${displayFont.variable} ${bodyFont.variable} bg-aaau-night text-white`}
      >
        <Providers>
          <div className="relative flex min-h-screen flex-col">
            <SiteHeader />
            <ScrollProgressIndicator />
            <main className="flex-1">{children}</main>
            <SiteFooter />
            <CartSheet />
          </div>
        </Providers>
      </body>
    </html>
  );
}
