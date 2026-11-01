import type { Metadata } from "next";
import { CategoryCatalog } from "@/components/orthotopy/catalog";
import { SiteShell } from "@/components/orthotopy/site-shell";

export const metadata: Metadata = {
  title: "Apps — Orthotopy",
  description:
    "Browse apps published on Orthotopy — tools, utilities and software from independent developers.",
};

export default function AppsPage() {
  return (
    <SiteShell>
      <CategoryCatalog
        title="Apps"
        description="Utilities, tools and everyday software from independent developers — no fees, no gatekeepers."
        include={["Apps"]}
        emptyTitle="No apps in the catalog yet"
        emptyHint="Be the first: publish your app and it will show up right here."
      />
    </SiteShell>
  );
}
