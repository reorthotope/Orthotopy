"use client";

import { Hero } from "@/components/orthotopy/hero";
import { CategoryStrip } from "@/components/orthotopy/category-strip";
import { CallToAction, PublishSteps } from "@/components/orthotopy/sections";
import { SiteShell, usePublish } from "@/components/orthotopy/site-shell";
import { useWorks } from "@/hooks/use-works";

/**
 * The page body lives INSIDE SiteShell so `usePublish()` resolves the
 * provider — Home itself renders the shell and would otherwise read the
 * no-op default context (the hero CTA could never open the dialog).
 */
function HomeContent() {
  const { data, isLoading } = useWorks();
  const openPublish = usePublish();

  const works = data ?? [];
  const activeDevelopers = new Set(
    works.filter((work) => work.kind === "Developer").map((work) => work.creator)
  ).size;
  const activeCreators = new Set(
    works.filter((work) => work.kind === "Creator").map((work) => work.creator)
  ).size;

  return (
    <>
      <a
        href="#browse"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to catalog
      </a>
      <Hero
        activeDevelopers={activeDevelopers}
        activeCreators={activeCreators}
        statsReady={!isLoading}
        onPublish={openPublish}
      />
      <CategoryStrip />
      <PublishSteps onPublish={openPublish} />
      <CallToAction onPublish={openPublish} />
    </>
  );
}

export default function Home() {
  return (
    <SiteShell>
      <HomeContent />
    </SiteShell>
  );
}
