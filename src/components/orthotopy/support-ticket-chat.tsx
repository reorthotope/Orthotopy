"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquareLock, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  decryptTicketMessage,
  readThread,
  sendTicketMessage,
  setThreadStatus,
  type SupportMessage,
  type SupportThread,
} from "./support-thread";

/**
 * The appeal / support chat — the conversation panel used by BOTH ends of a
 * ticket: the owner on /support/appeal-… and staff in the /apex console.
 *
 * Messages are end-to-end encrypted in this browser (AES-256-GCM with a key
 * derived from the ticket's secret link): outgoing text is encrypted before
 * it leaves, incoming ciphertext blobs are decrypted here. The server never
 * sees plaintext.
 *
 * `auth` decides who is talking: owner sessions pass their bearer token,
 * the apex console passes the x-apex-token. The API answers 404 to anyone
 * else, so this component only ever renders for the two allowed parties.
 */

export interface ChatAuth {
  bearer?: string | null;
  apexToken?: string | null;
}

const POLL_MS = 10_000;

export function SupportTicketChat({
  id,
  auth,
  onCloseThread,
  compact,
}: {
  id: string;
  auth: ChatAuth;
  /** Called after the thread's own status changes (closed/reopened). */
  onCloseThread?: () => void;
  compact?: boolean;
}) {
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [messages, setMessages] = useState<{ id: string; sender: string; text: string; createdAt: string | null }[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "not-found" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [decrypted, setDecrypted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const decryptAll = useCallback(
    async (idValue: string, raw: SupportMessage[]) => {
      const out: { id: string; sender: string; text: string; createdAt: string | null }[] = [];
      for (const m of raw) {
        out.push({
          id: m.id,
          sender: m.sender,
          text: await decryptTicketMessage(idValue, m.body),
          createdAt: m.createdAt,
        });
      }
      return out;
    },
    []
  );

  const load = useCallback(async () => {
    const result = await readThread(id, auth);
    if (result.status === "ok" && result.thread && result.messages) {
      setThread(result.thread);
      setMessages(await decryptAll(id, result.messages));
      setDecrypted(true);
      setState("ok");
      setError(null);
    } else if (result.status === "not-found") {
      setState("not-found");
    } else {
      setState("error");
      setError(result.error || "Couldn't load the ticket.");
    }
  }, [id, auth, decryptAll]);

  useEffect(() => {
    void load();
  }, [load]);

  // Light polling keeps both sides in sync while the chat is open.
  useEffect(() => {
    if (state !== "ok") return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [state, load]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, state]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    const result = await sendTicketMessage(id, text, auth);
    setSending(false);
    if (result.ok) {
      setDraft("");
      await load();
    } else {
      setError(result.error || "The message didn't go through.");
    }
  };

  const changeStatus = async (action: "close" | "reopen") => {
    setError(null);
    const result = await setThreadStatus(id, action, auth);
    if (result.ok) {
      onCloseThread?.();
      await load();
    } else {
      setError(result.error || "That didn't go through.");
    }
  };

  if (state === "loading" && !thread) {
    return (
      <div className="flex justify-center py-14" aria-label="Loading ticket">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  if (state === "not-found") {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center">
        <MessageSquareLock className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
        <p className="mt-3 text-sm font-semibold">This support ticket isn&apos;t available to you</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
          Ticket links open only for the account that created them and for the
          Orthotopy team. Sign in with the GitHub account that owns this
          ticket, or go back to your dashboard to open a new one.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-5">
          <a href="/dashboard">Open your dashboard</a>
        </Button>
      </div>
    );
  }

  if (state === "error") {
    return (
      <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
        {error || "Couldn't load the ticket — try again in a moment."}
      </p>
    );
  }

  const closed = thread?.status === "closed";
  const statusLabel = closed ? "Closed" : thread?.status === "answered" ? "Answered" : "Open";

  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{thread?.subject || "Support ticket"}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-600 dark:text-sky-400">
              {statusLabel}
            </span>
            {thread?.viewer === "staff" && thread.username ? (
              <span>with {thread.username}</span>
            ) : null}
            {thread?.createdAt ? <span>opened {new Date(thread.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span> : null}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {closed ? (
            <Button size="sm" variant="outline" onClick={() => void changeStatus("reopen")}>
              Reopen
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => void changeStatus("close")}>
              Close ticket
            </Button>
          )}
        </div>
      </div>

      {/* messages */}
      <div
        ref={scrollRef}
        className={`max-h-[420px] space-y-3 overflow-y-auto px-5 py-4 ${compact ? "" : "min-h-[260px]"}`}
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            No messages yet — say what happened and the team will pick it up.
          </p>
        ) : null}
        {messages.map((m) => {
          const mine = thread?.viewer === "staff" ? m.sender === "staff" : m.sender === "user";
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  mine
                    ? "rounded-br-md bg-emerald-600 text-white"
                    : "rounded-bl-md bg-muted text-foreground"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.text}</p>
                <p className={`mt-1 text-[10px] tabular-nums ${mine ? "text-white/70" : "text-muted-foreground"}`}>
                  {mine ? (thread?.viewer === "staff" ? "You (staff)" : "You") : thread?.viewer === "staff" ? m.sender === "staff" ? "You (staff)" : thread.username || "developer" : "Orthotopy team"}
                  {m.createdAt
                    ? ` · ${new Date(m.createdAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}`
                    : ""}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* composer */}
      <div className="border-t px-5 py-4">
        {error ? (
          <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex items-end gap-2">
          <Textarea
            rows={2}
            value={draft}
            disabled={closed}
            placeholder={closed ? "This ticket is closed — reopen it to continue." : "Write a message…"}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void send();
              }
            }}
            className="min-h-0 resize-none"
            aria-label="Ticket message"
          />
          <Button size="sm" disabled={closed || sending || !draft.trim()} onClick={() => void send()}>
            {sending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="size-4" aria-hidden="true" />
            )}
            Send
          </Button>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="size-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
          {decrypted
            ? "End-to-end encrypted — messages are encrypted and decrypted in your browser; the server stores ciphertext only."
            : "Decrypting messages…"}
        </p>
      </div>
    </div>
  );
}
