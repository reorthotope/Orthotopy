"use client";

import { Github, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Logo } from "./logo";

const NAV_LINKS = [
  { href: "#apps", label: "Apps" },
  { href: "#categories", label: "Categories" },
  { href: "#publish", label: "Publish" },
];

export function Navbar() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/75 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#top" aria-label="Orthotopy home" className="rounded-md">
          <Logo />
        </a>
        <nav aria-label="Main navigation" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle color theme"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            <Moon className="size-4 dark:hidden" aria-hidden="true" />
            <Sun className="hidden size-4 dark:block" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" asChild>
            <a
              href="https://github.com/reorthotope/Orthotopy"
              target="_blank"
              rel="noreferrer"
              aria-label="Orthotopy on GitHub"
            >
              <Github className="size-4" aria-hidden="true" />
            </a>
          </Button>
          <Button asChild size="sm" className="ml-1 hidden sm:inline-flex">
            <a href="#publish">Submit an app</a>
          </Button>
        </div>
      </div>
    </header>
  );
}
