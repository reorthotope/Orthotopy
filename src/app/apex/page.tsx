import type { Metadata } from "next";
import { ApexConsole } from "@/components/orthotopy/apex-console";

/**
 * /apex — the site owner's private control console (dashboard, review
 * requests, CRM, support tickets, user reports). Deliberately outside the
 * public SiteShell, unindexed, and gated by the ADMIN_TOKEN passcode; all
 * data lives behind POST /api/apex.
 */
export const metadata: Metadata = {
  title: "Apex — Orthotopy Control Console",
  description: "Private control console for Orthotopy.",
  robots: { index: false, follow: false },
};

export default function ApexPage() {
  return <ApexConsole />;
}
