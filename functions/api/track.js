import { ensureProfileSchema, json, primaryDb } from "./_shared.js";

/**
 * POST /api/track
 *
 * Public beacon that counts a work's views and downloads:
 *   Body: { workId: string, type: "view" | "download" }
 *
 * One count per work+type+IP per hour (KV dedupe) so refreshes don't inflate
 * the numbers. Same-origin only — no CORS headers are emitted, so other
 * origins can't post to it.
 *
 * Bindings & variables:
 *   DB    D1 database (required — work_stats_daily)
 *   CODES KV namespace (optional — dedupe window; without it every call counts)
 */

const DAY_MS = 86_400_000;
void DAY_MS;

function utcDay() {
  return new Date().toISOString().slice(0, 10);
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const workId = String(body?.workId ?? "").trim();
  const type = String(body?.type ?? "").trim();
  if (!workId || workId.length > 120 || (type !== "view" && type !== "download")) {
    return json({ error: "Invalid request." }, 400);
  }
  if (!env.DB || typeof env.DB.prepare !== "function") {
    return json({ error: "Database not ready." }, 500);
  }

  try {
    await ensureProfileSchema(env);
    // Primary-pinned: the existence check must see a work approved moments
    // ago, or the listing's very first views would bounce off with a 404.
    const db = primaryDb(env);

    // Only count stats for works that actually exist.
    const work = await db
      .prepare("SELECT id FROM works WHERE id = ?1 LIMIT 1")
      .bind(workId)
      .first();
    if (!work) {
      return json({ error: "Unknown work." }, 404);
    }

    // Dedupe one count per work+type+IP per hour.
    if (env.CODES && typeof env.CODES.get === "function" && typeof env.CODES.put === "function") {
      const ip = String(request.headers.get("cf-connecting-ip") || "unknown");
      const key = `track:${workId}:${type}:${ip}`;
      const seen = await env.CODES.get(key);
      if (seen) {
        return json({ ok: true, counted: false });
      }
      await env.CODES.put(key, "1", { expirationTtl: 3600 });
    }

    const column = type === "view" ? "views" : "downloads";
    await db
      .prepare(
        `INSERT INTO work_stats_daily (work_id, day, views, downloads)
         VALUES (?1, ?2, ${type === "view" ? 1 : 0}, ${type === "download" ? 1 : 0})
         ON CONFLICT(work_id, day) DO UPDATE SET ${column} = ${column} + 1`
      )
      .bind(workId, utcDay())
      .run();

    return json({ ok: true, counted: true });
  } catch (err) {
    console.error(`track: failed: ${err && err.message}`);
    return json({ error: "We couldn't record that — please try again later." }, 500);
  }
}
