import {
  ensureProfileSchema,
  getSessionUser,
  json,
  primaryDb,
} from "./_shared.js";

/**
 * GET /api/my-works
 *
 * Returns the signed-in developer's published works with aggregated stats
 * for the dashboard: the works list, grand totals (works / views / downloads)
 * and a per-work daily series for the last 30 days (UTC days) so the client
 * can draw views and downloads line graphs with one line per work.
 *
 * Requires a bearer session token.
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

export async function onRequestGet({ env, request }) {
  const user = await getSessionUser(env, request);
  if (!user) {
    return json({ error: "Your session has expired — sign in again to continue." }, 401);
  }
  if (!env.DB || typeof env.DB.prepare !== "function") {
    return json({ error: "Database not ready — please try again in a moment." }, 500);
  }

  try {
    await ensureProfileSchema(env);
    // Primary-pinned: the dashboard must reflect a work published seconds ago.
    const db = primaryDb(env);

    const worksRes = await db
      .prepare(
        `SELECT id, title, tagline, description, kind, category, type, platform,
                icon, gradient, status, repo_url, download_url, images, created_at
         FROM works WHERE username = ?1 ORDER BY created_at DESC, id ASC`
      )
      .bind(user.username)
      .all();
    const rows = (worksRes && Array.isArray(worksRes.results) ? worksRes.results : []).map(
      (r) => ({
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
        repoUrl: r.repo_url ? String(r.repo_url) : "",
        downloadUrl: r.download_url ? String(r.download_url) : "",
        images: parseImagesColumn(r.images),
        createdAt: r.created_at ? String(r.created_at) : null,
      })
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
