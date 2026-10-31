import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { Providers } from "@/components/providers";

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
  icons: {
    icon: "/orthotopy.svg",
  },
  openGraph: {
    title: "Orthotopy — Every work in its right place",
    description: "A free, open publishing home for developers and creators.",
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
          <Providers>
            {children}
            <Toaster />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
