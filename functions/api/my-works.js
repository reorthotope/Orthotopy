import {
  ensureProfileSchema,
  getSessionUser,
  json,
  modErrorResponse,
  primaryDb,
  resolveModState,
} from "./_shared.js";
import { repoImageUrl } from "./_gh-repo.js";

/**
 * GET  /api/my-works — the signed-in developer's published works with
 * aggregated stats for the dashboard: the works list (including moderation
 * state and any pending update request), grand totals (works / views /
 * downloads) and a per-work daily series for the last 30 days (UTC days).
 *
 * POST /api/my-works — work self-management from the dashboard:
 *   { action: "remove", id }
 *       Deletes the work (and its daily stats) permanently.
 *   { action: "update-request", id, title, description, downloadUrl }
 *       Files an "update request": the live listing stays unchanged until a
 *       review approves the change; the pending edit is stored side-by-side
 *       (pending_title / pending_description / pending_download_url) and is
 *       applied by the apex console (or discarded on rejection).
 *
 * Both POST actions require a bearer session token and are refused with 403
 * while the account is suspended or banned (the dashboard shows the reason
 * and the appeal path instead).
 *
 * Bindings & variables:
 *   DB  D1 database (required — works + work_stats_daily tables)
 */

const SERIES_DAYS = 30;

function parseImagesColumn(raw) {
  try {
    const list = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(list) ? list.filter((f) => typeof f === "string" && f) : [];
  } catch {
    return [];
  }
}

function utcDay(offsetDays = 0) {
  const d = new Date(Date.now() - offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function isValidDownloadUrl(raw) {
  const value = String(raw ?? "").trim();
  if (!value || value.length > 600 || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function mapWorkRow(r, env) {
  const owner = r.repo_owner ? String(r.repo_owner) : "";
  const repo = r.repo_name ? String(r.repo_name) : "";
  const hasPending = Boolean(r.pending_requested_at);
  return {
    id: String(r.id),
    title: String(r.title || r.id),
    tagline: r.tagline ? String(r.tagline) : "",
    description: r.description ? String(r.description) : "",
    kind: r.kind ? String(r.kind) : "Developer",
    category: r.category ? String(r.category) : "Other",
    type: r.type ? String(r.type) : "",
    platform: r.platform ? String(r.platform) : "",
    icon: r.icon ? String(r.icon) : "sparkles",
    gradient: r.gradient ? String(r.gradient) : "",
    status: r.status ? String(r.status) : "pending",
    // Moderation info surfaced to the developer.
    modNote: r.mod_note ? String(r.mod_note) : "",
    suspendedUntil: r.suspended_until ? String(r.suspended_until) : null,
    // Pending "update request" awaiting review — the live version keeps
    // running until the review approves or rejects this edit.
    pendingUpdate: hasPending
      ? {
          title: String(r.pending_title || ""),
          description: String(r.pending_description || ""),
          downloadUrl: String(r.pending_download_url || ""),
          requestedAt: String(r.pending_requested_at),
        }
      : null,
    repoUrl: r.repo_url ? String(r.repo_url) : "",
    downloadUrl: r.download_url ? String(r.download_url) : "",
    images: parseImagesColumn(r.images),
    logoUrl:
      r.logo_file && owner && repo
        ? repoImageUrl(env, owner, repo, String(r.logo_file))
        : "",
    createdAt: r.created_at ? String(r.created_at) : null,
  };
}

export async function onRequestGet({ env, request }) {
  const user = await getSessionUser(env, request);
  if (!user) {
    return json({ error: "Your session has expired — sign in again to continue." }, 401);
  }
  if (!env.DB || typeof env.DB.prepare !== "function") {
    return json({ error: "Database not ready — please try again in a moment." }, 500);
  }

  // A suspended or banned account keeps its session (so it can reach the
  // dashboard, read the reason and appeal) but not its works data.
  const mod = resolveModState(user);
  if (mod.blocked) {
    return modErrorResponse(mod);
  }

  try {
    await ensureProfileSchema(env);
    // Primary-pinned: the dashboard must reflect a work published seconds ago.
    const db = primaryDb(env);

    const worksRes = await db
      .prepare(
        `SELECT id, title, tagline, description, kind, category, type, platform,
                icon, gradient, status, repo_url, repo_owner, repo_name, download_url,
                images, logo_file, created_at,
                pending_title, pending_description, pending_download_url,
                pending_requested_at, suspended_until, mod_note
         FROM works WHERE username = ?1 ORDER BY created_at DESC, id ASC`
      )
      .bind(user.username)
      .all();
    const rows = (worksRes && Array.isArray(worksRes.results) ? worksRes.results : []).map(
      (r) => mapWorkRow(r, env)
    );

    // Daily series for the user's works over the last SERIES_DAYS days.
    const since = utcDay(SERIES_DAYS - 1);
    const statsRes = await db
      .prepare(
        `SELECT s.work_id, s.day, s.views, s.downloads
         FROM work_stats_daily s JOIN works w ON w.id = s.work_id
         WHERE w.username = ?1 AND s.day >= ?2
         ORDER BY s.day ASC`
      )
      .bind(user.username, since)
      .all();
    const statRows = statsRes && Array.isArray(statsRes.results) ? statsRes.results : [];

    const totals = { works: rows.length, views: 0, downloads: 0 };
    const series = {};
    const perWork = new Map(rows.map((r) => [r.id, { views: 0, downloads: 0 }]));
    for (const row of statRows) {
      const id = String(row.work_id);
      const views = Number(row.views) || 0;
      const downloads = Number(row.downloads) || 0;
      if (!series[id]) series[id] = [];
      series[id].push({ day: String(row.day), views, downloads });
      const agg = perWork.get(id);
      if (agg) {
        agg.views += views;
        agg.downloads += downloads;
      }
    }
    for (const r of rows) {
      const agg = perWork.get(r.id) ?? { views: 0, downloads: 0 };
      r.views = agg.views;
      r.downloads = agg.downloads;
      totals.views += agg.views;
      totals.downloads += agg.downloads;
    }

    return json({ ok: true, works: rows, totals, series });
  } catch (err) {
    console.error(`my-works: failed: ${err && err.message}`);
    return json({ error: "We couldn't load your works — please try again in a moment." }, 500);
  }
}

export async function onRequestPost({ env, request }) {
  const user = await getSessionUser(env, request);
  if (!user) {
    return json({ error: "Your session has expired — sign in again to continue." }, 401);
  }
  if (!env.DB || typeof env.DB.prepare !== "function") {
    return json({ error: "Database not ready — please try again in a moment." }, 500);
  }

  // Same gate as the GET: moderated accounts manage nothing (they can still
  // appeal through the support system, which has its own endpoint).
  const mod = resolveModState(user);
  if (mod.blocked) {
    return modErrorResponse(mod);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const action = String(body?.action ?? "");
  const id = String(body?.id ?? "").trim();
  if (!id || id.length > 120) {
    return json({ error: "Missing work id." }, 400);
  }

  try {
    await ensureProfileSchema(env);
    // Primary-pinned — dashboard actions must be reflected in the next read.
    const db = primaryDb(env);

    const work = await db
      .prepare(
        `SELECT id, username, status, pending_requested_at
         FROM works WHERE id = ?1 LIMIT 1`
      )
      .bind(id)
      .first();
    if (!work || String(work.username).toLowerCase() !== user.username.toLowerCase()) {
      return json({ error: "No work of yours with that id." }, 404);
    }

    // -------------------------------------------------- remove my work
    if (action === "remove") {
      await db.batch([
        db.prepare("DELETE FROM work_stats_daily WHERE work_id = ?1").bind(id),
        db.prepare("DELETE FROM works WHERE id = ?1 AND username = ?2").bind(id, user.username),
      ]);
      return json({ ok: true, id, removed: true });
    }

    // --------------------------------------------- file update request
    if (action === "update-request") {
      if (String(work.status) !== "approved") {
        return json(
          { error: "Only live works can be updated — works still under review are editable by the review itself." },
          400
        );
      }
      if (work.pending_requested_at) {
        return json(
          { error: "An update request is already awaiting review for this work — wait for the decision first." },
          409
        );
      }
      const title = String(body?.title ?? "").trim();
      const description = String(body?.description ?? "").trim();
      const downloadUrl = String(body?.downloadUrl ?? "").trim();
      if (title.length < 2 || title.length > 80) {
        return json({ error: "Give the work a title between 2 and 80 characters." }, 400);
      }
      if (description.length < 10 || description.length > 2000) {
        return json({ error: "Describe the work in 10–2000 characters." }, 400);
      }
      if (!isValidDownloadUrl(downloadUrl)) {
        return json(
          { error: "The download link must be a direct https:// URL (GitHub Releases asset or your own)." },
          400
        );
      }
      await db
        .prepare(
          `UPDATE works
           SET pending_title = ?1, pending_description = ?2,
               pending_download_url = ?3, pending_requested_at = ?4
           WHERE id = ?5 AND username = ?6`
        )
        .bind(title, description, downloadUrl, new Date().toISOString(), id, user.username)
        .run();
      return json({
        ok: true,
        id,
        pendingUpdate: { title, description, downloadUrl, requestedAt: new Date().toISOString() },
      });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (err) {
    console.error(`my-works: ${action} failed: ${err && err.message}`);
    return json({ error: "We couldn't do that — please try again in a moment." }, 500);
  }
}
