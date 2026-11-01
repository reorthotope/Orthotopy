import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ICONS } from "@/lib/works";

/**
 * The four browsing sections of the catalog, replacing the old inline
 * works grid on the homepage. Each card routes to its own page.
 */
const SECTIONS = [
  {
    href: "/apps",
    icon: "box",
    title: "Apps",
    description: "Utilities, tools and everyday software.",
  },
  {
    href: "/games",
    icon: "gamepad",
    title: "Games",
    description: "Free indie games for browser and beyond.",
  },
  {
    href: "/extensions",
    icon: "puzzle",
    title: "Extensions",
    description: "Browser and editor add-ons from the community.",
  },
  {
    href: "/others",
    icon: "sparkles",
    title: "Others",
    description: "Audio, art, writing and everything between.",
  },
] as const;

export function CategoryStrip() {
  return (
    <section id="browse" className="scroll-mt-20" aria-labelledby="browse-heading">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <h2 id="browse-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
            Browse the catalog
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">
            Four sections, one open catalog — every work hosted by its creator.
          </p>
        </div>
        <ul className="grid grid-cols-1 gap-3 py-6 sm:grid-cols-2 lg:grid-cols-4">
          {SECTIONS.map((section) => {
            const Icon = ICONS[section.icon];
            return (
              <li key={section.href}>
                <Link
                  href={section.href}
                  className="group flex h-full flex-col rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5"
                >
                  <span className="flex items-center justify-between">
                    <span
                      aria-hidden="true"
                      className="flex size-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    >
                      {Icon ? <Icon className="size-5" /> : null}
                    </span>
                    <ArrowUpRight
                      className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="mt-3 text-base font-semibold">{section.title}</span>
                  <span className="mt-1 text-sm text-muted-foreground">
                    {section.description}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
