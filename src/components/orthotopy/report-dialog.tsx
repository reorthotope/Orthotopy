"use client";

/**
 * ReportWorkDialog — the public intake form behind the "Report" button on
 * every work's detail view. It posts straight to POST /api/report, which
 * verifies the target exists, throttles per IP and files the report into
 * the /apex console queue (User reports section).
 *
 * Reasons mirror the backend's REPORT_REASONS list exactly — the endpoint
 * rejects anything else. Details and contact are optional; signed-in
 * developers get their GitHub login attached server-side, anonymous
 * reporters can leave a contact for follow-ups.
 */

import { useState } from "react";
import { Flag, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Work } from "@/lib/works";

const REASONS: { value: string; label: string }[] = [
  { value: "broken-link", label: "Download or repo link is broken" },
  { value: "not-working", label: "It doesn't work as described" },
  { value: "infringing", label: "It copies someone else's work" },
  { value: "malware", label: "It's harmful, unsafe or malware" },
  { value: "spam", label: "Spam or advertising" },
  { value: "other", label: "Something else" },
];

type ReportState = "idle" | "sending" | "sent";

export function ReportWorkDialog({
  work,
  open,
  onOpenChange,
}: {
  work: Work | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<ReportState>("idle");
  const [error, setError] = useState<string | null>(null);

  // Fresh form every time the dialog opens.
  const resetForm = () => {
    setReason("");
    setDetails("");
    setContact("");
    setState("idle");
    setError(null);
  };
  const handleOpenChange = (next: boolean) => {
    if (next && !open) resetForm();
    onOpenChange(next);
  };

  const submit = async () => {
    if (!work || !reason) return;
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetType: "work",
          targetId: work.id,
          reason,
          details: details.trim() || undefined,
          contact: contact.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (res.ok && json?.ok) {
        setState("sent");
        return;
      }
      setState("idle");
      setError(json?.error || "We couldn't record that — please try again in a moment.");
    } catch {
      setState("idle");
      setError("Network hiccup — please try again in a moment.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {state === "sent" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                Report received
              </DialogTitle>
              <DialogDescription>
                Thanks for helping keep Orthotopy safe — &ldquo;{work?.title}&rdquo; is
                now in the review queue. Reports are read by a human.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Flag className="size-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                Report &ldquo;{work?.title}&rdquo;
              </DialogTitle>
              <DialogDescription>
                Tell us what&apos;s wrong with this work. False reports are fine —
                we&apos;d rather check than miss something.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="report-reason">What&apos;s the problem?</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger id="report-reason" aria-label="Report reason">
                    <SelectValue placeholder="Pick a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {REASONS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="report-details">Details (optional)</Label>
                <Textarea
                  id="report-details"
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  placeholder="What happened? A link or two helps us reproduce it."
                  rows={3}
                  maxLength={2000}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="report-contact">Contact (optional)</Label>
                <Input
                  id="report-contact"
                  value={contact}
                  onChange={(event) => setContact(event.target.value)}
                  placeholder="Email or GitHub handle, so we can follow up"
                  maxLength={200}
                />
              </div>

              {error ? (
                <p className="text-xs text-destructive" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenChange(false)}
                  disabled={state === "sending"}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => void submit()}
                  disabled={!reason || state === "sending"}
                >
                  {state === "sending" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Flag className="size-4" aria-hidden="true" />
                  )}
                  {state === "sending" ? "Sending…" : "Send report"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
