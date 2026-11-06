"use client";

/**
 * Apex — the Orthotopy control console (/apex).
 *
 * A private, standalone admin surface: developer dashboard stats, the review
 * queue for published works, a CRM over every GitHub account, support
 * tickets and user reports, plus a monetization tab parked as a
 * "coming soon" placeholder. It lives outside the public SiteShell on
 * purpose — no navbar, no footer, no indexing.
 *
 * Auth: the passcode IS the ADMIN_TOKEN variable, checked server-side by
 * POST /api/apex (action "login"). The browser never keeps the passcode —
 * the server hands back an opaque 12-hour session token that lives in
 * localStorage under APEX_KEY and rides along as the x-apex-token header.
 * Every section talks to that one endpoint with an action name.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Check,
  CircleDollarSign,
  ClipboardCheck,
  Download,
  ExternalLink,
  Flag,
  Github,
  HandCoins,
  LayoutDashboard,
  LifeBuoy,
  Loader2,
  Lock,
  LogOut,
  Receipt,
  RefreshCw,
  Search,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { githubAvatarSrc } from "./dev-profile";

// ----------------------------------------------------------------- session

const APEX_KEY = "orthotopy_apex_session";

interface ApexSession {
  token: string;
  expiresAt: string;
}

function readApexSession(): ApexSession | null {
  try {
    const raw = localStorage.getItem(APEX_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ApexSession>;
    if (!parsed.token) return null;
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() < Date.now()) {
      localStorage.removeItem(APEX_KEY);
      return null;
    }
    return { token: parsed.token, expiresAt: parsed.expiresAt || "" };
  } catch {
    return null;
  }
}

function storeApexSession(session: ApexSession) {
  try {
    localStorage.setItem(APEX_KEY, JSON.stringify(session));
  } catch {
    // Storage unavailable — the session just won't survive a reload.
  }
}

function clearApexSession() {
  try {
    localStorage.removeItem(APEX_KEY);
  } catch {
    // ignore
  }
}

// -------------------------------------------------------------- api client

type ApexResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; unauthorized?: boolean };

async function apexCall<T>(
  token: string | null,
  body: Record<string, unknown>
): Promise<ApexResult<T>> {
  try {
    const res = await fetch("/api/apex", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { "x-apex-token": token } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as
      | ({ ok?: boolean; error?: string } & Record<string, unknown>)
      | null;
    if (res.status === 401) {
      return {
        ok: false,
        unauthorized: true,
        error: data?.error || "Console session expired — sign in again.",
      };
    }
    if (res.ok && data?.ok) {
      return { ok: true, data: data as T };
    }
    return { ok: false, error: data?.error || "That didn't go through — try again." };
  } catch {
    return { ok: false, error: "Network error — we couldn't reach the server." };
  }
}

// ------------------------------------------------------------------- types

interface Overview {
  users: { total: number; withAccess: number; new7d: number };
  works: { total: number; pending: number; approved: number; rejected: number };
  stats: { views: number; downloads: number };
  tickets: { total: number; open: number };
  reports: { total: number; open: number };
  recentUsers: {
    username: string;
    githubName: string | null;
    githubEmail: string | null;
    publishAccess: boolean;
    createdAt: string | null;
  }[];
  recentWorks: {
    id: string;
    title: string;
    username: string;
    type: string;
    platform: string;
    status: string;
    createdAt: string | null;
  }[];
  series: { day: string; views: number; downloads: number }[];
}

interface PendingWork {
  id: string;
  username: string;
  title: string;
  type: string;
  platform: string;
  description: string;
  repoUrl: string;
  downloadUrl: string;
  imageUrls: string[];
  createdAt: string | null;
}

interface Account {
  username: string;
  githubName: string | null;
  githubEmail: string | null;
  starred: boolean;
  publishAccess: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
  worksTotal: number;
  worksLive: number;
}

interface Ticket {
  id: string;
  username: string;
  contact: string;
  subject: string;
  message: string;
  status: "open" | "answered" | "closed";
  priority: "low" | "normal" | "high";
  adminNote: string;
  createdAt: string | null;
  updatedAt: string | null;
}

interface Report {
  id: string;
  targetType: "work" | "user";
  targetId: string;
  reporter: string;
  contact: string;
  reason: string;
  details: string;
  status: "open" | "resolved" | "dismissed";
  adminNote: string;
  createdAt: string | null;
  updatedAt: string | null;
}

// ------------------------------------------------------------------ helpers

/** "2026-11-06 08:00:00" | ISO → "Nov 6, 08:00". Falls back to the raw string. */
function fmtWhen(raw: string | null): string {
  if (!raw) return "—";
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}/.test(raw) ? `${raw.replace(" ", "T")}Z` : raw;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const STATUS_BADGE: Record<string, string> = {
  pending: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  approved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  live: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rejected: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
  open: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  answered: "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  closed: "border-zinc-500/40 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  resolved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  dismissed: "border-zinc-500/40 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${
        STATUS_BADGE[status] ?? "border-border bg-muted text-muted-foreground"
      }`}
    >
      {status.replace("-", " ")}
    </span>
  );
}

function SectionHeading({
  title,
  description,
  onRefresh,
  refreshing,
}: {
  title: string;
  description: string;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {onRefresh ? (
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="size-4" aria-hidden="true" />
          )}
          Refresh
        </Button>
      ) : null}
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p
      className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
      role="alert"
    >
      {message}
    </p>
  );
}

function OkNote({ message }: { message: string }) {
  return (
    <p className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
      {message}
    </p>
  );
}

// -------------------------------------------------------------------- gate

function Gate({ onUnlocked }: { onUnlocked: (session: ApexSession) => void }) {
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy || !passcode.trim()) return;
    setBusy(true);
    setError(null);
    const result = await apexCall<{ token?: string; expiresAt?: string }>(null, {
      action: "login",
      passcode,
    });
    if (result.ok && result.data.token) {
      const session = {
        token: result.data.token,
        expiresAt: result.data.expiresAt || "",
      };
      storeApexSession(session);
      onUnlocked(session);
      return;
    }
    setBusy(false);
    setError(!result.ok ? result.error : "That passcode isn't right.");
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute size-[480px] rounded-full bg-emerald-500/10 blur-3xl"
      />
      <form
        className="relative w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <span className="flex size-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <Lock className="size-5" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-xl font-bold tracking-tight">Apex console</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Private control room for Orthotopy — reviews, developers, tickets
          and reports. Enter the admin passcode to unlock.
        </p>
        <div className="mt-6 space-y-2">
          <Label htmlFor="apex-passcode">Admin passcode</Label>
          <Input
            id="apex-passcode"
            type="password"
            autoComplete="current-password"
            autoFocus
            placeholder="ADMIN_TOKEN"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
            disabled={busy}
          />
        </div>
        <Button type="submit" className="mt-4 w-full" disabled={busy || !passcode.trim()}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Lock className="size-4" aria-hidden="true" />
          )}
          {busy ? "Checking…" : "Unlock console"}
        </Button>
        {error ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
          The passcode is the server&apos;s ADMIN_TOKEN secret. Only a 12-hour
          session token is stored here — never the passcode itself.
        </p>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- dashboard

function DashboardSection({
  overview,
  state,
  onRefresh,
}: {
  overview: Overview | null;
  state: "loading" | "ok" | "error";
  onRefresh: () => void;
}) {
  const stats = useMemo(() => {
    if (!overview) return [];
    return [
      { label: "Developers", value: overview.users.total, hint: `${overview.users.withAccess} with publish access` },
      { label: "Live works", value: overview.works.approved, hint: `${overview.works.total} submitted in total` },
      { label: "Under review", value: overview.works.pending, hint: "waiting in the queue" },
      { label: "Total views", value: overview.stats.views, hint: "all works, all time" },
      { label: "Total downloads", value: overview.stats.downloads, hint: "all works, all time" },
      { label: "Open tickets", value: overview.tickets.open, hint: `${overview.tickets.total} ever` },
      { label: "Open reports", value: overview.reports.open, hint: `${overview.reports.total} ever` },
      { label: "New developers", value: overview.users.new7d, hint: "joined in the last 7 days" },
    ];
  }, [overview]);

  return (
    <div>
      <SectionHeading
        title="Dashboard"
        description="The whole site at a glance — developers, works, traffic, queue pressure."
        onRefresh={onRefresh}
        refreshing={state === "loading"}
      />
      {state === "error" ? <ErrorNote message="Couldn't load the overview — press Refresh." /> : null}
      {state === "loading" && !overview ? (
        <div className="mt-8 flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : null}
      {overview ? (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-2xl border bg-card p-5">
                <p className="text-3xl font-bold tabular-nums tracking-tight">
                  {stat.value.toLocaleString("en-US")}
                </p>
                <p className="mt-1 text-sm font-medium">{stat.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{stat.hint}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border bg-card p-5">
            <h2 className="text-sm font-semibold">Traffic — last 14 days</h2>
            <div className="mt-4 text-muted-foreground">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={overview.series} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <defs>
                    <linearGradient id="apexViews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="apexDownloads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="currentColor" strokeOpacity={0.15} vertical={false} />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(day: string) => day.slice(5)}
                    tick={{ fill: "currentColor", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "currentColor", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      color: "hsl(var(--card-foreground))",
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="views"
                    name="Views"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#apexViews)"
                  />
                  <Area
                    type="monotone"
                    dataKey="downloads"
                    name="Downloads"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="url(#apexDownloads)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-8 grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border bg-card p-5">
              <h2 className="text-sm font-semibold">Newest developers</h2>
              {overview.recentUsers.length === 0 ? (
                <p className="mt-4 text-xs text-muted-foreground">No accounts yet.</p>
              ) : (
                <ul className="mt-4 divide-y divide-border/60">
                  {overview.recentUsers.map((u) => (
                    <li key={u.username} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      {/* GitHub serves the avatar straight from the login — no DB copy. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={githubAvatarSrc(u.username)}
                        alt=""
                        className="size-7 rounded-full border bg-muted"
                        loading="lazy"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{u.username}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {u.githubEmail || u.githubName || "no public email"}
                        </p>
                      </div>
                      {u.publishAccess ? (
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                          publish
                        </Badge>
                      ) : null}
                      <span className="text-xs tabular-nums text-muted-foreground">{fmtWhen(u.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-2xl border bg-card p-5">
              <h2 className="text-sm font-semibold">Latest submissions</h2>
              {overview.recentWorks.length === 0 ? (
                <p className="mt-4 text-xs text-muted-foreground">Nothing published yet.</p>
              ) : (
                <ul className="mt-4 divide-y divide-border/60">
                  {overview.recentWorks.map((w) => (
                    <li key={w.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{w.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          by {w.username} · {w.type || "—"}
                          {w.platform ? ` · ${w.platform}` : ""}
                        </p>
                      </div>
                      <StatusBadge status={w.status} />
                      <span className="text-xs tabular-nums text-muted-foreground">{fmtWhen(w.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ reviews

function ReviewsSection({
  token,
  onDecided,
}: {
  token: string;
  onDecided: () => void;
}) {
  const [queue, setQueue] = useState<PendingWork[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [confirm, setConfirm] = useState<{ work: PendingWork; decision: "approve" | "reject" } | null>(null);
  // Radix keeps rendering the dialog during its exit animation — the data
  // state (confirm) therefore survives a close; only this flag flips.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    const result = await apexCall<{ queue: PendingWork[] }>(token, { action: "review-list" });
    if (result.ok) {
      setQueue(result.data.queue);
      setState("ok");
    } else {
      setError(result.error);
      setState("error");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async () => {
    if (!confirm) return;
    const { work, decision } = confirm;
    setBusyId(work.id);
    const result = await apexCall<{ status?: string }>(token, { action: "review-decide", id: work.id, decision });
    setBusyId(null);
    setConfirmOpen(false);
    if (result.ok) {
      setQueue((prev) => prev.filter((w) => w.id !== work.id));
      setFlash(
        decision === "approve"
          ? `"${work.title}" is live in the catalog now.`
          : `"${work.title}" was rejected and stays off the catalog.`
      );
      onDecided();
    } else {
      setError(result.error);
    }
  };

  return (
    <div>
      <SectionHeading
        title="Review requests"
        description="Submitted works waiting for a decision. Approve puts them in the public catalog immediately."
        onRefresh={() => void load()}
        refreshing={state === "loading"}
      />
      {error ? <ErrorNote message={error} /> : null}
      {!error && flash ? <OkNote message={flash} /> : null}

      {state === "loading" && queue.length === 0 ? (
        <div className="mt-8 flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : null}

      {state === "ok" && queue.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed p-10 text-center">
          <ClipboardCheck className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">The review queue is empty</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
            New submissions from POST /api/works land here automatically and
            get answered within the 24–48h promise.
          </p>
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        {queue.map((work) => (
          <article key={work.id} className="rounded-2xl border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold">{work.title}</h3>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={githubAvatarSrc(work.username)}
                      alt=""
                      className="size-4 rounded-full border bg-muted"
                      loading="lazy"
                    />
                    {work.username}
                  </span>
                  <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {work.type || "—"}
                    {work.platform ? ` · ${work.platform}` : ""}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    submitted {fmtWhen(work.createdAt)}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-500/40 text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400"
                  disabled={busyId === work.id}
                  onClick={() => {
                    setConfirm({ work, decision: "reject" });
                    setConfirmOpen(true);
                  }}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  Reject
                </Button>
                <Button
                  size="sm"
                  disabled={busyId === work.id}
                  onClick={() => {
                    setConfirm({ work, decision: "approve" });
                    setConfirmOpen(true);
                  }}
                >
                  {busyId === work.id ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="size-4" aria-hidden="true" />
                  )}
                  Approve
                </Button>
              </div>
            </div>

            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {work.description || "No description provided."}
            </p>

            <div className="mt-3 grid gap-1.5 text-xs">
              {work.repoUrl ? (
                <a
                  className="inline-flex items-center gap-1.5 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  href={work.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Github className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{work.repoUrl}</span>
                  <ArrowUpRight className="size-3 shrink-0" aria-hidden="true" />
                </a>
              ) : null}
              {work.downloadUrl ? (
                <a
                  className="inline-flex items-center gap-1.5 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  href={work.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{work.downloadUrl}</span>
                  <ArrowUpRight className="size-3 shrink-0" aria-hidden="true" />
                </a>
              ) : null}
            </div>

            {work.imageUrls.length > 0 ? (
              <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                {work.imageUrls.map((url) => (
                  // Screenshots live in the work's own GitHub repo (img.png…img9.png).
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={url}
                    src={url}
                    alt={`${work.title} screenshot`}
                    className="h-28 shrink-0 rounded-xl border object-cover"
                    loading="lazy"
                  />
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground">
                No screenshots found in the repo (img.png … img9.png).
              </p>
            )}
          </article>
        ))}
      </div>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.decision === "approve" ? "Approve this work?" : "Reject this work?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.decision === "approve"
                ? `"${confirm?.work.title}" by ${confirm?.work.username} goes live in the public catalog immediately.`
                : `"${confirm?.work.title}" by ${confirm?.work.username} will be kept off the catalog. The developer sees it as rejected on their dashboard.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={
                confirm?.decision === "reject"
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : undefined
              }
              disabled={Boolean(busyId)}
              onClick={(event) => {
                event.preventDefault();
                void decide();
              }}
            >
              {confirm?.decision === "approve" ? "Approve & publish" : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------- CRM

function CrmSection({ token }: { token: string }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Account | null>(null);
  // Data state (pendingDelete) survives the exit animation; only this flips.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [busyUser, setBusyUser] = useState<string | null>(null);

  const load = useCallback(
    async (q: string) => {
      setState("loading");
      setError(null);
      const result = await apexCall<{ accounts: Account[] }>(token, {
        action: "crm-list",
        q,
      });
      if (result.ok) {
        setAccounts(result.data.accounts);
        setState("ok");
      } else {
        setError(result.error);
        setState("error");
      }
    },
    [token]
  );

  useEffect(() => {
    const timer = setTimeout(() => void load(query), query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [query, load]);

  const setAccess = async (account: Account, publishAccess: boolean) => {
    setBusyUser(account.username);
    setFlash(null);
    setError(null);
    const result = await apexCall(token, {
      action: "crm-update",
      username: account.username,
      publishAccess,
    });
    setBusyUser(null);
    if (result.ok) {
      setAccounts((prev) =>
        prev.map((a) => (a.username === account.username ? { ...a, publishAccess } : a))
      );
      setFlash(
        publishAccess
          ? `${account.username} can publish works again.`
          : `${account.username} can no longer publish works.`
      );
    } else {
      setError(result.error);
    }
  };

  const removeAccount = async () => {
    if (!pendingDelete) return;
    const account = pendingDelete;
    setBusyUser(account.username);
    const result = await apexCall<{ worksRemoved?: number }>(token, {
      action: "crm-delete",
      username: account.username,
    });
    setBusyUser(null);
    setDeleteOpen(false);
    setDeleteConfirmText("");
    if (result.ok) {
      setAccounts((prev) => prev.filter((a) => a.username !== account.username));
      setFlash(
        `${account.username} and ${result.data.worksRemoved ?? 0} of their works were removed.`
      );
    } else {
      setError(result.error);
    }
  };

  return (
    <div>
      <SectionHeading
        title="CRM — developers"
        description="Every GitHub account on Orthotopy: what they published, and whether they may publish."
        onRefresh={() => void load(query)}
        refreshing={state === "loading"}
      />

      <div className="relative mt-6 max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          className="pl-9"
          placeholder="Search username, name or email…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {error ? <ErrorNote message={error} /> : null}
      {!error && flash ? <OkNote message={flash} /> : null}

      <div className="mt-6 overflow-hidden rounded-2xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Developer</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium">Last seen</th>
                <th className="px-4 py-3 font-medium">Works</th>
                <th className="px-4 py-3 font-medium">Starred</th>
                <th className="px-4 py-3 font-medium">Publish</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.username} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={githubAvatarSrc(account.username)}
                        alt=""
                        className="size-7 rounded-full border bg-muted"
                        loading="lazy"
                      />
                      <div className="min-w-0">
                        <a
                          className="block truncate font-medium underline-offset-2 hover:underline"
                          href={`https://github.com/${encodeURIComponent(account.username)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {account.username}
                        </a>
                        {account.githubName ? (
                          <p className="truncate text-xs text-muted-foreground">{account.githubName}</p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="max-w-[180px] px-4 py-3">
                    <p className="truncate text-xs text-muted-foreground">
                      {account.githubEmail || "no public email"}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-muted-foreground">
                    {fmtWhen(account.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-muted-foreground">
                    {fmtWhen(account.lastLoginAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums">
                    <span className="font-medium">{account.worksLive}</span>
                    <span className="text-muted-foreground"> / {account.worksTotal}</span>
                  </td>
                  <td className="px-4 py-3">
                    {account.starred ? (
                      <Check className="size-4 text-emerald-500" aria-label="starred the repo" />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Switch
                      checked={account.publishAccess}
                      disabled={busyUser === account.username}
                      onCheckedChange={(checked) => void setAccess(account, checked)}
                      aria-label={`Publish access for ${account.username}`}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={busyUser === account.username}
                      onClick={() => {
                        setPendingDelete(account);
                        setDeleteConfirmText("");
                        setDeleteOpen(true);
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
              {state === "ok" && accounts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {query ? "No accounts match that search." : "No developer accounts yet."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.username}?</AlertDialogTitle>
            <AlertDialogDescription>
              This wipes the account, its sessions and every work it published
              from Orthotopy. This cannot be undone — type the username to
              confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            placeholder={pendingDelete?.username}
            value={deleteConfirmText}
            onChange={(event) => setDeleteConfirmText(event.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleteConfirmText !== pendingDelete?.username || busyUser !== null}
              onClick={(event) => {
                event.preventDefault();
                void removeAccount();
              }}
            >
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ------------------------------------------------------------------ tickets

function TicketsSection({ token }: { token: string }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [filter, setFilter] = useState<"all" | "open" | "answered" | "closed">("all");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { note: string; priority: Ticket["priority"] }>>({});

  const load = useCallback(
    async (f: string) => {
      setState("loading");
      setError(null);
      const result = await apexCall<{ tickets: Ticket[] }>(token, {
        action: "tickets-list",
        ...(f === "all" ? {} : { status: f }),
      });
      if (result.ok) {
        setTickets(result.data.tickets);
        setState("ok");
      } else {
        setError(result.error);
        setState("error");
      }
    },
    [token]
  );

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  const draftFor = (ticket: Ticket) =>
    drafts[ticket.id] ?? { note: ticket.adminNote, priority: ticket.priority };

  const update = async (
    ticket: Ticket,
    patch: { status?: Ticket["status"]; saveDraft?: boolean }
  ) => {
    setError(null);
    setFlash(null);
    const draft = draftFor(ticket);
    const result = await apexCall(token, {
      action: "ticket-update",
      id: ticket.id,
      status: patch.status,
      priority: draft.priority,
      adminNote: draft.note,
    });
    if (result.ok) {
      setTickets((prev) =>
        patch.status === undefined && filter !== "all"
          ? prev.filter((t) => t.id !== ticket.id)
          : prev.map((t) =>
              t.id === ticket.id
                ? {
                    ...t,
                    status: patch.status ?? t.status,
                    priority: draft.priority,
                    adminNote: draft.note,
                  }
                : t
            )
      );
      setFlash(`Ticket "${ticket.subject}" updated.`);
    } else {
      setError(result.error);
    }
  };

  return (
    <div>
      <SectionHeading
        title="Support tickets"
        description="Requests that came in through POST /api/support — answer, prioritize, close."
        onRefresh={() => void load(filter)}
        refreshing={state === "loading"}
      />

      <Tabs value={filter} onValueChange={(value) => setFilter(value as typeof filter)} className="mt-6">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="answered">Answered</TabsTrigger>
          <TabsTrigger value="closed">Closed</TabsTrigger>
        </TabsList>
      </Tabs>

      {error ? <ErrorNote message={error} /> : null}
      {!error && flash ? <OkNote message={flash} /> : null}

      {state === "loading" && tickets.length === 0 ? (
        <div className="mt-8 flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : null}

      {state === "ok" && tickets.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed p-10 text-center">
          <LifeBuoy className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">No tickets here</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
            When someone POSTs to /api/support — signed in or not — the ticket
            shows up in this list.
          </p>
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        {tickets.map((ticket) => {
          const draft = draftFor(ticket);
          return (
            <article key={ticket.id} className="rounded-2xl border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold">{ticket.subject}</h3>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <StatusBadge status={ticket.status} />
                    {ticket.username ? (
                      <span>from {ticket.username}</span>
                    ) : ticket.contact ? (
                      <span>contact: {ticket.contact}</span>
                    ) : (
                      <span>anonymous</span>
                    )}
                    <span>· {fmtWhen(ticket.createdAt)}</span>
                  </p>
                </div>
                <Select
                  value={draft.priority}
                  onValueChange={(value) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [ticket.id]: { ...draft, priority: value as Ticket["priority"] },
                    }))
                  }
                >
                  <SelectTrigger className="h-8 w-32 text-xs" aria-label="Ticket priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low priority</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High priority</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <p className="mt-3 whitespace-pre-wrap rounded-xl bg-muted/40 px-4 py-3 text-sm leading-relaxed">
                {ticket.message}
              </p>

              <div className="mt-4 space-y-2">
                <Label
                  htmlFor={`note-${ticket.id}`}
                  className="text-xs text-muted-foreground"
                >
                  Internal note (never shown to the reporter)
                </Label>
                <Textarea
                  id={`note-${ticket.id}`}
                  rows={2}
                  placeholder="What was answered, what was decided…"
                  value={draft.note}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [ticket.id]: { ...draft, note: event.target.value },
                    }))
                  }
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {ticket.status !== "answered" ? (
                  <Button size="sm" variant="outline" onClick={() => void update(ticket, { status: "answered" })}>
                    Mark answered
                  </Button>
                ) : null}
                {ticket.status !== "closed" ? (
                  <Button size="sm" variant="outline" onClick={() => void update(ticket, { status: "closed" })}>
                    Close ticket
                  </Button>
                ) : null}
                {ticket.status !== "open" ? (
                  <Button size="sm" variant="ghost" onClick={() => void update(ticket, { status: "open" })}>
                    Reopen
                  </Button>
                ) : null}
                <Button size="sm" onClick={() => void update(ticket, {})}>
                  Save note
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ reports

const REASON_LABEL: Record<string, string> = {
  "broken-link": "Broken link",
  "not-working": "Doesn't work",
  infringing: "Infringing",
  malware: "Malware",
  spam: "Spam",
  other: "Other",
};

function ReportsSection({ token, onTriaged }: { token: string; onTriaged: () => void }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [filter, setFilter] = useState<"all" | "open" | "resolved" | "dismissed">("all");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (f: string) => {
      setState("loading");
      setError(null);
      const result = await apexCall<{ reports: Report[] }>(token, {
        action: "reports-list",
        ...(f === "all" ? {} : { status: f }),
      });
      if (result.ok) {
        setReports(result.data.reports);
        setState("ok");
      } else {
        setError(result.error);
        setState("error");
      }
    },
    [token]
  );

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  const update = async (report: Report, status: Report["status"]) => {
    setBusyId(report.id);
    setError(null);
    setFlash(null);
    const result = await apexCall(token, { action: "report-update", id: report.id, status });
    setBusyId(null);
    if (result.ok) {
      setReports((prev) =>
        filter === "all"
          ? prev.map((r) => (r.id === report.id ? { ...r, status } : r))
          : prev.filter((r) => r.id !== report.id)
      );
      setFlash(`Report marked ${status}.`);
      onTriaged();
    } else {
      setError(result.error);
    }
  };

  const removeWork = async (report: Report) => {
    setBusyId(report.id);
    setError(null);
    setFlash(null);
    const result = await apexCall<{ workRemoved?: boolean }>(token, {
      action: "report-remove-work",
      id: report.id,
    });
    setBusyId(null);
    if (result.ok) {
      setReports((prev) =>
        filter === "all"
          ? prev.map((r) => (r.id === report.id ? { ...r, status: "resolved" as const } : r))
          : prev.filter((r) => r.id !== report.id)
      );
      setFlash(
        result.data.workRemoved
          ? `Work "${report.targetId}" was removed from the catalog.`
          : `That work was already off the catalog — report resolved.`
      );
      onTriaged();
    } else {
      setError(result.error);
    }
  };

  return (
    <div>
      <SectionHeading
        title="User reports"
        description="Works and developers flagged by visitors through POST /api/report."
        onRefresh={() => void load(filter)}
        refreshing={state === "loading"}
      />

      <Tabs value={filter} onValueChange={(value) => setFilter(value as typeof filter)} className="mt-6">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
          <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
        </TabsList>
      </Tabs>

      {error ? <ErrorNote message={error} /> : null}
      {!error && flash ? <OkNote message={flash} /> : null}

      {state === "loading" && reports.length === 0 ? (
        <div className="mt-8 flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : null}

      {state === "ok" && reports.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed p-10 text-center">
          <Flag className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">No reports here</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
            A clean queue — when visitors flag a work or a developer, the
            report lands here for triage.
          </p>
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        {reports.map((report) => (
          <article key={report.id} className="rounded-2xl border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-red-500/40 text-red-600 dark:text-red-400">
                    {REASON_LABEL[report.reason] ?? report.reason}
                  </Badge>
                  <StatusBadge status={report.status} />
                  <span className="text-xs text-muted-foreground">
                    targets a {report.targetType}
                  </span>
                </div>
                <p className="mt-2 text-sm">
                  <span className="font-medium">
                    {report.targetType === "work" ? "Work" : "Developer"}:{" "}
                  </span>
                  {report.targetType === "user" ? (
                    <a
                      className="underline-offset-2 hover:underline"
                      href={`https://github.com/${encodeURIComponent(report.targetId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {report.targetId}
                      <ExternalLink className="ml-1 inline size-3" aria-hidden="true" />
                    </a>
                  ) : (
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{report.targetId}</code>
                  )}
                </p>
                {report.details ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                    {report.details}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  {report.reporter
                    ? `reported by ${report.reporter}`
                    : report.contact
                      ? `contact: ${report.contact}`
                      : "anonymous report"}
                  {" · "}
                  {fmtWhen(report.createdAt)}
                </p>
              </div>

              {report.status === "open" ? (
                <div className="flex shrink-0 flex-wrap gap-2">
                  {report.targetType === "work" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-500/40 text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400"
                      disabled={busyId === report.id}
                      onClick={() => void removeWork(report)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      Remove work
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === report.id}
                    onClick={() => void update(report, "dismissed")}
                  >
                    Dismiss
                  </Button>
                  <Button size="sm" disabled={busyId === report.id} onClick={() => void update(report, "resolved")}>
                    <Check className="size-4" aria-hidden="true" />
                    Resolve
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === report.id}
                  onClick={() => void update(report, "open")}
                >
                  Reopen
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------- monetization

/**
 * Placeholder only — no API calls, no state, nothing wired up. The real
 * monetization workspace (revenue, payouts, billing) replaces this panel
 * when it ships; the sidebar already advertises it with a "Coming soon"
 * chip so the slot is visible from day one.
 */
function MonetizationSection() {
  const teasers = [
    {
      icon: TrendingUp,
      title: "Revenue overview",
      text: "Sales, subscriptions and earnings charted per day, per work.",
    },
    {
      icon: HandCoins,
      title: "Developer payouts",
      text: "Split revenue with developers and pay out on a schedule.",
    },
    {
      icon: Receipt,
      title: "Billing history",
      text: "Invoices, receipts and downloadable account statements.",
    },
  ];

  return (
    <div>
      <SectionHeading
        title="Monetization"
        description="Money tools for the storefront — planned, not wired up yet."
      />

      <div className="mt-8 rounded-2xl border border-dashed p-8 sm:p-10">
        <div className="text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-amber-500/10">
            <CircleDollarSign
              className="size-7 text-amber-600 dark:text-amber-400"
              aria-hidden="true"
            />
          </span>
          <p className="mt-4 text-base font-semibold">Coming soon!</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            This tab is a placeholder for now — the monetization workspace
            will live here the moment it ships. Nothing on this panel reads
            or moves money yet.
          </p>
        </div>

        <div className="mt-8 space-y-3">
          {teasers.map((teaser) => (
            <div
              key={teaser.title}
              className="flex items-start gap-3 rounded-xl border bg-card/50 p-4 opacity-70"
            >
              <teaser.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{teaser.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{teaser.text}</p>
              </div>
              <span className="ml-auto shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                planned
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- shell

type SectionId = "dashboard" | "reviews" | "crm" | "tickets" | "reports" | "monetization";

const SECTIONS: {
  id: SectionId;
  label: string;
  icon: typeof LayoutDashboard;
  blurb: string;
  comingSoon?: boolean;
}[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, blurb: "Site-wide stats" },
  { id: "reviews", label: "Review requests", icon: ClipboardCheck, blurb: "Pending works" },
  { id: "crm", label: "CRM", icon: Users, blurb: "Developer accounts" },
  { id: "tickets", label: "Support tickets", icon: LifeBuoy, blurb: "Help requests" },
  { id: "reports", label: "User reports", icon: Flag, blurb: "Flagged content" },
  {
    id: "monetization",
    label: "Monetization",
    icon: CircleDollarSign,
    blurb: "Payouts & revenue",
    comingSoon: true,
  },
];

function ApexConsoleInner({ initialSession }: { initialSession: ApexSession }) {
  const [session, setSession] = useState<ApexSession>(initialSession);
  const [section, setSection] = useState<SectionId>("dashboard");

  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewState, setOverviewState] = useState<"loading" | "ok" | "error">("loading");

  const token = session.token;

  const loadOverview = useCallback(async () => {
    setOverviewState("loading");
    const result = await apexCall<{ overview: Overview }>(token, { action: "overview" });
    if (result.ok) {
      setOverview(result.data.overview);
      setOverviewState("ok");
    } else if (result.unauthorized) {
      clearApexSession();
      setSession(null as unknown as ApexSession);
    } else {
      setOverviewState("error");
    }
  }, [token]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const signOut = async () => {
    await apexCall(token, { action: "logout" });
    clearApexSession();
    setSession(null as unknown as ApexSession);
  };

  if (!session?.token) {
    return (
      <Gate
        onUnlocked={(fresh) => {
          setSession(fresh);
          setOverview(null);
          setOverviewState("loading");
        }}
      />
    );
  }

  const badgeFor = (id: SectionId): number | null => {
    if (!overview) return null;
    if (id === "reviews") return overview.works.pending;
    if (id === "tickets") return overview.tickets.open;
    if (id === "reports") return overview.reports.open;
    return null;
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1500px]">
        {/* ---------------------------------------------------- sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r px-4 py-6 md:flex">
          <div className="flex items-center gap-2.5 px-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/10 text-sm font-bold text-emerald-600 dark:text-emerald-400">
              A
            </span>
            <div>
              <p className="text-sm font-bold leading-tight">Apex</p>
              <p className="text-xs text-muted-foreground">Orthotopy control</p>
            </div>
          </div>

          <nav className="mt-8 flex flex-1 flex-col gap-1">
            {SECTIONS.map((item) => {
              const active = section === item.id;
              const badge = badgeFor(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                    active
                      ? "bg-emerald-500/10 font-medium text-emerald-700 dark:text-emerald-400"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <item.icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{item.label}</span>
                    {item.comingSoon ? (
                      <span className="mt-0.5 flex items-center gap-1.5">
                        <span className="truncate text-[11px] opacity-70">{item.blurb}</span>
                        <span className="shrink-0 whitespace-nowrap rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                          Coming soon
                        </span>
                      </span>
                    ) : (
                      <span className="block truncate text-[11px] opacity-70">{item.blurb}</span>
                    )}
                  </span>
                  {badge && badge > 0 ? (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          <div className="space-y-1 border-t pt-4">
            <Button asChild variant="ghost" size="sm" className="w-full justify-start">
              <a href="/" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" aria-hidden="true" />
                Open the site
              </a>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground hover:text-foreground"
              onClick={() => void signOut()}
            >
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </aside>

        {/* ------------------------------------------------------- main */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          {/* mobile nav */}
          <div className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 md:hidden">
            {SECTIONS.map((item) => {
              const active = section === item.id;
              const badge = badgeFor(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${
                    active
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : "bg-card text-muted-foreground"
                  }`}
                >
                  <item.icon className="size-3.5" aria-hidden="true" />
                  {item.label}
                  {badge && badge > 0 ? (
                    <span className="rounded-full bg-emerald-500/15 px-1.5 text-[11px] font-semibold tabular-nums">
                      {badge}
                    </span>
                  ) : item.comingSoon ? (
                    <span className="whitespace-nowrap rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                      Coming soon
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="mx-auto max-w-5xl">
            {section === "dashboard" ? (
              <DashboardSection
                overview={overview}
                state={overviewState}
                onRefresh={() => void loadOverview()}
              />
            ) : null}
            {section === "reviews" ? (
              <ReviewsSection token={token} onDecided={() => void loadOverview()} />
            ) : null}
            {section === "crm" ? <CrmSection token={token} /> : null}
            {section === "tickets" ? <TicketsSection token={token} /> : null}
            {section === "reports" ? (
              <ReportsSection token={token} onTriaged={() => void loadOverview()} />
            ) : null}
            {section === "monetization" ? <MonetizationSection /> : null}

            <p className="mt-10 text-center text-xs text-muted-foreground">
              Apex · Orthotopy control console · sessions expire after 12 hours
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

export function ApexConsole() {
  const [booted, setBooted] = useState(false);
  const [session, setSession] = useState<ApexSession | null>(null);

  useEffect(() => {
    setSession(readApexSession());
    setBooted(true);
  }, []);

  if (!booted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  if (!session?.token) {
    return (
      <Gate
        onUnlocked={(fresh) => {
          setSession(fresh);
        }}
      />
    );
  }

  return (
    <ApexConsoleInner
      key={session.token}
      initialSession={session}
    />
  );
}
