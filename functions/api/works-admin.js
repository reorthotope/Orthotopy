import { ensureProfileSchema, json } from "./_shared.js";
import { repoImageUrl } from "./_gh-repo.js";

/**
 * POST /api/works-admin — the review side of publishing.
 *
 * Published works arrive as status 'pending' (under review). The site owner
 * approves or rejects them here; approved works immediately appear in the
 * public catalog feed (GET /api/works) and on the storefront.
 *
 * Auth: `x-admin-token` header must equal the ADMIN_TOKEN variable. Set it
 * once in the Cloudflare Pages project settings (Production + Preview):
 *   wrangler pages secret put ADMIN_TOKEN --project-name orthotopy
 * or add it in Dashboard → Settings → Environment variables. Without it the
 * endpoint answers 503 and the queue is untouched.
 *
 * Body (JSON):
 *   { action: "list" }                       → pending queue (oldest first)
 *   { action: "approve" | "reject", id }     → decide one work
 */

async function adminAuthorized(env, request) {
  const expected = String(env?.ADMIN_TOKEN ?? "").trim();
  if (!expected) return false;
  const provided = String(request.headers.get("x-admin-token") ?? "").trim();
  if (!provided || provided.length > 200) return false;
  // Compare SHA-256 digests so byte lengths and timing both line up.
  const digest = async (text) => {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
  };
  const [a, b] = await Promise.all([digest(expected), digest(provided)]);
  return a === b;
}

function parseImagesColumn(raw) {
  try {
    const list = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(list) ? list.filter((f) => typeof f === "string" && f) : [];
  } catch {
    return [];
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.DB || typeof env.DB.prepare !== "function") {
    return json({ error: "Database not ready." }, 500);
  }
  if (!(await adminAuthorized(env, request))) {
    return json({ error: "Admin token missing or wrong (set the ADMIN_TOKEN variable)." }, env?.ADMIN_TOKEN ? 401 : 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const action = String(body?.action ?? "");

  try {
    await ensureProfileSchema(env);

    if (action === "list") {
      const res = await env.DB.prepare(
        `SELECT id, username, title, type, platform, description, repo_url, repo_owner, repo_name, download_url, images, created_at
         FROM works WHERE status = 'pending'
         ORDER BY created_at ASC, id ASC LIMIT 100`
      ).all();
      const rows = res && Array.isArray(res.results) ? res.results : [];
      return json({
        ok: true,
        pending: rows.map((r) => {
          const owner = r.repo_owner ? String(r.repo_owner) : "";
          const repo = r.repo_name ? String(r.repo_name) : "";
          const files = parseImagesColumn(r.images);
          return {
            id: String(r.id),
            username: String(r.username || ""),
            title: String(r.title || r.id),
            type: String(r.type || ""),
            platform: String(r.platform || ""),
            description: String(r.description || ""),
            repoUrl: r.repo_url ? String(r.repo_url) : "",
            downloadUrl: r.download_url ? String(r.download_url) : "",
            imageUrls:
              owner && repo
                ? files.map((file) => repoImageUrl(env, owner, repo, file))
                : [],
            createdAt: String(r.created_at || ""),
          };
        }),
      });
    }

    if (action === "approve" || action === "reject") {
      const id = String(body?.id ?? "").trim();
      if (!id || id.length > 120) {
        return json({ error: "Missing work id." }, 400);
      }
      const status = action === "approve" ? "approved" : "rejected";
      const result = await env.DB
        .prepare("UPDATE works SET status = ?1, reviewed_at = ?2 WHERE id = ?3 AND status = 'pending'")
        .bind(status, new Date().toISOString(), id)
        .run();
      const changed = Number(result?.meta?.changes ?? 0);
      if (!changed) {
        return json({ error: "No pending work with that id." }, 404);
      }
      return json({ ok: true, id, status });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (err) {
    console.error(`works-admin: failed: ${err && err.message}`);
    return json({ error: "We couldn't do that — please try again in a moment." }, 500);
  }
}
