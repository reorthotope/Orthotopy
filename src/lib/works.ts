import {
  AudioWaveform,
  BookOpen,
  Box,
  Calculator,
  Camera,
  Clapperboard,
  Code2,
  Gamepad2,
  Image as ImageIcon,
  Layers,
  ListTodo,
  Mountain,
  Music,
  Package,
  Palette,
  PenLine,
  Puzzle,
  ShieldCheck,
  Sparkles,
  Telescope,
  Terminal,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/** Kinds of publishers on Orthotopy. */
export const KINDS = ["Developer", "Creator"] as const;
export type WorkKind = (typeof KINDS)[number];

/**
 * Work types for the publish form: an App, a Game or a browser Extension,
 * each targeting a set of platforms. Stored alongside the work and shown as
 * a tag on the storefront and in the dashboard.
 */
export const WORK_TYPES = ["Apps", "Games", "Extensions"] as const;
export type WorkType = (typeof WORK_TYPES)[number];

export const TYPE_PLATFORMS: Record<WorkType, string[]> = {
  Apps: ["Android", "Desktop", "Mac", "iOS", "Linux"],
  Games: ["Android", "Desktop", "Mac", "iOS"],
  Extensions: ["Chrome", "Firefox", "Edge"],
};

export const TYPE_ICONS: Record<WorkType, string> = {
  Apps: "box",
  Games: "gamepad",
  Extensions: "puzzle",
};

/**
 * Screenshot convention: works show images straight from their own public
 * GitHub repo — no uploads, no URLs to paste. The files must sit in the
 * repo root named exactly img.png (or img.jpeg), then img1.png … img9.png:
 * ten images max, shown in that order.
 */
export const IMAGE_STEMS = [
  "img", "img1", "img2", "img3", "img4",
  "img5", "img6", "img7", "img8", "img9",
] as const;
export const MAX_IMAGES = 10;
export const IMAGE_NAMING_HINT = "img.png, img1.png … img9.png (.png or .jpeg)";

/**
 * Logo convention: the work's tile image comes straight from the repo too.
 * Put a logo.png (or icon.png) in the repo root and the publish flow picks
 * it up automatically — no upload anywhere. Without one, the storefront
 * falls back to a generated type icon.
 */
export const LOGO_NAMING_HINT = "logo.png or icon.png (.png or .jpeg)";

export interface Work {
  id: string;
  title: string;
  tagline: string;
  kind: string;
  category: string;
  creator: string;
  icon: string;
  gradient: string;
  createdAt?: string;
  description?: string;
  type?: string;
  platform?: string;
  repoUrl?: string;
  downloadUrl?: string;
  imageUrls?: string[];
  /** Repo-root logo (logo.png / icon.png) served from the developer's repo. */
  logoUrl?: string;
}

/**
 * Parses a GitHub repo link (github.com/owner/repo, with or without scheme,
 * trailing .git, /tree/… paths or query strings) into owner + repo.
 * Returns null for anything that isn't an owner/repo pair on github.com.
 */
export function parseGithubRepoUrl(raw: string): { owner: string; repo: string } | null {
  const input = raw.trim();
  if (!input || input.length > 300) return null;
  let host = "";
  let rest = "";
  try {
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    host = url.hostname.toLowerCase();
    rest = url.pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
  if (host !== "github.com" && host !== "www.github.com") return null;
  const match = /^\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9._-]+?)$/.exec(rest);
  if (!match) return null;
  const repo = match[2].replace(/\.git$/i, "");
  if (!repo || repo === ".") return null;
  return { owner: match[1], repo };
}

/**
 * Public CDN URL of one screenshot file in the repo's default branch —
 * raw.githubusercontent.com serves public repos without authentication,
 * so the site hotlinks the repo's own images and stores nothing.
 */
export function repoImageUrl(owner: string, repo: string, file: string): string {
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/HEAD/${encodeURIComponent(file)}`;
}

/** Icon map shared by catalog entries (stored as a string key in the DB). */
export const ICONS: Record<string, LucideIcon> = {
  code: Code2,
  terminal: Terminal,
  layers: Layers,
  gamepad: Gamepad2,
  notebook: PenLine,
  shield: ShieldCheck,
  package: Package,
  calculator: Calculator,
  waveform: AudioWaveform,
  music: Music,
  palette: Palette,
  image: ImageIcon,
  book: BookOpen,
  camera: Camera,
  film: Clapperboard,
  box: Box,
  mountain: Mountain,
  telescope: Telescope,
  users: Users,
  list: ListTodo,
  puzzle: Puzzle,
  wrench: Wrench,
  sparkles: Sparkles,
};

/** Categories offered in the publish form. */
export const CATEGORIES = [
  "Developer Tools",
  "Apps",
  "Games",
  "Extensions",
  "Audio",
  "Design",
  "Visual Art",
  "Writing",
  "Photography",
  "Assets",
  "Other",
] as const;

/** Fallback icon per category, for works published without an explicit icon. */
export const CATEGORY_ICONS: Record<string, string> = {
  "Developer Tools": "terminal",
  Apps: "box",
  Games: "gamepad",
  Extensions: "puzzle",
  Audio: "music",
  Design: "palette",
  "Visual Art": "image",
  Writing: "book",
  Photography: "camera",
  Assets: "package",
  Other: "sparkles",
};

/** Gradient pool used to style new works deterministically. */
export const GRADIENTS = [
  "from-emerald-500 to-teal-600",
  "from-violet-500 to-fuchsia-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-teal-500 to-emerald-600",
  "from-fuchsia-500 to-purple-600",
  "from-lime-500 to-emerald-600",
  "from-orange-500 to-amber-600",
  "from-green-500 to-emerald-700",
  "from-teal-500 to-green-700",
  "from-violet-500 to-purple-700",
  "from-rose-400 to-orange-500",
];

export function gradientFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
  }
  return GRADIENTS[hash % GRADIENTS.length];
}
