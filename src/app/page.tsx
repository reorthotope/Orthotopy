"use client";

import { useState } from "react";
import { AppGrid } from "@/components/orthotopy/app-grid";
import { Footer } from "@/components/orthotopy/footer";
import { Hero } from "@/components/orthotopy/hero";
import { Navbar } from "@/components/orthotopy/navbar";
import { CallToAction, Categories, PublishSteps } from "@/components/orthotopy/sections";

export default function Home() {
  const [query, setQuery] = useState("");

  return (
    <div id="top" className="flex min-h-screen flex-col bg-background text-foreground">
      <a
        href="#apps"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to apps
      </a>
      <Navbar />
      <main className="flex-1">
        <Hero query={query} onQueryChange={setQuery} />
        <AppGrid query={query} onQueryChange={setQuery} />
        <Categories />
        <PublishSteps />
        <CallToAction />
      </main>
      <Footer />
    </div>
  );
}
