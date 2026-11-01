"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, GitCommitHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeroProps {
  /** Distinct developers with at least one work in the catalog. */
  activeDevelopers: number;
  /** Distinct creators with at least one work in the catalog. */
  activeCreators: number;
  /** False while the catalog is still loading. */
  statsReady: boolean;
  onPublish: () => void;
}

const REPO_API = "https://api.github.com/repos/reorthotope/Orthotopy/commits";

export function Hero({ activeDevelopers, activeCreators, statsReady, onPublish }: HeroProps) {
  const [dailyCommits, setDailyCommits] = useState<number | null>(null);

  // Daily commits are counted live from the public GitHub API and fall back
  // to an em dash whenever the request fails or is rate limited.
  useEffect(() => {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const controller = new AbortController();
    fetch(`${REPO_API}?since=${since.toISOString()}`, {
      signal: controller.signal,
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error(String(response.status)))
      )
      .then((list) => setDailyCommits(Array.isArray(list) ? list.length : 0))
      .catch(() => setDailyCommits(null));
    return () => controller.abort();
  }, []);

  const stats = [
    { value: statsReady ? `${activeDevelopers}` : "—", label: "active developers" },
    { value: statsReady ? `${activeCreators}` : "—", label: "active creators" },
    { value: dailyCommits === null ? "—" : `${dailyCommits}`, label: "daily commits" },
  ];

  return (
    <section className="relative overflow-hidden" aria-labelledby="hero-heading">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 mx-auto size-[480px] rounded-full bg-emerald-500/15 blur-3xl"
      />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-4 pb-16 pt-20 text-center sm:px-6 sm:pt-28">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Free forever — no fees, no gatekeepers
          </span>
          <h1
            id="hero-heading"
            className="mt-6 max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl"
          >
            Every work in its{" "}
            <span className="text-emerald-600 dark:text-emerald-400">right place</span>
          </h1>
          <p className="mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
            Orthotopy is a free, open publishing home for developers and creators. Ship
            apps, tools, games, music, design and words — hosted by you, listed here,
            with zero platform tax.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="h-11 rounded-xl">
              <a href="#browse">
                Browse works
                <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-11 rounded-xl"
              onClick={onPublish}
            >
              Publish yours
            </Button>
          </div>
          <div className="mt-12 grid w-full max-w-xl grid-cols-3 divide-x divide-border rounded-2xl border bg-card/60 text-center">
            {stats.map((stat) => (
              <div key={stat.label} className="px-2 py-4">
                <p className="flex items-center justify-center gap-1.5 text-xl font-semibold sm:text-2xl">
                  {stat.label === "daily commits" ? (
                    <GitCommitHorizontal
                      className="size-4 text-muted-foreground sm:size-5"
                      aria-hidden="true"
                    />
                  ) : null}
                  {stat.value}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{stat.label}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
