"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Footer } from "@/components/orthotopy/footer";
import { Hero } from "@/components/orthotopy/hero";
import { Navbar } from "@/components/orthotopy/navbar";
import { PublishDialog } from "@/components/orthotopy/publish-dialog";
import { CallToAction, Creators, PublishSteps } from "@/components/orthotopy/sections";
import { WorksExplorer } from "@/components/orthotopy/works-explorer";
import type { Work } from "@/lib/works";

export default function Home() {
  const [query, setQuery] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["works"],
    queryFn: async (): Promise<Work[]> => {
      const res = await fetch("/catalog/works.json");
      if (!res.ok) throw new Error("Failed to load works");
      const json = (await res.json()) as { works: Work[] };
      return json.works;
    },
  });

  const works = data ?? [];
  const creatorCount = new Set(works.map((work) => work.creator)).size;
  const openPublish = () => setPublishOpen(true);

  return (
    <div id="top" className="flex min-h-screen flex-col bg-background text-foreground">
      <a
        href="#works"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to works
      </a>
      <Navbar onPublish={openPublish} />
      <main className="flex-1">
        <Hero
          query={query}
          onQueryChange={setQuery}
          workCount={works.length}
          creatorCount={creatorCount}
          onPublish={openPublish}
        />
        <WorksExplorer
          works={works}
          isLoading={isLoading}
          query={query}
          onQueryChange={setQuery}
        />
        <Creators works={works} />
        <PublishSteps onPublish={openPublish} />
        <CallToAction onPublish={openPublish} />
      </main>
      <Footer />
      <PublishDialog open={publishOpen} onOpenChange={setPublishOpen} />
    </div>
  );
}
