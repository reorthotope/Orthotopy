"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { useToast } from "@/hooks/use-toast";
import { CATEGORIES, CATEGORY_ICONS, KINDS, gradientFor } from "@/lib/works";

const CATALOG_URL =
  "https://github.com/reorthotope/Orthotopy/blob/main/public/catalog/works.json";
const NEW_ISSUE_URL = "https://github.com/reorthotope/Orthotopy/issues/new";

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PublishDialog({ open, onOpenChange }: PublishDialogProps) {
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [creator, setCreator] = useState("");
  const [tagline, setTagline] = useState("");
  const [kind, setKind] = useState<string>("Developer");
  const [category, setCategory] = useState<string>("Apps");

  const valid =
    title.trim().length >= 2 && creator.trim().length >= 2 && tagline.trim().length >= 4;

  /**
   * The catalog is a static JSON file in the repository, so "publishing"
   * opens a prefilled GitHub issue with the ready-to-merge JSON entry.
   * Merging it (and redeploing) lists the work on the live site.
   */
  const publish = () => {
    const entry = {
      title: title.trim(),
      tagline: tagline.trim(),
      kind,
      category,
      creator: creator.trim(),
      icon: CATEGORY_ICONS[category] ?? "sparkles",
      gradient: gradientFor(title.trim()),
    };
    const body = [
      "Please add this work to the Orthotopy catalog.",
      "",
      "Append the JSON object below to the `works` array in " +
        "`public/catalog/works.json`, then merge and redeploy:",
      "",
      "```json",
      JSON.stringify(entry, null, 2),
      "```",
      "",
      `Catalog file: ${CATALOG_URL}`,
    ].join("\n");
    const url = `${NEW_ISSUE_URL}?title=${encodeURIComponent(
      `[Publish] ${entry.title}`
    )}&body=${encodeURIComponent(body)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    onOpenChange(false);
    setTitle("");
    setCreator("");
    setTagline("");
    toast({
      title: "Opening GitHub",
      description:
        "Submit the prefilled issue (or turn it into a pull request) — once merged into the catalog, the work goes live.",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Publish a work</DialogTitle>
          <DialogDescription>
            List your app, tool, game, music, design or writing. The catalog is open on
            GitHub — submitting opens a prefilled issue with your listing.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) publish();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="work-title">Title</Label>
            <Input
              id="work-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Hexably"
              maxLength={80}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="work-creator">Your name or handle</Label>
              <Input
                id="work-creator"
                value={creator}
                onChange={(event) => setCreator(event.target.value)}
                placeholder="e.g. Mara Lindqvist"
                maxLength={60}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="work-kind">Publishing as</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger id="work-kind" aria-label="Publisher kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="work-category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="work-category" aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="work-tagline">One-line pitch</Label>
            <Textarea
              id="work-tagline"
              value={tagline}
              onChange={(event) => setTagline(event.target.value)}
              placeholder="What is it, and why should people care?"
              rows={2}
              maxLength={160}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid}>
              Continue on GitHub
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
