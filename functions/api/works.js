import {
  ensureProfileSchema,
  getSessionUser,
  githubTokenKey,
  json,
} from "./_shared.js";
import {
  detectRepoImages,
  fetchLatestRelease,
  fetchRepoMeta,
  parseRepoUrl,
  repoImageUrl,
  repoWebUrl,
} from "./_gh-repo.js";

/**
 * POST /api/works — publish a work.
 *
 * The developer submits the listing directly (no signup, no catalog issue):
 * title, type (Apps / Games / Extensions + platform), description, the
 * work's PUBLIC GitHub repo link and a download link (a GitHub Releases
 * asset URL or any direct download URL). Screenshots are never uploaded —
 * they must already live in the repo root as img.png, img1.png … img9.png
 * (.png or .jpeg/.jpg) and are detected from the repo contents here on the
 * server, so the form can never claim images the repo doesn't have.
 *
 * Every submission lands as status 'pending' — under review — and shows on
 * the developer's dashboard immediately. When the review approves it
 * (POST /api/works-admin) it starts appearing in the public catalog feed
 * (GET /api/works) and the storefront, typically within 24–48 hours.
 *
 * GET /api/works — public feed of APPROVED works for the storefront. Safe to
 * cache briefly; contains only what is already public on GitHub.
 *
 * Bindings:
 *   DB    D1 database (required — works table)
 *   CODES KV namespace (optional — the developer's GitHub OAuth token, used
 *         for the upstream repo reads; anonymous fallback works too)
 */

const TYPES = ["Apps", "Games", "Extensions"];
const PLATFORMS = {
  Apps: ["Android", "Desktop", "Mac", "iOS", "Linux"],
  Games: ["Android", "Desktop", "Mac", "iOS"],
  Extensions: ["Chrome", "Firefox", "Edge"],
};
const TYPE_ICONS = { Apps: "box", Games: "gamepad", Extensions: "puzzle" };

const MAX_PENDING_PER_USER = 5;
const MAX_ID_TRIES = 40;

const slugifyTitle = (raw) =>
  String(raw ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "work";

/** Same deterministic gradient the client library uses (hash → palette). */
const GRADIENTS = [
  "from-emerald-500 to-teal-600",
  "from-violet-500 to-fuchsia-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-teal-500 to-emerald-600",
  "from-fuchsia-500 to-purple-600",
  "from-lime-500 to-emerald-600",
  "from-orange-500 to-amber-600",
  "from-green-500 to-emerald-700",
  "from-teal-500 to-green-700",
  "from-violet-500 to-purple-700",
  "from-rose-400 to-orange-500",
];
function gradientFor(seed) {
  let hash = 0;
  const text = String(seed ?? "");
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 100000;
  }
  return GRADIENTS[hash % GRADIENTS.length];
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

function parseImagesColumn(raw) {
  try {
    const list = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(list) ? list.filter((f) => typeof f === "string" && f) : [];
  } catch {
    return [];
  }
}

async function getGithubToken(env, username) {
  if (!env.CODES || typeof env.CODES.get !== "function") return null;
  try {
    const token = await env.CODES.get(githubTokenKey(username));
    return token ? String(token) : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ publish

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
  const type = String(body?.type ?? "").trim();
  const platform = String(body?.platform ?? "").trim();
  const description = String(body?.description ?? "").trim();
  const repoLink = String(body?.repoUrl ?? "").trim();
  const downloadUrl = String(body?.downloadUrl ?? "").trim();

  if (title.length < 2 || title.length > 80) {
    return json({ error: "Give the work a title between 2 and 80 characters." }, 400);
  }
  if (!TYPES.includes(type)) {
    return json({ error: "Pick a type: Apps, Games or Extensions." }, 400);
  }
  if (!PLATFORMS[type].includes(platform)) {
    return json({ error: `Pick a platform for ${type}: ${PLATFORMS[type].join(", ")}.` }, 400);
  }
  if (description.length < 10 || description.length > 2000) {
    return json({ error: "Describe the work in 10–2000 characters." }, 400);
  }

  const parsedRepo = parseRepoUrl(repoLink);
  if (!parsedRepo) {
    return json({ error: "That doesn't look like a GitHub repo link — use github.com/owner/repo." }, 400);
  }
  if (!isValidDownloadUrl(downloadUrl)) {
    return json({ error: "The download link must be a direct https:// URL (GitHub Releases asset or your own)." }, 400);
  }

  try {
    await ensureProfileSchema(env);

    // Keep the review queue tidy: at most a handful of works awaiting review.
    const pending = await env.DB
      .prepare("SELECT COUNT(*) AS n FROM works WHERE username = ?1 AND status = 'pending'")
      .bind(user.username)
      .first();
    if (Number(pending?.n ?? 0) >= MAX_PENDING_PER_USER) {
      return json(
        { error: "You already have several works waiting for review — once they're approved you can publish more." },
        429
      );
    }

    const token = await getGithubToken(env, user.username);
    const meta = await fetchRepoMeta(env, token, parsedRepo.owner, parsedRepo.repo);
    if (!meta.ok) {
      if (meta.reason === "rate-limited") {
        return json({ error: "GitHub is rate-limiting us right now — please try again in a minute." }, 503);
      }
      return json({ error: "That repo couldn't be found on GitHub — check the link (and that it's public)." }, 400);
    }
    if (!meta.isPublic) {
      return json({ error: "The repo must be public to publish it here." }, 400);
    }

    // The server re-detects screenshots from the repo contents — the client's
    // preview is display-only, this list is what gets stored.
    const imageFiles = await detectRepoImages(env, token, parsedRepo.owner, parsedRepo.repo);

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
        `INSERT INTO works
           (id, username, title, tagline, kind, category, icon, gradient, status, created_at,
            description, type, platform, repo_url, repo_owner, repo_name, download_url, images)
         VALUES (?1, ?2, ?3, ?4, 'Developer', ?5, ?6, ?7, 'pending', ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)`
      )
      .bind(
        id,
        user.username,
        title,
        description.slice(0, 160), // legacy column doubles as the short pitch
        type,
        TYPE_ICONS[type],
        gradientFor(id),
        createdAt,
        description,
        type,
        platform,
        repoWebUrl(parsedRepo.owner, parsedRepo.repo),
        parsedRepo.owner,
        parsedRepo.repo,
        downloadUrl,
        JSON.stringify(imageFiles)
      )
      .run();

    return json({
      ok: true,
      work: {
        id,
        title,
        type,
        platform,
        status: "pending",
        createdAt,
        repoUrl: repoWebUrl(parsedRepo.owner, parsedRepo.repo),
        downloadUrl,
        images: imageFiles,
        imageUrls: imageFiles.map((file) =>
          repoImageUrl(env, parsedRepo.owner, parsedRepo.repo, file)
        ),
      },
    });
  } catch (err) {
    console.error(`works: publish failed: ${err && err.message}`);
    return json({ error: "We couldn't record that — please try again in a moment." }, 500);
  }
}

// ------------------------------------------------------- public approved feed

export async function onRequestGet({ env }) {
  if (!env.DB || typeof env.DB.prepare !== "function") {
    return json({ error: "Database not ready." }, 500);
  }
  try {
    await ensureProfileSchema(env);
    const res = await env.DB.prepare(
      `SELECT w.id, w.title, w.tagline, w.description, w.kind, w.category, w.type, w.platform,
              w.icon, w.gradient, w.repo_url, w.repo_owner, w.repo_name, w.download_url,
              w.images, w.created_at,
              COALESCE(NULLIF(u.github_name, ''), w.username) AS creator
       FROM works w LEFT JOIN users u ON u.username = w.username
       WHERE w.status = 'approved'
       ORDER BY w.created_at DESC, w.id ASC
       LIMIT 200`
    ).all();
    const rows = res && Array.isArray(res.results) ? res.results : [];
    const works = rows.map((r) => {
      const type = r.type ? String(r.type) : "";
      const owner = r.repo_owner ? String(r.repo_owner) : "";
      const repo = r.repo_name ? String(r.repo_name) : "";
      const files = parseImagesColumn(r.images);
      return {
        id: String(r.id),
        title: String(r.title || r.id),
        tagline: r.description
          ? String(r.description).slice(0, 160)
          : String(r.tagline || ""),
        description: r.description ? String(r.description) : "",
        kind: r.kind ? String(r.kind) : "Developer",
        category: type || String(r.category || "Other"),
        type,
        platform: r.platform ? String(r.platform) : "",
        icon: type ? TYPE_ICONS[type] || "sparkles" : String(r.icon || "sparkles"),
        gradient: r.gradient ? String(r.gradient) : gradientFor(String(r.id)),
        creator: r.creator ? String(r.creator) : "developer",
        repoUrl: r.repo_url ? String(r.repo_url) : "",
        downloadUrl: r.download_url ? String(r.download_url) : "",
        imageUrls:
          owner && repo
            ? files.map((file) => repoImageUrl(env, owner, repo, file))
            : [],
        createdAt: r.created_at ? String(r.created_at) : null,
      };
    });
    return new Response(JSON.stringify({ ok: true, works }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=60",
      },
    });
  } catch (err) {
    console.error(`works: public feed failed: ${err && err.message}`);
    return json({ error: "Catalog temporarily unavailable." }, 500);
  }
}
