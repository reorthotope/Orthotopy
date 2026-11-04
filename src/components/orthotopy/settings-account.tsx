"use client";

/**
 * Account settings for the OAuth-only developer account.
 *
 * Shows what the account holds (all of it sourced from GitHub) and the two
 * levers that exist: sign out (keeps the account) and delete account (erases
 * the profile row, sessions, works, stats and the stored GitHub token —
 * leaving means leaving completely, because there is no password to keep).
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Github, Loader2, LogOut, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clearAuth,
  clearCachedProfile,
  fetchProfile,
  githubAvatarSrc,
  readAuth,
  type DevAuth,
  type DevProfile,
} from "./dev-profile";

type DeleteStage = "idle" | "confirm" | "deleting";

export function SettingsAccount() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [auth, setAuth] = useState<DevAuth | null>(null);
  const [profile, setProfile] = useState<DevProfile | null>(null);
  const [deleteStage, setDeleteStage] = useState<DeleteStage>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const current = readAuth();
    setAuth(current);
    setReady(true);
    if (!current?.token) return;
    let cancelled = false;
    void (async () => {
      const result = await fetchProfile(current.token);
      if (cancelled) return;
      if (result.status === "ok" && result.profile) {
        setProfile(result.profile);
      } else if (result.status === "unauthorized") {
        clearAuth();
        clearCachedProfile();
        setAuth(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = useCallback(() => {
    clearAuth();
    clearCachedProfile();
    router.push("/");
  }, [router]);

  const deleteAccount = useCallback(async () => {
    if (!auth?.token || deleteStage === "deleting") return;
    setDeleteStage("deleting");
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({ action: "delete-account" }),
      });
      if (res.ok) {
        clearAuth();
        clearCachedProfile();
        router.push("/");
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error || "We couldn't delete the account — please try again in a moment.");
    } catch {
      setError("Network error — we couldn't reach the server. Check your connection and try again.");
    }
    setDeleteStage("idle");
  }, [auth, deleteStage, router]);

  if (!ready) {
    return (
      <div className="flex justify-center py-16" aria-label="Loading settings">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  if (!auth?.token) {
    return (
      <div className="rounded-2xl border bg-card p-6 sm:p-8">
        <h2 className="text-lg font-semibold">Not signed in</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          There is no local account to configure — signing in with GitHub is
          the whole account. One tap on the dashboard button gets you in.
        </p>
        <Button className="mt-4" asChild>
          <a href="/dashboard">
            <Github className="size-4" aria-hidden="true" />
            Connect with GitHub
          </a>
        </Button>
      </div>
    );
  }

  const avatarSrc = profile?.githubUsername
    ? githubAvatarSrc(profile.githubUsername)
    : githubAvatarSrc(auth.username);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-card p-6 sm:p-8">
        <h2 className="text-lg font-semibold">Account</h2>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatarSrc}
            alt=""
            referrerPolicy="no-referrer"
            className="size-14 rounded-full border border-border/70 object-cover"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">@{auth.username}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {profile?.githubName ? `${profile.githubName} · ` : ""}
              Signed in via GitHub
              {profile?.githubEmail ? ` · ${profile.githubEmail}` : ""}
            </p>
          </div>
        </div>
        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          Everything stored about you comes straight from GitHub: username,
          display name and email. No password exists in this system, so there
          is nothing extra to protect or leak.
        </p>
        <div className="mt-5">
          <Button variant="outline" onClick={signOut}>
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-destructive">Danger zone</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Deleting the account erases everything tied to it on this site: the
          profile, your sessions, your recorded works and their stats, and the
          stored GitHub token. Works already merged into the public catalog
          stay in the catalog repository. Signing in with GitHub again starts
          a fresh account.
        </p>
        {error ? (
          <p className="mt-3 text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {deleteStage === "idle" ? (
            <Button
              variant="destructive"
              onClick={() => setDeleteStage("confirm")}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Delete my account and data
            </Button>
          ) : (
            <>
              <Button variant="destructive" onClick={() => void deleteAccount()} disabled={deleteStage === "deleting"}>
                {deleteStage === "deleting" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="size-4" aria-hidden="true" />
                )}
                {deleteStage === "deleting" ? "Deleting…" : "Yes, delete everything"}
              </Button>
              <Button variant="ghost" onClick={() => setDeleteStage("idle")} disabled={deleteStage === "deleting"}>
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
