/**
 * GET /api/github/callback — GitHub OAuth redirect URI, and the ONLY door
 * into an Orthotopy account.
 *
 * GitHub sends the developer back here with ?code=…&state=… after the
 * authorization prompt (or ?error=… when they cancel). The flow:
 *
 *   1. The state is looked up in KV — it was minted by POST /api/session
 *      {action:"oauth-start"} and is bound to the origin to return to and
 *      the redirect_uri used. It is one-time and expires after 10 minutes.
 *      No account is bound: the GitHub authorization itself creates the
 *      account (or signs the developer back in).
 *   2. The code is exchanged for an access token at github.com.
 *   3. The token reads the GitHub identity: GET /user (login, name, id) and
 *      GET /user/emails (primary verified email — scope user:email).
 *   4. The account is upserted with username = GitHub login. Stored data:
 *      username, github_id, display name, email. Nothing else — no
 *      password exists in this system at all. The avatar is NOT stored; it
 *      is derived from the login via https://github.com/<login>.png.
 *   5. A 30-day session token is issued and kept in KV alongside the OAuth
 *      access token (read-only, no repo scope) so a follow-up star check
 *      can ask GitHub whether THIS account starred the repo.
 *   6. The session token travels back to the browser as a ONE-TIME code
 *      (2-minute TTL in KV) appended to the redirect:
 *      302 → <origin>/dashboard?github=connected&auth=<code>. The dashboard
 *      trades it for the token via POST /api/session {action:"exchange"}
 *      and keeps it in localStorage like any other session.
 *
 * Bindings & variables (same project as /api/profile):
 *   DB                   D1 database (required)
 *   CODES                KV namespace (required — OAuth state/login codes)
 *   GITHUB_CLIENT_ID     OAuth App client id (required)
 *   GITHUB_CLIENT_SECRET OAuth App client secret (required)
 *   GH_API_BASE / GITHUB_WEB_BASE  optional overrides for local mock tests
 */

import {
  createSession,
  ensureProfileSchema,
  githubOauthConfig,
  githubRepo,
  githubTokenKey,
  githubWebBase,
  generateToken,
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
function redirectBack(origin, flag, loginCode) {
  let target = `${String(origin || "").replace(/\/+$/, "")}/dashboard?github=${flag}`;
  if (loginCode) target += `&auth=${encodeURIComponent(loginCode)}`;
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
  const redirectUri = String(saved?.redirectUri ?? "") || `${url.origin}/api/github/callback`;

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

  // GitHub logins are case-insensitive; everything downstream keys on the
  // lowercase form.
  const login = String(ghUser.login).toLowerCase();

  // --- upsert the account (username = GitHub login) ---------------------
  try {
    await ensureProfileSchema(env);
    const now = new Date().toISOString();
    await env.DB
      .prepare(
        `INSERT INTO users (username, github_id, github_name, github_email,
                            publish_access, created_at, last_login_at)
         VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)
         ON CONFLICT(username) DO UPDATE SET
           github_id = excluded.github_id,
           github_name = excluded.github_name,
           github_email = excluded.github_email,
           last_login_at = excluded.last_login_at,
           publish_access = 1`
      )
      .bind(
        login,
        Number(ghUser.id) || null,
        ghUser.name ? String(ghUser.name) : null,
        primaryEmail,
        now
      )
      .run();
  } catch (err) {
    console.error(`github callback: db upsert failed: ${err && err.message}`);
    return redirectBack(origin, "error");
  }

  // Issue the Orthotopy session (30 days) and keep the GitHub access token
  // in KV so the star check can ask GitHub whether THIS account starred the
  // repo — an authenticated request that never trips the challenges/rate
  // limits that break anonymous stargazer scans from datacenter egress.
  let sessionToken = "";
  try {
    sessionToken = await createSession(env, login);
  } catch (err) {
    console.error(`github callback: session create failed: ${err && err.message}`);
    return redirectBack(origin, "error");
  }
  if (env.CODES && typeof env.CODES.put === "function") {
    try {
      await env.CODES.put(githubTokenKey(login), accessToken, {
        expirationTtl: 2_592_000, // 30 days, refreshed on every sign-in
      });
    } catch (err) {
      console.error(`github callback: token store failed: ${err && err.message}`);
    }
  }

  // Best-effort star check while the token is at hand — recorded for the
  // profile (starred_at). Any failure here is harmless.
  try {
    const starredRes = await fetch(`${ghApiBase(env)}/user/starred/${githubRepo(env)}`, {
      headers: { ...GH_HEADERS, authorization: `Bearer ${accessToken}` },
    });
    if (starredRes.status === 204) {
      await env.DB
        .prepare("UPDATE users SET starred_at = COALESCE(starred_at, ?1) WHERE username = ?2")
        .bind(new Date().toISOString(), login)
        .run();
    }
  } catch (err) {
    console.error(`github callback: star check failed: ${err && err.message}`);
  }

  // Hand the session to the browser through a one-time code (2 minutes) so
  // the long-lived token never sits in the address bar or browser history.
  let loginCode = "";
  if (env.CODES && typeof env.CODES.put === "function") {
    try {
      loginCode = generateToken();
      await env.CODES.put(
        `gh:oauth:login:${loginCode}`,
        JSON.stringify({ username: login, token: sessionToken }),
        { expirationTtl: 120 }
      );
    } catch (err) {
      console.error(`github callback: login code mint failed: ${err && err.message}`);
    }
  }
  if (!loginCode) {
    // Extremely unlikely (KV hiccup) — the dashboard just shows the gate
    // again and the developer taps the button once more.
    return redirectBack(origin, "connected");
  }

  return redirectBack(origin, "connected", loginCode);
}
