"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Code2,
  ExternalLink,
  Package,
  Rocket,
  Sparkles,
  Loader2,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePublish } from "./site-shell";

/**
 * Developer dashboard — the landing spot right after "Account created!".
 *
 * Auth model (for now): the signup flow writes the session into
 * localStorage (`orthotopy_dev_auth`) once the email code is verified;
 * this page reads it and bounces unsigned visitors to /dev. A proper
 * server-session login can replace this later without changing the route.
 */

interface DevAuth {
  nickname: string;
  username: string;
  email: string;
  createdAt: string;
}

const AUTH_KEY = "orthotopy_dev_auth";

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

  useEffect(() => {
    const next = readAuth();
    if (!next) {
      router.replace("/dev");
      return;
    }
    setAuth(next);
    setReady(true);
  }, [router]);

  const signOut = () => {
    try {
      localStorage.removeItem(AUTH_KEY);
      window.dispatchEvent(new Event("orthotopy:auth"));
    } catch {
      // ignore
    }
    router.replace("/");
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

  const stats = [
    { icon: Package, value: "0", label: "works published" },
    { icon: Code2, value: "Developer", label: "your role" },
    { icon: Sparkles, value: "Free", label: "plan — forever" },
  ];

  const nextSteps = [
    "Set up your developer profile — coming soon to this dashboard.",
    "Publish your first work and see it listed in the catalog.",
    "Say hi on GitHub and help shape the roadmap.",
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
            </p>
          </div>
          <div className="sm:ml-auto">
            <Button variant="outline" onClick={signOut}>
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </Button>
          </div>
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
                onClick={publish}
                className="flex w-full items-center gap-4 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Rocket className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">Publish a work</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    List your app, game, extension or anything else in the catalog.
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
                {nextSteps.map((step, index) => (
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
