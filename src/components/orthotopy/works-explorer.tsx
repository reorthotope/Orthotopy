"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ICONS, type Work } from "@/lib/works";
import { cn } from "@/lib/utils";

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
