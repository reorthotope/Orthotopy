import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Orthotopy — Every app in its right place",
  description:
    "Orthotopy is a free, open app store for indie software. Discover and install apps with no platform fees, no ads and no lock-in — or publish your own in minutes.",
  keywords: ["Orthotopy", "app store", "open source", "indie apps", "free software"],
  authors: [{ name: "Orthotopy contributors" }],
  icons: {
    icon: "/orthotopy.svg",
  },
  openGraph: {
    title: "Orthotopy — Every app in its right place",
    description: "A free, open app store for indie software.",
    siteName: "Orthotopy",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
