import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SiteShell } from "@/components/orthotopy/site-shell";

export const metadata: Metadata = {
  title: "About — Orthotopy",
  description:
    "Orthotopy is a free, open publishing home for developers and creators. Learn how the catalog works and what the project stands for.",
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
              storefront that anyone can list on: apps, games, extensions, music, design,
              writing, photography and assets all sit side by side in one catalog. There are
              no platform fees, no ads gating your audience and no approval queue — if you
              made something, it belongs here.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The name comes from the idea that everything has a right place. Most work made
              by independent developers and creators is scattered across personal sites,
              file hosts and social feeds. Orthotopy gives it one address, with search,
              categories and creator pages, while your work stays hosted wherever you want.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">How the catalog works</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The entire catalog is an open JSON file that lives in the public GitHub
              repository. When you press “Publish”, the site opens a prefilled issue with
              your listing ready to merge — or you can edit the file directly and send a
              pull request. Every change is versioned and public, so the catalog can never
              silently disappear or lock you out.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The site itself is a fully static web app with offline support, installable
              on Android, iOS and desktop as a PWA. That keeps hosting free, fast and
              private: no accounts, no tracking, no database holding your work hostage.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">What the project stands for</h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li>· Free forever — publishing costs nothing and always will.</li>
              <li>· Open by default — the catalog, the code and the process are public.</li>
              <li>· Your work, your hosting — Orthotopy lists, it never locks in.</li>
              <li>· No feeds, no algorithms — visitors come to browse, not to scroll.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">The project is open source</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Orthotopy is MIT-licensed and built in the open. You can read every line of
              the code, audit the catalog file, fork the whole thing or help make it
              better. If you want to get involved, head to the GitHub repository — issues
              and pull requests are welcome.
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
