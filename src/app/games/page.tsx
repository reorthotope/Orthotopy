import type { Metadata } from "next";
import { CategoryCatalog } from "@/components/orthotopy/catalog";
import { SiteShell } from "@/components/orthotopy/site-shell";

export const metadata: Metadata = {
  title: "Games — Orthotopy",
  description:
    "Browse games published on Orthotopy — indie games of every shape, straight from their makers.",
};

export default function GamesPage() {
  return (
    <SiteShell>
      <CategoryCatalog
        title="Games"
        description="Indie games of every shape and size, published straight from their makers."
        include={["Games"]}
        emptyTitle="No games in the catalog yet"
        emptyHint="Be the first: publish your game and it will show up right here."
      />
    </SiteShell>
  );
}
