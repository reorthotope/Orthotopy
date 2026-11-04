/**
 * GET  /api/profile
 *   Returns the signed-in developer's profile and the publishing-gate state
 *   (GitHub connected, repo starred, publish access) plus whether GitHub OAuth
 *   is configured. Requires a bearer session token from /api/login or
 *   /api/verify.
 *
 * POST /api/profile
 *   Body: { action: "github-oauth-start", origin? } — mints a one-time state
 *     bound to this account and returns the github.com authorize URL. The
 *     callback (/api/github/callback) links the verified GitHub identity.
 *   Body: { action: "connect-github", username }  — legacy manual fallback,
 *     only accepted while OAuth credentials are NOT configured; links the
 *     profile after checking with api.github.com that the account exists.
 *   Body: { action: "check-star" }                — scans the repository's
 *     public stargazers for the connected username; when found, flips
 *     publish_access to 1 so the account can publish works.
 *
 * Publishing rule: before the FIRST work can be published, the account must
 * have BOTH a connected GitHub profile AND a star on the Orthotopy repo.
 *
 * Bindings & variables:
 *   DB                  D1 database (required)
 *   CODES               KV namespace (required for OAuth state + caching;
 *                       optional otherwise)
 *   GITHUB_CLIENT_ID    OAuth App client id  ─┐ both set ⇒ OAuth connect is
 *   GITHUB_CLIENT_SECRET OAuth App client secret┘ enforced; unset ⇒ manual
 *                                              username fallback
 *   GITHUB_REPO          optional "owner/name" override (defaults to
 *                        reorthotope/Orthotopy; useful for local testing)
 *   GH_API_BASE / GITHUB_WEB_BASE  optional api.github.com / github.com
 *                        overrides for local mock tests — never set in prod
 */

import {
  ensureProfileSchema,
  GITHUB_OAUTH_SCOPES,
  getSessionUser,
  githubOauthConfig,
  githubRepo,
  githubWebBase,
  generateToken,
  json,
} from "./_shared.js";

/**
 * Override with the GH_API_BASE variable to point the lookups somewhere else
 * (private GitHub Enterprise, or a local mock during development). Defaults
 * to the public api.github.com; never set it in production.
 */
function ghApiBase(env) {
  const base = String(env?.GH_API_BASE ?? "").trim().replace(/\/+$/, "");
  return base || "https://api.github.com";
}

const GH_HEADERS = {
  accept: "application/vnd.github+json",
  "user-agent": "Orthotopy-Pages-Function", // GitHub API requires a UA
  // Unauthenticated GitHub API calls get 60/hour per IP from shared Pages
  // egress addresses — keep an identifiable UA so we can request more later.
};

const GH_USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,36}[a-zA-Z0-9])?$/;

function profilePayload(row) {
  const githubUsername = row.github_username ? String(row.github_username) : null;
  const starred = Boolean(row.starred_at);
  return {
    nickname: row.nickname,
    username: row.username,
    email: row.email,
    createdAt: row.created_at || null,
    githubConnected: Boolean(githubUsername),
    githubUsername,
    githubName: row.github_name ? String(row.github_name) : null,
    githubEmail: row.github_email ? String(row.github_email) : null,
    starred,
    publishAccess: row.publish_access === 1 || (Boolean(githubUsername) && starred),
  };
}

async function kvGet(env, key) {
  if (!env.CODES || typeof env.CODES.get !== "function") return null;
  return env.CODES.get(key);
}

async function kvPut(env, key, value, ttlSeconds) {
  if (!env.CODES || typeof env.CODES.put !== "function") return;
  // KV rejects expirationTtl below 60 — clamp so short-lived values simply
  // linger a little longer instead of failing the request.
  await env.CODES.put(key, value, { expirationTtl: Math.max(60, Math.floor(ttlSeconds)) });
}

export async function onRequestGet({ request, env }) {
  if (!env.DB || typeof env.DB.prepare !== "function") {
    return json({ error: "Server setup incomplete — the database (D1) is not connected yet." }, 500);
  }
  try {
    await ensureProfileSchema(env);
  } catch (err) {
    console.error(`profile: schema failed: ${err && err.message}`);
    return json({ error: "Database not ready — please try again in a moment." }, 500);
  }
  const user = await getSessionUser(env, request);
  if (!user) {
    return json({ error: "Your session has expired — sign in again to continue." }, 401);
  }
  const oauth = githubOauthConfig(env);
  return json({
    ok: true,
    profile: profilePayload(user),
    // Tells the dashboard whether to render the "Connect with GitHub" OAuth
    // button (true) or the manual-username fallback (false).
    githubOauth: { configured: oauth.configured },
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB || typeof env.DB.prepare !== "function") {
    return json({ error: "Server setup incomplete — the database (D1) is not connected yet." }, 500);
  }
  try {
    await ensureProfileSchema(env);
  } catch (err) {
    console.error(`profile: schema failed: ${err && err.message}`);
    return json({ error: "Database not ready — please try again in a moment." }, 500);
  }

  const user = await getSessionUser(env, request);
  if (!user) {
    return json({ error: "Your session has expired — sign in again to continue." }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const action = String(body?.action ?? "");

  // ------------------------------------------------------- connect github
  // Legacy manual path: kept ONLY while OAuth credentials are not configured
  // (so the site keeps working before GITHUB_CLIENT_ID/SECRET are added).
  // Once OAuth is on, identity must come from the GitHub authorization flow.
  if (action === "connect-github") {
    if (githubOauthConfig(env).configured) {
      return json(
        {
          error: "Connecting is done with the “Connect with GitHub” button now — it verifies your identity.",
          oauthRequired: true,
        },
        400
      );
    }
    const raw = String(body?.username ?? "").trim();
    if (!GH_USERNAME_RE.test(raw)) {
      return json(
        { error: "That doesn't look like a GitHub username — letters, numbers and single hyphens only." },
        400
      );
    }

    // Cache successful lookups so repeated connects don't burn API quota.
    const cacheKey = `gh:user:${raw.toLowerCase()}`;
    let login = null;
    const cached = await kvGet(env, cacheKey);
    if (cached) {
      login = cached;
    } else {
      let res;
      try {
        res = await fetch(
          `${ghApiBase(env)}/users/${encodeURIComponent(raw)}`,
          { headers: GH_HEADERS }
        );
      } catch {
        return json({ error: "We couldn't reach GitHub — please try again in a moment." }, 502);
      }
      if (res.status === 404) {
        return json(
          { error: "No GitHub account with that username — check the spelling and try again." },
          400
        );
      }
      if (!res.ok) {
        console.error(`profile: github user lookup failed: ${res.status}`);
        return json({ error: "GitHub lookup failed — please try again in a moment." }, 502);
      }
      const gh = await res.json().catch(() => null);
      login = String(gh?.login ?? "").toLowerCase();
      if (!login) {
        return json({ error: "GitHub lookup failed — please try again in a moment." }, 502);
      }
      await kvPut(env, cacheKey, login, 300);
    }

    // One GitHub profile can only be connected to one Orthotopy account.
    try {
      const clash = await env.DB
        .prepare("SELECT username FROM users WHERE github_username = ?1 AND username != ?2 LIMIT 1")
        .bind(login, user.username)
        .first();
      if (clash) {
        return json(
          { error: "That GitHub profile is already connected to another Orthotopy account." },
          409
        );
      }
      await env.DB
        .prepare(
          "UPDATE users SET github_username = ?1, github_connected_at = ?2 WHERE username = ?3"
        )
        .bind(login, new Date().toISOString(), user.username)
        .run();
    } catch (err) {
      console.error(`profile: connect github failed: ${err && err.message}`);
      return json({ error: "We couldn't save that — please try again in a moment." }, 500);
    }

    const fresh = await env.DB
      .prepare(
        "SELECT nickname, username, email, github_username, github_connected_at, github_name, github_email, starred_at, publish_access, created_at FROM users WHERE username = ?1"
      )
      .bind(user.username)
      .first();
    return json({ ok: true, profile: profilePayload(fresh ?? user) });
  }

  // ---------------------------------------------- start GitHub OAuth flow
  // Mints a one-time state bound to this account, stores it in KV and hands
  // back the github.com authorize URL. The browser is redirected there; GitHub
  // comes back to /api/github/callback, which exchanges the code and links
  // the verified profile to the account stored in the state.
  if (action === "github-oauth-start") {
    const oauth = githubOauthConfig(env);
    if (!oauth.configured) {
      return json(
        { error: "GitHub OAuth isn't configured yet.", oauthConfigured: false },
        400
      );
    }
    if (!env.CODES || typeof env.CODES.put !== "function") {
      console.error("profile: oauth start without CODES KV binding");
      return json(
        { error: "Server setup incomplete — the KV namespace (CODES) is not connected yet." },
        500
      );
    }

    // The OAuth round-trip must return to the SAME origin the developer is
    // signed in on (localStorage sessions are per-origin), so the callback
    // redirect_uri is derived from this request's own origin.
    let origin = String(body?.origin ?? "").trim();
    if (origin) {
      try {
        origin = new URL(origin).origin;
      } catch {
        origin = "";
      }
    }
    if (!origin) {
      try {
        origin = new URL(request.url).origin;
      } catch {
        return json({ error: "We couldn't work out where to send you back to." }, 400);
      }
    }
    const redirectUri = `${origin}/api/github/callback`;

    const state = generateToken();
    await env.CODES.put(
      `gh:oauth:state:${state}`,
      JSON.stringify({ username: user.username, origin, redirectUri }),
      { expirationTtl: 600 } // 10 minutes to finish the flow
    );

    const authorizeUrl =
      `${githubWebBase(env)}/login/oauth/authorize?response_type=code` +
      `&client_id=${encodeURIComponent(oauth.clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(GITHUB_OAUTH_SCOPES)}` +
      `&state=${encodeURIComponent(state)}` +
      `&allow_signup=true`;
    return json({ ok: true, authorizeUrl });
  }

  // ----------------------------------------------------------- check star
  if (action === "check-star") {
    if (!user.github_username) {
      return json(
        { error: "Connect your GitHub profile first — that's how we find your star." },
        400
      );
    }

    // Light throttle: the stargazer list is cached, but don't let one account
    // hammer the endpoint either. KV TTLs can't go below 60s, so the value
    // carries a timestamp and we enforce the 10s gap ourselves.
    const throttleKey = `star-check:${user.username}`;
    const lastCheck = Number(await kvGet(env, throttleKey)) || 0;
    if (lastCheck && Date.now() - lastCheck < 10_000) {
      return json(
        { error: "Hang on a few seconds, then check again." },
        429
      );
    }
    await kvPut(env, throttleKey, String(Date.now()), 60);

    const repo = githubRepo(env);
    const target = String(user.github_username).toLowerCase();
    let found = false;

    try {
      // Scan up to 5 pages (500 most recent stargazers). The list is newest
      // first, so a fresh star is on page 1; older stars need the extra pages.
      // Cached pages go stale after 20s: KV's floor TTL is 60s, but a developer
      // who just starred should not wait a minute, so the value carries its own
      // timestamp and older entries are simply refetched (the 10s per-account
      // throttle still caps worst-case GitHub usage).
      const STALE_MS = 20_000;
      for (let page = 1; page <= 5 && !found; page++) {
        const cacheKey = `gh:stars:${repo}:${page}`;
        let logins = null;
        const cached = await kvGet(env, cacheKey);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (
              parsed &&
              Array.isArray(parsed.logins) &&
              Date.now() - Number(parsed.t || 0) < STALE_MS
            ) {
              logins = parsed.logins;
            }
          } catch {
            // malformed cache entry — ignore it and refetch
          }
        }
        if (!logins) {
          let res;
          try {
            res = await fetch(
              `${ghApiBase(env)}/repos/${repo}/stargazers?per_page=100&page=${page}`,
              { headers: GH_HEADERS }
            );
          } catch {
            return json({ error: "We couldn't reach GitHub — please try again in a moment." }, 502);
          }
          if (res.status === 404) {
            return json({ error: `The repository ${repo} couldn't be found on GitHub.` }, 500);
          }
          if (!res.ok) {
            console.error(`profile: stargazers fetch failed: ${res.status}`);
            return json(
              { error: "GitHub lookup failed — please try again in a moment." },
              502
            );
          }
          const list = await res.json().catch(() => null);
          logins = Array.isArray(list)
            ? list.map((x) => String(x?.login ?? "").toLowerCase()).filter(Boolean)
            : [];
          await kvPut(env, cacheKey, JSON.stringify({ t: Date.now(), logins }), 60);
        }
        if (logins.includes(target)) found = true;
        if (logins.length < 100) break; // last page — no point scanning further
      }
    } catch (err) {
      console.error(`profile: star scan failed: ${err && err.message}`);
      return json({ error: "GitHub lookup failed — please try again in a moment." }, 502);
    }

    if (!found) {
      return json({
        ok: true,
        starred: false,
        message: `We can't see your star on ${repo} yet — make sure you're signed in to GitHub, star the repository, then check again in a few seconds.`,
      });
    }

    try {
      await env.DB
        .prepare(
          "UPDATE users SET starred_at = COALESCE(starred_at, ?1), publish_access = 1 WHERE username = ?2"
        )
        .bind(new Date().toISOString(), user.username)
        .run();
    } catch (err) {
      console.error(`profile: star save failed: ${err && err.message}`);
      return json({ error: "We couldn't save that — please try again in a moment." }, 500);
    }

    const fresh = await env.DB
      .prepare(
        "SELECT nickname, username, email, github_username, github_connected_at, github_name, github_email, starred_at, publish_access, created_at FROM users WHERE username = ?1"
      )
      .bind(user.username)
      .first();
    return json({ ok: true, starred: true, profile: profilePayload(fresh ?? user) });
  }

  return json({ error: "Unknown action." }, 400);
}
