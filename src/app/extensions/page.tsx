import type { Metadata } from "next";
import { CategoryCatalog } from "@/components/orthotopy/catalog";
import { SiteShell } from "@/components/orthotopy/site-shell";

export const metadata: Metadata = {
  title: "Extensions — Orthotopy",
  description:
    "Browse browser extensions, plugins and add-ons published on Orthotopy.",
};

export default function ExtensionsPage() {
  return (
    <SiteShell>
      <CategoryCatalog
        title="Extensions"
        description="Browser extensions, editor plugins and add-ons — small tools that make everything else better."
        include={["Extensions"]}
        emptyTitle="No extensions in the catalog yet"
        emptyHint="Be the first: publish your extension and it will show up right here."
      />
    </SiteShell>
  );
}
