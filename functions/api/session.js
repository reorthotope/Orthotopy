import {
  generateToken,
  githubOauthConfig,
  githubWebBase,
  GITHUB_OAUTH_SCOPES,
  json,
} from "./_shared.js";

/**
 * POST /api/session — the OAuth-only authentication endpoint.
 *
 * There is no signup and no sign-in form in this project: a GitHub
 * authorization IS the account. Two unauthenticated actions:
 *
 *   { action: "oauth-start", origin? } → mints a one-time state in KV and
 *     returns the github.com authorize URL. No account is required — the
 *     account is CREATED (or found) by the callback once GitHub verifies the
 *     identity.
 *   { action: "exchange", code } → trades the one-time code that
 *     /api/github/callback appended to the redirect URL for the session
 *     bearer token. One-time, 2-minute TTL, so the long-lived token never
 *     appears in the address bar or browser history.
 *
 * Bindings:
 *   CODES               KV namespace (required — OAuth state + login codes)
 *   GITHUB_CLIENT_ID    OAuth App client id  ─ both set ⇒ OAuth is offered
 *   GITHUB_CLIENT_SECRET OAuth App client secret ┘
 */

export async function onRequestPost({ request, env }) {
  if (!env.CODES || typeof env.CODES.put !== "function") {
    return json({ error: "Server setup incomplete — the KV namespace (CODES) is not connected yet." }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const action = String(body?.action ?? "");

  // --------------------------------------------------------- oauth-start
  if (action === "oauth-start") {
    const oauth = githubOauthConfig(env);
    if (!oauth.configured) {
      return json(
        { error: "GitHub sign-in isn't configured yet — it should be live shortly.", oauthConfigured: false },
        400
      );
    }

    // The OAuth round-trip must return to the SAME origin the developer
    // started on (localStorage sessions are per-origin), so the callback
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
      JSON.stringify({ origin, redirectUri }),
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

  // ------------------------------------------------------------ exchange
  if (action === "exchange") {
    const code = String(body?.code ?? "").trim();
    if (!code || code.length > 128) {
      return json({ error: "That sign-in link wasn't valid any more — press the GitHub button again." }, 400);
    }
    const key = `gh:oauth:login:${code}`;
    let raw = null;
    try {
      raw = await env.CODES.get(key);
    } catch {
      raw = null;
    }
    if (!raw) {
      return json(
        { error: "That sign-in link expired — press the GitHub button once more and you're in." },
        410
      );
    }
    // One-time: consume before answering so a replay is useless.
    try {
      await env.CODES.delete(key);
    } catch {
      // best effort
    }
    let saved = null;
    try {
      saved = JSON.parse(raw);
    } catch {
      saved = null;
    }
    const username = String(saved?.username ?? "");
    const token = String(saved?.token ?? "");
    if (!username || !token) {
      return json({ error: "That sign-in link wasn't valid any more — press the GitHub button again." }, 400);
    }
    return json({ ok: true, username, token });
  }

  return json({ error: "Unknown action." }, 400);
}
