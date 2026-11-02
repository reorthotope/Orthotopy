"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile widget — OPTIONAL.
 *
 * The human check only exists when a site key is configured at build time
 * (NEXT_PUBLIC_TURNSTILE_SITE_KEY). Without it the widget isn't rendered at
 * all and the form flows without it — the API likewise skips verification
 * while TURNSTILE_SECRET_KEY is unset. Keep the pair in sync in the Pages
 * settings (build variable + variable must come from the SAME widget, and
 * the widget's hostname list must include the domains it is served on).
 */

export const TURNSTILE_ENABLED = Boolean(
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
);

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId?: string) => void;
    };
    __orthotopyTurnstileReady?: Promise<void>;
  }
}

function loadTurnstile(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!window.__orthotopyTurnstileReady) {
    window.__orthotopyTurnstileReady = new Promise<void>((resolve, reject) => {
      const callbackName = "__orthotopyTurnstileLoad";
      (window as unknown as Record<string, unknown>)[callbackName] = () => resolve();
      const script = document.createElement("script");
      script.src = `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=${callbackName}`;
      script.async = true;
      script.onerror = () => reject(new Error("Turnstile script failed to load"));
      document.head.appendChild(script);
    });
  }
  return window.__orthotopyTurnstileReady;
}

interface TurnstileProps {
  onToken: (token: string) => void;
  /** Increment to reset the widget (e.g. after a token was consumed). */
  resetSignal?: number;
}

export function Turnstile({ onToken, resetSignal = 0 }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let cancelled = false;
    if (!TURNSTILE_ENABLED) return;
    loadTurnstile()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        if (widgetIdRef.current !== null) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(""),
          "error-callback": () => onTokenRef.current(""),
          theme: "auto",
          // Stay out of the way: the form auto-sends the code as soon as a
          // token exists, so only show UI when an interaction is required.
          appearance: "interaction-only",
        });
      })
      .catch(() => {
        // Script blocked/offline: the API layer surfaces the missing token.
      });
    return () => {
      cancelled = true;
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (resetSignal > 0 && widgetIdRef.current !== null && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
      onTokenRef.current("");
    }
  }, [resetSignal]);

  return <div ref={containerRef} className="min-h-16" aria-label="Human verification" />;
}
