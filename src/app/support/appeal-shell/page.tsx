import type { Metadata } from "next";
import { SupportTicketClient } from "@/components/orthotopy/support-ticket-client";

/**
 * Static shell for /support/appeal-… ticket pages.
 *
 * The site is a static export, so the private ticket links
 * (/support/appeal-<username><8-digits>) are served by
 * functions/support/[slug].js, which validates the link shape, checks the
 * ticket exists in D1 and returns THIS page. The client component then
 * parses the id from the address bar and loads the encrypted chat through
 * /api/support-threads (owner or staff only — everyone else gets a 404 and
 * a "this ticket isn't yours" card).
 *
 * This page is unindexed; it never exposes ticket data on its own — when
 * loaded directly (no ticket id in the path) it shows the invalid-link card.
 */
export const metadata: Metadata = {
  title: "Support ticket — Orthotopy",
  description: "Private appeal and support ticket chat.",
  robots: { index: false, follow: false },
};

export default function SupportAppealShellPage() {
  return <SupportTicketClient />;
}
