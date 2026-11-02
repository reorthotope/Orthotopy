import type { Metadata } from "next";
import { SiteShell } from "@/components/orthotopy/site-shell";
import { JoinDevForm } from "@/components/orthotopy/join-form";

export const metadata: Metadata = {
  title: "Join the Dev Team — Orthotopy",
  description:
    "Apply to build and maintain Orthotopy — the catalog, the storefront and the open-source tooling behind it. Verify your email with a 6-character code.",
};

export default function DevPortalPage() {
  return (
    <SiteShell>
      <JoinDevForm />
    </SiteShell>
  );
}
