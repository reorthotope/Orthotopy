import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { Providers } from "@/components/providers";
import { PwaRegister } from "@/components/pwa-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Orthotopy — Every work in its right place",
  description:
    "Orthotopy is a free, open publishing home for developers and creators. Publish apps, tools, games, music, design and writing — no fees, no gatekeepers, no lock-in.",
  keywords: ["Orthotopy", "publishing", "open source", "indie developers", "creators", "catalog"],
  authors: [{ name: "Orthotopy contributors" }],
  applicationName: "Orthotopy",
  // Google AdSense site-ownership verification.
  other: {
    "google-adsense-account": "ca-pub-7195646239757957",
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/orthotopy.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Orthotopy",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "Orthotopy — Every work in its right place",
    description: "A free, open publishing home for developers and creators.",
    siteName: "Orthotopy",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b120e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Google AdSense loads only when NEXT_PUBLIC_ADSENSE_CLIENT is set at build
  // time (e.g. NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-1234567890123456 bun run build).
  const adsenseClient = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {adsenseClient ? (
          <Script
            id="adsense"
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        ) : null}
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <Providers>
            {children}
            <Toaster />
            <PwaRegister />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
