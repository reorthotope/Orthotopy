"use client";

import { useEffect, useState } from "react";
import { LifeBuoy } from "lucide-react";
import { SupportTicketChat } from "./support-ticket-chat";
import { appealIdFromPath } from "./support-thread";
import { readAuth } from "./dev-profile";

/**
 * The client half of the /support/appeal-… page. The static shell loads at
 * /support/appeal-shell (and is served by functions/support/[slug].js for
 * real ticket links); this component re-parses the ticket id from the
 * address bar, attaches the visitor's bearer session (if the owner is
 * signed in) and hands everything to the encrypted chat panel.
 */
export function SupportTicketClient() {
  const [id, setId] = useState<string | null>(null);
  const [bearer, setBearer] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setId(appealIdFromPath(window.location.pathname));
    const auth = readAuth();
    if (auth?.token) setBearer(auth.token);
    setReady(true);
  }, []);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 mx-auto size-[420px] rounded-full bg-emerald-500/10 blur-3xl"
      />
      <div className="relative w-full max-w-2xl">
        <div className="mb-6 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <LifeBuoy className="size-6" aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Orthotopy support</h1>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
            {ready && id
              ? "Your private ticket chat. Messages are end-to-end encrypted — only you and the Orthotopy team can read them."
              : "Tickets open only through their private link — only the account that created a ticket and the Orthotopy team can read it."}
          </p>
        </div>

        {ready && id ? (
          <SupportTicketChat id={id} auth={{ bearer }} />
        ) : (
          <div className="rounded-2xl border bg-card p-8 text-center">
            <p className="text-sm font-semibold">This support link isn&apos;t valid</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
              Ticket links look like /support/appeal-username-12345678 and are
              issued when a ticket is created. Open your dashboard to see your
              tickets or to start a new one.
            </p>
            <a
              href="/dashboard"
              className="mt-5 inline-flex h-8 items-center rounded-lg border px-4 text-xs font-medium hover:bg-muted"
            >
              Open your dashboard
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
