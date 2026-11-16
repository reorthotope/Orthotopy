"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CircleDollarSign,
  Download,
  Eye,
  Github,
  HandCoins,
  LifeBuoy,
  Loader2,
  Package,
  Pencil,
  Receipt,
  RefreshCw,
  Rocket,
  ShieldAlert,
  TrendingUp,
  Trash2,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
import { Textarea } from "@/components/ui/textarea";
import { usePublish } from "./site-shell";
import { createTicket, listMyThreads, type SupportThread } from "./support-thread";
import {
  clearAuth,
  exchangeSessionCode,
  fetchProfile,
  readAuth,
  readCachedProfile,
  startGithubOauth,
  type DevAuth,
  type DevProfile,
} from "./dev-profile";

/**
 * Developer dashboard.
 *
 * Auth model: OAuth-only. There is no signup and no sign-in — an unsigned
 * visitor sees exactly one thing here: "Connect GitHub to access your
 * dashboard". The GitHub authorization creates (or finds) the account, and
 * the callback lands back on this page with a one-time code that is traded
 * for the session token (kept in localStorage, `orthotopy_dev_auth`).
 *
 * No names, emails or avatars live in the dashboard body; identity lives in
 * the navbar account menu.
 *
 * Content: three stat blocks (Total Works / Views / Downloads), the list of
 * published works with a per-work color tag, a publish button and two line
 * graphs (views, downloads) with one colored line per work. Data comes from
 * GET /api/my-works (D1 works + work_stats_daily); a submitted work is
 * recorded as 'pending' by POST /api/works the moment the publish form is
 * sent, and POST /api/track grows the graphs as the storefront's View /
 * Download buttons are used.
 *
 * The page closes with a "Monetization" placeholder card (amber Coming
 * soon tag) — parked UI for earnings tracking and payouts; nothing is
 * wired up yet.
 */

interface MyWork {
  id: string;
  title: string;
  tagline: string;
  description: string;
  kind: string;
  category: string;
  type: string;
  platform: string;
  status: string;
  /** Why the work was taken down / suspended / banned (from apex). */
  modNote: string;
  /** When a work suspension auto-ends (ISO), or null. */
  suspendedUntil: string | null;
  /** Pending "update request" — the live listing keeps running until the
   * review approves or rejects this edit. */
  pendingUpdate: {
    title: string;
    description: string;
    downloadUrl: string;
    requestedAt: string;
  } | null;
  repoUrl: string;
  downloadUrl: string;
  images: string[];
  createdAt: string | null;
  views: number;
  downloads: number;
}

interface DashboardData {
  works: MyWork[];
  totals: { works: number; views: number; downloads: number };
  series: Record<string, { day: string; views: number; downloads: number }[]>;
}

/** Line colors for the charts + list tags — one stable color per work. */
const WORK_COLORS = [
  "#10b981",
  "#6366f1",
  "#f59e0b",
  "#ec4899",
  "#14b8a6",
  "#8b5cf6",
  "#f97316",
  "#06b6d4",
  "#84cc16",
  "#ef4444",
];

function workColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 100000;
  }
  return WORK_COLORS[hash % WORK_COLORS.length];
}

type DashboardState = "idle" | "loading" | "ok" | "error";

function isValidDownloadUrl(raw: string): boolean {
  const value = raw.trim();
  if (!value || value.length > 600 || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function fmtUntil(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function DeveloperDashboard() {
  const router = useRouter();
  const publish = usePublish();
  const [auth, setAuth] = useState<DevAuth | null>(null);
  const [ready, setReady] = useState(false);
  const [authNote, setAuthNote] = useState<string | null>(null);

  // Publishing-gate state
  const [profile, setProfile] = useState<DevProfile | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const oauthHandledRef = useRef(false);

  // Dashboard data (works + stats)
  const [data, setData] = useState<DashboardData | null>(null);
  const [dataState, setDataState] = useState<DashboardState>("idle");

  // Work self-management (update request + remove)
  const [updateWork, setUpdateWork] = useState<MyWork | null>(null);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateForm, setUpdateForm] = useState({ title: "", description: "", downloadUrl: "" });
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [removeWork, setRemoveWork] = useState<MyWork | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  // Appeal / support tickets
  const [tickets, setTickets] = useState<SupportThread[]>([]);
  const [ticketBusy, setTicketBusy] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (token: string) => {
    setDataState("loading");
    try {
      const res = await fetch("/api/my-works", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        // Session expired — drop it; the gate card offers the one-tap way
        // back in.
        clearAuth();
        setAuth(null);
        setProfile(null);
        setData(null);
        setDataState("idle");
        setAuthNote("Your session expired — one tap on the button gets you back in.");
        return;
      }
      const json = (await res.json().catch(() => null)) as
        | (DashboardData & { ok?: boolean })
        | null;
      if (res.ok && json?.ok) {
        setData({ works: json.works, totals: json.totals, series: json.series });
        setDataState("ok");
      } else {
        setDataState("error");
      }
    } catch {
      setDataState("error");
    }
  }, []);

  const loadProfile = useCallback(async (token: string): Promise<DevProfile | null> => {
    if (!token) {
      setProfile(readCachedProfile());
      return null;
    }
    const result = await fetchProfile(token);
    if (result.status === "ok" && result.profile) {
      setProfile(result.profile);
      return result.profile;
    }
    if (result.status === "unauthorized") {
      clearAuth();
      setAuth(null);
      setProfile(null);
      setData(null);
      setDataState("idle");
      setAuthNote("Your session expired — one tap on the button gets you back in.");
      return null;
    }
    // Network hiccup — fall back to the cached gate state.
    setProfile(readCachedProfile());
    return readCachedProfile();
  }, []);

  useEffect(() => {
    const current = readAuth();
    if (current?.token) setAuth(current);
    setReady(true);
  }, []);

  // Sync the profile + works once the session is known.
  useEffect(() => {
    if (!ready || !auth?.token) return;
    void loadProfile(auth.token).then((fresh) => {
      if (fresh) void loadDashboard(auth.token);
    });
  }, [ready, auth, loadProfile, loadDashboard]);

  // The developer's own support tickets (linked chats).
  const loadTickets = useCallback(async (token: string) => {
    const result = await listMyThreads(token);
    if (result.ok && result.threads) setTickets(result.threads);
  }, []);

  useEffect(() => {
    if (ready && auth?.token && profile?.modState === "ok") void loadTickets(auth.token);
  }, [ready, auth, profile, loadTickets]);

  // A publish that just succeeded (the dialog lives in the site shell)
  // announces itself here so the list and counters update immediately.
  useEffect(() => {
    const onWorksChanged = () => {
      if (auth?.token) void loadDashboard(auth.token);
    };
    window.addEventListener("orthotopy:works", onWorksChanged);
    return () => window.removeEventListener("orthotopy:works", onWorksChanged);
  }, [auth, loadDashboard]);

  const refreshAll = useCallback(async () => {
    if (!auth?.token) return;
    const fresh = await loadProfile(auth.token);
    if (fresh) await loadDashboard(auth.token);
    await loadTickets(auth.token);
  }, [loadProfile, loadDashboard, loadTickets, auth]);

  // ------------------------------------------------- update / remove flows
  const openUpdateDialog = (work: MyWork) => {
    setUpdateWork(work);
    setUpdateForm({
      title: work.title,
      description: work.description || work.tagline || "",
      downloadUrl: work.downloadUrl || "",
    });
    setUpdateError(null);
    setUpdateOpen(true);
  };

  const submitUpdate = async () => {
    if (!updateWork || updateBusy || !auth?.token) return;
    const title = updateForm.title.trim();
    const description = updateForm.description.trim();
    const downloadUrl = updateForm.downloadUrl.trim();
    if (title.length < 2 || title.length > 80) {
      setUpdateError("Give the work a title between 2 and 80 characters.");
      return;
    }
    if (description.length < 10 || description.length > 2000) {
      setUpdateError("Describe the work in 10–2000 characters.");
      return;
    }
    if (!isValidDownloadUrl(downloadUrl)) {
      setUpdateError("The download link must be a direct https:// URL.");
      return;
    }
    setUpdateBusy(true);
    setUpdateError(null);
    try {
      const res = await fetch("/api/my-works", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({
          action: "update-request",
          id: updateWork.id,
          title,
          description,
          downloadUrl,
        }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (res.ok && json?.ok) {
        setUpdateOpen(false);
        setUpdateWork(null);
        await loadDashboard(auth.token);
        return;
      }
      setUpdateError(json?.error || "The update request didn't go through — try again.");
    } catch {
      setUpdateError("Network error — the update request didn't go through.");
    }
    setUpdateBusy(false);
  };

  const submitRemove = async () => {
    if (!removeWork || removeBusy || !auth?.token) return;
    setRemoveBusy(true);
    try {
      const res = await fetch("/api/my-works", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({ action: "remove", id: removeWork.id }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (res.ok && json?.ok) {
        setRemoveWork(null);
        await loadDashboard(auth.token);
        return;
      }
      setUpdateError(json?.error || "The removal didn't go through — try again.");
    } catch {
      setUpdateError("Network error — the removal didn't go through.");
    }
    setRemoveBusy(false);
  };

  const openNewTicket = async () => {
    if (ticketBusy || !auth?.token) return;
    setTicketBusy(true);
    setTicketError(null);
    const result = await createTicket(auth.token, auth.username, {
      subject: "Support request",
      context: "general",
    });
    setTicketBusy(false);
    if (result.ok && result.url) {
      router.push(result.url);
      return;
    }
    setTicketError(result.error || "Couldn't open a ticket — try again in a moment.");
  };

  const connectGithub = async () => {
    if (connecting) return;
    setConnecting(true);
    setConnectError(null);
    const result = await startGithubOauth();
    if (result.ok && result.authorizeUrl) {
      // Full-page redirect to GitHub's authorize prompt; GitHub sends the
      // developer back to /api/github/callback, which creates/finds the
      // account and returns here with a one-time session code.
      window.location.assign(result.authorizeUrl);
      return;
    }
    setConnecting(false);
    setConnectError(
      result.notConfigured
        ? "GitHub sign-in isn't switched on for the site yet — it should be live shortly."
        : result.error || "We couldn't open GitHub — please try again in a moment."
    );
  };

  // Return leg of the GitHub OAuth round-trip: /api/github/callback bounces
  // back here with ?github=<flag> and, on success, a one-time ?auth=<code>
  // that trades for the real session. Connecting IS signing in — the
  // dashboard opens right after.
  useEffect(() => {
    if (!ready || oauthHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("github");
    if (!flag) return;
    oauthHandledRef.current = true;
    const authCode = params.get("auth") || "";
    params.delete("github");
    params.delete("auth");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (query ? `?${query}` : "")
    );

    const finishSignIn = async (code: string) => {
      const result = await exchangeSessionCode(code);
      if (result.ok && result.auth) {
        setAuthNote(null);
        setAuth(result.auth);
        const fresh = await loadProfile(result.auth.token);
        if (fresh) await loadDashboard(result.auth.token);
        return;
      }
      setConnectError(
        result.error ||
          "We couldn't finish the sign-in — press Connect with GitHub once more."
      );
    };

    if (flag === "connected") {
      if (authCode) {
        void finishSignIn(authCode);
      } else {
        // Connected but no one-time code (KV hiccup) — the navbar session
        // may already exist from an earlier sign-in; otherwise show the gate.
        const current = readAuth();
        if (current?.token) {
          setAuth(current);
          void loadProfile(current.token).then((fresh) => {
            if (fresh) void loadDashboard(current.token);
          });
        } else {
          setConnectError(
            "GitHub confirmed the connection but the handover expired — press Connect with GitHub once more."
          );
        }
      }
      return;
    }

    const messages: Record<string, string> = {
      denied: "You cancelled the GitHub authorization — nothing was created. You can try again any time.",
      expired: "That GitHub link expired before it finished — press Connect with GitHub to try again.",
      invalid: "That GitHub link wasn't valid any more — press Connect with GitHub to try again.",
      unconfigured: "GitHub sign-in isn't switched on for the site yet — it should be live shortly.",
      exchange: "We couldn't complete the GitHub handshake — please try again in a moment.",
      profile: "We reached GitHub but couldn't read your profile — please try again.",
      error: "Something went wrong creating your account — please try again.",
    };
    setConnectError(messages[flag] || "Something went wrong signing in with GitHub — please try again.");
  }, [ready, loadProfile, loadDashboard]);

  // ------------------------------------------------------------ gate
  if (!ready) {
    return (
      <div className="flex justify-center py-32" aria-label="Loading dashboard">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  if (!auth?.token) {
    return (
      <div className="relative mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-40 mx-auto size-[420px] rounded-full bg-emerald-500/10 blur-3xl"
        />
        <div className="relative mx-auto max-w-xl rounded-2xl border bg-card p-6 text-center sm:p-10">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Github className="size-6" aria-hidden="true" />
          </span>
          <h1 className="mt-5 text-2xl font-bold tracking-tight">
            Connect GitHub to access your dashboard
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            One authorization verifies your developer identity, opens the
            dashboard and lets you publish works. There is no signup and no
            password — GitHub is the whole sign-in.
          </p>
          <div className="mt-6 flex justify-center">
            <Button onClick={() => void connectGithub()} disabled={connecting}>
              {connecting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Github className="size-4" aria-hidden="true" />
              )}
              {connecting ? "Opening GitHub…" : "Connect with GitHub"}
            </Button>
          </div>
          {authNote ? (
            <p className="mt-4 text-xs text-muted-foreground">{authNote}</p>
          ) : null}
          {connectError ? (
            <p className="mt-4 text-xs text-destructive" role="alert">
              {connectError}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  // ------------------------------------------------ blocked (sus / ban)
  // A suspended or banned account can still open the dashboard — but sees
  // the reason, the end of a suspension and an appeal button instead of
  // any works data. The appeal opens a private, end-to-end-encrypted
  // support ticket chat and lands the developer straight in it.
  if (profile?.modState === "suspended" || profile?.modState === "banned") {
    const banned = profile.modState === "banned";
    const until = profile.modUntil ? fmtUntil(profile.modUntil) : "";
    const openAppeal = async () => {
      if (ticketBusy || !auth?.token) return;
      setTicketBusy(true);
      setTicketError(null);
      const result = await createTicket(auth.token, auth.username, {
        subject: banned ? "Appeal — account ban" : "Appeal — account suspension",
        context: banned ? "account-banned" : "account-suspended",
      });
      setTicketBusy(false);
      if (result.ok && result.url) {
        router.push(result.url);
        return;
      }
      setTicketError(result.error || "Couldn't open the appeal — try again in a moment.");
    };
    return (
      <div className="relative mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-40 mx-auto size-[420px] rounded-full bg-red-500/10 blur-3xl"
        />
        <div className="relative mx-auto max-w-xl rounded-2xl border bg-card p-6 text-center sm:p-10">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-600 dark:text-red-400">
            <ShieldAlert className="size-6" aria-hidden="true" />
          </span>
          <h1 className="mt-5 text-2xl font-bold tracking-tight">
            {banned ? "Account banned" : "Account suspended"}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Your developer account doesn&apos;t have access to the dashboard right now.
            {banned
              ? " Bans don't expire — you can appeal the decision below."
              : until
                ? ` This suspension ends automatically on ${until} — your works stay live in the meantime.`
                : " Your works stay live in the meantime."}
          </p>
          {profile.modReason ? (
            <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
                Reason given by the review
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">{profile.modReason}</p>
            </div>
          ) : null}
          <div className="mt-6 flex justify-center">
            <Button onClick={() => void openAppeal()} disabled={ticketBusy}>
              {ticketBusy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <LifeBuoy className="size-4" aria-hidden="true" />
              )}
              {ticketBusy ? "Opening your appeal chat…" : "Appeal this decision"}
            </Button>
          </div>
          {ticketError ? (
            <p className="mt-4 text-xs text-destructive" role="alert">{ticketError}</p>
          ) : null}
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            The appeal opens a private chat with the Orthotopy team. Messages
            are end-to-end encrypted — only you and the team can read them.
          </p>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------ main dashboard
  const works = data?.works ?? [];
  const totals = data?.totals ?? { works: 0, views: 0, downloads: 0 };
  const stats = [
    { icon: Package, value: String(totals.works), label: "Total Works" },
    { icon: Eye, value: totals.views.toLocaleString("en-US"), label: "Views" },
    { icon: Download, value: totals.downloads.toLocaleString("en-US"), label: "Downloads" },
  ];

  const hasStats = totals.views > 0 || totals.downloads > 0;

  const buildChartData = (key: "views" | "downloads") => {
    const days = new Set<string>();
    for (const w of works) {
      for (const p of data?.series[w.id] ?? []) days.add(p.day);
    }
    return [...days].sort().map((day) => {
      const row: Record<string, string | number> = { day: day.slice(5) };
      for (const w of works) {
        const point = (data?.series[w.id] ?? []).find((x) => x.day === day);
        row[w.id] = point ? point[key] : 0;
      }
      return row;
    });
  };

  const viewsData = buildChartData("views");
  const downloadsData = buildChartData("downloads");

  const renderChart = (
    key: "views" | "downloads",
    chartData: Record<string, string | number>[],
    headline: string
  ) => (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{headline}</h2>
        {dataState === "loading" ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : null}
      </div>
      {works.length === 0 || chartData.length === 0 ? (
        <div className="mt-4 flex h-56 items-center justify-center rounded-xl border border-dashed p-4 text-center">
          <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
            No stats yet — once people start {key === "views" ? "viewing" : "downloading"}{" "}
            your works, the trend lines show up here, one per work.
          </p>
        </div>
      ) : (
        <div className="mt-4 text-muted-foreground">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="currentColor" strokeOpacity={0.15} vertical={false} />
              <XAxis
                dataKey="day"
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
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />
              {works.map((w) => (
                <Line
                  key={w.id}
                  type="monotone"
                  dataKey={w.id}
                  name={w.title}
                  stroke={workColor(w.id)}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 mx-auto size-[420px] rounded-full bg-emerald-500/10 blur-3xl"
      />
      <div className="relative mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        {/* Header — no names, no avatars, no emails */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your published works and how they&apos;re doing.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refreshAll()}
            disabled={dataState === "loading"}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Refresh
          </Button>
        </div>

        {dataState === "error" ? (
          <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
            We couldn&apos;t load your works — press Refresh to try again.
          </p>
        ) : null}

        {/* Stat blocks */}
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex items-center gap-4 rounded-2xl border bg-card p-5"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <stat.icon className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-2xl font-bold tabular-nums tracking-tight">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Works list */}
        <div className="mt-8 rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Your works</h2>
            <Button size="sm" onClick={publish}>
              <Rocket className="size-4" aria-hidden="true" />
              Publish a work
            </Button>
          </div>
          {works.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed p-6 text-center">
              <p className="text-sm font-medium">No works published yet</p>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                Submit your first one — it lands here immediately as
                &ldquo;pending&rdquo; and goes live in the catalog within
                24–48 hours once the review approves it.
              </p>
              <Button size="sm" variant="outline" className="mt-4" onClick={publish}>
                <Rocket className="size-4" aria-hidden="true" />
                Publish your first work
              </Button>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-border/60">
              {works.map((work) => {
                const color = workColor(work.id);
                const status = work.status;
                const statusBadge =
                  status === "pending"
                    ? { label: "Pending review", cls: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400" }
                    : status === "approved"
                      ? { label: "Live", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" }
                      : status === "taken_down"
                        ? { label: "Taken down", cls: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400" }
                        : status === "suspended"
                          ? { label: "Suspended", cls: "border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-400" }
                          : status === "banned"
                            ? { label: "Banned", cls: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400" }
                            : { label: status.replace("-", " ") || "Unknown", cls: "border-border bg-muted text-muted-foreground" };
                return (
                  <li key={work.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{work.title}</p>
                      {(work.description || work.tagline) ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {work.description || work.tagline}
                        </p>
                      ) : null}
                      {work.pendingUpdate ? (
                        <p className="mt-0.5 truncate text-xs text-sky-600 dark:text-sky-400">
                          Update request: &ldquo;{work.pendingUpdate.title}&rdquo; — awaiting review
                        </p>
                      ) : null}
                      {work.status === "suspended" && work.suspendedUntil ? (
                        <p className="mt-0.5 truncate text-xs text-orange-600 dark:text-orange-400">
                          Back live automatically on {fmtUntil(work.suspendedUntil)}
                        </p>
                      ) : null}
                      {work.modNote && ["taken_down", "suspended", "banned"].includes(work.status) ? (
                        <p className="mt-0.5 truncate text-xs text-red-600 dark:text-red-400">
                          Review note: {work.modNote}
                        </p>
                      ) : null}
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusBadge.cls}`}>
                      {statusBadge.label}
                    </span>
                    {work.pendingUpdate ? (
                      <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-600 dark:text-sky-400">
                        Update request
                      </span>
                    ) : null}
                    <span
                      className="rounded-full border px-2 py-0.5 text-[11px] font-medium"
                      style={{ borderColor: `${color}55`, color }}
                    >
                      {work.type || work.category}
                      {work.platform ? ` · ${work.platform}` : ""}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                      <Eye className="size-3.5" aria-hidden="true" />
                      {work.views.toLocaleString("en-US")}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                      <Download className="size-3.5" aria-hidden="true" />
                      {work.downloads.toLocaleString("en-US")}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={
                          work.pendingUpdate !== null ||
                          work.status !== "approved" ||
                          dataState === "loading"
                        }
                        title={
                          work.pendingUpdate
                            ? "An update request is already awaiting review"
                            : work.status !== "approved"
                              ? "Only live works can be updated"
                              : "Update title, description and download link"
                        }
                        onClick={() => openUpdateDialog(work)}
                      >
                        <Pencil className="size-3.5" aria-hidden="true" />
                        Update
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={dataState === "loading"}
                        onClick={() => setRemoveWork(work)}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        Remove
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Trend graphs */}
        <div className="mt-8 grid gap-4 xl:grid-cols-2">
          {renderChart("views", viewsData, "Views — last 30 days, per work")}
          {renderChart("downloads", downloadsData, "Downloads — last 30 days, per work")}
        </div>

        {hasStats ? (
          <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block size-2 rounded-full bg-emerald-500" aria-hidden="true" />
            Live counts — each work keeps its color across the list and both graphs.
          </p>
        ) : null}

        {/* Support tickets — linked, private, encrypted chats */}
        <div className="mt-8 rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Support tickets</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Private chats with the review — appeals, issues, questions.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void openNewTicket()} disabled={ticketBusy}>
              {ticketBusy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <LifeBuoy className="size-4" aria-hidden="true" />
              )}
              New support ticket
            </Button>
          </div>
          {ticketError ? (
            <p className="mt-3 text-xs text-destructive" role="alert">{ticketError}</p>
          ) : null}
          {tickets.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
              No tickets yet — if you ever need to appeal a decision or ask
              for help, open one here.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border/60">
              {tickets.map((ticket) => (
                <li key={ticket.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <LifeBuoy className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <a
                      className="truncate text-sm font-medium underline-offset-2 hover:underline"
                      href={`/support/${ticket.id}`}
                    >
                      {ticket.subject || ticket.id}
                    </a>
                    <p className="truncate text-xs text-muted-foreground">
                      opened{" "}
                      {ticket.createdAt
                        ? new Date(ticket.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })
                        : "—"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      ticket.status === "open"
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        : ticket.status === "answered"
                          ? "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400"
                          : "border-zinc-500/40 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400"
                    }`}
                  >
                    {ticket.status}
                  </span>
                  <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                    <a href={`/support/${ticket.id}`}>Open chat</a>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Monetization — placeholder card, nothing wired up */}
        <div className="mt-8 rounded-2xl border border-dashed bg-card/40 p-6 sm:p-10">
          <div className="text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-amber-500/10">
              <CircleDollarSign
                className="size-7 text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              />
            </span>
            <div className="mt-4 flex items-center justify-center gap-2">
              <h2 className="text-base font-semibold">Monetization</h2>
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                Coming soon
              </span>
            </div>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
              Earn from your works — day-by-day earnings tracking and payouts
              are on the roadmap. Nothing here is active yet.
            </p>
          </div>

          <div className="mt-6 space-y-3">
            {[
              {
                icon: TrendingUp,
                title: "Earnings overview",
                text: "See what each work earns per day, at a glance.",
              },
              {
                icon: HandCoins,
                title: "Payouts",
                text: "Cash out your balance whenever you're ready.",
              },
              {
                icon: Receipt,
                title: "Statements",
                text: "Downloadable earnings statements for your records.",
              },
            ].map((teaser) => (
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

      {/* Update request dialog — the live listing keeps running until the
          review approves or discards the change. */}
      <Dialog open={updateOpen} onOpenChange={setUpdateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Update “{updateWork?.title}”</DialogTitle>
            <DialogDescription>
              Your changes go to the review as an update request — the live
              listing stays unchanged until they&apos;re approved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="update-title">Title</Label>
              <Input
                id="update-title"
                value={updateForm.title}
                maxLength={80}
                onChange={(event) => setUpdateForm((f) => ({ ...f, title: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="update-description">Description</Label>
              <Textarea
                id="update-description"
                rows={5}
                maxLength={2000}
                value={updateForm.description}
                onChange={(event) => setUpdateForm((f) => ({ ...f, description: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="update-download">Download link</Label>
              <Input
                id="update-download"
                placeholder="https://github.com/you/your-repo/releases/…"
                value={updateForm.downloadUrl}
                onChange={(event) => setUpdateForm((f) => ({ ...f, downloadUrl: event.target.value }))}
              />
            </div>
            {updateError ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
                {updateError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateOpen(false)} disabled={updateBusy}>
              Cancel
            </Button>
            <Button onClick={() => void submitUpdate()} disabled={updateBusy || !updateForm.title.trim() || !updateForm.description.trim() || !updateForm.downloadUrl.trim()}>
              {updateBusy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Pencil className="size-4" aria-hidden="true" />
              )}
              Submit update request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation */}
      <AlertDialog
        open={removeWork !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveWork(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{removeWork?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The work comes off your dashboard and the public catalog right
              away, together with its stats. This cannot be undone — you can
              always publish it again from scratch.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={removeBusy}
              onClick={(event) => {
                event.preventDefault();
                void submitRemove();
              }}
            >
              {removeBusy ? "Removing…" : "Remove work"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
