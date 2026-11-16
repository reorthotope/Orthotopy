"use client";

/**
 * Client-side machinery for the appeal / support chat system.
 *
 * LINK MODEL — every ticket is a thread whose id doubles as its private
 * link:  appeal-<username><8 random digits>  (e.g. appeal-pixelwork48291057).
 * The server guarantees every new link is unique; the id is minted once at
 * ticket creation and never rotates.
 *
 * END-TO-END ENCRYPTION — messages are encrypted IN THE BROWSER with
 * AES-256-GCM before they are sent. The key is derived per ticket from the
 * secret link itself (SHA-256 of a versioned label + the id), so:
 *   - D1 stores nothing but opaque ciphertext blobs (v1:<iv>:<ciphertext>);
 *   - the server never encrypts, decrypts or validates message content;
 *   - the only way to read the history is to hold the link — which is
 *     exactly what the owner received and what the /apex console shows
 *     staff. A database dump alone reveals nothing readable.
 *
 * ACCESS CONTROL — /api/support-threads answers 404 to anyone except the
 * ticket's owner (bearer session) and staff (apex console session), so
 * tickets can't be opened or probed through their /support links by
 * outsiders.
 */

const KEY_LABEL = "orthotopy-support-v1";

/** Matches the ids minted by POST /api/support-threads. */
export const APPEAL_SLUG_RE = /^appeal-[a-z0-9][a-z0-9-]{0,58}\d{8}$/;

/** Extracts the ticket id from a /support/appeal-… path, or null. */
export function appealIdFromPath(pathname: string): string | null {
  const match = /\/support\/(appeal-[A-Za-z0-9][A-Za-z0-9-]{0,58}\d{8})(?:\/)?$/.exec(pathname);
  return match ? match[1].toLowerCase() : null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The per-ticket AES-GCM key, derived from the secret link. */
async function ticketKey(id: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${KEY_LABEL}|${id.toLowerCase()}`)
  );
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** Encrypts one chat message into the stored blob format. */
export async function encryptTicketMessage(id: string, text: string): Promise<string> {
  const key = await ticketKey(id);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(text)
    )
  );
  return `v1:${bytesToBase64(iv)}:${bytesToBase64(ciphertext)}`;
}

/** Decrypts one stored blob. Unreadable blobs render as a placeholder. */
export async function decryptTicketMessage(id: string, blob: string): Promise<string> {
  const parts = String(blob ?? "").split(":");
  if (parts.length !== 3 || parts[0] !== "v1") return "[unreadable message]";
  try {
    const key = await ticketKey(id);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(parts[1]) as unknown as BufferSource },
      key,
      base64ToBytes(parts[2]) as unknown as BufferSource
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return "[unreadable message]";
  }
}

export interface SupportThread {
  id: string;
  username: string;
  subject: string;
  context: string;
  status: "open" | "answered" | "closed";
  createdAt: string | null;
  updatedAt: string | null;
  viewer?: "owner" | "staff";
}

export interface SupportMessage {
  id: string;
  sender: "user" | "staff";
  /** Ciphertext as stored — call decryptTicketMessage for the text. */
  body: string;
  createdAt: string | null;
}

export interface ThreadReadResult {
  status: "ok" | "not-found" | "error";
  thread?: SupportThread;
  messages?: SupportMessage[];
  error?: string;
}

/** Loads the thread metadata + encrypted messages (owner or staff only). */
export async function readThread(
  id: string,
  auth?: { bearer?: string | null; apexToken?: string | null }
): Promise<ThreadReadResult> {
  try {
    const res = await fetch(`/api/support-threads?id=${encodeURIComponent(id)}`, {
      headers: {
        ...(auth?.bearer ? { authorization: `Bearer ${auth.bearer}` } : {}),
        ...(auth?.apexToken ? { "x-apex-token": auth.apexToken } : {}),
      },
    });
    if (res.status === 404) return { status: "not-found" };
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string; thread?: SupportThread; messages?: SupportMessage[] }
      | null;
    if (res.ok && data?.ok && data.thread && data.messages) {
      return { status: "ok", thread: data.thread, messages: data.messages };
    }
    return { status: "error", error: data?.error || "Couldn't load the ticket." };
  } catch {
    return { status: "error", error: "Network error — couldn't reach the server." };
  }
}

/** Encrypts in the browser, then appends the blob to the thread. */
export async function sendTicketMessage(
  id: string,
  text: string,
  auth?: { bearer?: string | null; apexToken?: string | null }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const body = await encryptTicketMessage(id, text);
    const res = await fetch("/api/support-threads", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(auth?.bearer ? { authorization: `Bearer ${auth.bearer}` } : {}),
        ...(auth?.apexToken ? { "x-apex-token": auth.apexToken } : {}),
      },
      body: JSON.stringify({ action: "send", id, body }),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (res.ok && data?.ok) return { ok: true };
    return { ok: false, error: data?.error || "The message didn't go through — try again." };
  } catch {
    return { ok: false, error: "Network error — the message didn't go through." };
  }
}

export interface ThreadCreateResult {
  ok: boolean;
  id?: string;
  url?: string;
  error?: string;
}

/**
 * Opens a new ticket and returns the /support/<id> URL to navigate to.
 *
 * The id is minted HERE (username part + 8 random digits) because the
 * optional first message must be encrypted with the id's key before the
 * ticket exists. The server re-derives the username part from the session,
 * probes uniqueness and refuses anything that doesn't match the caller's
 * own account — so every new link is unique and always self-owned.
 */
export async function createTicket(
  bearer: string,
  username: string,
  input: { subject?: string; context?: string; message?: string }
): Promise<ThreadCreateResult> {
  try {
    const part =
      username
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "dev";
    const id = `appeal-${part}${Array.from(
      crypto.getRandomValues(new Uint8Array(8))
    )
      .map((b) => String(b % 10))
      .join("")}`;
    const body = input.message
      ? { id, body: await encryptTicketMessage(id, input.message) }
      : { id };
    const res = await fetch("/api/support-threads", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify({ action: "create", subject: input.subject, context: input.context, ...body }),
    });
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string; id?: string; url?: string }
      | null;
    if (res.ok && data?.ok && data.id && data.url) {
      return { ok: true, id: data.id, url: data.url };
    }
    return { ok: false, error: data?.error || "Couldn't open a ticket — try again in a moment." };
  } catch {
    return { ok: false, error: "Network error — couldn't open a ticket." };
  }
}

/** The caller's own tickets (dashboard "Support tickets" card). */
export async function listMyThreads(
  bearer: string
): Promise<{ ok: boolean; threads?: SupportThread[]; error?: string }> {
  try {
    const res = await fetch("/api/support-threads", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify({ action: "mine" }),
    });
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string; threads?: SupportThread[] }
      | null;
    if (res.ok && data?.ok && data.threads) return { ok: true, threads: data.threads };
    return { ok: false, error: data?.error || "Couldn't load your tickets." };
  } catch {
    return { ok: false, error: "Network error — couldn't load your tickets." };
  }
}

/** Closes or reopens a ticket (owner or staff). */
export async function setThreadStatus(
  id: string,
  action: "close" | "reopen",
  auth?: { bearer?: string | null; apexToken?: string | null }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/support-threads", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(auth?.bearer ? { authorization: `Bearer ${auth.bearer}` } : {}),
        ...(auth?.apexToken ? { "x-apex-token": auth.apexToken } : {}),
      },
      body: JSON.stringify({ action, id }),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (res.ok && data?.ok) return { ok: true };
    return { ok: false, error: data?.error || "That didn't go through." };
  } catch {
    return { ok: false, error: "Network error — that didn't go through." };
  }
}
