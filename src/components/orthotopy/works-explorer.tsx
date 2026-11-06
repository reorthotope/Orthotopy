"use client";

import { useEffect, useState } from "react";
import { Download, ExternalLink, Flag, Github, PackageOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportWorkDialog } from "@/components/orthotopy/report-dialog";
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

/**
 * Fire-and-forget stats beacon. The server (/api/track) dedupes per
 * work+type+IP per hour, so refreshes don't inflate the dashboard graphs.
 */
export function trackWork(workId: string, type: "view" | "download") {
  try {
    void fetch("/api/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workId, type }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // stats are never worth breaking a click over
  }
}

/** The Download button hands the visitor straight to the download URL —
 * typically a GitHub Releases asset, so the browser starts downloading the
 * moment the tab opens. The site looks like it serves the file; GitHub
 * Releases actually does the hosting. */
export function DownloadButton({ work, size = "sm" }: { work: Work; size?: "sm" | "default" }) {
  if (!work.downloadUrl) return null;
  return (
    <Button
      size={size}
      className={cn("shrink-0 rounded-lg", size === "sm" ? "h-8 px-4" : "")}
      onClick={() => {
        trackWork(work.id, "download");
        window.open(work.downloadUrl, "_blank", "noopener,noreferrer");
      }}
    >
      <Download className="size-4" aria-hidden="true" />
      Download
    </Button>
  );
}

export function WorkCard({ work, onView }: { work: Work; onView: (work: Work) => void }) {
  const cover = work.imageUrls?.[0];
  return (
    <Card className="flex h-full flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5">
      {cover ? (
        <div className="aspect-video w-full overflow-hidden border-b bg-muted/40">
          <img
            src={cover}
            alt={`Screenshot of ${work.title}`}
            loading="lazy"
            className="size-full object-cover"
          />
        </div>
      ) : null}
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
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <KindBadge kind={work.kind} />
            {work.type ? (
              <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium">
                {work.type}
              </span>
            ) : null}
            {work.platform ? (
              <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {work.platform}
              </span>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <p className="text-sm text-muted-foreground">{work.tagline}</p>
      </CardContent>
      <CardFooter className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">{work.category}</span>
        <div className="flex shrink-0 items-center gap-2">
          {work.downloadUrl ? <DownloadButton work={work} /> : null}
          <Button
            size="sm"
            variant={work.downloadUrl ? "outline" : "default"}
            className="h-8 shrink-0 rounded-lg px-4"
            onClick={() => onView(work)}
          >
            View
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

/**
 * The work's public detail view. Screenshots come straight from the work's
 * GitHub repo (they were detected at publish time and are hotlinked from
 * raw.githubusercontent.com), the description and links round out the page.
 * Opening it counts as the work's view. The footer carries a Report button
 * that opens the public report intake — every work on the site is
 * reportable and reports land in the /apex review queue.
 */
export function WorkDialog({
  work,
  open,
  onOpenChange,
}: {
  work: Work | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    if (open && work) trackWork(work.id, "view");
  }, [open, work]);

  // Closing the parent detail view also tears down the report dialog.
  useEffect(() => {
    if (!open) setReportOpen(false);
  }, [open]);

  if (!work) return null;
  const images = work.imageUrls ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-left">{work.title}</DialogTitle>
          <DialogDescription className="text-left">
            {work.type ? `${work.type}` : work.category}
            {work.platform ? ` · ${work.platform}` : ""} · by {work.creator}
          </DialogDescription>
        </DialogHeader>

        {images.length > 0 ? (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border bg-muted/40">
              <img
                src={images[0]}
                alt={`Screenshot of ${work.title}`}
                className="aspect-video w-full object-cover"
              />
            </div>
            {images.length > 1 ? (
              <div className="grid grid-cols-5 gap-2">
                {images.slice(1, 10).map((src, index) => (
                  <div key={src} className="overflow-hidden rounded-lg border bg-muted/40">
                    <img
                      src={src}
                      alt={`${work.title} screenshot ${index + 2}`}
                      loading="lazy"
                      className="aspect-video w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-3">
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
            {work.description || work.tagline}
          </p>
          {work.repoUrl ? (
            <a
              href={work.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-emerald-600 hover:underline dark:text-emerald-400"
            >
              <Github className="size-4" aria-hidden="true" />
              Source repository
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <span className="text-xs text-muted-foreground">
            {work.downloadUrl
              ? "Download opens the release file — it starts downloading straight away."
              : "No download link was provided for this work yet."}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setReportOpen(true)}
            >
              <Flag className="size-4" aria-hidden="true" />
              Report
            </Button>
            {work.downloadUrl ? <DownloadButton work={work} size="default" /> : null}
          </div>
        </div>

        <ReportWorkDialog work={work} open={reportOpen} onOpenChange={setReportOpen} />
      </DialogContent>
    </Dialog>
  );
}

/** Empty-state card used when the whole catalog has no works at all. */
export function CatalogEmpty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed py-16 text-center">
      <PackageOpen className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="mt-3 font-medium">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{hint}</p>
    </div>
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
