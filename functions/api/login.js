/**
 * POST /api/login
 *
 * Body: { identifier, password, turnstileToken }
 *   identifier — the username OR the email the account was registered with.
 *
 * Looks the account up in the same D1 `users` table that /api/verify writes
 * when registration completes, checks the salted PBKDF2 hash and returns the
 * profile on success. Unknown identifier and wrong password return the SAME
 * generic message so the endpoint can't be used to enumerate accounts.
 *
 * Bindings & variables:
 *   DB                   D1 database (schema: migrations/0001_users.sql, required)
 *   TURNSTILE_SECRET_KEY Turnstile secret (optional — check is skipped while unset)
 */

import {
  createSession,
  ensureProfileSchema,
  EMAIL_RE,
  json,
  verifyPassword,
  verifyTurnstile,
} from "./_shared.js";

export async function onRequestPost({ request, env }) {
  if (!env.DB || typeof env.DB.prepare !== "function") {
    return json({ error: "Server setup incomplete — the database (D1) is not connected yet." }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const ip = request.headers.get("cf-connecting-ip") || undefined;
  const human = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, String(body?.turnstileToken ?? ""), ip);
  if (!human) {
    return json({ error: "Human check failed — refresh the page and try again." }, 403);
  }

  const identifier = String(body?.identifier ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  if (!identifier || !password) {
    return json({ error: "Enter your username/email and your password." }, 400);
  }

  // Self-healing schema — identical to verify.js so a fresh D1 binding works
  // without a manual migration step.
  try {
    await ensureProfileSchema(env);
  } catch (err) {
    console.error(`login: d1 schema check failed: ${err && err.message}`);
    return json({ error: "Database not ready — run migrations/0001_users.sql on the D1 database." }, 500);
  }

  const isEmail = EMAIL_RE.test(identifier);
  let row = null;
  try {
    row = await env.DB.prepare(
      isEmail
        ? "SELECT nickname, username, email, password_hash, created_at FROM users WHERE email = ?1 LIMIT 1"
        : "SELECT nickname, username, email, password_hash, created_at FROM users WHERE username = ?1 LIMIT 1"
    )
      .bind(identifier)
      .first();
  } catch (err) {
    console.error(`login: d1 select failed: ${err && err.message}`);
    return json({ error: "We couldn't check your account — please try again in a moment." }, 500);
  }

  // Same message for "no such account" and "wrong password".
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return json(
      { error: "That username/email and password don't match an account." },
      401
    );
  }

  // SQLite stores "YYYY-MM-DD HH:MM:SS" (UTC); hand the client an ISO string.
  let createdAt = row.created_at || null;
  if (createdAt && !String(createdAt).includes("T")) {
    createdAt = `${String(createdAt).replace(" ", "T")}Z`;
  }

  // Session token so the client can call /api/profile (GitHub connect +
  // star check) and future account endpoints.
  let token = null;
  try {
    token = await createSession(env, row.username);
  } catch (err) {
    console.error(`login: session create failed: ${err && err.message}`);
  }

  return json({
    ok: true,
    token,
    user: {
      nickname: row.nickname,
      username: row.username,
      email: row.email,
      createdAt,
    },
  });
}
