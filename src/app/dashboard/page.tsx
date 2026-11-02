import type { Metadata } from "next";
import { SiteShell } from "@/components/orthotopy/site-shell";
import { DeveloperDashboard } from "@/components/orthotopy/dashboard";

export const metadata: Metadata = {
  title: "Developer Dashboard — Orthotopy",
  description:
    "Your Orthotopy developer dashboard — publish works, manage your presence and track what's next.",
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  return (
    <SiteShell>
      <DeveloperDashboard />
    </SiteShell>
  );
}
