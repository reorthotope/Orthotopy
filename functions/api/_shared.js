/**
 * Shared helpers for the Orthotopy Pages Functions.
 * Imported by functions/api/request-code.js, verify.js, login.js and profile.js.
 */

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";

export const CODE_TTL_SECONDS = 600; // codes live for 10 minutes
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 45_000;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_RE = /^\+?[0-9](?:[0-9\s-]{5,17})[0-9]$/;

// The repository developers must star before their first publish.
// Override with the GITHUB_REPO variable (e.g. for local testing).
export function githubRepo(env) {
  const repo = String(env?.GITHUB_REPO ?? "").trim();
  return /^[^\s/]+\/[^\s/]+$/.test(repo) ? repo : "reorthotope/Orthotopy";
}

// --- GitHub OAuth (the trusted way to connect a developer's identity) ---

/**
 * OAuth is active as soon as both GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET
 * are configured. Until then /api/profile keeps the manual-username fallback
 * so the site keeps working before the credentials are added.
 */
export function githubOauthConfig(env) {
  const clientId = String(env?.GITHUB_CLIENT_ID ?? "").trim();
  const clientSecret = String(env?.GITHUB_CLIENT_SECRET ?? "").trim();
  return { clientId, clientSecret, configured: Boolean(clientId && clientSecret) };
}

/**
 * Where the /login/oauth/authorize + /login/oauth/access_token endpoints live.
 * Defaults to github.com; override with GITHUB_WEB_BASE for local mock tests.
 */
export function githubWebBase(env) {
  const base = String(env?.GITHUB_WEB_BASE ?? "").trim().replace(/\/+$/, "");
  return base || "https://github.com";
}

export const GITHUB_OAUTH_SCOPES = "read:user user:email";

/**
 * KV key holding the developer's GitHub OAuth access token (scope
 * read:user user:email only). Stored by /api/github/callback so the star
 * check can ask GitHub directly whether THIS account starred the repo —
 * exact, and immune to the IP challenges/rate limits that hit anonymous
 * stargazer requests from datacenter egress (Cloudflare Workers included).
 * Deleted when the account disconnects GitHub.
 */
export function githubTokenKey(username) {
  return `gh:oauth:token:${String(username || "").toLowerCase()}`;
}

/**
 * Username policy (mirror of src/lib/verification.ts — keep both in sync):
 *  - always lowercase (the frontend lowercases as the user types)
 *  - 3–20 characters
 *  - lowercase letters, numbers, dots (.), hyphens (-) and underscores (_)
 *  - commas and spaces are never allowed
 *  - must START with a letter (no number, no symbol, no period)
 *  - must END with a letter or number (no symbol or period)
 *
 * Returns the specific reason when invalid, or null when acceptable.
 */
export function usernameError(raw) {
  const u = String(raw ?? "");
  if (!u) return "Choose a username.";
  if (/[A-Z]/.test(u)) return "Usernames are lowercase only.";
  if (/\s/.test(u)) return "Spaces are not allowed in usernames.";
  if (u.includes(",")) return "Commas are not allowed in usernames.";
  if (u.length < 3) return "Username must be at least 3 characters.";
  if (u.length > 20) return "Username can be at most 20 characters.";
  if (!/^[a-z0-9._-]+$/.test(u)) {
    return "Only lowercase letters, numbers, dots (.), hyphens (-) and underscores (_) are allowed.";
  }
  if (/[0-9]/.test(u.charAt(0))) return "Usernames can't start with a number.";
  if (!/^[a-z]/.test(u)) {
    return "Usernames must start with a letter — no symbols, dots or hyphens at the start.";
  }
  if (!/[a-z0-9]$/.test(u)) {
    return "Usernames can't end with a symbol or period — it must end with a letter or number.";
  }
  return null;
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function pick(alphabet) {
  return alphabet[crypto.getRandomValues(new Uint32Array(1))[0] % alphabet.length];
}

/**
 * 6-character code: 2 random letters (A-Z) then 4 random digits (0-9).
 * Same LLDDDD format as src/lib/verification.ts on the frontend.
 */
export function generateCode() {
  return (
    pick(LETTERS) +
    pick(LETTERS) +
    pick(DIGITS) +
    pick(DIGITS) +
    pick(DIGITS) +
    pick(DIGITS)
  );
}

/**
 * Turnstile is enforced as soon as TURNSTILE_SECRET_KEY is configured; until
 * then the check is skipped (test mode) so local dev and staging keep working.
 */
export async function verifyTurnstile(secret, token, ip) {
  if (!secret) return true;
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

export function codeEmailHtml(code) {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f5f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;padding:40px 36px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="font-size:20px;font-weight:700;color:#111827;padding-bottom:4px;">Orthotopy</td></tr>
        <tr><td style="font-size:14px;color:#374151;padding-bottom:24px;">Every work in its right place.</td></tr>
        <tr><td style="font-size:15px;color:#111827;padding-bottom:16px;">Your verification code:</td></tr>
        <tr><td align="center" style="padding-bottom:24px;">
          <div style="display:inline-block;font-size:34px;font-weight:700;letter-spacing:10px;color:#111827;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:12px;padding:16px 28px;">${code}</div>
        </td></tr>
        <tr><td style="font-size:13px;color:#6b7280;line-height:1.6;">This code expires in 10 minutes. Enter it on the Join the Dev Team page.<br/>If you didn&#39;t request it, you can safely ignore this email.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// --- password hashing: PBKDF2-SHA256 via WebCrypto (no runtime dependencies) ---
const PBKDF2_ITERATIONS = 100_000;

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex) {
  const clean = String(hex ?? "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Returns "pbkdf2-sha256$<iterations>$<salt-hex>$<hash-hex>". */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    key,
    256
  );
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(bits)}`;
}

/**
 * Constant-time check of a plain password against a stored
 * "pbkdf2-sha256$<iterations>$<salt-hex>$<hash-hex>" string (as written by
 * hashPassword / verify.js). Older or unknown formats simply fail.
 */
export async function verifyPassword(password, stored) {
  try {
    const parts = String(stored ?? "").split("$");
    if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return false;
    const iterations = Number.parseInt(parts[1], 10);
    if (!Number.isFinite(iterations) || iterations < 1 || iterations > 5_000_000) {
      return false;
    }
    const salt = hexToBytes(parts[2]);
    const expected = parts[3];
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(String(password ?? "")),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      key,
      256
    );
    const actual = bytesToHex(bits);
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) {
      diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

// --- sessions: opaque bearer tokens so profile endpoints know the caller ---

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Creates a session row and returns the bearer token. `expires_at` is stored
 * as an ISO-8601 UTC string so the lexicographic comparison in
 * getSessionUser works in SQLite.
 */
export async function createSession(env, username) {
  const token = generateToken();
  const now = new Date();
  await env.DB.prepare(
    "INSERT INTO sessions (token, username, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)"
  )
    .bind(
      token,
      username,
      now.toISOString(),
      new Date(now.getTime() + SESSION_TTL_MS).toISOString()
    )
    .run();
  return token;
}

/** Resolves the Authorization: Bearer header to a users row, or null. */
export async function getSessionUser(env, request) {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match || !env.DB || typeof env.DB.prepare !== "function") return null;
  try {
    return await env.DB.prepare(
      `SELECT u.nickname, u.username, u.email, u.github_username,
              u.github_connected_at, u.github_name, u.github_email,
              u.starred_at, u.publish_access, u.created_at
       FROM sessions s JOIN users u ON u.username = s.username
       WHERE s.token = ?1 AND s.expires_at > ?2
       LIMIT 1`
    )
      .bind(match[1], new Date().toISOString())
      .first();
  } catch {
    return null;
  }
}

/**
 * Self-healing schema for accounts + profile/publish-gate columns. Creating
 * the tables here means binding a fresh D1 database is enough — no manual
 * migration step required (mirrors migrations/0001_users.sql and
 * migrations/0002_github_profile.sql).
 */
export async function ensureProfileSchema(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      password_hash TEXT NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      github_username TEXT,
      github_connected_at TEXT,
      github_name TEXT,
      github_email TEXT,
      starred_at TEXT,
      publish_access INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )`
  ).run();
  // Older databases were created before the GitHub-profile columns existed.
  for (const sql of [
    "ALTER TABLE users ADD COLUMN github_username TEXT",
    "ALTER TABLE users ADD COLUMN github_connected_at TEXT",
    "ALTER TABLE users ADD COLUMN github_name TEXT",
    "ALTER TABLE users ADD COLUMN github_email TEXT",
    "ALTER TABLE users ADD COLUMN starred_at TEXT",
    "ALTER TABLE users ADD COLUMN publish_access INTEGER NOT NULL DEFAULT 0",
  ]) {
    try {
      await env.DB.prepare(sql).run();
    } catch (err) {
      const msg = String((err && err.message) || "");
      if (!/duplicate column|already exists/i.test(msg)) throw err;
    }
  }
}
