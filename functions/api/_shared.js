/**
 * Shared helpers for the Orthotopy Pages Functions.
 * Imported by functions/api/request-code.js and functions/api/verify.js.
 */

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";

export const CODE_TTL_SECONDS = 600; // codes live for 10 minutes
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 45_000;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_RE = /^\+?[0-9](?:[0-9\s-]{5,17})[0-9]$/;

/**
 * Username policy (mirror of src/lib/verification.ts — keep both in sync):
 *  - always lowercase (the frontend lowercases as the user types)
 *  - 3–20 characters
 *  - lowercase letters, numbers, dots (.), hyphens (-) and underscores (_)
 *  - commas and spaces are never allowed
 *  - must START with a letter (no number, no symbol, no period)
 *  - must END with a letter or number (no symbol or period)
 *
 * Returns the specific reason when invalid, or null when acceptable.
 */
export function usernameError(raw) {
  const u = String(raw ?? "");
  if (!u) return "Choose a username.";
  if (/[A-Z]/.test(u)) return "Usernames are lowercase only.";
  if (/\s/.test(u)) return "Spaces are not allowed in usernames.";
  if (u.includes(",")) return "Commas are not allowed in usernames.";
  if (u.length < 3) return "Username must be at least 3 characters.";
  if (u.length > 20) return "Username can be at most 20 characters.";
  if (!/^[a-z0-9._-]+$/.test(u)) {
    return "Only lowercase letters, numbers, dots (.), hyphens (-) and underscores (_) are allowed.";
  }
  if (/[0-9]/.test(u.charAt(0))) return "Usernames can't start with a number.";
  if (!/^[a-z]/.test(u)) {
    return "Usernames must start with a letter — no symbols, dots or hyphens at the start.";
  }
  if (!/[a-z0-9]$/.test(u)) {
    return "Usernames can't end with a symbol or period — it must end with a letter or number.";
  }
  return null;
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function pick(alphabet) {
  return alphabet[crypto.getRandomValues(new Uint32Array(1))[0] % alphabet.length];
}

/**
 * 6-character code: 2 random letters (A-Z) then 4 random digits (0-9).
 * Same LLDDDD format as src/lib/verification.ts on the frontend.
 */
export function generateCode() {
  return (
    pick(LETTERS) +
    pick(LETTERS) +
    pick(DIGITS) +
    pick(DIGITS) +
    pick(DIGITS) +
    pick(DIGITS)
  );
}

/**
 * Turnstile is enforced as soon as TURNSTILE_SECRET_KEY is configured; until
 * then the check is skipped (test mode) so local dev and staging keep working.
 */
export async function verifyTurnstile(secret, token, ip) {
  if (!secret) return true;
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

export function codeEmailHtml(code) {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f5f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;padding:40px 36px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="font-size:20px;font-weight:700;color:#111827;padding-bottom:4px;">Orthotopy</td></tr>
        <tr><td style="font-size:14px;color:#374151;padding-bottom:24px;">Every work in its right place.</td></tr>
        <tr><td style="font-size:15px;color:#111827;padding-bottom:16px;">Your verification code:</td></tr>
        <tr><td align="center" style="padding-bottom:24px;">
          <div style="display:inline-block;font-size:34px;font-weight:700;letter-spacing:10px;color:#111827;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:12px;padding:16px 28px;">${code}</div>
        </td></tr>
        <tr><td style="font-size:13px;color:#6b7280;line-height:1.6;">This code expires in 10 minutes. Enter it on the Join the Dev Team page.<br/>If you didn&#39;t request it, you can safely ignore this email.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// --- password hashing: PBKDF2-SHA256 via WebCrypto (no runtime dependencies) ---
const PBKDF2_ITERATIONS = 100_000;

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Returns "pbkdf2-sha256$<iterations>$<salt-hex>$<hash-hex>". */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    key,
    256
  );
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(bits)}`;
}
