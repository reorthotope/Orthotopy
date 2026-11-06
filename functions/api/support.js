import { ensureProfileSchema, generateToken, json, rateLimit, getSessionUser } from "./_shared.js";

/**
 * POST /api/support — public support-ticket intake, read and triaged in the
 * /apex console.
 *
 * Body (JSON):
 *   { subject: string, message: string, contact?: string }
 *
 * A signed-in developer's GitHub login is attached automatically when the
 * request carries their session bearer token; visitors can leave a contact
 * (email, GitHub handle, anything) instead. Anonymous is fine — no account
 * is required to ask for help.
 *
 * Throttled per IP (5 tickets/hour) so the queue can't be flooded. Same
 * origin only — no CORS headers are emitted.
 *
 * Bindings: DB (D1 — support_tickets), CODES (KV — throttle).
 */

const MAX_PER_HOUR = 5;

export async function onRequestPost({ request, env }) {
  if (!env.DB || typeof env.DB.prepare !== "function") {
    return json({ error: "Database not ready." }, 500);
  }
  if (!(await rateLimit(env, request, "support", MAX_PER_HOUR, 3600))) {
    return json(
      { error: "Several tickets already came in from this network — please try again a bit later." },
      429
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const subject = String(body?.subject ?? "").trim();
  const message = String(body?.message ?? "").trim();
  const contact = String(body?.contact ?? "").trim().slice(0, 200);
  if (subject.length < 3 || subject.length > 120) {
    return json({ error: "Give the ticket a subject between 3 and 120 characters." }, 400);
  }
  if (message.length < 10 || message.length > 4000) {
    return json({ error: "Describe it in 10–4000 characters." }, 400);
  }

  // Attach the GitHub username automatically for signed-in developers.
  let username = "";
  const user = await getSessionUser(env, request);
  if (user?.username) username = String(user.username);

  try {
    await ensureProfileSchema(env);
    const id = `tik_${generateToken().slice(0, 20)}`;
    await env.DB
      .prepare(
        `INSERT INTO support_tickets (id, username, contact, subject, message, status, priority, admin_note, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'open', 'normal', '', ?6)`
      )
      .bind(id, username, contact, subject, message, new Date().toISOString())
      .run();
    return json({ ok: true, id });
  } catch (err) {
    console.error(`support: insert failed: ${err && err.message}`);
    return json({ error: "We couldn't record that — please try again in a moment." }, 500);
  }
}
