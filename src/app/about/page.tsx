import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SiteShell } from "@/components/orthotopy/site-shell";

export const metadata: Metadata = {
  title: "About — Orthotopy",
  description:
    "Orthotopy is a free, open publishing home for developers and creators. Join with GitHub, publish directly, and keep your work hosted where it belongs — with you.",
};

export default function AboutPage() {
  return (
    <SiteShell>
      <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">About Orthotopy</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every work in its right place.
        </p>

        <div className="mt-10 space-y-10">
          <section>
            <h2 className="text-lg font-semibold">What Orthotopy is</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Orthotopy is a free, open publishing home for developers and creators. It is a
              storefront that anyone can list on: apps, games, extensions — and beyond — all sit
              side by side in one catalog. There are no platform fees, no ads gating your
              audience and no algorithm deciding who gets seen. If you made something worth
              sharing, it belongs here.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The name comes from the idea that everything has a right place. Most work made by
              independent developers and creators is scattered across personal sites, file hosts
              and social feeds. Orthotopy gives it one address — with categories, search and
              creator pages — while your work stays hosted exactly where it already lives: your
              own GitHub repository and your own release links.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">How publishing works</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Joining takes one tap: authorizing your GitHub profile is the whole sign-up — no
              form to fill, no password to invent, nothing to wait for. From your dashboard you
              publish a listing directly: a title, a type and platform, a description, a link to
              the work&apos;s public GitHub repository and a download link. Screenshots are never
              uploaded to us — the site detects them in your repository (img.png, img1.png …) and
              serves them straight from GitHub, so what visitors see is always what you actually
              shipped.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Every submission passes a quick human review before it goes live — usually within
              24–48 hours — which keeps the catalog free of spam, malware and drive-by junk.
              Once approved, your work appears in the public catalog with a detail page, a
              download button and per-day view and download stats on your dashboard. Visitors can
              report any listing with one tap, and every report is triaged by a human.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">What the project stands for</h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li>· Free forever — publishing costs nothing and always will.</li>
              <li>· Open by default — the code and the process are public (MIT-licensed).</li>
              <li>· Your work, your hosting — Orthotopy lists, it never locks in.</li>
              <li>· No feeds, no algorithms — visitors come to browse, not to scroll.</li>
              <li>· Humans at both ends — every listing reviewed, every report read.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Accounts, privacy and control</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              There are no passwords anywhere in this system — your GitHub authorization is the
              account. We store only what GitHub tells us: your login, display name and verified
              email. Browsing needs no account at all, and we run no ads and no tracking of our
              own. When you want out, Settings → delete account erases your profile, works, stats
              and session immediately — no email, no waiting period. The details are in the{" "}
              <Link
                href="/privacy"
                className="text-emerald-600 underline underline-offset-4 hover:underline dark:text-emerald-400"
              >
                privacy policy
              </Link>{" "}
              and the{" "}
              <Link
                href="/terms"
                className="text-emerald-600 underline underline-offset-4 hover:underline dark:text-emerald-400"
              >
                terms &amp; conditions
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">What&apos;s next</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The storefront is under active development. Coming soon: monetization for
              developers — earnings, payouts and statements, built on the same no-lock-in
              principles as everything else. If something is broken or missing, the support form
              and the GitHub repository are the fastest ways to be heard.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">The project is open source</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Orthotopy is MIT-licensed and built in the open. You can read every line of the
              code, fork the whole thing or help make it better — issues and pull requests are
              welcome on GitHub.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/support-us">Support the project</Link>
              </Button>
              <Button asChild variant="outline">
                <a
                  href="https://github.com/reorthotope/Orthotopy"
                  target="_blank"
                  rel="noreferrer"
                >
                  View on GitHub
                </a>
              </Button>
            </div>
          </section>
        </div>
      </article>
    </SiteShell>
  );
}
