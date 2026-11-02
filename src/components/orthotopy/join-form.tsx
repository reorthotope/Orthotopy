"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  AtSign,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  MailCheck,
  RotateCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Turnstile, TURNSTILE_ENABLED } from "@/components/orthotopy/turnstile";
import { cn } from "@/lib/utils";
import { CODE_PATTERN, normalizeCode, validateUsername } from "@/lib/verification";

/**
 * Developer signup flow.
 *
 * Step 1 — details: nickname, username (always lowercase, strict format),
 * email, password + confirm. Continue (or Enter) validates every field and
 * only then sends the verification code — nothing is sent before the user
 * explicitly submits.
 * Step 2 — verify: the 6-character LLDDDD code is checked automatically as
 * soon as the sixth character is typed; a resend button (45s cooldown) and an
 * "edit details" escape hatch are available.
 * Step 3 — success: the account is created server-side (D1) and the visitor
 * is handed off to /dashboard.
 *
 * API: POST /api/request-code (KV + Brevo), POST /api/verify (D1 users row).
 */

interface FormValues {
  nickname: string;
  username: string;
  email: string;
  password: string;
  confirm: string;
}

const EMPTY: FormValues = {
  nickname: "",
  username: "",
  email: "",
  password: "",
  confirm: "",
};

const AUTH_KEY = "orthotopy_dev_auth";
const AUTH_EVENT = "orthotopy:auth";
const RESEND_SECONDS = 45;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = "details" | "code" | "done";

function computeErrors(values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (values.nickname.trim().length < 2) {
    errors.nickname = "Tell us what to call you (at least 2 characters).";
  }
  const usernameReason = validateUsername(values.username);
  if (usernameReason) errors.username = usernameReason;
  if (!EMAIL_RE.test(values.email.trim())) {
    errors.email = "Enter a valid email address, e.g. you@example.com.";
  }
  if (values.password.length < 8) {
    errors.password = "Use at least 8 characters.";
  }
  if (values.confirm !== values.password || values.confirm.length === 0) {
    errors.confirm = "Passwords do not match.";
  }
  return errors;
}

interface RequestCodeResponse {
  ok?: boolean;
  devCode?: string;
  error?: string;
}

interface VerifyResponse {
  ok?: boolean;
  error?: string;
  field?: string;
  fields?: Record<string, string>;
}

export function JoinDevForm() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("details");
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentEmail, setSentEmail] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);

  const [alreadySignedIn, setAlreadySignedIn] = useState<string | null>(null);

  // Refs keep async callbacks away from stale state.
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const tokenRef = useRef(turnstileToken);
  tokenRef.current = turnstileToken;
  const sentEmailRef = useRef(sentEmail);
  sentEmailRef.current = sentEmail;
  const sendingRef = useRef(false);
  const verifyingRef = useRef(false);
  const sentForRef = useRef<string | null>(null); // email the last code was sent to

  const errors = useMemo(() => computeErrors(values), [values]);
  const allValid = Object.keys(errors).length === 0;

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  // Signed-in banner (e.g. a developer opening /dev again).
  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem(AUTH_KEY);
        if (!raw) return setAlreadySignedIn(null);
        const parsed = JSON.parse(raw) as { username?: string };
        setAlreadySignedIn(parsed.username || null);
      } catch {
        setAlreadySignedIn(null);
      }
    };
    read();
    window.addEventListener(AUTH_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(AUTH_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  const sendCode = useCallback(async (emailKey: string) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/request-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: emailKey, turnstileToken: tokenRef.current }),
      });
      const data = (await res.json().catch(() => null)) as RequestCodeResponse | null;
      if (res.ok && data?.ok) {
        sentForRef.current = emailKey;
        setSentEmail(emailKey);
        setCode("");
        setVerifyError(null);
        setResendIn(RESEND_SECONDS);
        if (data.devCode) setDevCode(data.devCode);
        setValues((prev) => ({ ...prev, email: emailKey }));
        setTurnstileReset((n) => n + 1); // mint a fresh token for the next send
        setStep("code");
      } else {
        setSendError(
          data?.error ||
            (res.status === 403
              ? "The security check blocked this request — refresh the page and try again."
              : "We couldn't send the code right now — please try again in a moment.")
        );
      }
      // The Turnstile token is single-use — after any failed send, mint a
      // fresh one so the next attempt isn't rejected by siteverify.
      setTurnstileReset((n) => n + 1);
    } catch {
      setSendError(
        "Network error — we couldn't reach the server. Check your connection and try again."
      );
      setTurnstileReset((n) => n + 1);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, []);

  const verifyCode = useCallback(async (codeValue: string) => {
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    setVerifying(true);
    setVerifyError(null);
    try {
      const v = valuesRef.current;
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: sentEmailRef.current,
          code: codeValue,
          nickname: v.nickname.trim(),
          username: v.username.trim().toLowerCase(),
          password: v.password,
        }),
      });
      const data = (await res.json().catch(() => null)) as VerifyResponse | null;
      if (res.ok && data?.ok) {
        try {
          localStorage.setItem(
            AUTH_KEY,
            JSON.stringify({
              nickname: v.nickname.trim(),
              username: v.username.trim().toLowerCase(),
              email: sentEmailRef.current,
              createdAt: new Date().toISOString(),
            })
          );
          window.dispatchEvent(new Event(AUTH_EVENT));
        } catch {
          // Storage unavailable (private mode) — the dashboard gate handles it.
        }
        setStep("done");
        return;
      }
      setCode("");
      if (data?.fields?.username || data?.fields?.email) {
        setServerErrors({
          ...(data.fields?.username ? { username: data.fields.username } : {}),
          ...(data.fields?.email ? { email: data.fields.email } : {}),
        });
        setStep("details");
        return;
      }
      setVerifyError(
        data?.error ||
          (res.status === 403
            ? "The security check blocked this request — refresh the page and try again."
            : "Verification failed — please try again in a moment.")
      );
    } catch {
      setCode("");
      setVerifyError(
        "Network error — we couldn't reach the server. Check your connection and try again."
      );
    } finally {
      verifyingRef.current = false;
      setVerifying(false);
    }
  }, []);

  // Auto-verify: check as soon as the sixth character lands.
  useEffect(() => {
    if (step !== "code" || verifyingRef.current) return;
    if (!CODE_PATTERN.test(code)) return;
    void verifyCode(code);
  }, [step, code, verifyCode]);

  // Hand off to the dashboard after the success screen.
  useEffect(() => {
    if (step !== "done") return;
    const t = setTimeout(() => router.replace("/dashboard"), 1800);
    return () => clearTimeout(t);
  }, [step, router]);

  const update = (field: keyof FormValues) => (value: string) => {
    setServerErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const markTouched = (field: keyof FormValues) => () =>
    setTouched((prev) => ({ ...prev, [field]: true }));

  const fieldError = (field: keyof FormValues) => {
    const message = serverErrors[field] || (touched[field] ? errors[field] : undefined);
    return message ? (
      <p className="mt-1.5 text-xs text-destructive">{message}</p>
    ) : null;
  };

  const handleDetailsSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched({ nickname: true, username: true, email: true, password: true, confirm: true });
    if (!allValid) return;
    if (TURNSTILE_ENABLED && !turnstileToken) {
      setSendError(
        "The human check is still running — give it a second, then press Continue again."
      );
      return;
    }
    const emailKey = values.email.trim().toLowerCase();
    if (sentForRef.current === emailKey) {
      setStep("code");
      return;
    }
    void sendCode(emailKey);
  };

  const handleResend = () => {
    if (sending || resendIn > 0 || !sentEmail) return;
    void sendCode(sentEmail);
  };

  // ---------------------------------------------------------------- success
  if (step === "done") {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-20 text-center sm:px-6 sm:py-24">
        <span className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-7" aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">
          Account created!
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Welcome to Orthotopy, {values.nickname.trim()}.{" "}
          <strong className="text-foreground">{values.email.trim()}</strong> is
          verified and your developer dashboard is ready.
        </p>
        <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Taking you to your dashboard…
        </p>
        <Button className="mt-8" onClick={() => router.replace("/dashboard")}>
          Go to your dashboard now
        </Button>
      </div>
    );
  }

  // ------------------------------------------------------------------ step 2
  if (step === "code") {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Check your inbox
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            We emailed a 6-character verification code to{" "}
            <strong className="text-foreground">{sentEmail}</strong>. It
            expires in 10 minutes — check spam too.
          </p>
        </div>

        <div className="mt-8 space-y-6 rounded-2xl border bg-card p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <MailCheck className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold">Enter the code from your email</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                We verify automatically the moment you type the sixth character.
              </p>
            </div>
          </div>

          <div>
            <InputOTP
              maxLength={6}
              value={code}
              onChange={(value) => setCode(normalizeCode(value))}
              disabled={verifying}
              className="flex-wrap"
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
            {verifying ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                Verifying your code…
              </p>
            ) : verifyError ? (
              <p className="mt-3 text-xs text-destructive" role="alert">
                {verifyError}
              </p>
            ) : null}
          </div>

          {devCode ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
              <strong>DEV MODE</strong> — the email service isn&#39;t configured, so
              your code is{" "}
              <strong className="font-mono text-base tracking-widest">{devCode}</strong>
              . This banner only appears in local development.
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 border-t pt-5">
            <Button
              type="button"
              variant="outline"
              onClick={handleResend}
              disabled={sending || resendIn > 0}
            >
              {sending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <RotateCw className="size-4" aria-hidden="true" />
              )}
              {sending ? "Sending…" : resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setCode("");
                setVerifyError(null);
                setStep("details");
              }}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Edit details
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Wrong address? Tap <strong>Edit details</strong>, fix it and press
            <strong> Continue</strong> to send a fresh code.
          </p>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------ step 1
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Join the Dev Team
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          Create your free developer account — publish and manage works across
          the Orthotopy catalog.
        </p>
      </div>

      {alreadySignedIn ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-sm">
          <span>
            You&#39;re signed in as{" "}
            <strong className="text-foreground">@{alreadySignedIn}</strong>.
          </span>
          <Button variant="outline" size="sm" asChild>
            <a href="/dashboard">Open dashboard</a>
          </Button>
        </div>
      ) : null}

      <form onSubmit={handleDetailsSubmit} noValidate className="mt-8 space-y-6 rounded-2xl border bg-card p-6 sm:p-8">
        <fieldset className="space-y-5" disabled={sending}>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nickname">Nickname</Label>
              <div className="relative">
                <UserRound
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="nickname"
                  value={values.nickname}
                  onChange={(event) => update("nickname")(event.target.value)}
                  onBlur={markTouched("nickname")}
                  placeholder="Kite"
                  autoComplete="nickname"
                  className="pl-9"
                  aria-invalid={Boolean(serverErrors.nickname || (touched.nickname && errors.nickname))}
                />
              </div>
              {fieldError("nickname")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <AtSign
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="username"
                  value={values.username}
                  onChange={(event) => update("username")(event.target.value.toLowerCase())}
                  onBlur={markTouched("username")}
                  placeholder="kite.dev"
                  autoComplete="username"
                  spellCheck={false}
                  className="pl-9"
                  aria-invalid={Boolean(serverErrors.username || (touched.username && errors.username))}
                />
              </div>
              {fieldError("username")}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={values.email}
              onChange={(event) => update("email")(event.target.value)}
              onBlur={markTouched("email")}
              placeholder="you@example.com"
              autoComplete="email"
              aria-invalid={Boolean(serverErrors.email || (touched.email && errors.email))}
            />
            {fieldError("email")}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={values.password}
                  onChange={(event) => update("password")(event.target.value)}
                  onBlur={markTouched("password")}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  className="pr-10"
                  aria-invalid={Boolean(touched.password && errors.password)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" aria-hidden="true" />
                  ) : (
                    <Eye className="size-4" aria-hidden="true" />
                  )}
                </button>
              </div>
              {fieldError("password")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type={showPassword ? "text" : "password"}
                value={values.confirm}
                onChange={(event) => update("confirm")(event.target.value)}
                onBlur={markTouched("confirm")}
                placeholder="Repeat your password"
                autoComplete="new-password"
                aria-invalid={Boolean(touched.confirm && errors.confirm)}
              />
              {fieldError("confirm")}
            </div>
          </div>
        </fieldset>

        {TURNSTILE_ENABLED ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Human check
            </p>
            <Turnstile onToken={setTurnstileToken} resetSignal={turnstileReset} />
          </div>
        ) : null}

        <div className="space-y-3 border-t pt-6">
          {sendError ? (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive"
              role="alert"
            >
              <span>{sendError}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSendError(null)}
              >
                Try again
              </Button>
            </div>
          ) : sending ? (
            <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Sending your verification code to {values.email.trim().toLowerCase()}…
            </p>
          ) : TURNSTILE_ENABLED && allValid && !turnstileToken ? (
            <p className="px-1 text-xs text-muted-foreground">
              Finish the human check above, then press Continue.
            </p>
          ) : null}
          <Button
            type="submit"
            size="lg"
            className="w-full rounded-xl"
            disabled={sending}
          >
            {sending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Sending…
              </>
            ) : (
              "Continue"
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Already joined?{" "}
            <a
              href="/dashboard"
              className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
            >
              Go to your dashboard
            </a>
          </p>
        </div>
      </form>
    </div>
  );
}
