"use client";

/**
 * Shared client-side helpers for the dev-profile publishing gate.
 *
 * The server (GET /api/profile) is the source of truth for whether an
 * account has connected GitHub + starred the repo (publishAccess). The last
 * confirmed state is cached in localStorage so the publish dialog and the
 * dashboard keep working across a failed request, and so a developer who
 * already unlocked publishing never gets blocked by a network hiccup.
 */

export interface DevProfile {
  githubConnected: boolean;
  githubUsername: string | null;
  starred: boolean;
  publishAccess: boolean;
}

export const PROFILE_KEY = "orthotopy_dev_profile";
export const REPO_URL = "https://github.com/reorthotope/Orthotopy";

export function readCachedProfile(): DevProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DevProfile>;
    return {
      githubConnected: Boolean(parsed.githubConnected),
      githubUsername: parsed.githubUsername || null,
      starred: Boolean(parsed.starred),
      publishAccess: Boolean(parsed.publishAccess),
    };
  } catch {
    return null;
  }
}

export function cacheProfile(profile: DevProfile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    window.dispatchEvent(new Event("orthotopy:profile"));
  } catch {
    // Storage unavailable (private mode) — fetches just won't cache.
  }
}

export function clearCachedProfile() {
  try {
    localStorage.removeItem(PROFILE_KEY);
    window.dispatchEvent(new Event("orthotopy:profile"));
  } catch {
    // ignore
  }
}

export interface ProfileFetchResult {
  status: "ok" | "unauthorized" | "unreachable";
  profile: DevProfile | null;
}

/** Fetches the live profile state with a bearer session token. */
export async function fetchProfile(token: string): Promise<ProfileFetchResult> {
  try {
    const res = await fetch("/api/profile", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (res.status === 401) return { status: "unauthorized", profile: null };
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      profile?: DevProfile;
    } | null;
    if (res.ok && data?.ok && data.profile) {
      const profile: DevProfile = {
        githubConnected: Boolean(data.profile.githubConnected),
        githubUsername: data.profile.githubUsername || null,
        starred: Boolean(data.profile.starred),
        publishAccess: Boolean(data.profile.publishAccess),
      };
      cacheProfile(profile);
      return { status: "ok", profile };
    }
    return { status: "unreachable", profile: null };
  } catch {
    return { status: "unreachable", profile: null };
  }
}

export interface ProfileActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  profile?: DevProfile;
}

/** POSTs a profile action ("connect-github" | "check-star") to /api/profile. */
export async function postProfileAction(
  token: string,
  body: Record<string, unknown>
): Promise<ProfileActionResult> {
  try {
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      message?: string;
      starred?: boolean;
      profile?: DevProfile;
    } | null;
    if (res.ok && data?.ok) {
      // check-star can legitimately return ok WITHOUT a profile (the star
      // isn't visible yet) — surface the server's message in that case.
      if (data.profile) {
        const profile: DevProfile = {
          githubConnected: Boolean(data.profile.githubConnected),
          githubUsername: data.profile.githubUsername || null,
          starred: Boolean(data.profile.starred),
          publishAccess: Boolean(data.profile.publishAccess),
        };
        cacheProfile(profile);
        return { ok: true, message: data.message, profile };
      }
      return { ok: true, message: data.message };
    }
    return { ok: false, error: data?.error || "Something went wrong — please try again." };
  } catch {
    return {
      ok: false,
      error: "Network error — we couldn't reach the server. Check your connection and try again.",
    };
  }
}
