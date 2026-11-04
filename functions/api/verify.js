/**
 * POST /api/verify
 *
 * Body: { email, code, username, password, turnstileToken } — no names collected
 * (phone is optional — the form does not collect it for now)
 *
 * Checks the emailed code, then creates the dev-team account row in D1 with a
 * salted PBKDF2 password hash. Codes are single-use and deleted on success.
 * On success a bearer session token is returned so the fresh account can use
 * the profile endpoints (GET/POST /api/profile) right away.
 *
 * Bindings & variables:
 *   CODES                KV namespace (required)
 *   DB                   D1 database (schema: migrations/0001_users.sql +
 *                        migrations/0002_github_profile.sql, required)
 *   TURNSTILE_SECRET_KEY Turnstile secret (optional — check is skipped while unset)
 */

import {
  CODE_TTL_SECONDS,
  EMAIL_RE,
  MAX_ATTEMPTS,
  PHONE_RE,
  createSession,
  ensureProfileSchema,
  hashPassword,
  json,
  usernameError,
  verifyTurnstile,
} from "./_shared.js";

function checkProfile(body) {
  // Names are not collected any more — identity is the username; GitHub
  // OAuth supplies the verified profile once connected.
  const username = String(body?.username ?? "").trim().toLowerCase();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const phone = String(body?.phone ?? "").trim();
  const password = String(body?.password ?? "");

  const errors = {};
  const usernameReason = usernameError(username);
  if (usernameReason) {
    errors.username = usernameReason;
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    errors.email = "Enter a valid email address, e.g. you@example.com.";
  }
  // Phone is optional for now (the form doesn't collect it); validate only when present.
  if (phone && !PHONE_RE.test(phone)) {
    errors.phone = "Include the country code, e.g. +1 555 000 1234.";
  }
  if (password.length < 8 || password.length > 200) {
    errors.password = "Use at least 8 characters.";
  }
  return { errors, values: { username, email, phone, password } };
}

export async function onRequestPost({ request, env }) {
  if (!env.CODES || typeof env.CODES.get !== "function") {
    return json({ error: "Server setup incomplete — the code store (KV) is not connected yet." }, 500);
  }
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

  const { errors, values } = checkProfile(body);
  if (Object.keys(errors).length > 0) {
    return json({ error: "Please fix the highlighted fields and try again.", fields: errors }, 400);
  }

  const key = `code:${values.email}`;
  const raw = await env.CODES.get(key);
  let record = null;
  if (raw) {
    try {
      record = JSON.parse(raw);
    } catch {
      record = null;
    }
  }
  if (!record || typeof record.code !== "string") {
    await env.CODES.delete(key);
    return json({ error: "That code isn't active any more — request a new one.", field: "code" }, 400);
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await env.CODES.delete(key);
    return json({ error: "Too many wrong attempts — request a fresh code.", field: "code" }, 429);
  }

  const submitted = String(body?.code ?? "").trim().toUpperCase();
  if (submitted !== record.code) {
    const attempts = (record.attempts ?? 0) + 1;
    const expiration = Number.isFinite(record.expiresAt)
      ? Math.floor(record.expiresAt / 1000)
      : Math.floor(Date.now() / 1000) + Math.min(CODE_TTL_SECONDS, 300);
    await env.CODES.put(key, JSON.stringify({ ...record, attempts }), { expiration });
    const left = Math.max(0, MAX_ATTEMPTS - attempts);
    if (left === 0) {
      return json({ error: "That code doesn't match and you're out of attempts — request a fresh code.", field: "code" }, 400);
    }
    return json(
      {
        error: `That code doesn't match — ${left} attempt${left === 1 ? "" : "s"} left.`,
        field: "code",
      },
      400
    );
  }

  // Code accepted — make sure the username/email are still free before hashing.
  try {
    // Self-healing schema: creating the tables here means binding a fresh D1
    // database is enough — no manual migration step required.
    await ensureProfileSchema(env);
    const taken = await env.DB
      .prepare("SELECT username, email FROM users WHERE username = ?1 OR email = ?2")
      .bind(values.username, values.email)
      .first();
    if (taken) {
      if (taken.username === values.username) {
        return json({ error: "That username is already taken — try another.", field: "username" }, 409);
      }
      return json({ error: "An application with that email already exists.", field: "email" }, 409);
    }
  } catch (err) {
    console.error(`verify: d1 select failed: ${err && err.message}`);
    return json({ error: "Database not ready — run migrations/0001_users.sql on the D1 database." }, 500);
  }

  const passwordHash = await hashPassword(values.password);
  try {
    await env.DB.prepare(
      // Names are no longer collected — an empty string keeps older databases
      // (where the column is NOT NULL) happy; new databases allow NULL too.
      "INSERT INTO users (nickname, username, email, phone, password_hash, email_verified) VALUES ('', ?1, ?2, ?3, ?4, 1)"
    )
      .bind(values.username, values.email, values.phone || null, passwordHash)
      .run();
  } catch (err) {
    const msg = String((err && err.message) || "");
    if (msg.includes("UNIQUE")) {
      if (msg.includes("username")) {
        return json({ error: "That username is already taken — try another.", field: "username" }, 409);
      }
      return json({ error: "An application with that email already exists.", field: "email" }, 409);
    }
    console.error(`verify: d1 insert failed: ${msg}`);
    return json({ error: "We couldn't save your application — please try again." }, 500);
  }

  await env.CODES.delete(key); // single-use

  // Hand the fresh account a session so the dashboard can call /api/profile
  // (GitHub connect + star check) without a second sign-in.
  let token = null;
  try {
    token = await createSession(env, values.username);
  } catch (err) {
    console.error(`verify: session create failed: ${err && err.message}`);
  }

  return json({ ok: true, token });
}
