import {
  apexSessionValid,
  ensureProfileSchema,
  generateToken,
  getSessionUser,
  isValidMessageCipher,
  json,
  primaryDb,
  rateLimit,
} from "./_shared.js";

/**
 * Appeal / support chat threads — the messaging backend for
 * /support/appeal-<username><8-digits> links and the /apex console.
 *
 * Every ticket is a thread whose id IS its private link:
 *   appeal-<username><8 random digits>   e.g. appeal-pixelwork48291057
 * Created per request, guaranteed never to repeat (probe-before-insert in a
 * 100-million-wide digit space, per username prefix). The owner reaches the
 * chat through the link with their normal bearer session; staff reach the
 * same chat from the /apex console with the x-apex-token session. Anyone
 * else — including other signed-in developers — gets a 404 for reads and
 * writes, so ticket URLs can't be browsed into.
 *
 * END-TO-END ENCRYPTION: message bodies are encrypted in the browser
 * (AES-256-GCM, key derived per-thread from the secret link) before they
 * ever leave the client. This server stores and returns only opaque
 * ciphertext blobs ("v1:<iv>:<ciphertext>") — it never sees, validates the
 * content of, or decrypts a message. Losing the link means losing the
 * ability to read the history (by design).
 *
 * POST /api/support-threads  (JSON body; bearer session required for
 *                            developer actions, x-apex-token for staff)
 *   { action: "create", subject?, context?, message? }
 *       → { ok, id, url } — mints the unique appeal link. Moderated
 *         accounts (suspended / banned) are exactly the ones who need this,
 *         so no moderation gate applies here.
 *   { action: "mine" }
 *       → { ok, threads: [...] } — the caller's own tickets (dashboard).
 *   { action: "send", id, body }
 *       → { ok } — appends one encrypted message. `sender` is decided
 *         server-side from the caller's session type (never trusted from
 *         the client).
 *   { action: "close" | "reopen", id }
 *       → { ok, status } — owner or staff can close / reopen.
 *
 * GET /api/support-threads?id=<slug>
 *       → { ok, thread, messages: [{ id, sender, body (ciphertext), createdAt }] }
 *         Owner or staff only; 404 for everyone else.
 *
 * Bindings: DB (D1 — support_threads + support_messages), CODES (KV —
 * rate limits + apex console sessions).
 */

const THREAD_CONTEXTS = new Set([
  "account-suspended",
  "account-banned",
  "work-taken-down",
  "work-suspended",
  "work-banned",
  "general",
]);

const MAX_CREATE_PER_HOUR = 5;
const MAX_SEND_PER_5MIN = 20;

function cleanText(raw, max) {
  return String(raw ?? "").trim().slice(0, max);
}

/** The ticket id is built from the sanitized GitHub login + 8 random digits. */
function sanitizeUsernamePart(username) {
  return (
    String(username ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "dev"
  );
}

// The ticket id shape is appeal-<username-part><8 digits>. The CLIENT mints
// it (it needs the id's key to encrypt the first message); the create action
// below re-derives the username part from the session and probes uniqueness
// before insert, so every new link is unique and can never impersonate
// another account's ticket.

export async function onRequestGet({ request, env }) {
  if (!env.DB || typeof env.DB.prepare !== "function") {
    return json({ error: "Database not ready." }, 500);
  }
  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") ?? "").trim().toLowerCase();
  if (!id || !/^appeal-[a-z0-9-]{1,48}\d{8}$/.test(id)) {
    return json({ error: "That support link isn't valid." }, 404);
  }

  try {
    await ensureProfileSchema(env);
    const db = primaryDb(env);
    const thread = await db
      .prepare("SELECT id, username, subject, context, status, created_at, updated_at FROM support_threads WHERE id = ?1")
      .bind(id)
      .first();
    // 404 for missing AND for unauthorized — existence is not disclosed to
    // anyone who isn't the owner or staff.
    if (!thread) return json({ error: "No ticket with that link." }, 404);

    const isStaff = await apexSessionValid(env, request);
    const user = await getSessionUser(env, request);
    const isOwner = Boolean(
      user && String(user.username).toLowerCase() === String(thread.username).toLowerCase()
    );
    if (!isOwner && !isStaff) {
      return json({ error: "This support ticket isn't yours." }, 404);
    }

    const messagesRes = await db
      .prepare(
        "SELECT id, sender, body, created_at FROM support_messages WHERE thread_id = ?1 ORDER BY created_at ASC, id ASC LIMIT 500"
      )
      .bind(id)
      .all();
    return json({
      ok: true,
      thread: {
        id: String(thread.id),
        username: String(thread.username),
        subject: String(thread.subject || ""),
        context: String(thread.context || ""),
        status: String(thread.status || "open"),
        createdAt: thread.created_at ? String(thread.created_at) : null,
        updatedAt: thread.updated_at ? String(thread.updated_at) : null,
        viewer: isStaff ? "staff" : "owner",
      },
      // Raw ciphertext — decryption happens in the browser of whoever is
      // allowed to hold the link.
      messages: (messagesRes?.results ?? []).map((m) => ({
        id: String(m.id),
        sender: String(m.sender),
        body: String(m.body),
        createdAt: m.created_at ? String(m.created_at) : null,
      })),
    });
  } catch (err) {
    console.error(`support-threads: read failed: ${err && err.message}`);
    return json({ error: "We couldn't load that ticket — please try again in a moment." }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.DB || typeof env.DB.prepare !== "function") {
    return json({ error: "Database not ready." }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const action = String(body?.action ?? "");

  const user = await getSessionUser(env, request);
  const isStaff = await apexSessionValid(env, request);
  if (!user && !isStaff) {
    return json({ error: "Sign in with GitHub to use the support system." }, 401);
  }

  try {
    await ensureProfileSchema(env);
    const db = primaryDb(env);

    // ------------------------------------------------------------- create
    if (action === "create") {
      if (!user) {
        return json({ error: "Sign in with GitHub to open a ticket." }, 403);
      }
      if (!(await rateLimit(env, request, "thread-create", MAX_CREATE_PER_HOUR, 3600))) {
        return json({ error: "Several tickets already came in from this network — try again a bit later." }, 429);
      }
      const context = cleanText(body?.context, 40);
      const subject = cleanText(body?.subject, 120) || "Support request";
      const firstMessage = String(body?.body ?? "");
      if (firstMessage && !isValidMessageCipher(firstMessage)) {
        return json({ error: "That message couldn't be encrypted — reload the page and try again." }, 400);
      }

      // The CLIENT mints the id (it needs the id's key to encrypt the first
      // message before it exists), but the username part is re-derived from
      // the session server-side — a caller can never mint a link that looks
      // like someone else's ticket.
      const usernamePart = sanitizeUsernamePart(user.username);
      const id = String(body?.id ?? "").trim().toLowerCase();
      if (!new RegExp(`^appeal-${usernamePart}\\d{8}$`).test(id)) {
        return json({ error: "That ticket link isn't valid for your account — reload the page and try again." }, 400);
      }
      const clash = await db
        .prepare("SELECT 1 FROM support_threads WHERE id = ?1 LIMIT 1")
        .bind(id)
        .first();
      if (clash) {
        return json({ error: "That ticket link already exists — reload the page and try again." }, 409);
      }

      const now = new Date().toISOString();
      await db
        .prepare(
          `INSERT INTO support_threads (id, username, subject, context, status, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, 'open', ?5, ?5)`
        )
        .bind(id, user.username, subject, THREAD_CONTEXTS.has(context) ? context : "general", now)
        .run();
      if (firstMessage) {
        await db
          .prepare(
            "INSERT INTO support_messages (id, thread_id, sender, body, created_at) VALUES (?1, ?2, 'user', ?3, ?4)"
          )
          .bind(`msg_${generateToken().slice(0, 24)}`, id, firstMessage, now)
          .run();
      }
      return json({ ok: true, id, url: `/support/${id}` });
    }

    // --------------------------------------------------------------- mine
    if (action === "mine") {
      if (!user) {
        return json({ error: "Sign in with GitHub to see your tickets." }, 403);
      }
      const res = await db
        .prepare(
          `SELECT t.id, t.subject, t.context, t.status, t.created_at, t.updated_at,
                  (SELECT COUNT(*) FROM support_messages m WHERE m.thread_id = t.id) AS message_count
           FROM support_threads t WHERE t.username = ?1
           ORDER BY COALESCE(t.updated_at, t.created_at) DESC LIMIT 50`
        )
        .bind(user.username)
        .all();
      return json({
        ok: true,
        threads: (res?.results ?? []).map((r) => ({
          id: String(r.id),
          subject: String(r.subject || ""),
          context: String(r.context || ""),
          status: String(r.status || "open"),
          createdAt: r.created_at ? String(r.created_at) : null,
          updatedAt: r.updated_at ? String(r.updated_at) : null,
          messageCount: Number(r.message_count ?? 0),
        })),
      });
    }

    // send / close / reopen below operate on an existing thread and are
    // open to the owner OR staff.
    const id = String(body?.id ?? "").trim().toLowerCase();
    if (!id || !/^appeal-[a-z0-9-]{1,48}\d{8}$/.test(id)) {
      return json({ error: "That support link isn't valid." }, 404);
    }
    const thread = await db
      .prepare("SELECT id, username, status FROM support_threads WHERE id = ?1")
      .bind(id)
      .first();
    if (!thread) return json({ error: "No ticket with that link." }, 404);
    const isOwner = Boolean(
      user && String(user.username).toLowerCase() === String(thread.username).toLowerCase()
    );
    if (!isOwner && !isStaff) {
      return json({ error: "This support ticket isn't yours." }, 404);
    }
    const sender = isStaff ? "staff" : "user";

    if (action === "send") {
      if (!(await rateLimit(env, request, `thread-send-${sender}`, MAX_SEND_PER_5MIN, 300))) {
        return json({ error: "Slow down a little — too many messages in a row." }, 429);
      }
      const cipher = String(body?.body ?? "");
      if (!isValidMessageCipher(cipher)) {
        return json({ error: "That message couldn't be encrypted — reload the page and try again." }, 400);
      }
      const status = String(thread.status || "open");
      if (status === "closed" && sender === "user") {
        return json({ error: "This ticket is closed — press Reopen if you still need help." }, 409);
      }
      const now = new Date().toISOString();
      await db.batch([
        db
          .prepare(
            "INSERT INTO support_messages (id, thread_id, sender, body, created_at) VALUES (?1, ?2, ?3, ?4, ?5)"
          )
          .bind(`msg_${generateToken().slice(0, 24)}`, id, sender, cipher, now),
        // A staff reply marks the thread answered; a user reply opens it
        // again for staff attention. Closed stays closed for staff.
        db
          .prepare(
            `UPDATE support_threads SET updated_at = ?1, status = ?2 WHERE id = ?3`
          )
          .bind(
            now,
            status === "closed" && sender === "staff"
              ? "closed"
              : sender === "staff"
                ? "answered"
                : "open",
            id
          ),
      ]);
      return json({ ok: true, id, sender });
    }

    if (action === "close" || action === "reopen") {
      const status = action === "close" ? "closed" : "open";
      const result = await db
        .prepare("UPDATE support_threads SET status = ?1, updated_at = ?2 WHERE id = ?3")
        .bind(status, new Date().toISOString(), id)
        .run();
      if (!Number(result?.meta?.changes ?? 0)) {
        return json({ error: "No ticket with that link." }, 404);
      }
      return json({ ok: true, id, status });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (err) {
    console.error(`support-threads: ${action} failed: ${err && err.message}`);
    return json({ error: "We couldn't do that — please try again in a moment." }, 500);
  }
}
