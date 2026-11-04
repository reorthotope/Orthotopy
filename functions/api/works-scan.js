import { getSessionUser, githubTokenKey, json } from "./_shared.js";
import {
  detectRepoImages,
  fetchLatestRelease,
  fetchRepoMeta,
  parseRepoUrl,
  repoImageUrl,
  repoWebUrl,
} from "./_gh-repo.js";

/**
 * POST /api/works-scan — live repo preview for the publish form.
 *
 * Body: { repoUrl: "github.com/owner/repo" } with a bearer session.
 *
 * As soon as the developer types their repo link, the form asks this
 * endpoint to look the repo up on GitHub and answers with everything the
 * next step shows:
 *   - whether the repo exists AND is public (publishing requires public),
 *   - the screenshot files found in the repo root (img.png, img1.png …
 *     img9.png, .png or .jpeg/.jpg) with their ready-to-serve raw URLs,
 *   - a suggested download link from the repo's latest GitHub release
 *     (first release asset — browsers auto-download it), prefilled only
 *     when the developer hasn't typed one.
 *
 * Bindings:
 *   CODES KV namespace (optional — the developer's GitHub OAuth token so the
 *   upstream reads are authenticated and immune to anonymous rate limits)
 */

export async function onRequestPost({ request, env }) {
  const user = await getSessionUser(env, request);
  if (!user) {
    return json({ error: "Your session has expired — sign in with GitHub again to continue." }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const parsed = parseRepoUrl(String(body?.repoUrl ?? ""));
  if (!parsed) {
    return json({ error: "That doesn't look like a GitHub repo link — use github.com/owner/repo." }, 400);
  }

  let token = null;
  if (env.CODES && typeof env.CODES.get === "function") {
    try {
      token = (await env.CODES.get(githubTokenKey(user.username))) || null;
    } catch {
      token = null;
    }
  }

  const meta = await fetchRepoMeta(env, token, parsed.owner, parsed.repo);
  if (!meta.ok) {
    if (meta.reason === "rate-limited") {
      return json({ error: "GitHub is rate-limiting us right now — please try again in a minute." }, 503);
    }
    if (meta.reason === "unreachable") {
      return json({ error: "We couldn't reach GitHub — please try again in a moment." }, 502);
    }
    return json({ error: "Repo not found on GitHub — check the link (and that it's public)." }, 404);
  }
  if (!meta.isPublic) {
    return json({ error: "The repo must be public to publish it here." }, 403);
  }

  const [imageFiles, releaseUrl] = await Promise.all([
    detectRepoImages(env, token, parsed.owner, parsed.repo),
    fetchLatestRelease(env, token, parsed.owner, parsed.repo),
  ]);

  return json({
    ok: true,
    owner: parsed.owner,
    repo: parsed.repo,
    repoUrl: repoWebUrl(parsed.owner, parsed.repo),
    description: meta.description || "",
    images: imageFiles,
    imageUrls: imageFiles.map((file) => repoImageUrl(env, parsed.owner, parsed.repo, file)),
    suggestedDownloadUrl: releaseUrl || "",
  });
}
