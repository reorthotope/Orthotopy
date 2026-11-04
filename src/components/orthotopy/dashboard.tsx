"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  CheckCircle2,
  Code2,
  ExternalLink,
  Github,
  Loader2,
  Lock,
  LogOut,
  Package,
  RefreshCw,
  Rocket,
  Sparkles,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePublish } from "./site-shell";
import {
  fetchProfile,
  githubAvatarSrc,
  postProfileAction,
  readCachedProfile,
  clearCachedProfile,
  startGithubOauth,
  REPO_URL,
  type DevProfile,
  type ProfileActionResult,
} from "./dev-profile";

/**
 * Developer dashboard — the landing spot right after "Account created!".
 *
 * Auth model: signup/sign-in store a session in localStorage
 * (`orthotopy_dev_auth`, including a bearer token for /api/profile).
 *
 * Publishing gate: before the FIRST work can be published, the account must
 * (1) connect a GitHub profile and (2) star reorthotope/Orthotopy. Both are
 * verified server-side; until then the publish actions open the setup card
 * below and the publish dialog shows the checklist instead of the form.
 */

interface DevAuth {
  nickname: string;
  username: string;
  email: string;
  createdAt: string;
  token?: string;
}

const AUTH_KEY = "orthotopy_dev_auth";
const AUTH_EVENT = "orthotopy:auth";

function readAuth(): DevAuth | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DevAuth>;
    if (!parsed.username || !parsed.email) return null;
    return {
      nickname: parsed.nickname || parsed.username,
      username: parsed.username,
      email: parsed.email,
      createdAt: parsed.createdAt || new Date().toISOString(),
      token: parsed.token || "",
    };
  } catch {
    return null;
  }
}

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
  const [checkingStar, setCheckingStar] = useState(false);
  const checkingStarRef = useRef(false);
  const [starNote, setStarNote] = useState<string | null>(null);
  const [starNeedsReconnect, setStarNeedsReconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const setupRef = useRef<HTMLDivElement | null>(null);
  const oauthHandledRef = useRef(false);

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

  useEffect(() => {
    const next = readAuth();
    if (!next) {
      router.replace("/dev");
      return;
    }
    setAuth(next);
    setReady(true);
    void loadProfile();
  }, [router, loadProfile]);

  const signOut = () => {
    try {
      localStorage.removeItem(AUTH_KEY);
      clearCachedProfile();
      window.dispatchEvent(new Event(AUTH_EVENT));
    } catch {
      // ignore
    }
    router.replace("/");
  };

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
    } else {
      setConnectError(result.error || "We couldn't connect that — please try again.");
    }
  };

  const checkStar = useCallback(async (): Promise<ProfileActionResult | null> => {
    const current = readAuth();
    if (!current?.token || checkingStarRef.current) return null;
    checkingStarRef.current = true;
    setCheckingStar(true);
    setStarNote(null);
    const result = await postProfileAction(current.token, { action: "check-star" });
    checkingStarRef.current = false;
    setCheckingStar(false);
    if (result.ok) {
      setStarNeedsReconnect(false);
      if (result.profile) {
        setProfile(result.profile);
        setProfileState("live");
      }
      setStarNote(result.message || null);
    } else {
      setStarNeedsReconnect(result.reconnect === true);
      setStarNote(result.error || "We couldn't check just now — please try again.");
    }
    return result;
  }, []);

  // Disconnect the linked GitHub profile: clears the verified identity, the
  // stored OAuth token and every publishing-gate flag — publishing access is
  // taken back until the developer reconnects and re-stars.
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
      if (result.profile) {
        setProfile(result.profile);
        setProfileState("live");
      }
      setStarNote(null);
      setStarNeedsReconnect(false);
      setConnectError(null);
    } else {
      setConnectError(result.error || "We couldn't disconnect — please try again.");
    }
  };

  // Return leg of the GitHub OAuth round-trip: /api/github/callback bounces
  // back here with ?github=<flag>. Sync the profile, surface any error and —
  // per the publishing rule — auto-run the star check once, since most
  // developers star the repo while (or before) authorizing.
  useEffect(() => {
    if (!ready || !auth?.token || oauthHandledRef.current) return;
    const flag = new URLSearchParams(window.location.search).get("github");
    if (!flag) return;
    oauthHandledRef.current = true;
    window.history.replaceState({}, "", window.location.pathname);
    if (flag === "connected") {
      void (async () => {
        const fresh = await loadProfile();
        if (fresh?.githubConnected && !fresh.starred) {
          await checkStar();
        }
      })();
      return;
    }
    const messages: Record<string, string> = {
      denied: "You cancelled the GitHub authorization — nothing was changed. You can try again any time.",
      expired: "That GitHub link expired before it finished — press Connect with GitHub to try again.",
      invalid: "That GitHub link wasn't valid any more — press Connect with GitHub to try again.",
      taken: "That GitHub profile is already linked to another Orthotopy account.",
      unconfigured: "GitHub OAuth isn't configured yet — enter your username manually for now.",
      exchange: "We couldn't complete the GitHub handshake — please try again in a moment.",
      profile: "We reached GitHub but couldn't read your profile — please try again.",
      error: "Something went wrong linking your GitHub profile — please try again.",
    };
    setConnectError(
      messages[flag] || "Something went wrong connecting GitHub — please try again."
    );
  }, [ready, auth, loadProfile, checkStar]);

  const scrollToSetup = () =>
    setupRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

  const handlePublishClick = () => {
    if (profile?.publishAccess) {
      publish();
      return;
    }
    scrollToSetup();
  };

  if (!ready || !auth) {
    return (
      <div className="flex justify-center py-32" aria-label="Loading dashboard">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  const initial = auth.nickname.trim().charAt(0).toUpperCase() || "O";
  const joined = new Date(auth.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const unlocked = Boolean(profile?.publishAccess);

  const stats = [
    { icon: Package, value: "0", label: "works published" },
    { icon: Code2, value: "Developer", label: "your role" },
    { icon: Sparkles, value: "Free", label: "plan — forever" },
  ];

  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 mx-auto size-[420px] rounded-full bg-emerald-500/10 blur-3xl"
      />
      <div className="relative mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        {/* Welcome header */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <span
            className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-2xl font-bold text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          >
            {initial}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
              Welcome back, {auth.nickname}
            </h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="font-mono text-foreground">@{auth.username}</span>
              <span aria-hidden="true">·</span>
              <span className="truncate">{auth.email}</span>
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <BadgeCheck className="size-3.5" aria-hidden="true" />
                Email verified
              </span>
              <span aria-hidden="true">·</span>
              <span>Member since {joined}</span>
              {unlocked ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                    Publishing unlocked
                  </span>
                </>
              ) : null}
            </p>
          </div>
          <div className="sm:ml-auto">
            <Button variant="outline" onClick={signOut}>
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </div>

        {/* Dev profile setup — the gate before the first publish */}
        <div ref={setupRef} id="dev-profile-setup" className="mt-8 scroll-mt-24">
          {profileState === "unauthorized" ? (
            <div className="rounded-2xl border bg-card p-6 sm:p-8">
              <h2 className="text-lg font-semibold tracking-tight">
                Set up your dev profile
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Your session is out of date, so we can&#39;t sync your profile.
                Sign in again with your username/email and password — it takes
                seconds and your progress is kept.
              </p>
              <Button className="mt-4" asChild>
                <a href="/dev">Sign in again</a>
              </Button>
            </div>
          ) : unlocked ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Dev profile ready — publishing unlocked</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    GitHub connected{profile?.githubUsername ? ` as @${profile.githubUsername}` : ""}{" "}
                    · repository starred. Publish as many works as you like.
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={loadProfile}>
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Refresh status
              </Button>
            </div>
          ) : (
            <div className="rounded-2xl border bg-card p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                    <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
                    Set up your dev profile
                  </h2>
                  <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    Two quick steps before you publish your first work — connect
                    your GitHub profile and star the Orthotopy repository. Do it
                    once and publishing stays unlocked.
                  </p>
                </div>
                {profileState === "stale" ? (
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                    showing saved status
                  </span>
                ) : null}
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {/* Step 1 — connect GitHub */}
                <div className="rounded-2xl border bg-background p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold text-muted-foreground">
                        1
                      </span>
                      <Github className="size-4" aria-hidden="true" />
                      Connect your GitHub profile
                    </p>
                    {profile?.githubConnected ? (
                      <CheckCircle2
                        className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                        aria-label="GitHub connected"
                      />
                    ) : null}
                  </div>
                  {profile?.githubConnected ? (
                    <>
                      <div className="mt-3 flex items-start gap-3">
                        {profile.githubUsername ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={githubAvatarSrc(profile.githubUsername)}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="size-10 shrink-0 rounded-full border bg-muted"
                          />
                        ) : null}
                        <div className="min-w-0 text-sm">
                          <p className="flex flex-wrap items-center gap-x-2">
                            <span className="font-medium text-foreground">
                              {profile.githubName || `@${profile.githubUsername}`}
                            </span>
                            <a
                              href={`https://github.com/${profile.githubUsername}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 text-muted-foreground underline underline-offset-4 hover:no-underline"
                            >
                              @{profile.githubUsername}
                              <ExternalLink className="size-3" aria-hidden="true" />
                            </a>
                          </p>
                          {profile.githubEmail ? (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {profile.githubEmail}
                            </p>
                          ) : null}
                          <p className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                            <BadgeCheck className="size-3.5" aria-hidden="true" />
                            Identity verified via GitHub
                          </p>
                        </div>
                      </div>
                      {confirmDisconnect ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <p className="text-xs text-muted-foreground">
                            This unlinks your GitHub profile and takes back publishing access.
                          </p>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => void disconnectGithub()}
                            disabled={disconnecting}
                          >
                            {disconnecting ? "Disconnecting…" : "Yes, disconnect"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmDisconnect(false)}
                            disabled={disconnecting}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="mt-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-muted-foreground hover:text-destructive"
                            onClick={() => setConfirmDisconnect(true)}
                            disabled={disconnecting}
                          >
                            Disconnect GitHub
                          </Button>
                        </div>
                      )}
                    </>
                  ) : oauthConfigured === false ? (
                    <>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        GitHub OAuth isn&#39;t wired up yet, so for now we check
                        the username with GitHub directly — it has to be a real
                        account.
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
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
                          disabled={connecting || profileState === "unauthorized"}
                        />
                        <Button
                          type="button"
                          onClick={connectGithub}
                          disabled={connecting || profileState === "unauthorized"}
                        >
                          {connecting ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <Github className="size-4" aria-hidden="true" />
                          )}
                          {connecting ? "Connecting…" : "Connect"}
                        </Button>
                      </div>
                      {connectError ? (
                        <p className="mt-2 text-xs text-destructive" role="alert">
                          {connectError}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        Connect with GitHub once — we read your name, email and
                        avatar to verify your developer identity. Nothing is
                        posted and your repositories stay untouched.
                      </p>
                      <div className="mt-3">
                        <Button
                          type="button"
                          onClick={connectGithubOauth}
                          disabled={connecting || profileState === "unauthorized"}
                        >
                          {connecting ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <Github className="size-4" aria-hidden="true" />
                          )}
                          {connecting ? "Opening GitHub…" : "Connect with GitHub"}
                        </Button>
                      </div>
                      {connectError ? (
                        <p className="mt-2 text-xs text-destructive" role="alert">
                          {connectError}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>

                {/* Step 2 — star the repo */}
                <div className="rounded-2xl border bg-background p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold text-muted-foreground">
                        2
                      </span>
                      <Star className="size-4" aria-hidden="true" />
                      Star the Orthotopy repository
                    </p>
                    {profile?.starred ? (
                      <CheckCircle2
                        className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                        aria-label="Repository starred"
                      />
                    ) : null}
                  </div>
                  {profile?.starred ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Star confirmed — thanks for supporting the project!
                    </p>
                  ) : (
                    <>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        Stars are how the project grows. Open the repository,
                        press the Star button, then verify below.
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button type="button" variant="outline" asChild>
                          <a href={REPO_URL} target="_blank" rel="noreferrer">
                            <Github className="size-4" aria-hidden="true" />
                            Open repository
                            <ExternalLink className="size-3" aria-hidden="true" />
                          </a>
                        </Button>
                        <Button
                          type="button"
                          onClick={() => void checkStar()}
                          disabled={
                            checkingStar ||
                            !profile?.githubConnected ||
                            profileState === "unauthorized"
                          }
                        >
                          {checkingStar ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <Star className="size-4" aria-hidden="true" />
                          )}
                          {checkingStar ? "Checking…" : "I starred it — verify"}
                        </Button>
                      </div>
                      {!profile?.githubConnected ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Connect your GitHub profile first — that&#39;s how we
                          find your star.
                        </p>
                      ) : null}
                      {starNote ? (
                        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400" role="status">
                          {starNote}
                        </p>
                      ) : null}
                      {starNeedsReconnect ? (
                        <div className="mt-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={connectGithubOauth}
                            disabled={connecting}
                          >
                            {connecting ? (
                              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                            ) : (
                              <Github className="size-4" aria-hidden="true" />
                            )}
                            Reconnect GitHub
                          </Button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>

              {profileState === "none" || profileState === "stale" ? (
                <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={loadProfile}
                  >
                    <RefreshCw className="size-3" aria-hidden="true" />
                    Retry sync
                  </Button>
                  Couldn&#39;t reach the profile service just now.
                </p>
              ) : null}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border bg-card p-5">
              <stat.icon className="size-5 text-muted-foreground" aria-hidden="true" />
              <p className="mt-3 text-2xl font-semibold tracking-tight">{stat.value}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-5">
          {/* Quick actions */}
          <section aria-labelledby="dashboard-actions" className="lg:col-span-3">
            <h2 id="dashboard-actions" className="text-sm font-semibold">
              Quick actions
            </h2>
            <div className="mt-3 space-y-3">
              <button
                type="button"
                onClick={handlePublishClick}
                className="flex w-full items-center gap-4 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Rocket className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    Publish a work
                    {!unlocked ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                        <Lock className="size-3" aria-hidden="true" />
                        finish setup above
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {!unlocked
                      ? "Connect GitHub and star the repo to unlock publishing."
                      : "List your app, game, extension or anything else in the catalog."}
                  </span>
                </span>
              </button>
              <Link
                href="/"
                className="flex w-full items-center gap-4 rounded-2xl border bg-card p-4 transition-colors hover:bg-accent"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Package className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">Browse the catalog</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    See what other developers and creators have shipped.
                  </span>
                </span>
              </Link>
              <a
                href="https://github.com/reorthotope/Orthotopy"
                target="_blank"
                rel="noreferrer"
                className="flex w-full items-center gap-4 rounded-2xl border bg-card p-4 transition-colors hover:bg-accent"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <ExternalLink className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">Open the repository</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    Issues, roadmap and the open-source tooling behind Orthotopy.
                  </span>
                </span>
              </a>
            </div>
          </section>

          {/* Next steps */}
          <section aria-labelledby="dashboard-next" className="lg:col-span-2">
            <h2 id="dashboard-next" className="text-sm font-semibold">
              What&#39;s next
            </h2>
            <div className="mt-3 rounded-2xl border bg-card p-5">
              <ol className="space-y-3">
                {(unlocked
                  ? [
                      "Publish your first work and see it listed in the catalog.",
                      "Set up your developer profile — coming soon to this dashboard.",
                      "Say hi on GitHub and help shape the roadmap.",
                    ]
                  : [
                      "Connect your GitHub profile — step 1 above.",
                      "Star the Orthotopy repository — step 2 above.",
                      "Publish your first work once both are checked.",
                    ]
                ).map((step, index) => (
                  <li key={step} className="flex gap-3 text-sm">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="text-muted-foreground">{step}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-4 border-t pt-4 text-xs text-muted-foreground">
                Profile editing, work management and API keys are on the way — this
                dashboard grows with the platform.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
