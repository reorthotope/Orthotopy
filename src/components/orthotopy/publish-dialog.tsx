"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Circle,
  CheckCircle2,
  Clock3,
  Github,
  ImagePlus,
  Loader2,
  Send,
} from "lucide-react";
import {
  IMAGE_NAMING_HINT,
  TYPE_PLATFORMS,
  WORK_TYPES,
  parseGithubRepoUrl,
  type WorkType,
} from "@/lib/works";
import { fetchProfile, readAuth, readCachedProfile, type DevProfile } from "./dev-profile";

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Publishing gate: there is no signup — the account IS a GitHub
 * authorization. The dialog resolves the current state every time it opens:
 * no session → join prompt; session whose profile isn't confirmed yet →
 * checklist; unlocked → the publish form. Once unlocked, the state is also
 * cached in localStorage so an offline hiccup never re-locks the form.
 */
type Gate = "checking" | "no-account" | "locked" | "ready";

/**
 * Result of POST /api/works-scan — the live repo preview shown as soon as
 * the developer types their repo link.
 */
interface ScanResult {
  owner: string;
  repo: string;
  repoUrl: string;
  description: string;
  images: string[];
  imageUrls: string[];
  suggestedDownloadUrl: string;
}

interface SubmittedWork {
  id: string;
  title: string;
  status: string;
}

type ScanState = "idle" | "scanning" | "ok" | "error";

export function PublishDialog({ open, onOpenChange }: PublishDialogProps) {
  const [gate, setGate] = useState<Gate>("checking");
  const [profile, setProfile] = useState<DevProfile | null>(null);
  const [needsSignin, setNeedsSignin] = useState(false);

  // Form fields
  const [title, setTitle] = useState("");
  const [workType, setWorkType] = useState<WorkType>("Apps");
  const [platform, setPlatform] = useState<string>(TYPE_PLATFORMS.Apps[0]);
  const [description, setDescription] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");

  // Repo scan (live preview of public status + repo-hosted screenshots)
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const scanNonceRef = useRef(0);

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<SubmittedWork | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Deferred to a microtask: the gate is reset on every close (event
    // handler), and the resolve below runs one tick after the dialog opens
    // instead of setting state synchronously inside the effect body.
    queueMicrotask(async () => {
      const auth = readAuth();
      if (cancelled) return;
      if (!auth?.token) {
        setGate("no-account");
        return;
      }
      const cached = readCachedProfile();
      if (cached?.publishAccess) {
        // Already unlocked on this device — don't block on a round-trip.
        setProfile(cached);
        setGate("ready");
      }
      const result = await fetchProfile(auth.token);
      if (cancelled) return;
      if (result.status === "ok" && result.profile) {
        setProfile(result.profile);
        setGate(result.profile.publishAccess ? "ready" : "locked");
        return;
      }
      // The request failed (or the session just expired) — fall back to the
      // cached gate state so a network hiccup doesn't re-lock the form.
      if (cancelled) return;
      if (cached) {
        setProfile(cached);
        setNeedsSignin(!cached.publishAccess);
        setGate(cached.publishAccess ? "ready" : "locked");
      } else {
        setProfile(null);
        setNeedsSignin(true);
        setGate("locked");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  /**
   * Live repo preview: as soon as the repo link parses, the form asks the
   * server to look the repo up — public check and the img.png / img1.png …
   * screenshots it hosts. Debounced (immediate when the link turned invalid,
   * to clear the preview); only the newest answer wins. Every state change
   * happens inside the timer callback, never synchronously in the effect.
   */
  useEffect(() => {
    if (!open || gate !== "ready") return;
    const link = repoUrl.trim();
    const parsed = link ? parseGithubRepoUrl(link) : null;
    const nonce = ++scanNonceRef.current;
    const timer = setTimeout(async () => {
      if (nonce !== scanNonceRef.current) return;
      if (!parsed) {
        setScanState("idle");
        setScan(null);
        setScanError(null);
        return;
      }
      setScanState("scanning");
      setScanError(null);
      const auth = readAuth();
      try {
        const res = await fetch("/api/works-scan", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(auth?.token ? { authorization: `Bearer ${auth.token}` } : {}),
          },
          body: JSON.stringify({ repoUrl: link }),
        });
        if (nonce !== scanNonceRef.current) return; // a newer scan started
        const data = (await res.json().catch(() => null)) as
          | (ScanResult & { ok?: boolean; error?: string })
          | null;
        if (res.ok && data?.ok) {
          setScan({
            owner: data.owner,
            repo: data.repo,
            repoUrl: data.repoUrl,
            description: data.description,
            images: data.images ?? [],
            imageUrls: data.imageUrls ?? [],
            suggestedDownloadUrl: data.suggestedDownloadUrl ?? "",
          });
          setScanState("ok");
          // Suggest the GitHub Releases asset as the download link, but only
          // into an empty field — never over what the developer typed.
          setDownloadUrl((current) =>
            current.trim() ? current : data.suggestedDownloadUrl || ""
          );
          return;
        }
        setScan(null);
        setScanState("error");
        setScanError(data?.error || "We couldn't check that repo — please try again in a moment.");
      } catch {
        if (nonce !== scanNonceRef.current) return;
        setScan(null);
        setScanState("error");
        setScanError("Network error while checking the repo — please try again.");
      }
    }, parsed ? 600 : 0);
    return () => clearTimeout(timer);
  }, [repoUrl, open, gate]);

  const parsedRepo = parseGithubRepoUrl(repoUrl);
  const titleOk = title.trim().length >= 2 && title.trim().length <= 80;
  const descriptionOk = description.trim().length >= 10 && description.trim().length <= 2000;
  const repoOk = Boolean(parsedRepo) && scanState === "ok";
  const downloadOk = downloadUrl.trim().length > 8 && /^https?:\/\/\S+$/i.test(downloadUrl.trim());
  const valid = titleOk && descriptionOk && repoOk && downloadOk && platform.length > 0;

  const submit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const auth = readAuth();
    try {
      const res = await fetch("/api/works", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(auth?.token ? { authorization: `Bearer ${auth.token}` } : {}),
        },
        body: JSON.stringify({
          title: title.trim(),
          type: workType,
          platform,
          description: description.trim(),
          repoUrl: repoUrl.trim(),
          downloadUrl: downloadUrl.trim(),
        }),
      });
      if (res.status === 401) {
        setSubmitError("Your session has expired — close this and sign in with GitHub once more.");
        setSubmitting(false);
        return;
      }
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; work?: SubmittedWork; error?: string }
        | null;
      if (res.ok && data?.ok && data.work) {
        setSubmitted(data.work);
        try {
          window.dispatchEvent(new Event("orthotopy:works"));
        } catch {
          // ignore
        }
      } else {
        setSubmitError(data?.error || "We couldn't record that — please try again in a moment.");
      }
    } catch {
      setSubmitError("Network error — we couldn't reach the server. Check your connection and try again.");
    }
    setSubmitting(false);
  };

  const closeAndReset = () => {
    onOpenChange(false);
    setGate("checking");
    setProfile(null);
    setNeedsSignin(false);
    setTitle("");
    setWorkType("Apps");
    setPlatform(TYPE_PLATFORMS.Apps[0]);
    setDescription("");
    setRepoUrl("");
    setDownloadUrl("");
    setScan(null);
    setScanState("idle");
    setScanError(null);
    setSubmitting(false);
    setSubmitted(null);
    setSubmitError(null);
  };

  const gateRow = (done: boolean, label: string, hint: string) => (
    <li className="flex items-start gap-3">
      {done ? (
        <CheckCircle2
          className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
          aria-hidden="true"
        />
      ) : (
        <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <span className="text-sm">
        <span className={done ? "font-medium text-foreground" : "text-foreground"}>
          {label}
        </span>{" "}
        <span className="text-muted-foreground">
          {done ? "— done" : `— ${hint}`}
        </span>
      </span>
    </li>
  );

  const scanStatusLine = () => {
    if (scanState === "idle") {
      return (
        <p className="text-xs text-muted-foreground">
          Paste your public repo link — github.com/yourname/your-work.
        </p>
      );
    }
    if (scanState === "scanning") {
      return (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Checking the repo on GitHub…
        </p>
      );
    }
    if (scanState === "error") {
      return (
        <p className="text-xs text-destructive" role="alert">
          {scanError}
        </p>
      );
    }
    return (
      <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
        Public repo found: {scan?.owner}/{scan?.repo}
      </p>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(next) : closeAndReset())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {gate === "checking" ? (
          <div className="flex justify-center py-10" aria-label="Checking your account">
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        ) : gate === "no-account" ? (
          <>
            <DialogHeader>
              <DialogTitle>Join with GitHub first</DialogTitle>
              <DialogDescription>
                There is no signup form — a GitHub authorization IS the
                account. One tap verifies your developer identity, opens your
                dashboard and unlocks publishing.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button asChild className="w-full">
                <Link href="/dev" onClick={closeAndReset}>
                  <Github className="size-4" aria-hidden="true" />
                  Join with GitHub
                </Link>
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Only your username, display name and email are read — read-only,
                nothing posted. No password is ever created or stored.
              </p>
            </DialogFooter>
          </>
        ) : gate === "locked" ? (
          <>
            <DialogHeader>
              <DialogTitle>One quick step before your first publish</DialogTitle>
              <DialogDescription>
                Before your first work, sign in with GitHub — it verifies your
                developer identity and keeps the catalog real. You only do
                this once.
              </DialogDescription>
            </DialogHeader>
            <ul className="space-y-2.5 rounded-xl border bg-card p-4">
              {gateRow(
                Boolean(profile?.githubConnected),
                "Sign in with GitHub",
                "do this from your dashboard"
              )}
            </ul>
            {needsSignin ? (
              <p className="text-xs text-muted-foreground">
                Your session is out of date — one tap on the dashboard button
                signs you back in.
              </p>
            ) : null}
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button asChild className="w-full">
                <Link href="/dashboard" onClick={closeAndReset}>
                  Finish setup on your dashboard
                </Link>
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                The check turns green the moment the server confirms it.
              </p>
            </DialogFooter>
          </>
        ) : submitted ? (
          <>
            <div className="flex justify-center pt-2">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-6" aria-hidden="true" />
              </span>
            </div>
            <DialogHeader className="items-center text-center">
              <DialogTitle>Sent for review</DialogTitle>
              <DialogDescription className="text-center">
                &ldquo;{submitted.title}&rdquo; is in the review queue. It goes
                live in the catalog within 24–48 hours — you&apos;ll already
                find it on your dashboard marked{" "}
                <span className="whitespace-nowrap font-medium text-amber-600 dark:text-amber-400">
                  Pending review
                </span>
                .
              </DialogDescription>
            </DialogHeader>
            <p className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock3 className="size-3.5" aria-hidden="true" />
              Reviews happen daily — nothing else is needed from you.
            </p>
            <DialogFooter>
              <Button className="w-full" onClick={closeAndReset}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Publish a work</DialogTitle>
              <DialogDescription>
                Enter the listing directly — it lands in the review queue and
                goes live within 24–48 hours. No uploads: screenshots come
                from your repo.
              </DialogDescription>
            </DialogHeader>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <div className="grid gap-2">
                <Label htmlFor="work-title">Title</Label>
                <Input
                  id="work-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. Hexably"
                  maxLength={80}
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="work-type">Type</Label>
                  <Select
                    value={workType}
                    onValueChange={(next) => {
                      const type = next as WorkType;
                      setWorkType(type);
                      setPlatform(TYPE_PLATFORMS[type][0]);
                    }}
                  >
                    <SelectTrigger id="work-type" aria-label="Work type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WORK_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="work-platform">Platform</Label>
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger id="work-platform" aria-label="Platform">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPE_PLATFORMS[workType].map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="work-description">Description</Label>
                <Textarea
                  id="work-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What is it, what does it do, why should people try it?"
                  rows={4}
                  maxLength={2000}
                  required
                />
                <p className="text-right text-[11px] text-muted-foreground">
                  {description.trim().length}/2000
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="work-repo">GitHub repo link</Label>
                <Input
                  id="work-repo"
                  value={repoUrl}
                  onChange={(event) => setRepoUrl(event.target.value)}
                  placeholder="https://github.com/you/your-work"
                  maxLength={300}
                  required
                />
                {scanStatusLine()}
              </div>

              <div className="grid gap-2 rounded-xl border bg-card p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  <ImagePlus className="size-3.5" aria-hidden="true" />
                  Screenshots from the repo {scan?.images?.length ? `(${scan.images.length}/10)` : ""}
                </p>
                {scanState === "ok" && scan && scan.images.length > 0 ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {scan.imageUrls.slice(0, 10).map((src, index) => (
                        <img
                          key={src}
                          src={src}
                          alt={`${scan.repo} screenshot ${index + 1}`}
                          loading="lazy"
                          className="h-14 w-24 rounded-md border object-cover"
                        />
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      These are shown on the work&apos;s page, straight from
                      your repo — nothing is uploaded here.
                    </p>
                  </>
                ) : (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Optional. To show screenshots, add images to the repo root
                    named exactly {IMAGE_NAMING_HINT} — they&apos;re fetched
                    from the repo automatically once the link is checked. Ten
                    images max.
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="work-download">Download link</Label>
                <Input
                  id="work-download"
                  value={downloadUrl}
                  onChange={(event) => setDownloadUrl(event.target.value)}
                  placeholder="https://github.com/you/your-work/releases/download/v1.0.0/app.apk"
                  maxLength={600}
                  required
                />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  A direct download URL — a GitHub Releases asset (browsers
                  auto-download it) or your own direct file link. The site&apos;s
                  Download button opens this link.
                  {scan?.suggestedDownloadUrl ? " Your repo's latest release was suggested above." : ""}
                </p>
              </div>

              {submitError ? (
                <p className="text-xs text-destructive" role="alert">
                  {submitError}
                </p>
              ) : null}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeAndReset}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!valid || submitting}>
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="size-4" aria-hidden="true" />
                  )}
                  {submitting ? "Sending…" : "Submit for review"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
