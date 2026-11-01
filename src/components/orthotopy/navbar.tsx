"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Github, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Logo } from "./logo";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/apps", label: "Apps" },
  { href: "/games", label: "Games" },
  { href: "/extensions", label: "Extensions" },
  { href: "/others", label: "Others" },
  { href: "/support-us", label: "Support Us" },
  { href: "/about", label: "About" },
];

export function Navbar() {
  const { resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/75 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
        <Link href="/" aria-label="Orthotopy home" className="shrink-0 rounded-md">
          <Logo />
        </Link>
        <nav aria-label="Main navigation" className="hidden items-center gap-0.5 lg:flex">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-2 text-sm transition-colors",
                  active
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {link.label}
              </Link>
            );
          })}
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
          <Button size="sm" className="ml-1" asChild>
            <Link href="/join">Join Dev Team</Link>
          </Button>
        </div>
      </div>
      {/* Compact category row for tablet/mobile where the main nav is hidden */}
      <nav
        aria-label="Section navigation"
        className="flex items-center gap-1 overflow-x-auto border-t border-border/40 px-4 py-1.5 lg:hidden"
      >
        {NAV_LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs transition-colors",
                active
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
