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
import { Input } from "@/components/ui/input";
import { usePublish } from "./site-shell";
import {
  fetchProfile,
  postProfileAction,
  readCachedProfile,
  clearCachedProfile,
  startGithubOauth,
  type DevProfile,
} from "./dev-profile";

/**
 * Developer dashboard.
 *
 * Auth model: signup/sign-in store a session in localStorage
 * (`orthotopy_dev_auth`, including a bearer token for the API).
 *
 * Access: the dashboard opens once a GitHub profile is connected via OAuth —
 * the verified identity IS the access. No names, emails or avatars live
 * here; identity lives in the navbar account menu.
 *
 * Content: three stat blocks (Total Works / Views / Downloads), the list of
 * published works with a per-work color tag, a publish button and two line
 * graphs (views, downloads) with one colored line per work. Data comes from
 * GET /api/my-works (D1 works + work_stats_daily); stats start at zero and
 * grow once POST /api/track is wired into the storefront.
 */

const AUTH_KEY = "orthotopy_dev_auth";
const AUTH_EVENT = "orthotopy:auth";

interface DevAuth {
  username: string;
  email: string;
  createdAt: string;
  token?: string;
}

interface MyWork {
  id: string;
  title: string;
  tagline: string;
  kind: string;
  category: string;
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

function readAuth(): DevAuth | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DevAuth>;
    if (!parsed.username || !parsed.email) return null;
    return {
      username: parsed.username,
      email: parsed.email,
      createdAt: parsed.createdAt || new Date().toISOString(),
      token: parsed.token || "",
    };
  } catch {
    return null;
  }
}

type DashboardState = "idle" | "loading" | "ok" | "unauthorized" | "error";

export function DeveloperDashboard() {
  const router = useRouter();
  const publish = usePublish();
  const [auth, setAuth] = useState<DevAuth | null>(null);
  const [ready, setReady] = useState(false);

  // Publishing-gate state
  const [profile, setProfile] = useState<DevProfile | null>(null);
  const [profileState, setProfileState] = useState<
    "loading" | "live" | "stale" | "unauthorized" | "none"
  >("loading");
  // null = unknown (assume OAuth); false = server said OAuth isn't set up yet
  // → show the manual-username fallback until GITHUB_CLIENT_ID/SECRET exist.
  const [oauthConfigured, setOauthConfigured] = useState<boolean | null>(null);
  const [ghInput, setGhInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const oauthHandledRef = useRef(false);

  // Dashboard data (works + stats)
  const [data, setData] = useState<DashboardData | null>(null);
  const [dataState, setDataState] = useState<DashboardState>("idle");

  const loadProfile = useCallback(async (): Promise<DevProfile | null> => {
    // Read straight from localStorage — this also runs on first mount, before
    // the `auth` state has been set, so the ref/state isn't reliable yet.
    const current = readAuth();
    if (!current) return null;
    if (!current.token) {
      // Signed up before sessions existed — the server can't confirm the
      // gate state, so fall back to the cache and ask for a re-sign-in.
      const cached = readCachedProfile();
      setProfile(cached);
      setProfileState(cached ? "stale" : "none");
      return cached;
    }
    setProfileState("loading");
    const result = await fetchProfile(current.token);
    setOauthConfigured(result.oauthConfigured);
    if (result.status === "ok" && result.profile) {
      setProfile(result.profile);
      setProfileState("live");
      return result.profile;
    }
    if (result.status === "unauthorized") {
      const cached = readCachedProfile();
      setProfile(cached);
      setProfileState(cached && cached.publishAccess ? "stale" : "unauthorized");
      return cached;
    }
    const cached = readCachedProfile();
    setProfile(cached);
    setProfileState(cached ? "stale" : "none");
    return cached;
  }, []);

  const loadDashboard = useCallback(async (token: string) => {
    setDataState("loading");
    try {
      const res = await fetch("/api/my-works", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        setDataState("unauthorized");
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

  useEffect(() => {
    const next = readAuth();
    if (!next) {
      router.replace("/dev");
      return;
    }
    setAuth(next);
    setReady(true);
  }, [router]);

  // Sync the profile once the session is known.
  useEffect(() => {
    if (!ready || !auth) return;
    void loadProfile();
  }, [ready, auth, loadProfile]);

  // Pull the works + stats once GitHub is connected.
  useEffect(() => {
    if (!auth?.token || !profile?.githubConnected) return;
    void loadDashboard(auth.token);
  }, [auth, profile?.githubConnected, loadDashboard]);

  const refreshAll = useCallback(async () => {
    const fresh = await loadProfile();
    if (fresh?.githubConnected && auth?.token) {
      await loadDashboard(auth.token);
    }
  }, [loadProfile, loadDashboard, auth]);

  // Return leg of the GitHub OAuth round-trip: /api/github/callback bounces
  // back here with ?github=<flag>. Connecting unlocks the dashboard — sync
  // the profile and surface any error on the connect card.
  useEffect(() => {
    if (!ready || !auth?.token || oauthHandledRef.current) return;
    const flag = new URLSearchParams(window.location.search).get("github");
    if (!flag) return;
    oauthHandledRef.current = true;
    window.history.replaceState({}, "", window.location.pathname);
    if (flag === "connected") {
      void refreshAll();
      return;
    }
    const messages: Record<string, string> = {
      denied: "You cancelled the GitHub authorization — nothing was changed. You can try again any time.",
      expired: "That GitHub link expired before it finished — press Connect with GitHub to try again.",
      invalid: "That GitHub link wasn't valid any more — press Connect with GitHub to try again.",
      taken: "That GitHub profile is already linked to another Orthotopy account.",
      unconfigured: "GitHub OAuth isn't configured yet — connect manually below for now.",
      exchange: "We couldn't complete the GitHub handshake — please try again in a moment.",
      profile: "We reached GitHub but couldn't read your profile — please try again.",
      error: "Something went wrong linking your GitHub profile — please try again.",
    };
    setConnectError(messages[flag] || "Something went wrong connecting GitHub — please try again.");
  }, [ready, auth, refreshAll]);

  const connectGithubOauth = async () => {
    if (connecting || !auth?.token) return;
    setConnecting(true);
    setConnectError(null);
    const result = await startGithubOauth(auth.token);
    if (result.ok && result.authorizeUrl) {
      // Full-page redirect to GitHub's authorize prompt; GitHub sends the
      // developer back to /api/github/callback, which links the verified
      // identity and returns to /dashboard?github=connected.
      window.location.assign(result.authorizeUrl);
      return;
    }
    setConnecting(false);
    if (result.notConfigured) {
      setOauthConfigured(false);
      setConnectError("GitHub OAuth isn't wired up yet — enter your username below for now.");
      return;
    }
    setConnectError(result.error || "We couldn't start the GitHub connection — please try again.");
  };

  const connectGithub = async () => {
    if (connecting || !auth?.token) return;
    const username = ghInput.trim();
    if (!username) {
      setConnectError("Enter your GitHub username first.");
      return;
    }
    setConnecting(true);
    setConnectError(null);
    const result = await postProfileAction(auth.token, {
      action: "connect-github",
      username,
    });
    setConnecting(false);
    if (result.ok && result.profile) {
      setProfile(result.profile);
      setProfileState("live");
      setGhInput("");
      if (auth.token) await loadDashboard(auth.token);
    } else {
      setConnectError(result.error || "We couldn't connect that — please try again.");
    }
  };

  // Disconnect revokes the dashboard access: the connect card comes back
  // until the developer reconnects.
  const disconnectGithub = async () => {
    const current = readAuth();
    if (!current?.token || disconnecting) return;
    setDisconnecting(true);
    const result = await postProfileAction(current.token, {
      action: "disconnect-github",
    });
    setDisconnecting(false);
    setConfirmDisconnect(false);
    if (result.ok) {
      setData(null);
      setDataState("idle");
      await loadProfile();
    } else {
      setConnectError(result.error || "We couldn't disconnect — please try again.");
    }
  };

  if (!ready || !auth) {
    return (
      <div className="flex justify-center py-32" aria-label="Loading dashboard">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  const connected = Boolean(profile?.githubConnected);
  const gatePending =
    profileState === "loading" || (profileState === "none" && !connected);

  // ---------------------------------------------------------------- gate
  if (!connected && !gatePending) {
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
            One authorization verifies your developer identity — your name and
            verified email come straight from GitHub and nothing is posted or
            touched in your repositories.
          </p>
          <div className="mt-6 flex justify-center">
            <Button onClick={connectGithubOauth} disabled={connecting}>
              {connecting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Github className="size-4" aria-hidden="true" />
              )}
              {connecting ? "Opening GitHub…" : "Connect with GitHub"}
            </Button>
          </div>
          {oauthConfigured === false ? (
            <div className="mt-6 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={ghInput}
                  onChange={(event) => setGhInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void connectGithub();
                    }
                  }}
                  placeholder="your-github-username"
                  spellCheck={false}
                  autoComplete="off"
                  className="min-w-44 flex-1"
                  disabled={connecting}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={connectGithub}
                  disabled={connecting}
                >
                  {connecting ? "Connecting…" : "Connect"}
                </Button>
              </div>
            </div>
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

  // ------------------------------------------------------------- loading
  if (gatePending) {
    return (
      <div className="flex justify-center py-32" aria-label="Loading your dashboard">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  if (profileState === "unauthorized") {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-xl rounded-2xl border bg-card p-6 sm:p-8">
          <h1 className="text-lg font-semibold tracking-tight">Session out of date</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Your session expired, so we can&#39;t load your dashboard. Sign in
            again — it takes seconds and everything is kept.
          </p>
          <Button className="mt-4" asChild>
            <a href="/dev">Sign in again</a>
          </Button>
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
              Your published works and how they&#39;re doing.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refreshAll()}
              disabled={dataState === "loading"}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Refresh
            </Button>
            {confirmDisconnect ? (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void disconnectGithub()}
                  disabled={disconnecting}
                >
                  {disconnecting ? "Disconnecting…" : "Yes, disconnect"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDisconnect(false)}
                  disabled={disconnecting}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setConfirmDisconnect(true)}
                disabled={disconnecting}
              >
                Disconnect GitHub
              </Button>
            )}
          </div>
        </div>

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
                Your works appear here once they&#39;re approved into the
                catalog — submit your first one to get started.
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
