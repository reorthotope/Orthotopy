"use client";

/**
 * Join the Dev Team — one tap, GitHub only.
 *
 * There is no signup form and no sign-in form in this project. Authorizing
 * your GitHub profile IS the account: the callback creates it (or finds it)
 * and the dashboard opens. Nothing to invent (no password), nothing to wait
 * for (no email code), nothing to remember.
 *
 * Flow: POST /api/session {action:"oauth-start"} → github.com authorize →
 * /api/github/callback → /dashboard?github=connected&auth=<one-time-code>.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Github, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  readAuth,
  readCachedProfile,
  startGithubOauth,
} from "./dev-profile";

type JoinState = "idle" | "opening" | "signed-in";

export function JoinDevForm() {
  const router = useRouter();
  const [state, setState] = useState<JoinState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  // Creating a developer account is entering an agreement: the button stays
  // locked until the Terms & Conditions and the Privacy Policy are accepted.
  const [agreed, setAgreed] = useState(false);

  // Already holding a session? Show the "you're in" card instead.
  useEffect(() => {
    const auth = readAuth();
    if (auth?.token) {
      setSignedInAs(auth.username);
      setState("signed-in");
    }
  }, []);

  const join = async () => {
    if (state === "opening") return;
    setState("opening");
    setError(null);
    const result = await startGithubOauth();
    if (result.ok && result.authorizeUrl) {
      // Full-page redirect to GitHub's authorize prompt; GitHub sends the
      // developer back to /api/github/callback, which creates/finds the
      // account and lands on /dashboard with a one-time session code.
      window.location.assign(result.authorizeUrl);
      return;
    }
    setState(signedInAs ? "signed-in" : "idle");
    setError(
      result.notConfigured
        ? "GitHub sign-in isn't switched on for the site yet — it should be live shortly."
        : result.error || "We couldn't open GitHub — please try again in a moment."
    );
  };

  const points = [
    "One authorization — no form to fill, no password to invent, no email code to wait for.",
    "Your GitHub username and email become your account; nothing else is asked or stored.",
    "No password exists in this system, so there is no password to leak.",
  ];

  if (state === "signed-in") {
    const profile = readCachedProfile();
    return (
      <div className="relative mx-auto w-full max-w-xl px-4 py-16 sm:py-24">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-40 mx-auto size-[420px] rounded-full bg-emerald-500/10 blur-3xl"
        />
        <div className="relative rounded-2xl border bg-card p-8 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="size-6" aria-hidden="true" />
          </span>
          <h1 className="mt-5 text-2xl font-bold tracking-tight">You&apos;re on the team</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Signed in as{" "}
            <span className="font-medium text-foreground">@{signedInAs}</span>
            {profile?.githubConnected ? " via GitHub" : ""}
            {" "}— your dashboard is one tap away.
          </p>
          <div className="mt-6 flex justify-center">
            <Button asChild>
              <Link href="/dashboard">
                Open your dashboard
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto w-full max-w-xl px-4 py-16 sm:py-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 mx-auto size-[420px] rounded-full bg-emerald-500/10 blur-3xl"
      />
      <div className="relative rounded-2xl border bg-card p-6 sm:p-10">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 sm:mx-0">
          <Github className="size-6" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl">
          Join the Dev Team with GitHub
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          One tap. GitHub verifies you&apos;re a developer, we open your
          dashboard and you can start publishing works. Already joined? The
          same tap signs you back in.
        </p>
        <ul className="mt-6 space-y-3">
          {points.map((point) => (
            <li key={point} className="flex items-start gap-2.5 text-sm">
              <Check
                className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <span className="text-foreground/90">{point}</span>
            </li>
          ))}
        </ul>
        <div className="mt-8 space-y-4">
          <div className="flex items-start gap-2.5">
            <Checkbox
              id="join-terms"
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked === true)}
              className="mt-0.5"
            />
            {/* A plain label: the shadcn Label is flex and would spread this
                long sentence into scattered flex items. */}
            <label
              htmlFor="join-terms"
              className="text-xs font-normal leading-relaxed text-muted-foreground"
            >
              I agree to the{" "}
              <Link
                href="/terms"
                target="_blank"
                className="font-medium text-foreground underline underline-offset-4 hover:text-emerald-600 dark:hover:text-emerald-400"
              >
                Terms &amp; Conditions
              </Link>{" "}
              — including the developer publishing rules — and the{" "}
              <Link
                href="/privacy"
                target="_blank"
                className="font-medium text-foreground underline underline-offset-4 hover:text-emerald-600 dark:hover:text-emerald-400"
              >
                Privacy Policy
              </Link>
              .
            </label>
          </div>
          <Button
            size="lg"
            className="w-full"
            onClick={() => void join()}
            disabled={state === "opening" || !agreed}
          >
            {state === "opening" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Github className="size-4" aria-hidden="true" />
            )}
            {state === "opening" ? "Opening GitHub…" : "Join with GitHub"}
          </Button>
          {error ? (
            <p className="text-center text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            We only read your GitHub username, display name and verified email
            (read-only scope — no repositories, nothing posted). You can delete
            the account and its data any time from Settings.
          </p>
        </div>
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Questions first?{" "}
        <Link
          href="/about"
          className="underline underline-offset-4 hover:text-foreground"
        >
          Read about the project
        </Link>{" "}
        or say hi on GitHub.
      </p>
    </div>
  );
}
