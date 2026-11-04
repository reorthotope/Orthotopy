"use client";

import { useQuery } from "@tanstack/react-query";
import type { Work } from "@/lib/works";

/**
 * Loads the catalog from two sources:
 *  - the static JSON file /catalog/works.json (seeded entries, reviewable
 *    in git), and
 *  - the live feed GET /api/works — works developers published through the
 *    dashboard and the review approved. Those carry their repo link,
 *    download link and repo-hosted screenshots.
 *
 * The two are merged and deduped by id (live wins — it is newer), newest
 * first. If the live feed is unreachable the seeded catalog still renders.
 */
export function useWorks() {
  return useQuery({
    queryKey: ["works"],
    queryFn: async (): Promise<Work[]> => {
      const staticRes = await fetch("/catalog/works.json");
      if (!staticRes.ok) throw new Error("Failed to load works");
      const staticJson = (await staticRes.json()) as { works: Work[] };
      const seeded = Array.isArray(staticJson.works) ? staticJson.works : [];

      let live: Work[] = [];
      try {
        const res = await fetch("/api/works");
        if (res.ok) {
          const json = (await res.json()) as { works?: Work[] };
          if (Array.isArray(json.works)) live = json.works;
        }
      } catch {
        // Function hiccup or offline — the seeded catalog still stands.
      }

      const byId = new Map<string, Work>();
      for (const work of [...seeded, ...live]) {
        if (work?.id) byId.set(work.id, work);
      }
      return [...byId.values()].sort((a, b) => toTime(b) - toTime(a));
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
