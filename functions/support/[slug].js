import { ensureProfileSchema } from "../api/_shared.js";

/**
 * /support/appeal-<username><8-digits> — the appeal & support chat page.
 *
 * The site is a static export, so there is no server-rendered dynamic
 * route; this Pages Function bridges the gap. It validates the ticket-link
 * shape, makes sure the ticket actually exists in D1 (unknown links get the
 * real 404 page instead of a shell that loads nothing), then serves the
 * static shell page (/support/appeal-shell). The shell's client component
 * re-parses the id from the address bar, loads the thread through
 * /api/support-threads and renders the encrypted chat.
 *
 * Access control happens in the API: only the ticket's owner (bearer
 * session) and staff (apex console session) can read or post messages —
 * everyone else, including other signed-in developers, gets a 404 and sees
 * a "this ticket isn't yours" card. This function only decides whether the
 * shell loads at all.
 *
 * Bindings: DB (D1), ASSETS (implicit Cloudflare Pages static assets).
 */

const SLUG_RE = /^appeal-[a-z0-9][a-z0-9-]{0,58}\d{8}$/i;

/** Serves a static asset path with an overridden HTTP status (for 404s). */
async function serveAsset(env, request, path, status) {
  const asset = await env.ASSETS.fetch(new URL(path, request.url));
  return new Response(asset.body, { status, headers: asset.headers });
}

export async function onRequestGet({ request, env, params }) {
  const slug = String(params?.slug ?? "");
  // Pages Functions run before static assets, so the shell's own path lands
  // here too — pass it through to the asset server.
  if (slug.toLowerCase() === "appeal-shell") {
    return env.ASSETS.fetch(new URL("/support/appeal-shell", request.url));
  }
  if (!SLUG_RE.test(slug)) {
    // Not shaped like a ticket link — serve the site's real 404 page.
    return serveAsset(env, request, "/404.html", 404);
  }
  if (env.DB && typeof env.DB.prepare === "function") {
    try {
      await ensureProfileSchema(env);
      const exists = await env.DB
        .prepare("SELECT 1 FROM support_threads WHERE id = ?1 LIMIT 1")
        .bind(slug.toLowerCase())
        .first();
      if (!exists) {
        return serveAsset(env, request, "/404.html", 404);
      }
    } catch (err) {
      // A failed existence check must never take the page down — the API
      // layer still refuses to hand out data to anyone unauthorized.
      console.error(`support/[slug]: existence check failed: ${err && err.message}`);
    }
  }
  return env.ASSETS.fetch(new URL("/support/appeal-shell", request.url));
}
