import {
  apexSessionValid,
  clientIp,
  ensureProfileSchema,
  generateToken,
  githubTokenKey,
  json,
  primaryDb,
  rateLimit,
} from "./_shared.js";
import { repoImageUrl } from "./_gh-repo.js";

/**
 * POST /api/apex — the whole backend of the /apex control console.
 *
 * /apex is the site owner's private admin surface: a dashboard, the review
 * queue for published works (the same queue POST /api/works feeds), the
 * all-works catalog manager (moderation: takedown / suspend / ban / delete
 * plus update-request decisions, with per-work view & download counts), a
 * CRM over every developer account (publish access + suspend / ban /
 * delete), support tickets, appeal chat threads and user reports.
 *
 * Auth model — the passcode never lives in the browser:
 *   1. The console sends { action: "login", passcode }. The passcode is
 *      compared (SHA-256 digests, constant-ish time) against the ADMIN_TOKEN
 *      variable — the same secret the raw review endpoint /api/works-admin
 *      has always used. Set it once:
 *        wrangler pages secret put ADMIN_TOKEN --project-name orthotopy
 *   2. On success the server mints a random 12-hour session token, stores it
 *      in the CODES KV namespace (apex:session:<token>) and returns it. The
 *      console keeps only this opaque token (localStorage) and sends it back
 *      as the x-apex-token header. The ADMIN_TOKEN itself is never stored
 *      client-side, and a wrong-passcode brute force is throttled per IP.
 *
 * Actions (all JSON bodies):
 *   login        { passcode }                          → { ok, token, expiresAt }
 *   logout                                             → { ok }
 *   overview                                           → dashboard stats + series + recents
 *   review-list  { }                                   → pending works queue
 *   review-decide{ id, decision: "approve"|"reject" }  → decide one work
 *   works-list   { status?, type?, q? }                → every work + per-work stats
 *   work-moderate{ id, action: "takedown"|"suspend"|"ban"|"delete"|"restore"
 *                     |"approve-update"|"reject-update",
 *                  until?, reason? }                   → moderate one work
 *   crm-list     { q? }                                → developer accounts + work counts
 *   crm-update   { username, publishAccess }           → grant / revoke publish access
 *   crm-suspend  { username, reason, until? }          → temp suspension (auto-ends)
 *   crm-ban      { username, reason }                  → permanent ban (works → review)
 *   crm-restore  { username }                          → end suspension / unban
 *   crm-delete   { username }                          → wipe account + works + sessions
 *   tickets-list { status? }                           → support tickets, newest first
 *   ticket-update{ id, status?, priority?, adminNote? } → triage one ticket
 *   threads-list { status? }                           → appeal chat threads
 *   thread-update{ id, status? }                       → close / reopen a thread
 *   reports-list { status? }                           → user reports, newest first
 *   report-update{ id, status?, adminNote? }           → resolve / dismiss a report
 *   report-remove-work { id }                          → reject the reported work + resolve
 *
 * Bindings: DB (D1, required), CODES (KV — admin sessions + throttle), and
 * the ADMIN_TOKEN variable.
 */

const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 hours per console session

const TICKET_STATUSES = ["open", "answered", "closed"];
const TICKET_PRIORITIES = ["low", "normal", "high"];
const THREAD_STATUSES = ["open", "answered", "closed"];
const REPORT_STATUSES = ["open", "resolved", "dismissed"];
const WORK_MOD_ACTIONS = ["takedown", "suspend", "ban", "delete", "restore", "approve-update", "reject-update"];

/** Normalizes an incoming suspend deadline (datetime-local string, ISO or
 * "YYYY-MM-DD HH:MM") to an ISO-8601 UTC string, or null when invalid. */
function parseDeadline(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value) ? `${value.replace(" ", "T")}:00Z` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

// ------------------------------------------------------------------ helpers

async function sha256Hex(text) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** True when the x-apex-token header holds a live console session. */
const sessionValid = (env, request) => apexSessionValid(env, request);

/** SQLite datetime('now') vs ISO mixes — normalize for JSON output. */
function normalizeTimestamp(raw) {
  const value = String(raw ?? "");
  return value || null;
}

function parseImagesColumn(raw) {
  try {
    const list = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(list) ? list.filter((f) => typeof f === "string" && f) : [];
  } catch {
    return [];
  }
}

function cleanText(raw, max) {
  return String(raw ?? "").trim().slice(0, max);
}

function str(value, fallback = "") {
  return value === undefined || value === null ? fallback : String(value);
}

// ------------------------------------------------------------------ handler

export async function onRequestPost({ request, env }) {
  // Every console action runs through the primary-pinned D1 session (the
  // Sessions API — see _shared.js): what the admin just wrote must appear
  // in the very next list the console reads.
  const db = env?.DB ? primaryDb(env) : null;
  if (!db) {
    return json({ error: "Database not ready." }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const action = str(body?.action);

  // --- login: the only action reachable without a console session -------
  if (action === "login") {
    const expected = String(env.ADMIN_TOKEN ?? "").trim();
    if (!expected) {
      return json(
        { error: "ADMIN_TOKEN is not set on the server yet — add it in the Cloudflare Pages settings, then try again." },
        503
      );
    }
    // Brute-force throttle: 10 attempts per IP per hour, counted whether
    // they succeed or not (an admin needs a handful at most).
    if (!(await rateLimit(env, request, "apex-login", 10, 3600))) {
      return json({ error: "Too many attempts from this network — try again in about an hour." }, 429);
    }
    const passcode = cleanText(body?.passcode, 200);
    const [a, b] = await Promise.all([sha256Hex(expected), sha256Hex(passcode)]);
    if (a !== b) {
      return json({ error: "That passcode isn't right." }, 401);
    }
    const token = generateToken();
    try {
      await env.CODES.put(`apex:session:${token}`, `ip:${clientIp(request)}`, {
        expirationTtl: SESSION_TTL_SECONDS,
      });
    } catch {
      return json({ error: "We couldn't open a session — please try again." }, 500);
    }
    return json({
      ok: true,
      token,
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
    });
  }

  // --- everything below needs a live console session ---------------------
  if (!(await sessionValid(env, request))) {
    return json({ error: "Console session expired — sign in again." }, 401);
  }

  try {
    await ensureProfileSchema(env);

    switch (action) {
      case "logout": {
        const provided = String(request.headers.get("x-apex-token") ?? "").trim();
        try {
          await env.CODES.delete(`apex:session:${provided}`);
        } catch {
          // Best effort — the token expires on its own anyway.
        }
        return json({ ok: true });
      }

      // ---------------------------------------------------- dashboard
      case "overview": {
        const [usersRow, accessRow, newUsersRow, worksRow, statsRow, ticketsRow, reportsRow, threadsRow] =
          await Promise.all([
            db.prepare("SELECT COUNT(*) AS n FROM users").first(),
            db
              .prepare("SELECT COUNT(*) AS n FROM users WHERE publish_access = 1")
              .first(),
            db
              .prepare(
                "SELECT COUNT(*) AS n FROM users WHERE created_at >= ?1"
              )
              .bind(new Date(Date.now() - 7 * 86400000).toISOString())
              .first(),
            db
              .prepare(
                `SELECT COUNT(*) AS total,
                        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
                        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
                        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
                        SUM(CASE WHEN status IN ('taken_down', 'suspended', 'banned') THEN 1 ELSE 0 END) AS moderated,
                        SUM(CASE WHEN pending_requested_at IS NOT NULL THEN 1 ELSE 0 END) AS updateRequests
                 FROM works`
              )
              .first(),
            db
              .prepare(
                "SELECT COALESCE(SUM(views), 0) AS views, COALESCE(SUM(downloads), 0) AS downloads FROM work_stats_daily"
              )
              .first(),
            db
              .prepare(
                "SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open FROM support_tickets"
              )
              .first(),
            db
              .prepare(
                "SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open FROM user_reports"
              )
              .first(),
            db
              .prepare(
                "SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open FROM support_threads"
              )
              .first(),
          ]);

        const recentUsersRes = await db.prepare(
          `SELECT username, github_name, github_email, publish_access, created_at
           FROM users ORDER BY created_at DESC LIMIT 8`
        ).all();
        const recentWorksRes = await db.prepare(
          `SELECT id, title, username, type, platform, status, created_at
           FROM works ORDER BY created_at DESC LIMIT 8`
        ).all();

        // 14-day activity series, gaps filled with zeros so the chart line
        // is continuous even on quiet days.
        const since = new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10);
        const statsRes = await db.prepare(
          `SELECT day, SUM(views) AS views, SUM(downloads) AS downloads
           FROM work_stats_daily WHERE day >= ?1 GROUP BY day`
        )
          .bind(since)
          .all();
        const byDay = new Map();
        for (const row of statsRes?.results ?? []) {
          byDay.set(String(row.day), {
            views: Number(row.views ?? 0),
            downloads: Number(row.downloads ?? 0),
          });
        }
        const series = [];
        for (let i = 13; i >= 0; i -= 1) {
          const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
          const hit = byDay.get(day) ?? { views: 0, downloads: 0 };
          series.push({ day, views: hit.views, downloads: hit.downloads });
        }

        return json({
          ok: true,
          overview: {
            users: {
              total: Number(usersRow?.n ?? 0),
              withAccess: Number(accessRow?.n ?? 0),
              new7d: Number(newUsersRow?.n ?? 0),
            },
            works: {
              total: Number(worksRow?.total ?? 0),
              pending: Number(worksRow?.pending ?? 0),
              approved: Number(worksRow?.approved ?? 0),
              rejected: Number(worksRow?.rejected ?? 0),
              moderated: Number(worksRow?.moderated ?? 0),
              updateRequests: Number(worksRow?.updateRequests ?? 0),
            },
            stats: {
              views: Number(statsRow?.views ?? 0),
              downloads: Number(statsRow?.downloads ?? 0),
            },
            tickets: {
              total: Number(ticketsRow?.total ?? 0),
              open: Number(ticketsRow?.open ?? 0),
            },
            threads: {
              total: Number(threadsRow?.total ?? 0),
              open: Number(threadsRow?.open ?? 0),
            },
            reports: {
              total: Number(reportsRow?.total ?? 0),
              open: Number(reportsRow?.open ?? 0),
            },
            recentUsers: (recentUsersRes?.results ?? []).map((r) => ({
              username: str(r.username),
              githubName: r.github_name ? str(r.github_name) : null,
              githubEmail: r.github_email ? str(r.github_email) : null,
              publishAccess: Number(r.publish_access) === 1,
              createdAt: normalizeTimestamp(r.created_at),
            })),
            recentWorks: (recentWorksRes?.results ?? []).map((r) => ({
              id: str(r.id),
              title: str(r.title),
              username: str(r.username),
              type: str(r.type),
              platform: str(r.platform),
              status: str(r.status),
              createdAt: normalizeTimestamp(r.created_at),
            })),
            series,
          },
        });
      }

      // ----------------------------------------------- review requests
      case "review-list": {
        const res = await db.prepare(
          `SELECT id, username, title, type, platform, description, repo_url, repo_owner, repo_name, download_url, images, created_at
           FROM works WHERE status = 'pending'
           ORDER BY created_at ASC, id ASC LIMIT 100`
        ).all();
        const queue = [];
        for (const r of res?.results ?? []) {
          const owner = str(r.repo_owner);
          const repo = str(r.repo_name);
          const files = parseImagesColumn(r.images);
          queue.push({
            id: str(r.id),
            username: str(r.username),
            title: str(r.title),
            type: str(r.type),
            platform: str(r.platform),
            description: str(r.description),
            repoUrl: r.repo_url ? str(r.repo_url) : "",
            downloadUrl: r.download_url ? str(r.download_url) : "",
            imageUrls:
              owner && repo
                ? files.map((file) => repoImageUrl(env, owner, repo, file))
                : [],
            createdAt: normalizeTimestamp(r.created_at),
          });
        }
        return json({ ok: true, queue });
      }

      case "review-decide": {
        const id = cleanText(body?.id, 120);
        const decision = str(body?.decision);
        if (!id) return json({ error: "Missing work id." }, 400);
        if (decision !== "approve" && decision !== "reject") {
          return json({ error: "Decision must be approve or reject." }, 400);
        }
        const status = decision === "approve" ? "approved" : "rejected";
        const result = await db
          .prepare("UPDATE works SET status = ?1, reviewed_at = ?2 WHERE id = ?3 AND status = 'pending'")
          .bind(status, new Date().toISOString(), id)
          .run();
        if (!Number(result?.meta?.changes ?? 0)) {
          return json({ error: "No pending work with that id — the queue may have moved." }, 404);
        }
        return json({ ok: true, id, status });
      }

      // ----------------------------------------------------- all works
      // The catalog manager: every work of every status with its per-work
      // view & download counts (work_stats_daily aggregates) — these counts
      // are shown here only, never on the public storefront.
      case "works-list": {
        const status = cleanText(body?.status, 20);
        const res = await db
          .prepare(
            `SELECT w.id, w.username, w.title, w.tagline, w.description, w.type, w.platform,
                    w.status, w.created_at, w.repo_url, w.download_url,
                    w.pending_title, w.pending_description, w.pending_download_url,
                    w.pending_requested_at, w.suspended_until, w.mod_note,
                    COALESCE(SUM(s.views), 0) AS views,
                    COALESCE(SUM(s.downloads), 0) AS downloads
             FROM works w
             LEFT JOIN work_stats_daily s ON s.work_id = w.id
             ${status ? "WHERE w.status = ?1" : ""}
             GROUP BY w.id
             ORDER BY w.created_at DESC, w.id ASC
             LIMIT 400`
          )
          .bind(...(status ? [status] : []))
          .all();
        const type = cleanText(body?.type, 20);
        const q = cleanText(body?.q, 80).toLowerCase();
        const works = (res?.results ?? []).map((r) => ({
          id: str(r.id),
          username: str(r.username),
          title: str(r.title),
          type: str(r.type),
          platform: str(r.platform),
          description: str(r.description),
          status: str(r.status),
          repoUrl: r.repo_url ? str(r.repo_url) : "",
          downloadUrl: r.download_url ? str(r.download_url) : "",
          pendingUpdate:
            r.pending_requested_at
              ? {
                  title: str(r.pending_title),
                  description: str(r.pending_description),
                  downloadUrl: str(r.pending_download_url),
                  requestedAt: normalizeTimestamp(r.pending_requested_at),
                }
              : null,
          suspendedUntil: r.suspended_until ? str(r.suspended_until) : null,
          modNote: str(r.mod_note),
          views: Number(r.views ?? 0),
          downloads: Number(r.downloads ?? 0),
          createdAt: normalizeTimestamp(r.created_at),
        }));
        // Type / "others" and free-text filters are applied in JS — "others"
        // covers anything that isn't Apps, Games or Extensions.
        const filtered = works.filter((w) => {
          if (type === "apps" && w.type !== "Apps") return false;
          if (type === "games" && w.type !== "Games") return false;
          if (type === "extensions" && w.type !== "Extensions") return false;
          if (type === "others" && ["Apps", "Games", "Extensions"].includes(w.type)) return false;
          if (q && !(w.title.toLowerCase().includes(q) || w.username.toLowerCase().includes(q) || w.id.toLowerCase().includes(q))) {
            return false;
          }
          return true;
        });
        return json({ ok: true, works: filtered });
      }

      case "work-moderate": {
        const id = cleanText(body?.id, 120);
        // The verb rides in `modAction` — `action` is the endpoint action.
        const modAction = str(body?.modAction);
        if (!id) return json({ error: "Missing work id." }, 400);
        if (!WORK_MOD_ACTIONS.includes(modAction)) {
          return json({ error: "Unknown moderation action." }, 400);
        }
        const reason = cleanText(body?.reason, 500);
        const current = await db
          .prepare("SELECT id, status FROM works WHERE id = ?1 LIMIT 1")
          .bind(id)
          .first();
        if (!current) return json({ error: "No work with that id." }, 404);

        if (modAction === "delete") {
          await db.batch([
            db.prepare("DELETE FROM work_stats_daily WHERE work_id = ?1").bind(id),
            db.prepare("DELETE FROM works WHERE id = ?1").bind(id),
          ]);
          return json({ ok: true, id, action: modAction, deleted: true });
        }

        if (modAction === "suspend") {
          // Temporary: hidden until the given date+time, then auto-restored
          // by the next public catalog read (GET /api/works).
          const until = parseDeadline(body?.until);
          if (!until) {
            return json({ error: "Give a valid suspend date and time." }, 400);
          }
          if (until <= new Date().toISOString()) {
            return json({ error: "The suspend date+time must be in the future." }, 400);
          }
          await db
            .prepare(
              "UPDATE works SET status = 'suspended', suspended_until = ?1, mod_note = ?2 WHERE id = ?3"
            )
            .bind(until, reason, id)
            .run();
          return json({ ok: true, id, action: modAction, status: "suspended", suspendedUntil: until });
        }

        if (modAction === "restore") {
          await db
            .prepare(
              "UPDATE works SET status = 'approved', suspended_until = '', mod_note = '', reviewed_at = ?1 WHERE id = ?2"
            )
            .bind(new Date().toISOString(), id)
            .run();
          return json({ ok: true, id, action: modAction, status: "approved" });
        }

        if (modAction === "approve-update") {
          // Apply the developer's pending edit to the live listing, then
          // clear the request.
          const pending = await db
            .prepare(
              "SELECT pending_title, pending_description, pending_download_url, pending_requested_at FROM works WHERE id = ?1"
            )
            .bind(id)
            .first();
          if (!pending?.pending_requested_at) {
            return json({ error: "That work has no update request pending." }, 404);
          }
          await db
            .prepare(
              `UPDATE works
               SET title = COALESCE(NULLIF(pending_title, ''), title),
                   description = COALESCE(NULLIF(pending_description, ''), description),
                   download_url = COALESCE(NULLIF(pending_download_url, ''), download_url),
                   pending_title = '', pending_description = '',
                   pending_download_url = '', pending_requested_at = NULL,
                   reviewed_at = ?1
               WHERE id = ?2`
            )
            .bind(new Date().toISOString(), id)
            .run();
          return json({ ok: true, id, action: modAction, status: "approved" });
        }

        if (modAction === "reject-update") {
          const cleared = await db
            .prepare(
              `UPDATE works
               SET pending_title = '', pending_description = '',
                   pending_download_url = '', pending_requested_at = NULL
               WHERE id = ?1 AND pending_requested_at IS NOT NULL`
            )
            .bind(id)
            .run();
          if (!Number(cleared?.meta?.changes ?? 0)) {
            return json({ error: "That work has no update request pending." }, 404);
          }
          return json({ ok: true, id, action: modAction, status: str(current.status) });
        }

        // takedown / ban — both hide the work permanently (restorable only
        // by the admin "restore" action); delete above removes the row.
        const hiddenStatus = modAction === "ban" ? "banned" : "taken_down";
        await db
          .prepare(
            "UPDATE works SET status = ?1, suspended_until = '', mod_note = ?2, reviewed_at = ?3 WHERE id = ?4"
          )
          .bind(hiddenStatus, reason, new Date().toISOString(), id)
          .run();
        return json({ ok: true, id, action: modAction, status: hiddenStatus });
      }

      // ----------------------------------------------------------- CRM
      case "crm-list": {
        const q = cleanText(body?.q, 80).toLowerCase();
        const res = await db.prepare(
          `SELECT u.username, u.github_name, u.github_email, u.starred_at,
                  u.publish_access, u.created_at, u.last_login_at,
                  u.mod_state, u.mod_reason, u.mod_until,
                  COUNT(w.id) AS works_total,
                  COALESCE(SUM(CASE WHEN w.status = 'approved' THEN 1 ELSE 0 END), 0) AS works_live
           FROM users u LEFT JOIN works w ON w.username = u.username
           GROUP BY u.username
           ORDER BY u.created_at DESC
           LIMIT 500`
        ).all();
        const accounts = (res?.results ?? [])
          .map((r) => ({
            username: str(r.username),
            githubName: r.github_name ? str(r.github_name) : null,
            githubEmail: r.github_email ? str(r.github_email) : null,
            starred: Boolean(r.starred_at),
            publishAccess: Number(r.publish_access) === 1,
            createdAt: normalizeTimestamp(r.created_at),
            lastLoginAt: normalizeTimestamp(r.last_login_at),
            modState: str(r.mod_state, "ok"),
            modReason: str(r.mod_reason),
            modUntil: r.mod_until ? str(r.mod_until) : null,
            worksTotal: Number(r.works_total ?? 0),
            worksLive: Number(r.works_live ?? 0),
          }))
          .filter((a) => {
            if (!q) return true;
            return (
              a.username.toLowerCase().includes(q) ||
              (a.githubName ?? "").toLowerCase().includes(q) ||
              (a.githubEmail ?? "").toLowerCase().includes(q)
            );
          });
        return json({ ok: true, accounts });
      }

      case "crm-update": {
        const username = cleanText(body?.username, 80);
        if (!username) return json({ error: "Missing username." }, 400);
        const publishAccess = body?.publishAccess ? 1 : 0;
        const result = await db
          .prepare("UPDATE users SET publish_access = ?1 WHERE username = ?2")
          .bind(publishAccess, username)
          .run();
        if (!Number(result?.meta?.changes ?? 0)) {
          return json({ error: "No account with that username." }, 404);
        }
        return json({ ok: true, username, publishAccess: publishAccess === 1 });
      }

      case "crm-suspend": {
        const username = cleanText(body?.username, 80);
        const reason = cleanText(body?.reason, 500);
        if (!username) return json({ error: "Missing username." }, 400);
        if (!reason) return json({ error: "Give the developer a reason — they will see it." }, 400);
        const until = parseDeadline(body?.until);
        if (!until) {
          return json({ error: "Give a valid suspension date and time (temporary — it auto-ends)." }, 400);
        }
        if (until <= new Date().toISOString()) {
          return json({ error: "The suspension date+time must be in the future." }, 400);
        }
        const result = await db
          .prepare(
            "UPDATE users SET mod_state = 'suspended', mod_reason = ?1, mod_until = ?2 WHERE username = ?3"
          )
          .bind(reason, until, username)
          .run();
        if (!Number(result?.meta?.changes ?? 0)) {
          return json({ error: "No account with that username." }, 404);
        }
        // Suspended accounts keep their works live — nothing else to change.
        return json({ ok: true, username, modState: "suspended", until });
      }

      case "crm-ban": {
        const username = cleanText(body?.username, 80);
        const reason = cleanText(body?.reason, 500);
        if (!username) return json({ error: "Missing username." }, 400);
        if (!reason) return json({ error: "Give the developer a reason — they will see it." }, 400);
        const result = await db
          .prepare(
            "UPDATE users SET mod_state = 'banned', mod_reason = ?1, mod_until = NULL WHERE username = ?2"
          )
          .bind(reason, username)
          .run();
        if (!Number(result?.meta?.changes ?? 0)) {
          return json({ error: "No account with that username." }, 404);
        }
        // Banned accounts' live works go back into the review queue; any
        // update request still pending on them is dropped with them.
        const pulled = await db
          .prepare(
            `UPDATE works
             SET status = 'pending', reviewed_at = NULL,
                 pending_title = '', pending_description = '',
                 pending_download_url = '', pending_requested_at = NULL
             WHERE username = ?1 AND status = 'approved'`
          )
          .bind(username)
          .run();
        return json({
          ok: true,
          username,
          modState: "banned",
          worksBackToReview: Number(pulled?.meta?.changes ?? 0),
        });
      }

      case "crm-restore": {
        const username = cleanText(body?.username, 80);
        if (!username) return json({ error: "Missing username." }, 400);
        const result = await db
          .prepare(
            "UPDATE users SET mod_state = 'ok', mod_reason = '', mod_until = NULL WHERE username = ?1 AND mod_state != 'ok'"
          )
          .bind(username)
          .run();
        if (!Number(result?.meta?.changes ?? 0)) {
          return json({ error: "No suspended or banned account with that username." }, 404);
        }
        return json({ ok: true, username, modState: "ok" });
      }

      case "crm-delete": {
        const username = cleanText(body?.username, 80);
        if (!username) return json({ error: "Missing username." }, 400);
        const exists = await db
          .prepare("SELECT 1 FROM users WHERE username = ?1 LIMIT 1")
          .bind(username)
          .first();
        if (!exists) return json({ error: "No account with that username." }, 404);
        const wipedWorks = await db
          .prepare("DELETE FROM works WHERE username = ?1")
          .bind(username)
          .run();
        await db.batch([
          db.prepare("DELETE FROM sessions WHERE username = ?1").bind(username),
          db.prepare(
            "DELETE FROM work_stats_daily WHERE work_id NOT IN (SELECT id FROM works)"
          ),
        ]);
        await db.prepare("DELETE FROM users WHERE username = ?1").bind(username).run();
        try {
          await env.CODES.delete(githubTokenKey(username));
        } catch {
          // Token entry also expires on its own; deletion is best effort.
        }
        return json({
          ok: true,
          username,
          worksRemoved: Number(wipedWorks?.meta?.changes ?? 0),
        });
      }

      // ------------------------------------------------ support tickets
      case "tickets-list": {
        const status = cleanText(body?.status, 20);
        const stmt =
          status && TICKET_STATUSES.includes(status)
            ? db.prepare(
                "SELECT * FROM support_tickets WHERE status = ?1 ORDER BY created_at DESC LIMIT 200"
              ).bind(status)
            : db.prepare(
                "SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT 200"
              );
        const res = await stmt.all();
        return json({
          ok: true,
          tickets: (res?.results ?? []).map((r) => ({
            id: str(r.id),
            username: str(r.username),
            contact: str(r.contact),
            subject: str(r.subject),
            message: str(r.message),
            status: str(r.status, "open"),
            priority: str(r.priority, "normal"),
            adminNote: str(r.admin_note),
            createdAt: normalizeTimestamp(r.created_at),
            updatedAt: normalizeTimestamp(r.updated_at),
          })),
        });
      }

      case "ticket-update": {
        const id = cleanText(body?.id, 80);
        if (!id) return json({ error: "Missing ticket id." }, 400);
        const status = cleanText(body?.status, 20);
        const priority = cleanText(body?.priority, 20);
        const adminNote = cleanText(body?.adminNote, 2000);
        if (status && !TICKET_STATUSES.includes(status)) {
          return json({ error: "Unknown ticket status." }, 400);
        }
        if (priority && !TICKET_PRIORITIES.includes(priority)) {
          return json({ error: "Unknown ticket priority." }, 400);
        }
        const current = await db
          .prepare("SELECT status, priority, admin_note FROM support_tickets WHERE id = ?1 LIMIT 1")
          .bind(id)
          .first();
        if (!current) return json({ error: "No ticket with that id." }, 404);
        await db
          .prepare(
            `UPDATE support_tickets
             SET status = ?1, priority = ?2, admin_note = ?3, updated_at = ?4
             WHERE id = ?5`
          )
          .bind(
            status || str(current.status, "open"),
            priority || str(current.priority, "normal"),
            body?.adminNote === undefined ? str(current.admin_note) : adminNote,
            new Date().toISOString(),
            id
          )
          .run();
        return json({ ok: true, id });
      }

      // -------------------------------------- appeal / support threads
      // Threads are created by developers (POST /api/support-threads) and
      // chatted in from /support/<id> or right here; this console only
      // lists and closes/reopens them. Message bodies live encrypted —
      // the console decrypts them client-side with the thread id.
      case "threads-list": {
        const status = cleanText(body?.status, 20);
        const stmt =
          status && THREAD_STATUSES.includes(status)
            ? db.prepare(
                "SELECT * FROM support_threads WHERE status = ?1 ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 200"
              ).bind(status)
            : db.prepare(
                "SELECT * FROM support_threads ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 200"
              );
        const res = await stmt.all();
        const rows = res?.results ?? [];
        const counts = await db
          .prepare(
            "SELECT thread_id, COUNT(*) AS n FROM support_messages GROUP BY thread_id"
          )
          .all();
        const countBy = new Map((counts?.results ?? []).map((r) => [str(r.thread_id), Number(r.n ?? 0)]));
        return json({
          ok: true,
          threads: rows.map((r) => ({
            id: str(r.id),
            username: str(r.username),
            subject: str(r.subject),
            context: str(r.context),
            status: str(r.status, "open"),
            createdAt: normalizeTimestamp(r.created_at),
            updatedAt: normalizeTimestamp(r.updated_at),
            messageCount: countBy.get(str(r.id)) ?? 0,
          })),
        });
      }

      case "thread-update": {
        const id = cleanText(body?.id, 80);
        if (!id) return json({ error: "Missing thread id." }, 400);
        const status = cleanText(body?.status, 20);
        if (!status || !THREAD_STATUSES.includes(status)) {
          return json({ error: "Unknown thread status." }, 400);
        }
        const result = await db
          .prepare(
            "UPDATE support_threads SET status = ?1, updated_at = ?2 WHERE id = ?3"
          )
          .bind(status, new Date().toISOString(), id)
          .run();
        if (!Number(result?.meta?.changes ?? 0)) {
          return json({ error: "No thread with that id." }, 404);
        }
        return json({ ok: true, id, status });
      }

      // -------------------------------------------------- user reports
      case "reports-list": {
        const status = cleanText(body?.status, 20);
        const stmt =
          status && REPORT_STATUSES.includes(status)
            ? db.prepare(
                "SELECT * FROM user_reports WHERE status = ?1 ORDER BY created_at DESC LIMIT 200"
              ).bind(status)
            : db.prepare(
                "SELECT * FROM user_reports ORDER BY created_at DESC LIMIT 200"
              );
        const res = await stmt.all();
        return json({
          ok: true,
          reports: (res?.results ?? []).map((r) => ({
            id: str(r.id),
            targetType: str(r.target_type, "work"),
            targetId: str(r.target_id),
            reporter: str(r.reporter),
            contact: str(r.contact),
            reason: str(r.reason, "other"),
            details: str(r.details),
            status: str(r.status, "open"),
            adminNote: str(r.admin_note),
            createdAt: normalizeTimestamp(r.created_at),
            updatedAt: normalizeTimestamp(r.updated_at),
          })),
        });
      }

      case "report-update": {
        const id = cleanText(body?.id, 80);
        if (!id) return json({ error: "Missing report id." }, 400);
        const status = cleanText(body?.status, 20);
        const adminNote = cleanText(body?.adminNote, 2000);
        if (status && !REPORT_STATUSES.includes(status)) {
          return json({ error: "Unknown report status." }, 400);
        }
        const current = await db
          .prepare("SELECT status, admin_note FROM user_reports WHERE id = ?1 LIMIT 1")
          .bind(id)
          .first();
        if (!current) return json({ error: "No report with that id." }, 404);
        await db
          .prepare(
            `UPDATE user_reports
             SET status = ?1, admin_note = ?2, updated_at = ?3
             WHERE id = ?4`
          )
          .bind(
            status || str(current.status, "open"),
            body?.adminNote === undefined ? str(current.admin_note) : adminNote,
            new Date().toISOString(),
            id
          )
          .run();
        return json({ ok: true, id });
      }

      case "report-remove-work": {
        const id = cleanText(body?.id, 80);
        if (!id) return json({ error: "Missing report id." }, 400);
        const report = await db
          .prepare("SELECT target_type, target_id, status FROM user_reports WHERE id = ?1 LIMIT 1")
          .bind(id)
          .first();
        if (!report) return json({ error: "No report with that id." }, 404);
        if (str(report.target_type) !== "work") {
          return json({ error: "That report doesn't target a work." }, 400);
        }
        const targetId = str(report.target_id);
        const removed = await db
          .prepare("UPDATE works SET status = 'rejected', reviewed_at = ?1 WHERE id = ?2")
          .bind(new Date().toISOString(), targetId)
          .run();
        await db
          .prepare(
            "UPDATE user_reports SET status = 'resolved', updated_at = ?1 WHERE id = ?2"
          )
          .bind(new Date().toISOString(), id)
          .run();
        return json({
          ok: true,
          id,
          workId: targetId,
          workRemoved: Number(removed?.meta?.changes ?? 0) > 0,
        });
      }

      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (err) {
    console.error(`apex: action ${action} failed: ${err && err.message}`);
    return json({ error: "We couldn't do that — please try again in a moment." }, 500);
  }
}
