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

/**
 * Sample catalog seeded on first load. Six developer works and six creator
 * works, all fictional, to show how the storefront reads in practice.
 */
export const DEFAULT_WORKS: Omit<Work, "id" | "createdAt">[] = [
  {
    title: "Lumberstack",
    tagline: "Project scaffolds and stack templates in one tiny CLI.",
    kind: "Developer",
    category: "Developer Tools",
    creator: "Arun Patel",
    icon: "terminal",
    gradient: "from-emerald-500 to-teal-600",
  },
  {
    title: "Night Garden",
    tagline: "Forty hand-drawn botanical illustrations, free to remix.",
    kind: "Creator",
    category: "Visual Art",
    creator: "Yuki Aoyama",
    icon: "image",
    gradient: "from-rose-400 to-orange-500",
  },
  {
    title: "Hexably",
    tagline: "A hex-grid puzzle game with 200 handmade levels.",
    kind: "Developer",
    category: "Games",
    creator: "Mara Lindqvist",
    icon: "gamepad",
    gradient: "from-violet-500 to-fuchsia-600",
  },
  {
    title: "Lowtide EP",
    tagline: "Four ambient tracks recorded on a shoreline, CC-BY.",
    kind: "Creator",
    category: "Audio",
    creator: "Nia Okafor",
    icon: "music",
    gradient: "from-fuchsia-500 to-purple-600",
  },
  {
    title: "Notewell",
    tagline: "Markdown notes with end-to-end encrypted sync.",
    kind: "Developer",
    category: "Apps",
    creator: "Tomas Rivera",
    icon: "notebook",
    gradient: "from-amber-500 to-orange-600",
  },
  {
    title: "Papercut UI",
    tagline: "A cut-paper design system with 120 components and tokens.",
    kind: "Creator",
    category: "Design",
    creator: "Ines Duarte",
    icon: "palette",
    gradient: "from-rose-500 to-pink-600",
  },
  {
    title: "Shieldpass",
    tagline: "Offline password vault with zero telemetry.",
    kind: "Developer",
    category: "Apps",
    creator: "Priya Raman",
    icon: "shield",
    gradient: "from-lime-500 to-emerald-600",
  },
  {
    title: "Field Notes: Dolomites",
    tagline: "A photo essay on alpine light, shot over three summers.",
    kind: "Creator",
    category: "Photography",
    creator: "Jonas Weber",
    icon: "camera",
    gradient: "from-teal-500 to-green-700",
  },
  {
    title: "Ledgerly",
    tagline: "Plain-text budgeting that never leaves your device.",
    kind: "Developer",
    category: "Developer Tools",
    creator: "Chen Wei",
    icon: "calculator",
    gradient: "from-green-500 to-emerald-700",
  },
  {
    title: "Sprite Foundry",
    tagline: "Five hundred pixel-art sprites for indie game jams.",
    kind: "Creator",
    category: "Assets",
    creator: "Dana Kovalenko",
    icon: "box",
    gradient: "from-orange-500 to-amber-600",
  },
  {
    title: "Waveline",
    tagline: "Studio-quality recorder and trimmer under 5 MB.",
    kind: "Developer",
    category: "Audio",
    creator: "Felix Moreau",
    icon: "waveform",
    gradient: "from-teal-500 to-emerald-600",
  },
  {
    title: "The Lazy Virtual Machine",
    tagline: "An essay series on building interpreters that loaf.",
    kind: "Creator",
    category: "Writing",
    creator: "Sam Whitaker",
    icon: "book",
    gradient: "from-violet-500 to-purple-700",
  },
];
