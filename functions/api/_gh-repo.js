/**
 * GitHub repository helpers for the publish flow.
 *
 * Screenshots are never uploaded to Orthotopy: the work's own public GitHub
 * repo hosts them as img.png, img1.png … img9.png (.png or .jpeg/.jpg), and
 * the site reads them straight from the repo via raw.githubusercontent.com.
 * These helpers parse repo links, check that a repo is public, detect the
 * screenshot files and look up a latest-release download link.
 *
 * GH_API_BASE / GH_RAW_BASE are overridable for the local mock server.
 */

const API_BASE = (env) =>
  String(env?.GH_API_BASE ?? "").trim().replace(/\/+$/, "") || "https://api.github.com";
const RAW_BASE = (env) =>
  String(env?.GH_RAW_BASE ?? "").trim().replace(/\/+$/, "") ||
  "https://raw.githubusercontent.com";

/**
 * Screenshot naming convention: img.png / img.jpeg (no number), then
 * img1.png … img9.png — ten images max. .jpg is accepted as a .jpeg alias
 * and the lookup is case-insensitive (GitHub filesystems usually are).
 * The array order is the display order on the site.
 */
export const IMAGE_STEMS = ["img", "img1", "img2", "img3", "img4", "img5", "img6", "img7", "img8", "img9"];
export const IMAGE_EXTENSIONS = [".png", ".jpeg", ".jpg"];
export const MAX_IMAGES = 10;

/**
 * Parses a GitHub repo link into { owner, repo }. Accepts
 * github.com/<owner>/<repo> with or without scheme, trailing .git,
 * extra path segments (/tree/…, /releases/…) and query strings.
 * Returns null for anything that isn't an owner/repo pair.
 */
export function parseRepoUrl(raw) {
  const input = String(raw ?? "").trim();
  if (!input || input.length > 300) return null;
  let host = "";
  let rest = "";
  try {
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    host = url.hostname.toLowerCase();
    rest = url.pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
  if (host !== "github.com" && host !== "www.github.com") return null;
  const match = /^\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9._-]+?)$/.exec(rest);
  if (!match) return null;
  const repo = match[2].replace(/\.git$/i, "");
  if (!repo || repo === ".") return null;
  return { owner: match[1], repo };
}

/** github.com/<owner>/<repo> canonical URL for a parsed repo. */
export function repoWebUrl(owner, repo) {
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

/** Public CDN URL for one screenshot file in the repo's default branch. */
export function repoImageUrl(env, owner, repo, file) {
  return `${RAW_BASE(env)}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/HEAD/${file
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

function ghHeaders(token) {
  const headers = {
    "user-agent": "orthotopy-publish",
    accept: "application/vnd.github+json",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

/**
 * GET /repos/{owner}/{repo} — resolves the repo's public status.
 *   { ok: true, public: boolean, description, ... }
 *   { ok: false, reason: "not-found" | "rate-limited" | "unreachable" }
 */
export async function fetchRepoMeta(env, token, owner, repo) {
  const url = `${API_BASE(env)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  try {
    const res = await fetch(url, { headers: ghHeaders(token) });
    if (res.status === 404) return { ok: false, reason: "not-found" };
    if (res.status === 401) return { ok: false, reason: "not-found" };
    if (res.status === 403 || res.status === 429) return { ok: false, reason: "rate-limited" };
    if (!res.ok) return { ok: false, reason: "unreachable" };
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== "object") return { ok: false, reason: "unreachable" };
    return {
      ok: true,
      isPublic: data.private === false,
      description: typeof data.description === "string" ? data.description : "",
      defaultBranch: typeof data.default_branch === "string" ? data.default_branch : "main",
      ownerLogin: String(data.owner?.login || owner),
    };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

/**
 * Detects the screenshot files in a repo's root.
 *
 * Primary path: GET /repos/{o}/{r}/contents with the developer's OAuth
 * token — one request, lists the whole root. Fallback (no token or the
 * contents call was rate-limited): parallel HEAD probes against
 * raw.githubusercontent.com for every candidate filename — the raw CDN
 * serves public repos without authentication.
 *
 * Returns the matching filenames in display order, e.g.
 * ["img.png", "img1.png", "img2.png"].
 */
export async function detectRepoImages(env, token, owner, repo) {
  const url = `${API_BASE(env)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents`;
  try {
    const res = await fetch(url, { headers: ghHeaders(token) });
    if (res.ok) {
      const listing = await res.json().catch(() => null);
      if (Array.isArray(listing)) {
        return pickImageFiles(listing.map((entry) => String(entry?.name ?? "")));
      }
    }
  } catch {
    // fall through to raw probes
  }
  return probeRepoImages(env, owner, repo);
}

/** Filters a root listing down to the img / imgN screenshot files, in order. */
export function pickImageFiles(names) {
  const wanted = new Map(); // lowercase candidate name -> display order index
  IMAGE_STEMS.forEach((stem, stemIndex) => {
    for (const ext of IMAGE_EXTENSIONS) {
      wanted.set(`${stem}${ext}`, stemIndex);
    }
  });
  const present = new Map(); // display order index -> filename found
  for (const name of names) {
    const order = wanted.get(name.toLowerCase());
    if (order === undefined || present.has(order)) continue;
    present.set(order, name);
  }
  // An exact lowercase spelling (img.png, img1.jpeg …) wins over case variants.
  for (const name of names) {
    const order = wanted.get(name);
    if (order !== undefined) present.set(order, name);
  }
  return [...present.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(0, MAX_IMAGES)
    .map(([, name]) => name);
}

/** Anonymous HEAD probes against the raw CDN for every candidate filename. */
async function probeRepoImages(env, owner, repo) {
  const candidates = [];
  for (const stem of IMAGE_STEMS) {
    for (const ext of IMAGE_EXTENSIONS) {
      candidates.push(`${stem}${ext}`);
    }
  }
  const checks = candidates.map(async (file) => {
    try {
      const res = await fetch(repoImageUrl(env, owner, repo, file), {
        method: "HEAD",
      });
      return res.ok ? file : null;
    } catch {
      return null;
    }
  });
  const found = await Promise.all(checks);
  const hits = new Set(found.filter(Boolean));
  return IMAGE_STEMS.flatMap((stem) =>
    IMAGE_EXTENSIONS.map((ext) => `${stem}${ext}`)
  ).filter((file) => hits.has(file));
}

/**
 * GET /repos/{o}/{r}/releases/latest — suggests a download link: the first
 * release asset's browser_download_url (browsers auto-download assets), so
 * the site's Download button hands the visitor straight to the file while
 * GitHub Releases does the hosting. Returns null when there is no latest
 * release with assets.
 */
export async function fetchLatestRelease(env, token, owner, repo) {
  const url = `${API_BASE(env)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`;
  try {
    const res = await fetch(url, { headers: ghHeaders(token) });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== "object") return null;
    const assets = Array.isArray(data.assets) ? data.assets : [];
    const assetUrl = assets
      .map((a) => String(a?.browser_download_url ?? ""))
      .find((u) => /^https:\/\//.test(u));
    return assetUrl || null;
  } catch {
    return null;
  }
}
