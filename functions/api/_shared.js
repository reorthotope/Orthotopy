/**
 * Shared helpers for the Orthotopy Pages Functions.
 * Imported by functions/api/session.js, profile.js, works.js, my-works.js,
 * track.js, apex.js, support.js, report.js and github/callback.js.
 *
 * Auth model (OAuth-only): there is no signup, no sign-in form and no
 * password anywhere in the project. A developer joins by authorizing their
 * GitHub profile once; /api/github/callback upserts the account (username =
 * GitHub login, email = GitHub email) and issues the session token that the
 * browser keeps in localStorage as a bearer token.
 */

// The repository developers are asked to star before their first publish.
// Override with the GITHUB_REPO variable (e.g. for local testing).
export function githubRepo(env) {
  const repo = String(env?.GITHUB_REPO ?? "").trim();
  return /^[^\s/]+\/[^\s/]+$/.test(repo) ? repo : "reorthotope/Orthotopy";
}

// --- GitHub OAuth (the only way to create an account / sign in) -----------

/**
 * OAuth is active as soon as both GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET
 * are configured.
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
 * read:user user:email only). Stored by /api/github/callback so the callback
 * can ask GitHub directly whether THIS account starred the repo — exact, and
 * immune to the IP challenges/rate limits that hit anonymous stargazer
 * requests from datacenter egress (Cloudflare Workers included). Deleted
 * when the account is deleted.
 */
export function githubTokenKey(username) {
  return `gh:oauth:token:${String(username || "").toLowerCase()}`;
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

export function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// --- D1 read replication (Sessions API) ------------------------------------
//
// The production database runs with D1 read replication enabled (dashboard:
// D1 → database → Settings → Enable Read Replication; or REST API:
// PUT /accounts/{id}/d1/database/{db_id} {"read_replication":{"mode":"auto"}}).
// Writes always execute on the primary; unconstrained reads may be served by
// the nearest read replica, which keeps replica traffic off the primary and
// serves viewers from the closest region.
//
// Two helpers pick the routing per endpoint:
//   primaryDb(env) — every read in the request is pinned to the primary
//     (read-your-writes). Used for anything auth- or account-related, where
//     a replica a few hundred ms behind would surface as "my fresh session
//     doesn't exist" or "the work I just published is missing".
//   viewerDb(env)  — unconstrained session; reads may come from a replica.
//     Used for the public viewer reads (catalog feed) where a second of
//     eventual consistency is invisible.
// With replication disabled both behave exactly like env.DB — so the code
// is safe before and after the feature is switched on, and in local dev
// (miniflare implements withSession as a pass-through; served_by_* are
// undefined there).

/** D1 session pinned to the primary for read-your-writes consistency. */
export function primaryDb(env) {
  if (env?.DB && typeof env.DB.withSession === "function") {
    try {
      return env.DB.withSession("first-primary");
    } catch {
      // Older binding without the Sessions API — plain database object.
    }
  }
  return env.DB;
}

/** D1 session allowed to serve reads from the nearest read replica. */
export function viewerDb(env) {
  if (env?.DB && typeof env.DB.withSession === "function") {
    try {
      return env.DB.withSession("first-unconstrained");
    } catch {
      // Older binding without the Sessions API — plain database object.
    }
  }
  return env.DB;
}

/** Best-effort client IP for per-IP KV rate limits and dedupe windows. */
export function clientIp(request) {
  const raw =
    String(request?.headers?.get("cf-connecting-ip") ?? "") ||
    String(request?.headers?.get("x-forwarded-for") ?? "");
  return raw.split(",")[0].trim() || "unknown";
}

/**
 * Fixed-window per-IP rate limit backed by the CODES KV namespace.
 * Returns true when the call is allowed. Without KV every call is allowed —
 * the endpoints stay functional, just unthrottled.
 */
export async function rateLimit(env, request, bucket, max, windowSeconds) {
  if (
    !env?.CODES ||
    typeof env.CODES.get !== "function" ||
    typeof env.CODES.put !== "function"
  ) {
    return true;
  }
  const key = `rl:${bucket}:${clientIp(request)}`;
  let current = 0;
  try {
    current = Number((await env.CODES.get(key)) ?? 0);
  } catch {
    return true;
  }
  if (Number.isFinite(current) && current >= max) return false;
  try {
    await env.CODES.put(key, String(current + 1), { expirationTtl: windowSeconds });
  } catch {
    // A lost increment only weakens the throttle — never block the request.
  }
  return true;
}

// --- sessions: opaque bearer tokens so profile endpoints know the caller ---

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

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

/**
 * Resolves the Authorization: Bearer header to a users row, or null.
 *
 * Pinned to the primary: the session row may have been written seconds ago
 * by the OAuth callback, and a stale replica must never 401 a developer
 * who just signed in.
 */
export async function getSessionUser(env, request) {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match || !env.DB || typeof env.DB.prepare !== "function") return null;
  try {
    return await primaryDb(env).prepare(
      `SELECT u.username, u.github_id, u.github_name, u.github_email,
              u.starred_at, u.publish_access, u.created_at, u.last_login_at,
              u.mod_state, u.mod_reason, u.mod_until
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
 * True when the x-apex-token header holds a live console session (a 12-hour
 * opaque KV token minted by POST /api/apex action "login"). Shared by the
 * apex endpoint and by the support-thread endpoints, where a console
 * session grants staff access to an appeal chat.
 */
export async function apexSessionValid(env, request) {
  if (!env?.CODES || typeof env.CODES.get !== "function") return false;
  const provided = String(request.headers.get("x-apex-token") ?? "").trim();
  if (!provided || provided.length > 200) return false;
  try {
    const value = await env.CODES.get(`apex:session:${provided}`);
    return Boolean(value);
  } catch {
    return false;
  }
}

/**
 * Resolves the moderation state of an account row (mod_state / mod_reason /
 * mod_until) into a normalized shape every endpoint can act on:
 *   { state: 'ok' | 'suspended' | 'banned', reason, until, blocked, expired }
 *
 * A suspension whose date+time has passed resolves to 'ok' (blocked=false,
 * expired=true) — the account auto-un-suspends on its next dashboard visit;
 * endpoints may then lazily clear the columns (profile.js does).
 */
export function resolveModState(user) {
  const state = String(user?.mod_state || "ok");
  const reason = String(user?.mod_reason || "");
  const until = user?.mod_until ? String(user.mod_until) : "";
  if (state !== "suspended" && state !== "banned") {
    return { state: "ok", reason: "", until: null, blocked: false, expired: false };
  }
  if (state === "suspended" && until && until <= new Date().toISOString()) {
    return { state: "ok", reason: "", until: null, blocked: false, expired: true };
  }
  return { state, reason, until: until || null, blocked: true, expired: false };
}

/** 403-shaped response payload for a moderated account, for json(). */
export function modErrorResponse(mod) {
  const label = mod.state === "banned" ? "banned" : "suspended";
  const until = mod.until ? ` until ${mod.until}` : "";
  return json(
    {
      error: `Your account is ${label}${until}. You can still open your dashboard to see the details and appeal.`,
      mod: { state: mod.state, reason: mod.reason, until: mod.until },
    },
    403
  );
}

/**
 * Validates an incoming encrypted-support-message blob. Messages are
 * END-TO-END encrypted in the browser (AES-256-GCM, key derived per ticket
 * from the ticket's secret link) — this server stores the opaque ciphertext
 * and never sees plaintext. The blob format is versioned so the client can
 * evolve it:  "v1:<iv base64>:<ciphertext base64>".
 */
export function isValidMessageCipher(raw) {
  const value = String(raw ?? "");
  if (!value.startsWith("v1:") || value.length < 12 || value.length > 12000) return false;
  const parts = value.split(":");
  if (parts.length !== 3) return false;
  const [, iv, ct] = parts;
  // WebCrypto's AES-GCM default IV is 12 bytes — exactly 16 unpadded base64
  // chars. Accept optional stray padding but require the 16-char body.
  return /^[A-Za-z0-9+/]{16}=*$/.test(iv) && /^[A-Za-z0-9+/]+=*$/.test(ct);
}

/**
 * Self-healing schema for OAuth-only accounts + published works. Creating
 * the tables here means binding a fresh D1 database is enough — no manual
 * migration step required.
 *
 * The users table holds ONLY what GitHub told us: username (= GitHub login),
 * github_id, display name and email. No passwords, no nicknames, no locally
 * chosen names — nothing to leak. Databases from the signup/sign-in era are
 * rebuilt in place: password/nickname columns are dropped for good and
 * GitHub-linked accounts keep working under their GitHub login.
 *
 * Schema probes read through the primary-pinned session so a lagging read
 * replica can never report a column/table as missing and trigger a
 * redundant (or misleading) migration branch.
 */

// D1's client API has no reliable PRAGMA, so the table shape is detected by
// probing columns. The result is memoized per isolate — after the first
// successful pass the checks are skipped entirely.
let schemaReady = false;

/** false when the works table is missing the column, true when selectable. */
async function probeWorksColumn(env, column) {
  try {
    await primaryDb(env).prepare(`SELECT ${column} FROM works LIMIT 1`).all();
    return true;
  } catch {
    return false;
  }
}

/** true: column selectable; "no-table": users table missing; false: no column. */
async function probeColumn(env, column) {
  try {
    await primaryDb(env).prepare(`SELECT ${column} FROM users LIMIT 1`).all();
    return true;
  } catch (err) {
    const msg = String((err && err.message) || err);
    if (/no such table/i.test(msg)) return "no-table";
    return false;
  }
}

export async function ensureProfileSchema(env) {
  if (schemaReady) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )`
  ).run();
  // Published works owned by accounts. Rows are inserted by POST /api/works
  // when a developer submits a work (status 'pending' until the review
  // approves it); the dashboard reads them through /api/my-works. Screenshots
  // are never uploaded — they live in the work's own GitHub repo as
  // img.png, img1.png … img9.png and are detected from the repo contents.
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS works (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      title TEXT NOT NULL,
      tagline TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'Developer',
      category TEXT NOT NULL DEFAULT 'Other',
      icon TEXT NOT NULL DEFAULT 'sparkles',
      gradient TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      description TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT '',
      platform TEXT NOT NULL DEFAULT '',
      repo_url TEXT NOT NULL DEFAULT '',
      repo_owner TEXT NOT NULL DEFAULT '',
      repo_name TEXT NOT NULL DEFAULT '',
      download_url TEXT NOT NULL DEFAULT '',
      images TEXT NOT NULL DEFAULT '[]',
      reviewed_at TEXT,
      pending_title TEXT NOT NULL DEFAULT '',
      pending_description TEXT NOT NULL DEFAULT '',
      pending_download_url TEXT NOT NULL DEFAULT '',
      pending_requested_at TEXT,
      suspended_until TEXT,
      mod_note TEXT NOT NULL DEFAULT ''
    )`
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_works_username ON works(username)"
  ).run();
  // Databases created before the pending/live distinction: add the status
  // column in place.
  try {
    await env.DB.prepare("SELECT status FROM works LIMIT 1").all();
  } catch {
    try {
      await env.DB.prepare(
        "ALTER TABLE works ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'"
      ).run();
    } catch (err) {
      const msg = String((err && err.message) || "");
      if (!/duplicate column|already exists/i.test(msg)) throw err;
    }
  }
  // Columns for the direct publish flow (title + description + repo +
  // download link + repo-hosted screenshots). Older databases get them
  // in place; fresh databases already have them from the CREATE above —
  // the probe makes both shapes converge.
  for (const [col, ddl] of [
    ["description", "ALTER TABLE works ADD COLUMN description TEXT NOT NULL DEFAULT ''"],
    ["type", "ALTER TABLE works ADD COLUMN type TEXT NOT NULL DEFAULT ''"],
    ["platform", "ALTER TABLE works ADD COLUMN platform TEXT NOT NULL DEFAULT ''"],
    ["repo_url", "ALTER TABLE works ADD COLUMN repo_url TEXT NOT NULL DEFAULT ''"],
    ["repo_owner", "ALTER TABLE works ADD COLUMN repo_owner TEXT NOT NULL DEFAULT ''"],
    ["repo_name", "ALTER TABLE works ADD COLUMN repo_name TEXT NOT NULL DEFAULT ''"],
    ["download_url", "ALTER TABLE works ADD COLUMN download_url TEXT NOT NULL DEFAULT ''"],
    ["images", "ALTER TABLE works ADD COLUMN images TEXT NOT NULL DEFAULT '[]'"],
    ["logo_file", "ALTER TABLE works ADD COLUMN logo_file TEXT NOT NULL DEFAULT ''"],
    ["reviewed_at", "ALTER TABLE works ADD COLUMN reviewed_at TEXT"],
    ["pending_title", "ALTER TABLE works ADD COLUMN pending_title TEXT NOT NULL DEFAULT ''"],
    ["pending_description", "ALTER TABLE works ADD COLUMN pending_description TEXT NOT NULL DEFAULT ''"],
    ["pending_download_url", "ALTER TABLE works ADD COLUMN pending_download_url TEXT NOT NULL DEFAULT ''"],
    ["pending_requested_at", "ALTER TABLE works ADD COLUMN pending_requested_at TEXT"],
    ["suspended_until", "ALTER TABLE works ADD COLUMN suspended_until TEXT"],
    ["mod_note", "ALTER TABLE works ADD COLUMN mod_note TEXT NOT NULL DEFAULT ''"],
  ]) {
    if ((await probeWorksColumn(env, col)) === true) continue;
    try {
      await env.DB.prepare(ddl).run();
    } catch (err) {
      const msg = String((err && err.message) || "");
      if (!/duplicate column|already exists/i.test(msg)) throw err;
    }
  }
  // Daily view/download counters per work (UTC days). Incremented by
  // POST /api/track; aggregated by /api/my-works for the dashboard graphs.
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS work_stats_daily (
      work_id TEXT NOT NULL,
      day TEXT NOT NULL,
      views INTEGER NOT NULL DEFAULT 0,
      downloads INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (work_id, day)
    )`
  ).run();

  // Support tickets — public intake via POST /api/support, triaged in the
  // /apex console (status open → answered → closed, optional priority and
  // an admin note that stays internal).
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL DEFAULT '',
      contact TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'normal',
      admin_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT
    )`
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status)"
  ).run();

  // Appeal / support chat threads. Each thread's id IS its secret link:
  // "appeal-<username><8 random digits>" (e.g. appeal-pixelwork48291057),
  // generated by POST /api/support-threads and guaranteed unique by probe —
  // every new ticket gets a link that has never existed before. The owner
  // opens /support/<id> to reach the chat; the /apex console reaches the
  // same chat with its console session. Messages live in support_messages
  // and are end-to-end encrypted client-side (AES-256-GCM with a key
  // derived from the ticket id) — this database only ever stores ciphertext.
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS support_threads (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      context TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      updated_at TEXT
    )`
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_support_threads_username ON support_threads(username)"
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_support_threads_status ON support_threads(status)"
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS support_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_support_messages_thread ON support_messages(thread_id, created_at)"
  ).run();

  // User reports — public intake via POST /api/report (a work or a user,
  // with a reason), triaged in /apex. Resolving can remove the reported
  // work from the catalog (status 'rejected').
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS user_reports (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL DEFAULT 'work',
      target_id TEXT NOT NULL,
      reporter TEXT NOT NULL DEFAULT '',
      contact TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT 'other',
      details TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      admin_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT
    )`
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_user_reports_status ON user_reports(status)"
  ).run();

  const tableState = await probeColumn(env, "username");

  if (tableState === "no-table") {
    // Fresh database — create the OAuth-only shape directly.
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        github_id INTEGER,
        github_name TEXT,
        github_email TEXT,
        starred_at TEXT,
        publish_access INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        last_login_at TEXT,
        mod_state TEXT NOT NULL DEFAULT 'ok',
        mod_reason TEXT NOT NULL DEFAULT '',
        mod_until TEXT
      )`
    ).run();
    schemaReady = true;
    return;
  }

  // password_hash is the defining column of the signup/sign-in era.
  const isLegacy = tableState === true
    ? (await probeColumn(env, "password_hash")) === true
    : false;

  if (isLegacy) {
    // Legacy table from the signup/sign-in era. Rebuild without the
    // password/nickname columns (they are gone for good — data safety) and
    // normalize the username to the GitHub login where one was linked, so
    // existing sessions/works keep resolving after the next sign-in.
    // Column list is probed because legacy shapes varied over time.
    const want = {
      nickname: false,
      github_username: false,
      github_connected_at: false,
      github_name: false,
      github_email: false,
      email: false,
      starred_at: false,
      publish_access: false,
      created_at: false,
    };
    const present = {};
    for (const col of Object.keys(want)) {
      present[col] = (await probeColumn(env, col)) === true;
    }
    const selectList = ["username", ...Object.keys(present).filter((c) => present[c])];
    const legacy = await env.DB
      .prepare(`SELECT ${selectList.join(", ")} FROM users`)
      .all();
    const rows = Array.isArray(legacy?.results) ? legacy.results : [];
    // GitHub-linked rows first so they win any (impossible-in-practice)
    // username collision against password-only rows.
    rows.sort((a, b) => Number(Boolean(b.github_username)) - Number(Boolean(a.github_username)));

    const renames = [];
    const seen = new Set();
    const values = [];
    for (const r of rows) {
      const oldName = String(r.username ?? "");
      const linked = present.github_username && r.github_username
        ? String(r.github_username).toLowerCase()
        : "";
      const newName = linked || oldName.toLowerCase();
      if (!oldName || seen.has(newName)) continue;
      seen.add(newName);
      if (newName !== oldName) renames.push([oldName, newName]);
      values.push([
        newName,
        null,
        r.github_name ? String(r.github_name) : null,
        r.github_email ? String(r.github_email) : present.email && r.email ? String(r.email) : null,
        r.starred_at ? String(r.starred_at) : null,
        (!present.publish_access || Number(r.publish_access) === 1) ? 1 : 0,
        r.created_at ? String(r.created_at) : new Date().toISOString(),
      ]);
    }

    await env.DB.prepare("DROP TABLE IF EXISTS users_oauth_v2").run();
    await env.DB.prepare(
      `CREATE TABLE users_oauth_v2 (
        username TEXT PRIMARY KEY,
        github_id INTEGER,
        github_name TEXT,
        github_email TEXT,
        starred_at TEXT,
        publish_access INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        last_login_at TEXT,
        mod_state TEXT NOT NULL DEFAULT 'ok',
        mod_reason TEXT NOT NULL DEFAULT '',
        mod_until TEXT
      )`
    ).run();
    const inserts = values.map((v) =>
      env.DB.prepare(
        `INSERT OR IGNORE INTO users_oauth_v2
         (username, github_id, github_name, github_email, starred_at, publish_access, created_at, last_login_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL)`
      ).bind(...v)
    );
    if (inserts.length > 0) await env.DB.batch(inserts);
    await env.DB.batch([
      env.DB.prepare("DROP TABLE users"),
      env.DB.prepare("ALTER TABLE users_oauth_v2 RENAME TO users"),
    ]);

    // Point existing sessions and works at the normalized username.
    for (const [oldName, newName] of renames) {
      try {
        await env.DB.batch([
          env.DB.prepare("UPDATE sessions SET username = ?1 WHERE username = ?2").bind(newName, oldName),
          env.DB.prepare("UPDATE works SET username = ?1 WHERE username = ?2").bind(newName, oldName),
        ]);
      } catch (err) {
        console.error(`schema: session/work rename failed for ${oldName}: ${err && err.message}`);
      }
    }
    console.log(`schema: legacy users table rebuilt without password data (${values.length} accounts)`);
    schemaReady = true;
    return;
  }

  // GitHub-era table without the password columns — make sure the newer
  // columns exist (older databases predate github_id/last_login_at).
  for (const [col, ddl] of [
    ["github_id", "ALTER TABLE users ADD COLUMN github_id INTEGER"],
    ["last_login_at", "ALTER TABLE users ADD COLUMN last_login_at TEXT"],
    ["starred_at", "ALTER TABLE users ADD COLUMN starred_at TEXT"],
    ["publish_access", "ALTER TABLE users ADD COLUMN publish_access INTEGER NOT NULL DEFAULT 0"],
    ["created_at", "ALTER TABLE users ADD COLUMN created_at TEXT"],
    ["mod_state", "ALTER TABLE users ADD COLUMN mod_state TEXT NOT NULL DEFAULT 'ok'"],
    ["mod_reason", "ALTER TABLE users ADD COLUMN mod_reason TEXT NOT NULL DEFAULT ''"],
    ["mod_until", "ALTER TABLE users ADD COLUMN mod_until TEXT"],
  ]) {
    if ((await probeColumn(env, col)) === true) continue;
    try {
      await env.DB.prepare(ddl).run();
    } catch (err) {
      const msg = String((err && err.message) || "");
      if (!/duplicate column|already exists/i.test(msg)) throw err;
    }
  }
  schemaReady = true;
}
