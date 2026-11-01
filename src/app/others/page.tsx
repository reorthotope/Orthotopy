import type { Metadata } from "next";
import { CategoryCatalog } from "@/components/orthotopy/catalog";
import { SiteShell } from "@/components/orthotopy/site-shell";

export const metadata: Metadata = {
  title: "Others — Orthotopy",
  description:
    "Everything else on Orthotopy: audio, design, visual art, writing, photography, assets and more.",
};

export default function OthersPage() {
  return (
    <SiteShell>
      <CategoryCatalog
        title="Everything else"
        description="Audio, design, visual art, writing, photography, assets — the long tail of what people make."
        exclude={["Apps", "Games", "Extensions"]}
        emptyTitle="Nothing here yet"
        emptyHint="Publish any kind of work — music, art, writing, assets — and it will show up here."
      />
    </SiteShell>
  );
}
