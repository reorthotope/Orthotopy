import type { Metadata } from "next";
import { SiteShell } from "@/components/orthotopy/site-shell";
import { SettingsAccount } from "@/components/orthotopy/settings-account";

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
          Your account is your GitHub identity — here is exactly what that
          means and what you control.
        </p>
        <div className="mt-10">
          <SettingsAccount />
        </div>
      </article>
    </SiteShell>
  );
}
