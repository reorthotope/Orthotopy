/**
 * GET  /api/profile
 *   Returns the signed-in developer's profile. Requires the bearer session
 *   token that /api/github/callback issued — sessions only exist through a
 *   GitHub authorization, so a valid session already IS a verified identity.
 *
 * POST /api/profile
 *   Body: { action: "delete-account" } — removes the account and every piece
 *   of data tied to it (profile row, sessions, works, daily stats and the
 *   stored GitHub OAuth token). This is the "take my data back" switch that
 *   replaces the old disconnect flow: without a password to keep, leaving
 *   means leaving completely. Signing back in with GitHub starts a fresh
 *   account.
 *
 * Stored profile data (all of it sourced from GitHub): username = GitHub
 * login, github_id, display name, email. There are no passwords, nicknames
 * or locally chosen names anywhere in the system.
 *
 * Bindings & variables:
 *   DB                  D1 database (required)
 *   CODES               KV namespace (optional here — OAuth token cleanup)
 *   GITHUB_REPO          optional "owner/name" override (defaults to
 *                        reorthotope/Orthotopy; useful for local testing)
 */

import {
  ensureProfileSchema,
  getSessionUser,
  githubTokenKey,
  json,
} from "./_shared.js";

function profilePayload(row) {
  const connected = Boolean(row.last_login_at);
  return {
    username: row.username,
    // Kept for the navbar avatar: the login IS the GitHub identity.
    githubUsername: row.username,
    githubConnected: connected,
    githubName: row.github_name ? String(row.github_name) : null,
    githubEmail: row.github_email ? String(row.github_email) : null,
    starred: Boolean(row.starred_at),
    // Publishing unlocks with the verified GitHub identity — the OAuth
    // authorization IS the access (set on every sign-in).
    publishAccess: row.publish_access === 1 || connected,
  };
}

async function requireUser(env, request) {
  if (!env.DB || typeof env.DB.prepare !== "function") {
    return { error: json({ error: "Server setup incomplete — the database (D1) is not connected yet." }, 500) };
  }
  try {
    await ensureProfileSchema(env);
  } catch (err) {
    console.error(`profile: schema failed: ${err && err.message}`);
    return { error: json({ error: "Database not ready — please try again in a moment." }, 500) };
  }
  const user = await getSessionUser(env, request);
  if (!user) {
    return { error: json({ error: "Your session has expired — sign in with GitHub again to continue." }, 401) };
  }
  return { user };
}

export async function onRequestGet({ request, env }) {
  const { user, error } = await requireUser(env, request);
  if (error) return error;
  return json({ ok: true, profile: profilePayload(user) });
}

export async function onRequestPost({ request, env }) {
  const { user, error } = await requireUser(env, request);
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const action = String(body?.action ?? "");

  // ------------------------------------------------------- delete-account
  // OAuth-only accounts leave completely: profile row, sessions, works,
  // their daily stats and the stored GitHub token are all erased. A fresh
  // GitHub authorization starts a clean account afterwards.
  if (action === "delete-account") {
    const username = user.username;
    try {
      await env.DB.batch([
        env.DB
          .prepare(
            "DELETE FROM work_stats_daily WHERE work_id IN (SELECT id FROM works WHERE username = ?1)"
          )
          .bind(username),
        env.DB.prepare("DELETE FROM works WHERE username = ?1").bind(username),
        env.DB.prepare("DELETE FROM sessions WHERE username = ?1").bind(username),
        env.DB.prepare("DELETE FROM users WHERE username = ?1").bind(username),
      ]);
    } catch (err) {
      console.error(`profile: delete account failed: ${err && err.message}`);
      return json({ error: "We couldn't delete the account — please try again in a moment." }, 500);
    }
    try {
      if (env.CODES && typeof env.CODES.delete === "function") {
        await env.CODES.delete(githubTokenKey(username));
      }
    } catch {
      // best effort — the token expires on its own anyway
    }
    console.log(`profile: account deleted: ${username}`);
    return json({ ok: true, deleted: true });
  }

  return json({ error: "Unknown action." }, 400);
}
