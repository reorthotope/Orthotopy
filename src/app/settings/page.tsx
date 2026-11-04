import type { Metadata } from "next";
import { SiteShell } from "@/components/orthotopy/site-shell";

export const metadata: Metadata = {
  title: "Settings — Orthotopy",
  description: "Account settings for Orthotopy developers.",
  robots: { index: false, follow: false },
};

export default function SettingsPage() {
  return (
    <SiteShell>
      <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Account settings are on the way.
        </p>
        <div className="mt-10 rounded-2xl border bg-background p-6">
          <h2 className="text-lg font-semibold">Coming soon</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Profile details, notification preferences and publishing options
            will live here. GitHub connection is managed from the{" "}
            <a href="/dashboard" className="underline underline-offset-4 hover:no-underline">
              developer dashboard
            </a>
            .
          </p>
        </div>
      </article>
    </SiteShell>
  );
}
