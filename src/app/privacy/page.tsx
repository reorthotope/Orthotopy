import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/orthotopy/site-shell";

export const metadata: Metadata = {
  title: "Privacy Policy — Orthotopy",
  description:
    "What Orthotopy collects, why, and how to erase it: GitHub-verified developer accounts, session tokens, published listings and nothing else.",
};

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "The short version",
    body: [
      "Browsing Orthotopy sends no personal data to us: no account is needed, we run no ads, no analytics and no tracking of our own, and we do not build profiles of visitors. Developer accounts exist only through GitHub, hold only what GitHub tells us, and can be erased completely, by you, at any time from Settings.",
    ],
  },
  {
    title: "What visitors leave behind",
    body: [
      "Viewing the catalog, reading listings and following download links requires no account and stores nothing about you on our side. Like essentially every site on the internet, our host (Cloudflare) processes request metadata such as your IP address while serving pages — that handling is covered by Cloudflare's own privacy policy, and we do not receive or store those logs.",
      "Anonymous view and download counters are kept per work per day. They contain no visitor identifiers — a single visit and a thousand visits from one network look identical once counted.",
    ],
  },
  {
    title: "Developer accounts",
    body: [
      "There is no sign-up form and no password anywhere in this project — a GitHub authorization is the account. When you join, we receive and store: your GitHub login (which becomes your username), your GitHub numeric ID, your display name and your primary verified email address, plus whether you have starred the project repository. Nothing else is asked, and no password exists in the system, so there is no password to leak.",
      "Signing in issues a random session token that your browser keeps in its local storage for up to 30 days. It is not a cookie, so it is never sent to us automatically — only when you actively use the dashboard. Signing out or deleting the account removes it.",
      "To make the authorization work we keep a copy of your GitHub OAuth access token (read-only scope: your username, display name and email — no repository access, nothing can be posted in your name). It is used to verify your identity, confirm the repository star, and read your repository's public metadata and screenshots while you publish. It is refreshed on each sign-in and deleted when your account is.",
    ],
  },
  {
    title: "Published listings",
    body: [
      "When you publish a work, the listing you submit — title, type, platform, description, repository link and download link — is stored and becomes public in the catalog by design. Screenshot file names detected in your public repository are stored as part of the listing; the images themselves are served directly from your repository, never uploaded to us.",
      "Your developer name is shown on your listings. Per-day view and download totals for your works are visible to you on your dashboard.",
    ],
  },
  {
    title: "Reports and support tickets",
    body: [
      "Reports about a listing or account, and support tickets, are stored so a human can act on them. A report carries the target, the chosen reason, whatever details and contact you type, and — only if you were signed in when you filed it — your GitHub login. This information is visible only to the site operators and is kept only as long as it is useful for moderation.",
    ],
  },
  {
    title: "Abuse prevention",
    body: [
      "To keep open endpoints usable, short-lived per-IP counters throttle reports, tickets and sign-in attempts, and de-duplicate view/download beacons. These counters expire within minutes to hours, are never linked to an identity, and are not profiles.",
    ],
  },
  {
    title: "What we do not do",
    body: [
      "We do not set advertising or tracking cookies, we do not sell or share data, we do not run third-party ad scripts, and we do not email you — there is nothing to unsubscribe from. External links (repositories, downloads) and GitHub-hosted avatars lead to services with their own privacy policies.",
    ],
  },
  {
    title: "Deleting your data",
    body: [
      "Settings → Delete account removes your profile, every work you published, your statistics, your sessions and your stored GitHub token immediately and completely. A later sign-in starts a fresh account. For anything else, open an issue at github.com/reorthotope/Orthotopy/issues and we will sort it out.",
    ],
  },
  {
    title: "Changes",
    body: [
      "This policy describes the service as it runs today; if data handling changes, this page changes with it, and the previous version stays readable in the public repository's history.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <SiteShell>
      <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: November 2026 · Applies to orthotopy.us.ci and orthotopy.pages.dev
        </p>
        <div className="mt-10 space-y-10">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold">{section.title}</h2>
              {section.body.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 32)}
                  className="mt-3 text-sm leading-relaxed text-muted-foreground"
                >
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
          <p className="text-sm text-muted-foreground">
            By creating a developer account you also agree to the{" "}
            <Link
              href="/terms"
              className="text-emerald-600 underline underline-offset-4 hover:underline dark:text-emerald-400"
            >
              Terms &amp; Conditions
            </Link>
            , which cover publishing and account rules.
          </p>
        </div>
      </article>
    </SiteShell>
  );
}
