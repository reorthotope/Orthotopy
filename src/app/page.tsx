"use client";

import { useState } from "react";
import { Hero } from "@/components/orthotopy/hero";
import { WorksExplorer } from "@/components/orthotopy/works-explorer";
import { Creators, CallToAction, PublishSteps } from "@/components/orthotopy/sections";
import { SiteShell, usePublish } from "@/components/orthotopy/site-shell";
import { useWorks } from "@/hooks/use-works";

export default function Home() {
  const [query, setQuery] = useState("");
  const { data, isLoading } = useWorks();
  const openPublish = usePublish();

  const works = data ?? [];
  const creatorCount = new Set(works.map((work) => work.creator)).size;

  return (
    <SiteShell>
      <a
        href="#works"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to works
      </a>
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
    </SiteShell>
  );
}
