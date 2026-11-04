"use client";

/**
 * Shared client-side helpers for the OAuth-only dev account.
 *
 * There is no signup or sign-in form: a GitHub authorization IS the account.
 * The browser keeps the session (username + bearer token) in localStorage
 * under AUTH_KEY. The long-lived token never travels in a URL — the OAuth
 * callback hands it over as a one-time code that exchangeSessionCode trades
 * for the real session via POST /api/session.
 *
 * The server (GET /api/profile) is the source of truth for the profile and
 * the publish gate. The last confirmed state is cached in localStorage so
 * the publish dialog and the dashboard keep working across a failed request.
 */

export const AUTH_KEY = "orthotopy_dev_auth";
export const AUTH_EVENT = "orthotopy:auth";
export const PROFILE_KEY = "orthotopy_dev_profile";
export const REPO_URL = "https://github.com/reorthotope/Orthotopy";

export interface DevProfile {
  githubConnected: boolean;
  githubUsername: string | null;
  githubName: string | null;
  githubEmail: string | null;
  starred: boolean;
  publishAccess: boolean;
}

export interface DevAuth {
  username: string;
  token: string;
  createdAt?: string;
}

/**
 * GitHub serves each member's avatar straight from their login —
 * https://github.com/<login>.png redirects to the CDN image. So the avatar
 * needs no database column: it is derived from the username (= the login).
 */
export function githubAvatarSrc(username: string): string {
  return `https://github.com/${encodeURIComponent(username)}.png`;
}

/** Reads the stored session, or null when signed out / malformed. */
export function readAuth(): DevAuth | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DevAuth>;
    if (!parsed.username) return null;
    return {
      username: parsed.username,
      token: parsed.token || "",
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

/** Writes the session and tells every listening component to re-sync. */
export function storeAuth(auth: DevAuth) {
  try {
    localStorage.setItem(
      AUTH_KEY,
      JSON.stringify({
        username: auth.username,
        token: auth.token,
        createdAt: auth.createdAt || new Date().toISOString(),
      })
    );
    window.dispatchEvent(new Event(AUTH_EVENT));
  } catch {
    // Storage unavailable (private mode) — the session just won't persist.
  }
}

export function clearAuth() {
  try {
    localStorage.removeItem(AUTH_KEY);
    window.dispatchEvent(new Event(AUTH_EVENT));
  } catch {
    // ignore
  }
}

function normalizeProfile(raw: Partial<DevProfile> | null | undefined): DevProfile {
  return {
    githubConnected: Boolean(raw?.githubConnected),
    githubUsername: raw?.githubUsername || null,
    githubName: raw?.githubName || null,
    githubEmail: raw?.githubEmail || null,
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
}

/** Fetches the live profile state with a bearer session token. */
export async function fetchProfile(token: string): Promise<ProfileFetchResult> {
  try {
    const res = await fetch("/api/profile", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (res.status === 401) {
      return { status: "unauthorized", profile: null };
    }
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      profile?: Partial<DevProfile>;
    } | null;
    if (res.ok && data?.ok && data.profile) {
      const profile = normalizeProfile(data.profile);
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

/** POSTs an authenticated profile action (currently "delete-account"). */
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
      profile?: Partial<DevProfile>;
    } | null;
    if (res.ok && data?.ok) {
      return {
        ok: true,
        message: data.message,
        profile: data.profile ? normalizeProfile(data.profile) : undefined,
      };
    }
    return {
      ok: false,
      error: data?.error || "Something went wrong — please try again.",
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
 * Asks the server to mint a one-time OAuth state and returns the github.com
 * authorize URL. No signed-in account is required — the GitHub authorization
 * itself creates (or finds) the account. The caller redirects the browser to
 * the URL; GitHub comes back to /api/github/callback, which lands on
 * /dashboard?github=connected&auth=<one-time-code>.
 */
export async function startGithubOauth(): Promise<OauthStartResult> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  try {
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "oauth-start", origin }),
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
      error: data?.error || "We couldn't start the GitHub sign-in — please try again.",
    };
  } catch {
    return {
      ok: false,
      error: "Network error — we couldn't reach the server. Check your connection and try again.",
    };
  }
}

export interface ExchangeResult {
  ok: boolean;
  auth?: DevAuth;
  error?: string;
}

/**
 * Trades the one-time code from the OAuth redirect for the real session and
 * stores it. Returns the stored auth so the caller can continue signed in.
 */
export async function exchangeSessionCode(code: string): Promise<ExchangeResult> {
  try {
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "exchange", code }),
    });
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      username?: string;
      token?: string;
      error?: string;
    } | null;
    if (res.ok && data?.ok && data.username && data.token) {
      const auth: DevAuth = { username: data.username, token: data.token };
      storeAuth(auth);
      return { ok: true, auth };
    }
    return { ok: false, error: data?.error || "We couldn't finish the sign-in — please try again." };
  } catch {
    return { ok: false, error: "Network error — we couldn't reach the server. Check your connection and try again." };
  }
}
