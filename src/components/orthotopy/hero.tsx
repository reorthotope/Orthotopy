"use client";

import { motion } from "framer-motion";
import { ArrowRight, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface HeroProps {
  query: string;
  onQueryChange: (value: string) => void;
  workCount: number;
  creatorCount: number;
  onPublish: () => void;
}

export function Hero({ query, onQueryChange, workCount, creatorCount, onPublish }: HeroProps) {
  const stats = [
    { value: workCount > 0 ? `${workCount}` : "—", label: "works" },
    { value: creatorCount > 0 ? `${creatorCount}` : "—", label: "creators" },
    { value: "$0", label: "forever" },
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
          <form
            className="mt-8 flex w-full max-w-xl items-center gap-2"
            role="search"
            aria-label="Search the Orthotopy catalog"
            onSubmit={(event) => {
              event.preventDefault();
              document.getElementById("works")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Search works, categories, creators…"
                className="h-11 rounded-xl bg-card pl-9 text-base"
                aria-label="Search works"
              />
            </div>
            <Button type="submit" size="lg" className="h-11 rounded-xl">
              Search
            </Button>
          </form>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="h-11 rounded-xl">
              <a href="#works">
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
                <p className="text-xl font-semibold sm:text-2xl">{stat.value}</p>
                <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{stat.label}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
