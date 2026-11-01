"use client";

import { useQuery } from "@tanstack/react-query";
import type { Work } from "@/lib/works";

/**
 * Loads the open catalog. The single source of truth is the static JSON file
 * served from /catalog/works.json, so every route shares one cached query.
 */
export function useWorks() {
  return useQuery({
    queryKey: ["works"],
    queryFn: async (): Promise<Work[]> => {
      const res = await fetch("/catalog/works.json");
      if (!res.ok) throw new Error("Failed to load works");
      const json = (await res.json()) as { works: Work[] };
      return json.works;
    },
  });
}
