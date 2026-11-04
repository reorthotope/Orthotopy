/**
 * GET /api/github/callback — GitHub OAuth redirect URI.
 *
 * GitHub sends the developer back here with ?code=…&state=… after the
 * authorization prompt (or ?error=… when they cancel). The flow:
 *
 *   1. The state is looked up in KV — it was minted by
 *      POST /api/profile {action:"github-oauth-start"} and is bound to the
 *      Orthotopy username, the origin to return to and the redirect_uri used.
 *      It is one-time and expires after 10 minutes.
 *   2. The code is exchanged for an access token at github.com.
 *   3. The token reads the GitHub identity: GET /user (login, name) and
 *      GET /user/emails (primary verified email — scope user:email).
 *   4. The identity is written to the Orthotopy account (github_username,
 *      github_name, github_email). One GitHub profile can only ever be
 *      linked to one account. The avatar is NOT stored — the dashboard
 *      derives it from the login via https://github.com/<login>.png.
 *   5. The access token (scope read:user user:email — read-only, no repo
 *      access) is kept in KV for 30 days so /api/profile's star check can
 *      ask GitHub whether THIS account starred the repo; a star found now
 *      flips publish_access immediately.
 *   6. 302 back to <origin>/dashboard?github=connected — the dashboard sees
 *      the flag, re-syncs the profile and auto-runs the star check.
 *
 * The token is only used for the star check and identity read; it never
 * touches the D1 database and is deleted when the account disconnects.
 *
 * Bindings & variables (same project as /api/profile):
 *   DB                   D1 database (required)
 *   CODES                KV namespace (required — holds the OAuth state)
 *   GITHUB_CLIENT_ID     OAuth App client id (required)
 *   GITHUB_CLIENT_SECRET OAuth App client secret (required)
 *   GH_API_BASE / GITHUB_WEB_BASE  optional overrides for local mock tests
 */

import {
  ensureProfileSchema,
  githubOauthConfig,
  githubRepo,
  githubTokenKey,
  githubWebBase,
} from "../_shared.js";

const GH_HEADERS = {
  accept: "application/vnd.github+json",
  "user-agent": "Orthotopy-Pages-Function",
};

function ghApiBase(env) {
  const base = String(env?.GH_API_BASE ?? "").trim().replace(/\/+$/, "");
  return base || "https://api.github.com";
}

/** 302 back to the dashboard with a short ?github=… status flag. */
function redirectBack(origin, flag) {
  const target = `${String(origin || "").replace(/\/+$/, "")}/dashboard?github=${flag}`;
  return new Response(null, {
    status: 302,
    headers: { location: target, "cache-control": "no-store" },
  });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const ghError = url.searchParams.get("error") || "";

  const oauth = githubOauthConfig(env);
  const fallbackOrigin = url.origin;

  // The developer pressed "Cancel" on GitHub's prompt.
  if (ghError) {
    console.error(`github callback: denied: ${ghError}`);
    return redirectBack(fallbackOrigin, "denied");
  }
  if (!oauth.configured) {
    return redirectBack(fallbackOrigin, "unconfigured");
  }
  if (!code || !state || !env.CODES || typeof env.CODES.get !== "function") {
    return redirectBack(fallbackOrigin, "invalid");
  }

  // One-time state lookup — consume it immediately so it can't be replayed.
  const raw = await env.CODES.get(`gh:oauth:state:${state}`);
  if (!raw) {
    return redirectBack(fallbackOrigin, "expired");
  }
  await env.CODES.delete(`gh:oauth:state:${state}`);

  let saved = null;
  try {
    saved = JSON.parse(raw);
  } catch {
    saved = null;
  }
  const origin = String(saved?.origin ?? "") || fallbackOrigin;
  const username = String(saved?.username ?? "");
  const redirectUri = String(saved?.redirectUri ?? "") || `${url.origin}/api/github/callback`;
  if (!username) {
    return redirectBack(origin, "invalid");
  }

  // --- exchange the authorization code for an access token -------------
  let accessToken = "";
  try {
    const res = await fetch(`${githubWebBase(env)}/login/oauth/access_token`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        client_id: oauth.clientId,
        client_secret: oauth.clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    const data = await res.json().catch(() => null);
    accessToken = String(data?.access_token ?? "");
    if (!accessToken) {
      console.error(`github callback: token exchange failed: ${res.status} ${JSON.stringify(data?.error_description ?? data?.error ?? "")}`);
      return redirectBack(origin, "exchange");
    }
  } catch (err) {
    console.error(`github callback: token exchange threw: ${err && err.message}`);
    return redirectBack(origin, "exchange");
  }

  // --- read the verified GitHub identity -------------------------------
  const authHeaders = { ...GH_HEADERS, authorization: `Bearer ${accessToken}` };
  let ghUser = null;
  let primaryEmail = null;
  try {
    const userRes = await fetch(`${ghApiBase(env)}/user`, { headers: authHeaders });
    if (!userRes.ok) {
      console.error(`github callback: /user failed: ${userRes.status}`);
      return redirectBack(origin, "profile");
    }
    ghUser = await userRes.json().catch(() => null);
    if (!ghUser?.login) {
      return redirectBack(origin, "profile");
    }
    const emailRes = await fetch(`${ghApiBase(env)}/user/emails`, { headers: authHeaders });
    if (emailRes.ok) {
      const emails = await emailRes.json().catch(() => null);
      if (Array.isArray(emails)) {
        const primary = emails.find((e) => e && e.primary && e.verified) ||
          emails.find((e) => e && e.verified);
        primaryEmail = primary?.email ? String(primary.email) : null;
      }
    }
  } catch (err) {
    console.error(`github callback: identity fetch threw: ${err && err.message}`);
    return redirectBack(origin, "profile");
  }

  const login = String(ghUser.login).toLowerCase();

  // --- link the identity to the Orthotopy account ----------------------
  try {
    await ensureProfileSchema(env);
    const clash = await env.DB
      .prepare("SELECT username FROM users WHERE github_username = ?1 AND username != ?2 LIMIT 1")
      .bind(login, username)
      .first();
    if (clash) {
      console.error(`github callback: github profile ${login} already linked to ${clash.username}`);
      return redirectBack(origin, "taken");
    }
    await env.DB
      .prepare(
        `UPDATE users SET github_username = ?1, github_connected_at = ?2,
         github_name = ?3, github_email = ?4
         WHERE username = ?5`
      )
      .bind(
        login,
        new Date().toISOString(),
        ghUser.name ? String(ghUser.name) : null,
        primaryEmail,
        username
      )
      .run();
  } catch (err) {
    console.error(`github callback: db update failed: ${err && err.message}`);
    return redirectBack(origin, "error");
  }

  // Keep the access token in KV (30 days, refreshed on every connect) so the
  // star check can ask GitHub whether THIS account starred the repo. That
  // request is authenticated, so it never trips the challenges/rate limits
  // that break anonymous stargazer scans from datacenter egress.
  if (env.CODES && typeof env.CODES.put === "function") {
    try {
      await env.CODES.put(githubTokenKey(username), accessToken, {
        expirationTtl: 2_592_000, // 30 days
      });
    } catch (err) {
      console.error(`github callback: token store failed: ${err && err.message}`);
    }
  }

  // Best-effort star check while the token is at hand — a developer who
  // starred before connecting unlocks immediately. Any failure here is fine:
  // the dashboard's auto star check covers the rest.
  try {
    const starredRes = await fetch(`${ghApiBase(env)}/user/starred/${githubRepo(env)}`, {
      headers: { ...GH_HEADERS, authorization: `Bearer ${accessToken}` },
    });
    if (starredRes.status === 204) {
      await env.DB
        .prepare(
          "UPDATE users SET starred_at = COALESCE(starred_at, ?1), publish_access = 1 WHERE username = ?2"
        )
        .bind(new Date().toISOString(), username)
        .run();
    }
  } catch (err) {
    console.error(`github callback: star check failed: ${err && err.message}`);
  }

  return redirectBack(origin, "connected");
}
