import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SiteShell } from "@/components/orthotopy/site-shell";

export const metadata: Metadata = {
  title: "Join the Dev Team — Orthotopy",
  description:
    "The Orthotopy dev team application flow is being built. For now, say hi on GitHub.",
};

export default function JoinPage() {
  return (
    <SiteShell>
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 py-20 text-center sm:px-6 sm:py-28">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          Placeholder — coming soon
        </span>
        <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">
          Join the Dev Team
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          We are putting together the team that builds and maintains Orthotopy — the
          storefront, the catalog tooling and the open-source library behind it. This page
          will become the application flow. For now it is a placeholder, exactly as
          promised.
        </p>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Do not wait for the form, though: the fastest way in is to show up in the open.
          Open an issue, send a pull request, or publish a work — contributors get noticed.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <a
              href="https://github.com/reorthotope/Orthotopy/issues"
              target="_blank"
              rel="noreferrer"
            >
              Say hi on GitHub
            </a>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Back to the catalog</Link>
          </Button>
        </div>
      </div>
    </SiteShell>
  );
}
