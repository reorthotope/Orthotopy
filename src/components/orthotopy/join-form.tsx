"use client";

import { useEffect, useState } from "react";
import {
  AtSign,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  MailCheck,
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
import { Turnstile } from "@/components/orthotopy/turnstile";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CODE_PATTERN, normalizeCode } from "@/lib/verification";

/**
 * Developer-portal application form.
 *
 * Talks to the real backend: POST /api/request-code stores a 6-character
 * LLDDDD code in KV and emails it via Brevo (noreply@mail.orthotopy.us.ci);
 * POST /api/verify checks the code and creates the account row in D1.
 * The Turnstile widget uses the always-passing test key until
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is configured in the Pages environment.
 */

interface FormValues {
  nickname: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  confirm: string;
}

const EMPTY: FormValues = {
  nickname: "",
  username: "",
  email: "",
  phone: "",
  password: "",
  confirm: "",
};

const RESEND_SECONDS = 45;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9_](?:[a-z0-9_]{1,18}[a-z0-9_])?$/i;
const PHONE_RE = /^\+?[0-9](?:[0-9\s-]{5,17})[0-9]$/;

function validate(values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (values.nickname.trim().length < 2) {
    errors.nickname = "Tell us what to call you (at least 2 characters).";
  }
  if (!USERNAME_RE.test(values.username.trim())) {
    errors.username = "3–20 characters: letters, numbers and underscores only.";
  }
  if (!EMAIL_RE.test(values.email.trim())) {
    errors.email = "Enter a valid email address, e.g. you@example.com.";
  }
  if (!PHONE_RE.test(values.phone.trim())) {
    errors.phone = "Include the country code, e.g. +1 555 000 1234.";
  }
  if (values.password.length < 8) {
    errors.password = "Use at least 8 characters.";
  }
  if (values.confirm !== values.password || values.confirm.length === 0) {
    errors.confirm = "Passwords do not match.";
  }
  return errors;
}

interface ApiResponse {
  ok?: boolean;
  devCode?: string;
  error?: string;
  field?: string;
  fields?: Record<string, string>;
}

async function postJson(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as ApiResponse;
  return { ok: res.ok, status: res.status, data };
}

export function JoinDevForm() {
  const { toast } = useToast();
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);

  const [emailSent, setEmailSent] = useState(false);
  const [emailCode, setEmailCode] = useState("");
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);

  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  const set = (field: keyof FormValues) => (value: string) =>
    setValues((prev) => ({ ...prev, [field]: value }));

  const fieldError = (field: keyof FormValues) =>
    errors[field] ? (
      <p className="mt-1.5 text-xs text-destructive">{errors[field]}</p>
    ) : null;

  const sendEmailCode = async () => {
    const emailErrors = validate({ ...values, ...EMPTY, email: values.email });
    if (emailErrors.email) {
      toast({ title: "Check your email", description: emailErrors.email });
      return;
    }
    if (!turnstileToken) {
      toast({
        title: "Almost there",
        description: "Complete the human check first, then tap Send code.",
      });
      return;
    }
    setSending(true);
    try {
      const { ok, data } = await postJson("/api/request-code", {
        email: values.email.trim(),
        turnstileToken,
      });
      if (ok) {
        setEmailSent(true);
        setEmailCode("");
        setResendIn(RESEND_SECONDS);
        setTurnstileReset((n) => n + 1);
        toast({
          title: "Code sent",
          description: `We emailed a 6-character code to ${values.email.trim()}. It expires in 10 minutes — check spam too.`,
        });
      } else {
        toast({
          title: "Couldn't send the code",
          description: data.error ?? "Please try again in a moment.",
        });
      }
    } catch {
      toast({
        title: "Network error",
        description: "Could not reach the server — check your connection and try again.",
      });
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const nextErrors = validate(values);
    if (!emailSent) {
      nextErrors.emailCode = "Request a code first — tap Send code.";
    } else if (!CODE_PATTERN.test(emailCode)) {
      nextErrors.emailCode = "Enter the 6-character code: 2 letters then 4 digits.";
    } else if (!turnstileToken) {
      nextErrors.emailCode = "Complete the human check, then submit again.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      toast({
        title: "Almost there",
        description: "Fix the highlighted fields and submit again.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const { ok, status, data } = await postJson("/api/verify", {
        email: values.email.trim(),
        code: emailCode,
        nickname: values.nickname.trim(),
        username: values.username.trim(),
        phone: values.phone.trim(),
        password: values.password,
        turnstileToken,
      });
      if (ok) {
        setSubmitted(true);
        return;
      }
      setTurnstileReset((n) => n + 1);
      if (status === 400 && data.field === "code") {
        setErrors((prev) => ({ ...prev, emailCode: data.error ?? "That code doesn't match." }));
        toast({ title: "Almost there", description: data.error ?? "Check the code and try again." });
      } else if (data.field && data.error) {
        setErrors((prev) => ({ ...prev, [data.field as string]: data.error as string }));
        toast({ title: "Almost there", description: data.error });
      } else if (data.fields) {
        setErrors((prev) => ({ ...prev, ...data.fields }));
        toast({ title: "Almost there", description: data.error ?? "Fix the highlighted fields." });
      } else {
        toast({
          title: "Submission failed",
          description: data.error ?? "Please try again in a moment.",
        });
      }
    } catch {
      toast({
        title: "Network error",
        description: "Could not reach the server — check your connection and try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const startNewApplication = () => {
    setValues(EMPTY);
    setErrors({});
    setEmailSent(false);
    setEmailCode("");
    setResendIn(0);
    setTurnstileToken("");
    setSubmitted(false);
  };

  if (submitted) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-20 text-center sm:px-6 sm:py-24">
        <span className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-7" aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">
          Application received, {values.nickname.trim()}!
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Your dev-team application is in — we verified{" "}
          <strong className="text-foreground">{values.email.trim()}</strong> and saved your
          spot. We&#39;ll reach out with next steps. In the meantime, contributors get
          noticed fast.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <a
              href="https://github.com/reorthotope/Orthotopy/issues"
              target="_blank"
              rel="noreferrer"
            >
              Say hi on GitHub
              <ExternalLink className="size-4" aria-hidden="true" />
            </a>
          </Button>
          <Button variant="outline" onClick={startNewApplication}>
            Start a new application
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="max-w-2xl">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          Developer portal — applications open
        </span>
        <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
          Join the Dev Team
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          We are putting together the team that builds and maintains Orthotopy — the
          catalog, the storefront and the open-source tooling behind it. Fill in the
          application below and verify your email with a 6-character code (2 letters +
          4 digits); codes expire in 10 minutes. Phone numbers are collected but not
          verified for now.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="mt-8 space-y-8 rounded-2xl border bg-card p-6 sm:p-8"
      >
        <fieldset className="space-y-5" disabled={submitting}>
          <legend className="text-sm font-semibold">Profile</legend>
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
                  onChange={(event) => set("nickname")(event.target.value)}
                  placeholder="Kite"
                  autoComplete="nickname"
                  className="pl-9"
                  aria-invalid={Boolean(errors.nickname)}
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
                  onChange={(event) => set("username")(event.target.value)}
                  placeholder="kite_dev"
                  autoComplete="username"
                  className="pl-9"
                  aria-invalid={Boolean(errors.username)}
                />
              </div>
              {fieldError("username")}
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-5" disabled={submitting}>
          <legend className="text-sm font-semibold">Contact &amp; verification</legend>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="flex gap-2">
              <Input
                id="email"
                type="email"
                value={values.email}
                onChange={(event) => set("email")(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="flex-1"
                aria-invalid={Boolean(errors.email)}
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                onClick={sendEmailCode}
                disabled={sending || resendIn > 0}
              >
                {sending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <MailCheck className="size-4" aria-hidden="true" />
                )}
                {sending
                  ? "Sending…"
                  : resendIn > 0
                    ? `Resend in ${resendIn}s`
                    : emailSent
                      ? "Resend code"
                      : "Send code"}
              </Button>
            </div>
            {fieldError("email")}
            <Turnstile onToken={setTurnstileToken} resetSignal={turnstileReset} />
            {emailSent ? (
              <div className="rounded-xl border border-dashed p-3">
                <p className="text-xs text-muted-foreground">
                  We emailed a 6-character code (2 letters + 4 digits, like{" "}
                  <strong className="font-mono text-foreground">XK4831</strong>) to{" "}
                  <strong className="text-foreground">{values.email.trim()}</strong>. It
                  expires in 10 minutes — check spam too.
                </p>
                <InputOTP
                  maxLength={6}
                  value={emailCode}
                  onChange={(value) => setEmailCode(normalizeCode(value))}
                  className="mt-2"
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
                {errors.emailCode ? (
                  <p className="mt-1.5 text-xs text-destructive">{errors.emailCode}</p>
                ) : emailCode.length === 6 && CODE_PATTERN.test(emailCode) ? (
                  <p className="mt-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                    Looks right — hit Submit application.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone number</Label>
            <Input
              id="phone"
              type="tel"
              value={values.phone}
              onChange={(event) => set("phone")(event.target.value)}
              placeholder="+1 555 000 1234"
              autoComplete="tel"
              aria-invalid={Boolean(errors.phone)}
            />
            <p className="text-xs text-muted-foreground">
              We only collect your number for now — SMS verification comes later.
            </p>
            {fieldError("phone")}
          </div>
        </fieldset>

        <fieldset className="space-y-5" disabled={submitting}>
          <legend className="text-sm font-semibold">Security</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={values.password}
                  onChange={(event) => set("password")(event.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  className="pr-10"
                  aria-invalid={Boolean(errors.password)}
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
                onChange={(event) => set("confirm")(event.target.value)}
                placeholder="Repeat your password"
                autoComplete="new-password"
                aria-invalid={Boolean(errors.confirm)}
              />
              {fieldError("confirm")}
            </div>
          </div>
        </fieldset>

        <div className={cn("space-y-3 border-t pt-6")}>
          <Button type="submit" size="lg" className="w-full rounded-xl" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Submitting…
              </>
            ) : (
              "Submit application"
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            We only use your details to set up your dev-team account. Passwords are
            stored as salted hashes — never in plain text.
          </p>
        </div>
      </form>
    </div>
  );
}
