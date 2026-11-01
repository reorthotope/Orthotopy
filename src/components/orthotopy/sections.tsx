"use client";

import { useMemo } from "react";
import {
  FileCode2,
  Github,
  Rocket,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { gradientFor, type Work } from "@/lib/works";

const STEPS: { number: string; icon: LucideIcon; title: string; description: string }[] = [
  {
    number: "01",
    icon: FileCode2,
    title: "Describe it",
    description:
      "Write a small work.json — title, kind, category and a link to wherever your work lives. No platform lock-in.",
  },
  {
    number: "02",
    icon: Upload,
    title: "Submit it",
    description:
      "Send it as a pull request to the Orthotopy catalog, or use the Publish button on this page for the live demo flow.",
  },
  {
    number: "03",
    icon: Rocket,
    title: "Get discovered",
    description:
      "Show up in search, categories and creator pages. Your audience comes straight to you — no feed algorithms.",
  },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return name.slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0] ?? ""}`.toUpperCase();
}

export function Creators({ works }: { works: Work[] }) {
  const creators = useMemo(() => {
    const map = new Map<string, { name: string; kind: string; count: number }>();
    for (const work of works) {
      const entry = map.get(work.creator);
      if (entry) {
        entry.count += 1;
      } else {
        map.set(work.creator, { name: work.creator, kind: work.kind, count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [works]);

  return (
    <section
      id="creators"
      className="scroll-mt-20 border-t border-border/60 bg-muted/30"
      aria-labelledby="creators-heading"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="max-w-2xl">
          <h2 id="creators-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
            The people behind the works
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">
            Developers and creators, side by side in one open catalog.
          </p>
        </div>
        {creators.length === 0 ? (
          <p className="mt-8 text-sm text-muted-foreground">Loading creators…</p>
        ) : (
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {creators.map((creator) => (
              <li key={creator.name}>
                <div className="flex h-full items-center gap-3 rounded-xl border bg-card p-4">
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-semibold text-white ${gradientFor(creator.name)}`}
                    aria-hidden="true"
                  >
                    {initials(creator.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{creator.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {creator.kind} · {creator.count}{" "}
                      {creator.count === 1 ? "work" : "works"}
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function PublishSteps({ onPublish }: { onPublish: () => void }) {
  return (
    <section
      id="publish"
      className="scroll-mt-20 border-t border-border/60"
      aria-labelledby="publish-heading"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h2 id="publish-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
              Publish in three steps
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">
              Listing a work costs nothing and takes minutes. The catalog lives on GitHub,
              so every change is versioned and public.
            </p>
          </div>
          <Button onClick={onPublish} size="lg" className="rounded-xl">
            Open the publisher
          </Button>
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

export function CallToAction({ onPublish }: { onPublish: () => void }) {
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
            Publishing is free forever. Zero percent take rate, no gatekeepers — your
            hosting, your audience, your work.
          </p>
          <div className="relative mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" onClick={onPublish}>
              Publish a work
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
