"use client";

import { useEffect, useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { CATEGORIES, CATEGORY_ICONS, KINDS, gradientFor } from "@/lib/works";
import { CheckCircle2, Circle, Github, Loader2 } from "lucide-react";
import { fetchProfile, readCachedProfile, REPO_URL, type DevProfile } from "./dev-profile";

const CATALOG_URL =
  "https://github.com/reorthotope/Orthotopy/blob/main/public/catalog/works.json";
const NEW_ISSUE_URL = "https://github.com/reorthotope/Orthotopy/issues/new";

const AUTH_KEY = "orthotopy_dev_auth";

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Publishing gate: creating an account is required, and before the FIRST
 * work the account must have connected GitHub and starred the repository
 * (verified server-side). The dialog resolves the current state every time
 * it opens: no account → join prompt; account without setup → checklist;
 * unlocked → the publish form. Once unlocked, the state is also cached in
 * localStorage so an offline hiccup never re-locks the form.
 */
type Gate = "checking" | "no-account" | "locked" | "ready";

export function PublishDialog({ open, onOpenChange }: PublishDialogProps) {
  const { toast } = useToast();

  const [gate, setGate] = useState<Gate>("checking");
  const [profile, setProfile] = useState<DevProfile | null>(null);
  const [needsSignin, setNeedsSignin] = useState(false);

  const [title, setTitle] = useState("");
  const [creator, setCreator] = useState("");
  const [tagline, setTagline] = useState("");
  const [kind, setKind] = useState<string>("Developer");
  const [category, setCategory] = useState<string>("Apps");

  const valid =
    title.trim().length >= 2 && creator.trim().length >= 2 && tagline.trim().length >= 4;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setGate("checking");
    setProfile(null);
    setNeedsSignin(false);

    const resolve = async () => {
      let auth: { token?: string } | null = null;
      try {
        const raw = localStorage.getItem(AUTH_KEY);
        auth = raw ? (JSON.parse(raw) as { token?: string }) : null;
      } catch {
        auth = null;
      }
      if (!auth) {
        if (!cancelled) setGate("no-account");
        return;
      }
      const cached = readCachedProfile();
      if (cached?.publishAccess) {
        // Already unlocked on this device — don't block on a round-trip.
        setProfile(cached);
        setGate("ready");
      }
      if (auth.token) {
        const result = await fetchProfile(auth.token);
        if (cancelled) return;
        if (result.status === "ok" && result.profile) {
          setProfile(result.profile);
          setGate(result.profile.publishAccess ? "ready" : "locked");
          return;
        }
      }
      // No token (older signup) or the request failed — fall back to cache.
      if (cancelled) return;
      if (cached) {
        setProfile(cached);
        setNeedsSignin(!auth.token && !cached.publishAccess);
        setGate(cached.publishAccess ? "ready" : "locked");
      } else {
        setProfile(null);
        setNeedsSignin(!auth.token);
        setGate("locked");
      }
    };
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [open]);

  /**
   * The catalog is a static JSON file in the repository, so "publishing"
   * opens a prefilled GitHub issue with the ready-to-merge JSON entry.
   * Merging it (and redeploing) lists the work on the live site.
   */
  const publish = () => {
    const entry = {
      title: title.trim(),
      tagline: tagline.trim(),
      kind,
      category,
      creator: creator.trim(),
      icon: CATEGORY_ICONS[category] ?? "sparkles",
      gradient: gradientFor(title.trim()),
    };
    const body = [
      "Please add this work to the Orthotopy catalog.",
      "",
      "Append the JSON object below to the `works` array in " +
        "`public/catalog/works.json`, then merge and redeploy:",
      "",
      "```json",
      JSON.stringify(entry, null, 2),
      "```",
      "",
      `Catalog file: ${CATALOG_URL}`,
    ].join("\n");
    const url = `${NEW_ISSUE_URL}?title=${encodeURIComponent(
      `[Publish] ${entry.title}`
    )}&body=${encodeURIComponent(body)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    onOpenChange(false);
    setTitle("");
    setCreator("");
    setTagline("");
    toast({
      title: "Opening GitHub",
      description:
        "Submit the prefilled issue (or turn it into a pull request) — once merged into the catalog, the work goes live.",
    });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {gate === "checking" ? (
          <div className="flex justify-center py-10" aria-label="Checking your account">
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        ) : gate === "no-account" ? (
          <>
            <DialogHeader>
              <DialogTitle>Create your developer account first</DialogTitle>
              <DialogDescription>
                Publishing on Orthotopy starts with a free account: verify your
                email, connect your GitHub profile, star the repository — then
                publish as many works as you like.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button asChild className="w-full">
                <Link href="/dev" onClick={() => onOpenChange(false)}>
                  <Github className="size-4" aria-hidden="true" />
                  Join the Dev Team
                </Link>
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Already joined? On that page, tap{" "}
                <strong className="text-foreground">“Already joined? Sign in”</strong>{" "}
                under the Continue button.
              </p>
            </DialogFooter>
          </>
        ) : gate === "locked" ? (
          <>
            <DialogHeader>
              <DialogTitle>One quick step before your first publish</DialogTitle>
              <DialogDescription>
                Before your first work, connect your GitHub profile and star the
                Orthotopy repository — it keeps the catalog real and helps the
                project grow. You only do this once.
              </DialogDescription>
            </DialogHeader>
            <ul className="space-y-2.5 rounded-xl border bg-card p-4">
              {gateRow(
                Boolean(profile?.githubConnected),
                "Connect your GitHub profile",
                "do this from your dashboard"
              )}
              {gateRow(
                Boolean(profile?.starred),
                `Star ${REPO_URL.replace("https://github.com/", "")}`,
                "press Star on the repo, then verify"
              )}
            </ul>
            {needsSignin ? (
              <p className="text-xs text-muted-foreground">
                Your session is out of date — sign in again from the dashboard
                to sync your profile.
              </p>
            ) : null}
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button asChild className="w-full">
                <Link href="/dashboard" onClick={() => onOpenChange(false)}>
                  Finish setup on your dashboard
                </Link>
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Both checks turn green the moment the server confirms them.
              </p>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Publish a work</DialogTitle>
              <DialogDescription>
                List your app, tool, game, music, design or writing. The catalog is open on
                GitHub — submitting opens a prefilled issue with your listing.
              </DialogDescription>
            </DialogHeader>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (valid) publish();
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
                  <Label htmlFor="work-creator">Your name or handle</Label>
                  <Input
                    id="work-creator"
                    value={creator}
                    onChange={(event) => setCreator(event.target.value)}
                    placeholder="e.g. Mara Lindqvist"
                    maxLength={60}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="work-kind">Publishing as</Label>
                  <Select value={kind} onValueChange={setKind}>
                    <SelectTrigger id="work-kind" aria-label="Publisher kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {KINDS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {k}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="work-category">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="work-category" aria-label="Category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="work-tagline">One-line pitch</Label>
                <Textarea
                  id="work-tagline"
                  value={tagline}
                  onChange={(event) => setTagline(event.target.value)}
                  placeholder="What is it, and why should people care?"
                  rows={2}
                  maxLength={160}
                  required
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!valid}>
                  Continue on GitHub
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
