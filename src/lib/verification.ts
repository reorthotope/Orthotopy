/**
 * Verification-code format for the dev-team flow, shared by the demo preview
 * and (later) the real Cloudflare Pages Function that emails codes via Brevo.
 *
 * Format: 6 characters — the first two are random letters (A-Z) and the last
 * four are random digits (0-9), e.g. "XK4831".
 */

export const CODE_LENGTH = 6;
export const CODE_PATTERN = /^[A-Z]{2}[0-9]{4}$/;

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";

function pick(alphabet: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    return alphabet[crypto.getRandomValues(new Uint32Array(1))[0] % alphabet.length];
  }
  return alphabet[Math.floor(Math.random() * alphabet.length)];
}

/** Returns a fresh code in the LLDDDD format, e.g. "QR0723". */
export function generateVerificationCode(): string {
  return (
    pick(LETTERS) +
    pick(LETTERS) +
    pick(DIGITS) +
    pick(DIGITS) +
    pick(DIGITS) +
    pick(DIGITS)
  );
}

/** Uppercases and strips anything that is not A-Z / 0-9. */
export function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Username policy (mirror of functions/api/_shared.js — keep both in sync):
 *  - always lowercase (the input lowercases as you type)
 *  - 3–20 characters
 *  - lowercase letters, numbers, dots (.), hyphens (-) and underscores (_)
 *  - commas and spaces are never allowed
 *  - must START with a letter (no number, no symbol, no period)
 *  - must END with a letter or number (no symbol or period)
 *
 * Returns the specific reason when invalid, or null when acceptable.
 */
export function validateUsername(raw: string): string | null {
  const u = raw;
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
