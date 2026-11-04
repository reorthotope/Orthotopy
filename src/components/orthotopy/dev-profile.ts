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
  githubName: string | null;
  githubEmail: string | null;
  githubAvatarUrl: string | null;
  starred: boolean;
  publishAccess: boolean;
}

export const PROFILE_KEY = "orthotopy_dev_profile";
export const REPO_URL = "https://github.com/reorthotope/Orthotopy";

function normalizeProfile(raw: Partial<DevProfile> | null | undefined): DevProfile {
  return {
    githubConnected: Boolean(raw?.githubConnected),
    githubUsername: raw?.githubUsername || null,
    githubName: raw?.githubName || null,
    githubEmail: raw?.githubEmail || null,
    githubAvatarUrl: raw?.githubAvatarUrl || null,
    starred: Boolean(raw?.starred),
    publishAccess: Boolean(raw?.publishAccess),
  };
}

export function readCachedProfile(): DevProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    return normalizeProfile(JSON.parse(raw) as Partial<DevProfile>);
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
  /** True when the server has GITHUB_CLIENT_ID/SECRET set → OAuth connect. */
  oauthConfigured: boolean;
}

/** Fetches the live profile state with a bearer session token. */
export async function fetchProfile(token: string): Promise<ProfileFetchResult> {
  try {
    const res = await fetch("/api/profile", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (res.status === 401) {
      return { status: "unauthorized", profile: null, oauthConfigured: true };
    }
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      profile?: Partial<DevProfile>;
      githubOauth?: { configured?: boolean };
    } | null;
    if (res.ok && data?.ok && data.profile) {
      const profile = normalizeProfile(data.profile);
      cacheProfile(profile);
      return {
        status: "ok",
        profile,
        // Default true: an older backend without the flag still prefers OAuth.
        oauthConfigured: data.githubOauth?.configured !== false,
      };
    }
    return { status: "unreachable", profile: null, oauthConfigured: true };
  } catch {
    return { status: "unreachable", profile: null, oauthConfigured: true };
  }
}

export interface ProfileActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  profile?: DevProfile;
}

/** POSTs a profile action ("github-oauth-start" | "connect-github" | "check-star"). */
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
      authorizeUrl?: string;
      oauthConfigured?: boolean;
      profile?: Partial<DevProfile>;
    } | null;
    if (res.ok && data?.ok) {
      // check-star can legitimately return ok WITHOUT a profile (the star
      // isn't visible yet) — surface the server's message in that case.
      if (data.profile) {
        return {
          ok: true,
          message: data.message,
          profile: normalizeProfile(data.profile),
        };
      }
      return { ok: true, message: data.message };
    }
    return {
      ok: false,
      error: data?.error || "Something went wrong — please try again.",
      message: data?.oauthConfigured === false ? "oauth-unconfigured" : undefined,
    };
  } catch {
    return {
      ok: false,
      error: "Network error — we couldn't reach the server. Check your connection and try again.",
    };
  }
}

export interface OauthStartResult {
  ok: boolean;
  authorizeUrl?: string;
  /** True when the server answered that OAuth isn't configured yet. */
  notConfigured?: boolean;
  error?: string;
}

/**
 * Asks the server to mint a one-time OAuth state bound to this account and
 * returns the github.com authorize URL. The caller redirects the browser to
 * it; GitHub then comes back to /api/github/callback.
 */
export async function startGithubOauth(token: string): Promise<OauthStartResult> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  try {
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ action: "github-oauth-start", origin }),
    });
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      authorizeUrl?: string;
      error?: string;
      oauthConfigured?: boolean;
    } | null;
    if (res.ok && data?.ok && data.authorizeUrl) {
      return { ok: true, authorizeUrl: data.authorizeUrl };
    }
    return {
      ok: false,
      notConfigured: data?.oauthConfigured === false,
      error: data?.error || "We couldn't start the GitHub connection — please try again.",
    };
  } catch {
    return {
      ok: false,
      error: "Network error — we couldn't reach the server. Check your connection and try again.",
    };
  }
}
