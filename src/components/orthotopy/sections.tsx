"use client";

import {
  AudioWaveform,
  FileCode2,
  Gamepad2,
  Github,
  ListTodo,
  Mountain,
  PenLine,
  Rocket,
  ShieldCheck,
  Terminal,
  Upload,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APPS } from "@/lib/apps";

const CATEGORY_CARDS: { name: string; icon: LucideIcon }[] = [
  { name: "Developer Tools", icon: Terminal },
  { name: "Games", icon: Gamepad2 },
  { name: "Productivity", icon: ListTodo },
  { name: "Audio", icon: AudioWaveform },
  { name: "Privacy & Security", icon: ShieldCheck },
  { name: "Tools", icon: Wrench },
  { name: "Outdoors", icon: Mountain },
  { name: "Writing", icon: PenLine },
];

const STEPS: { number: string; icon: LucideIcon; title: string; description: string }[] = [
  {
    number: "01",
    icon: FileCode2,
    title: "Package it",
    description:
      "Add an orthotopy.json manifest to your project — name, icon, version and a download URL hosted anywhere you like.",
  },
  {
    number: "02",
    icon: Upload,
    title: "Ship it",
    description:
      "Open a pull request to the Orthotopy catalog. No gatekeepers — just automated checks that your build matches the manifest.",
  },
  {
    number: "03",
    icon: Rocket,
    title: "Get found",
    description:
      "Your listing appears in search and categories instantly, and downloads go straight from your own hosting to your users.",
  },
];

export function Categories() {
  return (
    <section
      id="categories"
      className="scroll-mt-20 border-t border-border/60 bg-muted/30"
      aria-labelledby="categories-heading"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="max-w-2xl">
          <h2 id="categories-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
            Browse by category
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">
            Every corner of the catalog, open for exploration.
          </p>
        </div>
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {CATEGORY_CARDS.map((category) => {
            const Icon = category.icon;
            const count = APPS.filter((app) => app.category === category.name).length;
            return (
              <li key={category.name}>
                <a
                  href="#apps"
                  className="flex h-full items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-emerald-500/40 hover:bg-accent"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{category.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {count} {count === 1 ? "app" : "apps"}
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function PublishSteps() {
  return (
    <section
      id="publish"
      className="scroll-mt-20 border-t border-border/60"
      aria-labelledby="publish-heading"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="max-w-2xl">
          <h2 id="publish-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
            Publish in three steps
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">
            Getting your app listed costs nothing and takes minutes. The catalog lives on
            GitHub, so every change is versioned and public.
          </p>
        </div>
        <ol className="grid grid-cols-1 gap-4 py-8 md:grid-cols-3">
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <li key={step.number}>
                <Card className="relative h-full overflow-hidden">
                  <span
                    aria-hidden="true"
                    className="absolute right-4 top-2 text-6xl font-bold text-emerald-500/10"
                  >
                    {step.number}
                  </span>
                  <CardHeader>
                    <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <CardTitle className="mt-2 text-lg">{step.title}</CardTitle>
                    <CardDescription className="text-sm leading-relaxed">
                      {step.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

export function CallToAction() {
  return (
    <section
      className="border-t border-border/60 bg-muted/30"
      aria-labelledby="cta-heading"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border bg-card px-6 py-12 text-center sm:px-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -bottom-24 mx-auto size-72 rounded-full bg-emerald-500/15 blur-3xl"
          />
          <h2 id="cta-heading" className="relative text-2xl font-bold tracking-tight sm:text-3xl">
            Have something to ship?
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
            Open a pull request today and your app could be in the catalog this week.
            Orthotopy takes zero percent, forever.
          </p>
          <div className="relative mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <a href="#publish">Publish your app</a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a
                href="https://github.com/reorthotope/Orthotopy"
                target="_blank"
                rel="noreferrer"
              >
                <Github className="size-4" aria-hidden="true" />
                Star the project
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
