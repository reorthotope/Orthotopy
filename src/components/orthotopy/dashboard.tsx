"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  Eye,
  Github,
  Loader2,
  Package,
  RefreshCw,
  Rocket,
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
import { Button } from "@/components/ui/button";
import { usePublish } from "./site-shell";
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
 * recorded as 'pending' by POST /api/works when the publish dialog opens the
 * catalog issue, and POST /api/track grows the graphs once the storefront
 * wires the beacons in.
 */

interface MyWork {
  id: string;
  title: string;
  tagline: string;
  kind: string;
  category: string;
  status: string;
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

  const refreshAll = useCallback(async () => {
    if (!auth?.token) return;
    const fresh = await loadProfile(auth.token);
    if (fresh) await loadDashboard(auth.token);
  }, [loadProfile, loadDashboard, auth]);

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
                &ldquo;pending&rdquo; and goes live in the catalog once the
                issue merges.
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
                const pending = work.status === "pending";
                return (
                  <li key={work.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{work.title}</p>
                      {work.tagline ? (
                        <p className="truncate text-xs text-muted-foreground">{work.tagline}</p>
                      ) : null}
                    </div>
                    {pending ? (
                      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                        Pending review
                      </span>
                    ) : null}
                    <span
                      className="rounded-full border px-2 py-0.5 text-[11px] font-medium"
                      style={{ borderColor: `${color}55`, color }}
                    >
                      {work.category}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                      <Eye className="size-3.5" aria-hidden="true" />
                      {work.views.toLocaleString("en-US")}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                      <Download className="size-3.5" aria-hidden="true" />
                      {work.downloads.toLocaleString("en-US")}
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
      </div>
    </div>
  );
}
