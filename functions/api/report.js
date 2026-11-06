import { ensureProfileSchema, generateToken, json, primaryDb, rateLimit, getSessionUser } from "./_shared.js";

/**
 * POST /api/report — public report intake ("report a work / a developer"),
 * read and triaged in the /apex console.
 *
 * Body (JSON):
 *   { targetType: "work" | "user", targetId: string,
 *     reason: one of REPORT_REASONS, details?: string, contact?: string }
 *
 * The target is verified to exist before the report is accepted, so the
 * queue never fills with ghosts. Signed-in developers get their GitHub
 * login attached automatically; anonymous reporters can leave a contact.
 *
 * Throttled per IP (10 reports/hour). Same origin only.
 *
 * Bindings: DB (D1 — user_reports), CODES (KV — throttle).
 */

const REPORT_REASONS = [
  "broken-link",
  "not-working",
  "infringing",
  "malware",
  "spam",
  "other",
];
const MAX_PER_HOUR = 10;

export async function onRequestPost({ request, env }) {
  if (!env.DB || typeof env.DB.prepare !== "function") {
    return json({ error: "Database not ready." }, 500);
  }
  if (!(await rateLimit(env, request, "report", MAX_PER_HOUR, 3600))) {
    return json(
      { error: "Several reports already came in from this network — please try again a bit later." },
      429
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const targetType = String(body?.targetType ?? "").trim();
  const targetId = String(body?.targetId ?? "").trim();
  const reason = String(body?.reason ?? "").trim();
  const details = String(body?.details ?? "").trim().slice(0, 2000);
  const contact = String(body?.contact ?? "").trim().slice(0, 200);

  if (targetType !== "work" && targetType !== "user") {
    return json({ error: "Say what you're reporting — a work or a user." }, 400);
  }
  if (!targetId || targetId.length > 120) {
    return json({ error: "Missing target." }, 400);
  }
  if (!REPORT_REASONS.includes(reason)) {
    return json({ error: "Pick a reason for the report." }, 400);
  }

  try {
    await ensureProfileSchema(env);
    // Primary-pinned: the target must exist — no ghost reports — and a work
    // approved seconds ago has to be reportable right away.
    const db = primaryDb(env);

    // The target must exist — no ghost reports.
    const target =
      targetType === "work"
        ? await db.prepare("SELECT 1 FROM works WHERE id = ?1 LIMIT 1").bind(targetId).first()
        : await db.prepare("SELECT 1 FROM users WHERE username = ?1 LIMIT 1").bind(targetId).first();
    if (!target) {
      return json({ error: "We couldn't find that target on Orthotopy." }, 404);
    }

    let reporter = "";
    const user = await getSessionUser(env, request);
    if (user?.username) reporter = String(user.username);

    const id = `rep_${generateToken().slice(0, 20)}`;
    await db
      .prepare(
        `INSERT INTO user_reports (id, target_type, target_id, reporter, contact, reason, details, status, admin_note, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'open', '', ?8)`
      )
      .bind(id, targetType, targetId, reporter, contact, reason, details, new Date().toISOString())
      .run();
    return json({ ok: true, id });
  } catch (err) {
    console.error(`report: insert failed: ${err && err.message}`);
    return json({ error: "We couldn't record that — please try again in a moment." }, 500);
  }
}
