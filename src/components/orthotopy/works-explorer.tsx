"use client";

import { useMemo, useState } from "react";
import { SearchX, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ICONS, KINDS, type Work } from "@/lib/works";
import { cn } from "@/lib/utils";

interface WorksExplorerProps {
  works: Work[];
  isLoading: boolean;
  query: string;
  onQueryChange: (value: string) => void;
}

const KIND_FILTERS = ["All", ...KINDS] as const;

export function KindBadge({ kind }: { kind: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        kind === "Developer"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400"
      )}
    >
      {kind}
    </span>
  );
}

function WorkIcon({ iconKey }: { iconKey: string }) {
  const Icon = ICONS[iconKey] ?? Sparkles;
  return <Icon className="size-6" aria-hidden="true" />;
}

export function WorkCard({ work, onView }: { work: Work; onView: (work: Work) => void }) {
  return (
    <Card className="flex h-full flex-col transition-all hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5">
      <CardHeader className="flex-row items-start gap-3 space-y-0">
        <span
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm",
            work.gradient
          )}
        >
          <WorkIcon iconKey={work.icon} />
        </span>
        <div className="min-w-0">
          <CardTitle className="truncate text-base">{work.title}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">by {work.creator}</p>
          <div className="mt-1.5">
            <KindBadge kind={work.kind} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <p className="text-sm text-muted-foreground">{work.tagline}</p>
      </CardContent>
      <CardFooter className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">{work.category}</span>
        <Button
          size="sm"
          className="h-8 shrink-0 rounded-lg px-4"
          onClick={() => onView(work)}
        >
          View
        </Button>
      </CardFooter>
    </Card>
  );
}

export function LoadingGrid() {
  return (
    <ul className="grid grid-cols-1 gap-4 py-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, index) => (
        <li key={index}>
          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-center gap-3">
              <Skeleton className="size-12 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <Skeleton className="mt-5 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-4/5" />
            <Skeleton className="mt-5 h-8 w-20" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function WorksExplorer({ works, isLoading, query, onQueryChange }: WorksExplorerProps) {
  const { toast } = useToast();
  const [kind, setKind] = useState<string>("All");
  const [category, setCategory] = useState<string>("All");

  const categories = useMemo(
    () => Array.from(new Set(works.map((work) => work.category))).sort(),
    [works]
  );

  const normalized = query.trim().toLowerCase();
  const filtered = works.filter((work) => {
    const matchesKind = kind === "All" || work.kind === kind;
    const matchesCategory = category === "All" || work.category === category;
    const matchesQuery =
      normalized.length === 0 ||
      `${work.title} ${work.tagline} ${work.category} ${work.creator}`
        .toLowerCase()
        .includes(normalized);
    return matchesKind && matchesCategory && matchesQuery;
  });

  const handleView = (work: Work) => {
    toast({
      title: "Demo work",
      description: `Public pages for “${work.title}” are coming soon — this catalog is a preview for now.`,
    });
  };

  return (
    <section id="works" className="scroll-mt-20" aria-labelledby="works-heading">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="works-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
              Fresh from the catalog
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Sample listings and works published on this instance.
            </p>
          </div>
          <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
            {isLoading ? "Loading catalog…" : `${filtered.length} of ${works.length} works`}
            {normalized.length > 0 ? ` for \u201c${query.trim()}\u201d` : ""}
          </p>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by publisher kind">
          {KIND_FILTERS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                kind === k
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {k === "All" ? "All kinds" : k}
            </button>
          ))}
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
          <button
            type="button"
            onClick={() => setCategory("All")}
            aria-pressed={category === "All"}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              category === "All"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            All categories
          </button>
          {categories.map((c) => (
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

        {isLoading ? (
          <LoadingGrid />
        ) : filtered.length === 0 ? (
          <div className="mt-10 flex flex-col items-center rounded-2xl border border-dashed py-16 text-center">
            <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 font-medium">No works match your search</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different keyword or clear the filters.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                onQueryChange("");
                setKind("All");
                setCategory("All");
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 py-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((work) => (
              <li key={work.id}>
                <WorkCard work={work} onView={handleView} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
