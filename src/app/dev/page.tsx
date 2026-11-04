import type { Metadata } from "next";
import { SiteShell } from "@/components/orthotopy/site-shell";
import { JoinDevForm } from "@/components/orthotopy/join-form";

export const metadata: Metadata = {
  title: "Join the Dev Team — Orthotopy",
  description:
    "One tap with GitHub — no signup form, no password. Verify your developer identity, open your dashboard and publish works in the catalog.",
};

export default function DevPortalPage() {
  return (
    <SiteShell>
      <JoinDevForm />
    </SiteShell>
  );
}
