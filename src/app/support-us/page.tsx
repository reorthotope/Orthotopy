import type { Metadata } from "next";
import Link from "next/link";
import { Github, Heart, Megaphone, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteShell } from "@/components/orthotopy/site-shell";

export const metadata: Metadata = {
  title: "Support Us — Orthotopy",
  description:
    "Ways to support Orthotopy: star and share the project, publish your works, or contribute code and design.",
};

const WAYS = [
  {
    icon: Heart,
    title: "Star the repository",
    body: "Stars are how open-source projects get discovered. A single star on GitHub costs nothing and genuinely helps other developers and creators find Orthotopy.",
    action: {
      label: "Star on GitHub",
      href: "https://github.com/reorthotope/Orthotopy",
      external: true,
    },
  },
  {
    icon: Megaphone,
    title: "Share it with one person",
    body: "You do not need a big audience to help. Send the site to one friend who makes things — an indie developer, a musician, a pixel artist. The catalog grows one real listing at a time.",
    action: { label: "Send the home page", href: "/", external: false },
  },
  {
    icon: Upload,
    title: "Publish your work",
    body: "The strongest way to support an open catalog is to be in it. Publishing is free and takes minutes, and every real listing makes the storefront more useful for everyone who arrives after you.",
    action: { label: "Publish a work", href: "/#publish", external: false },
  },
  {
    icon: Github,
    title: "Contribute code or design",
    body: "Orthotopy is MIT-licensed and built in the open. Bug reports, feature ideas, pull requests and design feedback are all welcome in the repository — no contribution is too small.",
    action: {
      label: "Open an issue",
      href: "https://github.com/reorthotope/Orthotopy/issues",
      external: true,
    },
  },
];

export default function SupportUsPage() {
  return (
    <SiteShell>
      <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Support Orthotopy</h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Orthotopy is free, open source and runs on a static host — it costs almost
            nothing to keep alive. What it needs most is people. Here are the four things
            that actually help, in order of impact.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
          {WAYS.map((way) => {
            const Icon = way.icon;
            return (
              <Card key={way.title} className="flex h-full flex-col">
                <CardHeader>
                  <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <CardTitle className="mt-2 text-lg">{way.title}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-4">
                  <p className="text-sm leading-relaxed text-muted-foreground">{way.body}</p>
                  {way.action.external ? (
                    <Button asChild variant="outline" size="sm" className="self-start">
                      <a href={way.action.href} target="_blank" rel="noreferrer">
                        {way.action.label}
                      </a>
                    </Button>
                  ) : (
                    <Button asChild variant="outline" size="sm" className="self-start">
                      <Link href={way.action.href}>{way.action.label}</Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </SiteShell>
  );
}
