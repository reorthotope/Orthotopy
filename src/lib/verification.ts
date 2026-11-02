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
