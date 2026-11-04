"use client";

/**
 * Account avatar + dropdown for signed-in developers, shown in the navbar in
 * place of the old "Dashboard" button.
 *
 * Auth is OAuth-only, so a session always carries a GitHub identity: the
 * avatar is the GitHub profile picture (derived from the login), the label
 * is @username. The dropdown shows the username, a developer-level
 * placeholder and navigation (Dashboard, Settings, Sign out).
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, LogOut, Settings, Sparkles } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AUTH_EVENT,
  clearAuth,
  clearCachedProfile,
  fetchProfile,
  githubAvatarSrc,
  readAuth,
  readCachedProfile,
  type DevProfile,
} from "./dev-profile";

const PROFILE_EVENT = "orthotopy:profile";

function initialsOf(username: string): string {
  const clean = username.replace(/[^a-zA-Z0-9]/g, "").trim();
  return (clean.slice(0, 2) || "?").toUpperCase();
}

export function AccountMenu() {
  const router = useRouter();
  const [account, setAccount] = useState<{ username: string; token: string } | null>(null);
  const [profile, setProfile] = useState<DevProfile | null>(null);

  const sync = useCallback(async () => {
    const current = readAuth();
    setAccount(current ? { username: current.username, token: current.token } : null);
    setProfile(readCachedProfile());
    if (!current?.token) return;
    const result = await fetchProfile(current.token);
    if (result.status === "ok" && result.profile) {
      setProfile(result.profile);
    } else if (result.status === "unauthorized") {
      // Session expired — drop the stale auth so the navbar falls back to
      // the Join CTA and the dashboard can show the sign-in flow again.
      clearAuth();
      clearCachedProfile();
      setAccount(null);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    void sync();
    const handler = () => void sync();
    window.addEventListener(AUTH_EVENT, handler);
    window.addEventListener(PROFILE_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(AUTH_EVENT, handler);
      window.removeEventListener(PROFILE_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, [sync]);

  if (!account) return null;

  const avatarSrc =
    profile?.githubConnected && profile.githubUsername
      ? githubAvatarSrc(profile.githubUsername)
      : null;

  const signOut = () => {
    clearAuth();
    clearCachedProfile();
    router.push("/");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="ml-1 flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/70 bg-accent text-[11px] font-semibold text-foreground outline-none transition-shadow hover:ring-2 hover:ring-ring/40 focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarSrc}
              alt=""
              referrerPolicy="no-referrer"
              className="size-full object-cover"
            />
          ) : (
            <span aria-hidden="true">{initialsOf(account.username)}</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium text-foreground">
            @{account.username}
          </span>
        </DropdownMenuLabel>
        {/* TODO: real developer levels — points/progression are planned but
            not implemented yet. Replace this placeholder badge with the
            computed level once the system lands. */}
        <div className="px-2 pb-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-accent/60 px-2 py-0.5 text-[11px] text-muted-foreground">
            <Sparkles className="size-3" aria-hidden="true" />
            Level 1 · Newcomer
          </span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/dashboard")}>
          <LayoutDashboard className="size-4" aria-hidden="true" />
          Dashboard
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/settings")}>
          <Settings className="size-4" aria-hidden="true" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={signOut}>
          <LogOut className="size-4" aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
