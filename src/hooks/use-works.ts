"use client";

import { useQuery } from "@tanstack/react-query";
import type { Work } from "@/lib/works";

/**
 * Loads the catalog from the live feed GET /api/works — only works that
 * developers published through the dashboard and a review approved. There is
 * no seeded or sample data anywhere: an empty platform shows an honest empty
 * state, and every listing that appears here is fresh, real data.
 *
 * Works carry their repo link, download link and repo-hosted screenshots.
 * React Query refetches on window focus, so the storefront tracks the live
 * catalog as viewers browse (server cache-control allows at most a 60s edge
 * cache).
 */
export function useWorks() {
  return useQuery({
    queryKey: ["works"],
    queryFn: async (): Promise<Work[]> => {
      const res = await fetch("/api/works");
      if (!res.ok) throw new Error("Failed to load works");
      const json = (await res.json()) as { works?: Work[] };
      const live = Array.isArray(json.works) ? json.works : [];
      return [...live].sort((a, b) => toTime(b) - toTime(a));
    },
    staleTime: 60_000,
  });
}

function toTime(work: Work): number {
  const created = work.createdAt as unknown;
  if (typeof created === "number") return created;
  if (typeof created === "string") {
    const parsed = Date.parse(created);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}
