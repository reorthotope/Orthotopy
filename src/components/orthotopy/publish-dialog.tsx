"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { CATEGORIES, KINDS, type Work } from "@/lib/works";

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PublishDialog({ open, onOpenChange }: PublishDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [creator, setCreator] = useState("");
  const [tagline, setTagline] = useState("");
  const [kind, setKind] = useState<string>("Developer");
  const [category, setCategory] = useState<string>("Apps");

  const valid =
    title.trim().length >= 2 && creator.trim().length >= 2 && tagline.trim().length >= 4;

  const publish = useMutation({
    mutationFn: async (): Promise<{ work: Work }> => {
      const res = await fetch("/api/works", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          tagline: tagline.trim(),
          kind,
          category,
          creator: creator.trim(),
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error ?? "Publish failed");
      }
      return (await res.json()) as { work: Work };
    },
    onSuccess: ({ work }) => {
      queryClient.invalidateQueries({ queryKey: ["works"] });
      onOpenChange(false);
      setTitle("");
      setCreator("");
      setTagline("");
      toast({
        title: "Work published",
        description: `“${work.title}” is live in this demo catalog — real submissions ship via GitHub pull requests.`,
      });
    },
    onError: () => {
      toast({
        title: "Could not publish",
        description: "Something went wrong on the way to the catalog — please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Publish a work</DialogTitle>
          <DialogDescription>
            List your app, tool, game, music, design or writing. It appears in the catalog
            immediately and is stored on this instance.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) publish.mutate();
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
            <Button type="submit" disabled={!valid || publish.isPending}>
              {publish.isPending ? "Publishing…" : "Publish work"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
