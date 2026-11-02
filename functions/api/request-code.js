/**
 * POST /api/request-code
 *
 * Body: { email, turnstileToken }
 *
 * Generates a 6-character LLDDDD code (same format as src/lib/verification.ts),
 * stores it in KV for 10 minutes and emails it to the applicant via Brevo.
 *
 * Bindings & variables (Cloudflare Pages → Settings → Bindings / Environment):
 *   CODES                KV namespace (required)
 *   BREVO_API_KEY        Brevo v3 API key (required in production)
 *   TURNSTILE_SECRET_KEY Turnstile secret (optional — check is skipped while unset)
 *   DEV_MODE             "1" ONLY in local dev: returns devCode in the response
 *                        instead of sending email. NEVER set this in Pages.
 */

import {
  CODE_TTL_SECONDS,
  EMAIL_RE,
  RESEND_COOLDOWN_MS,
  codeEmailHtml,
  generateCode,
  json,
  verifyTurnstile,
} from "./_shared.js";

const SENDER = { name: "Orthotopy", email: "noreply@mail.orthotopy.us.ci" };

export async function onRequestPost({ request, env }) {
  if (!env.CODES || typeof env.CODES.get !== "function") {
    return json({ error: "Server setup incomplete — the code store (KV) is not connected yet." }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ error: "Enter a valid email address, e.g. you@example.com." }, 400);
  }

  const ip = request.headers.get("cf-connecting-ip") || undefined;
  const human = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, String(body?.turnstileToken ?? ""), ip);
  if (!human) {
    return json({ error: "Human check failed — refresh the page and try again." }, 403);
  }

  // Light resend throttle so one address can't burn the Brevo daily quota.
  const key = `code:${email}`;
  const existingRaw = await env.CODES.get(key);
  if (existingRaw) {
    try {
      const existing = JSON.parse(existingRaw);
      if (Date.now() - existing.createdAt < RESEND_COOLDOWN_MS) {
        return json({ error: "A code was just sent to this address — wait a minute before requesting another." }, 429);
      }
    } catch {
      // corrupted value: fall through and overwrite it
    }
  }

  const code = generateCode();
  const expiresAt = Date.now() + CODE_TTL_SECONDS * 1000;
  await env.CODES.put(
    key,
    JSON.stringify({ code, attempts: 0, createdAt: Date.now(), expiresAt }),
    { expiration: Math.floor(expiresAt / 1000) }
  );

  // Local-development seam: with DEV_MODE=1 and no Brevo key configured, the
  // code comes back in the response so the flow is testable without email.
  if (!env.BREVO_API_KEY) {
    if (env.DEV_MODE === "1") {
      return json({ ok: true, devCode: code });
    }
    return json({ error: "Email service is not configured yet — please try again soon." }, 500);
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: SENDER,
      to: [{ email }],
      subject: "Your Orthotopy verification code",
      htmlContent: codeEmailHtml(code),
      textContent: `Your Orthotopy verification code is ${code}. It expires in 10 minutes. If you didn't request it, you can ignore this email.`,
    }),
  });
  if (!res.ok) {
    console.error(`request-code: brevo send failed with status ${res.status}`);
    return json({ error: "We couldn't send the email right now — please try again in a moment." }, 502);
  }
  return json({ ok: true });
}
