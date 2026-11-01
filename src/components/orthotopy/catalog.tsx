"use client";

import { useMemo, useState } from "react";
import { PackageOpen, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePublish } from "@/components/orthotopy/site-shell";
import { LoadingGrid, WorkCard } from "@/components/orthotopy/works-explorer";
import { useWorks } from "@/hooks/use-works";
import type { Work } from "@/lib/works";

interface CategoryCatalogProps {
  title: string;
  description: string;
  /** Categories to include; empty list means every category. */
  include?: string[];
  /** Categories to exclude (used when a page shows "everything else"). */
  exclude?: string[];
  emptyTitle: string;
  emptyHint: string;
}

export function CategoryCatalog({
  title,
  description,
  include = [],
  exclude = [],
  emptyTitle,
  emptyHint,
}: CategoryCatalogProps) {
  const { data, isLoading } = useWorks();
  const [query, setQuery] = useState("");
  const openPublish = usePublish();
  const { toast } = useToast();

  const scoped = useMemo(() => {
    const all = data ?? [];
    return all.filter((work) => {
      const inInclude = include.length === 0 || include.includes(work.category);
      const notExcluded = exclude.length === 0 || !exclude.includes(work.category);
      return inInclude && notExcluded;
    });
  }, [data, include, exclude]);

  const normalized = query.trim().toLowerCase();
  const filtered = scoped.filter((work) => {
    if (normalized.length === 0) return true;
    return `${work.title} ${work.tagline} ${work.category} ${work.creator}`
      .toLowerCase()
      .includes(normalized);
  });

  const onView = (work: Work) => {
    toast({
      title: "Demo work",
      description: `Public pages for “${work.title}” are coming soon — this catalog is a preview for now.`,
    });
  };

  const isEmptyCatalog = !isLoading && scoped.length === 0;

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16" aria-labelledby="catalog-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h1 id="catalog-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">
            {title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">{description}</p>
        </div>
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {isLoading ? "Loading catalog…" : `${filtered.length} ${filtered.length === 1 ? "work" : "works"}`}
        </p>
      </div>

      {scoped.length > 0 ? (
        <form
          className="mt-6 flex w-full max-w-md items-center gap-2"
          role="search"
          aria-label={`Search ${title}`}
          onSubmit={(event) => event.preventDefault()}
        >
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search in this section…"
            aria-label={`Search ${title}`}
            className="h-10 w-full rounded-xl border bg-card px-4 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </form>
      ) : null}

      {isLoading ? (
        <LoadingGrid />
      ) : filtered.length === 0 && !isEmptyCatalog ? (
        <div className="mt-10 flex flex-col items-center rounded-2xl border border-dashed py-16 text-center">
          <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 font-medium">Nothing matches that search</p>
          <p className="mt-1 text-sm text-muted-foreground">Try a different keyword.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setQuery("")}>
            Clear search
          </Button>
        </div>
      ) : isEmptyCatalog ? (
        <div className="mt-10 flex flex-col items-center rounded-2xl border border-dashed py-16 text-center">
          <PackageOpen className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 font-medium">{emptyTitle}</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">{emptyHint}</p>
          <Button size="sm" className="mt-5" onClick={openPublish}>
            Publish the first one
          </Button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 py-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((work) => (
            <li key={work.id}>
              <WorkCard work={work} onView={onView} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
