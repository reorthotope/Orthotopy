import type { Metadata } from "next";
import { SiteShell } from "@/components/orthotopy/site-shell";
import { JoinDevForm } from "@/components/orthotopy/join-form";

export const metadata: Metadata = {
  title: "Join the Dev Team — Orthotopy",
  description:
    "Create your free Orthotopy developer account. Verify your email with a 6-character code to publish and manage works in the catalog.",
};

export default function DevPortalPage() {
  return (
    <SiteShell>
      <JoinDevForm />
    </SiteShell>
  );
}
