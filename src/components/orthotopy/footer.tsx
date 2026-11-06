import Link from "next/link";
import { Logo } from "./logo";

const FOOTER_COLUMNS = [
  {
    title: "Browse",
    links: [
      { label: "Home", href: "/" },
      { label: "Apps", href: "/apps" },
      { label: "Games", href: "/games" },
      { label: "Extensions", href: "/extensions" },
      { label: "Others", href: "/others" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "About", href: "/about" },
      { label: "Support Us", href: "/support-us" },
      { label: "Join the dev team", href: "/dev" },
    ],
  },
  {
    title: "Resources",
    links: [
      {
        label: "GitHub repository",
        href: "https://github.com/reorthotope/Orthotopy",
      },
      { label: "Issues", href: "https://github.com/reorthotope/Orthotopy/issues" },
      {
        label: "MIT License",
        href: "https://github.com/reorthotope/Orthotopy/blob/main/LICENSE",
      },
      { label: "Privacy policy", href: "/privacy" },
      { label: "Terms & conditions", href: "/terms" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border/60 bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-3 text-sm text-muted-foreground">
              A free, open publishing home that puts every work in its right place.
            </p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3 sm:gap-16">
            {FOOTER_COLUMNS.map((column) => (
              <div key={column.title}>
                <h3 className="text-sm font-semibold">{column.title}</h3>
                <ul className="mt-3 space-y-2">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      {link.href.startsWith("http") ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-10 flex flex-col items-start justify-between gap-2 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>© 2026 Orthotopy contributors. Released under the MIT License.</p>
          <p>Built with Next.js, Tailwind CSS and shadcn/ui.</p>
        </div>
      </div>
    </footer>
  );
}
