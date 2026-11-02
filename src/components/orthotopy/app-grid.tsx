"use client";

import { useState } from "react";
import { Download, SearchX, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { APPS, CATEGORIES, type StoreApp } from "@/lib/apps";
import { cn } from "@/lib/utils";

interface AppGridProps {
  query: string;
  onQueryChange: (value: string) => void;
}

export function AppGrid({ query, onQueryChange }: AppGridProps) {
  const { toast } = useToast();
  const [category, setCategory] = useState<string>("All");

  const normalized = query.trim().toLowerCase();
  const filtered = APPS.filter((app) => {
    const matchesCategory = category === "All" || app.category === category;
    const matchesQuery =
      normalized.length === 0 ||
      `${app.name} ${app.tagline} ${app.category}`.toLowerCase().includes(normalized);
    return matchesCategory && matchesQuery;
  });

  const handleGet = (app: StoreApp) => {
    toast({
      title: "Demo download",
      description: `${app.name} is a sample listing — Orthotopy can't serve real packages yet.`,
    });
  };

  return (
    <section id="apps" className="scroll-mt-20" aria-labelledby="apps-heading">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="apps-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
              Trending this week
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Sample listings that show how the storefront works.
            </p>
          </div>
          <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
            {filtered.length} of {APPS.length} apps
            {normalized.length > 0 ? ` for \u201c${query.trim()}\u201d` : ""}
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                category === c
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {c}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="mt-10 flex flex-col items-center rounded-2xl border border-dashed py-16 text-center">
            <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 font-medium">No apps match your search</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different keyword or clear the filters.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                onQueryChange("");
                setCategory("All");
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 py-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((app) => {
              const Icon = app.icon;
              return (
                <li key={app.id}>
                  <Card className="flex h-full flex-col transition-all hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5">
                    <CardHeader className="flex-row items-center gap-3 space-y-0">
                      <span
                        className={cn(
                          "flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm",
                          app.gradient
                        )}
                      >
                        <Icon className="size-6" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">{app.name}</CardTitle>
                        <CardDescription className="mt-0.5 text-xs">
                          {app.category}
                        </CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <p className="text-sm text-muted-foreground">{app.tagline}</p>
                    </CardContent>
                    <CardFooter className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 font-medium text-foreground">
                          <Star
                            className="size-3.5 fill-amber-400 text-amber-400"
                            aria-hidden="true"
                          />
                          {app.rating.toFixed(1)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Download className="size-3.5" aria-hidden="true" />
                          {app.downloads}
                        </span>
                        <span>{app.size}</span>
                      </div>
                      <Button
                        size="sm"
                        className="h-8 shrink-0 rounded-lg px-4"
                        onClick={() => handleGet(app)}
                      >
                        Get
                      </Button>
                    </CardFooter>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
