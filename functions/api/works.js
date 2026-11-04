import {
  ensureProfileSchema,
  getSessionUser,
  json,
} from "./_shared.js";

/**
 * POST /api/works — record a work the moment a developer submits it.
 *
 * Publishing on Orthotopy ends in a prefilled GitHub issue that adds the
 * entry to public/catalog/works.json (the catalog is a static, reviewable
 * file). This endpoint gives the submitted work a row in D1 right away with
 * status 'pending', so it shows up in the developer's dashboard ("Your
 * works") immediately — views/downloads stay at zero until people actually
 * use the work. When the catalog issue merges, the entry is live on the
 * storefront.
 *
 * Body: { title, tagline, kind, category, icon?, gradient? }
 * Requires a bearer session with publish access (a verified GitHub identity).
 *
 * Bindings: DB (D1, required)
 */

const KIND_RE = /^(Developer|Creator)$/;
const MAX_ID_TRIES = 40;

function slugifyTitle(raw) {
  const base = String(raw ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "work";
}

export async function onRequestPost({ request, env }) {
  const user = await getSessionUser(env, request);
  if (!user) {
    return json({ error: "Your session has expired — sign in with GitHub again to continue." }, 401);
  }
  if (user.publish_access !== 1) {
    return json(
      { error: "Publishing unlocks with your verified GitHub identity — sign in with GitHub once more." },
      403
    );
  }
  if (!env.DB || typeof env.DB.prepare !== "function") {
    return json({ error: "Database not ready — please try again in a moment." }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const title = String(body?.title ?? "").trim();
  const tagline = String(body?.tagline ?? "").trim();
  const kind = KIND_RE.test(String(body?.kind ?? "")) ? String(body.kind) : "Developer";
  const category = String(body?.category ?? "Other").trim().slice(0, 40) || "Other";
  const icon = String(body?.icon ?? "sparkles").trim().slice(0, 40) || "sparkles";
  const gradient = String(body?.gradient ?? "").trim().slice(0, 120);

  if (title.length < 2 || title.length > 80) {
    return json({ error: "Give the work a title between 2 and 80 characters." }, 400);
  }
  if (tagline.length > 160) {
    return json({ error: "The one-line pitch can be at most 160 characters." }, 400);
  }

  try {
    await ensureProfileSchema(env);

    // Unique, human-readable id derived from the title.
    const base = slugifyTitle(title);
    let id = base;
    for (let n = 2; n <= MAX_ID_TRIES; n += 1) {
      const clash = await env.DB.prepare("SELECT 1 FROM works WHERE id = ?1 LIMIT 1")
        .bind(id)
        .first();
      if (!clash) break;
      id = `${base}-${n}`;
    }

    const createdAt = new Date().toISOString();
    await env.DB
      .prepare(
        `INSERT INTO works (id, username, title, tagline, kind, category, icon, gradient, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', ?9)`
      )
      .bind(id, user.username, title, tagline, kind, category, icon, gradient, createdAt)
      .run();

    return json({
      ok: true,
      work: {
        id,
        title,
        tagline,
        kind,
        category,
        icon,
        gradient,
        status: "pending",
        createdAt,
        views: 0,
        downloads: 0,
      },
    });
  } catch (err) {
    console.error(`works: insert failed: ${err && err.message}`);
    return json({ error: "We couldn't record that — please try again in a moment." }, 500);
  }
}
