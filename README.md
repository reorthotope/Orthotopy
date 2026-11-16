# Orthotopy

> Every work in its right place — a free, open publishing home for developers and creators.

Orthotopy is an open platform where developers and creators publish their works —
apps, tools, games, music, design, writing — without platform fees, ads or
gatekeeping. Works are hosted by their makers and listed in a live catalog
backed by Cloudflare D1.

We support open source and the site is **ad-free by policy**: no AdSense, no
ad scripts, no `ads.txt` — nothing to remove or re-enable.

The site is a **fully static export** (`next build` → `out/`), so it can be
hosted for free on Cloudflare Pages, GitHub Pages, Netlify or any static host.
It also ships as a **PWA**: installable on Android, iOS and desktop, with
offline support.

## How the catalog works

- The catalog is **live data only** — `GET /api/works` serves every reviewed,
  approved work straight from D1 (read-replica routed for viewers). There are
  no seeded or sample listings anywhere in the codebase.
- **Publishing a work**: the *Publish* button opens a form (title, type,
  platform, description, main repo link, download link). Submissions land in
  the review queue as `pending` and an admin approves them from `/apex`.
- Each work carries its public GitHub repo link, so every listing shows a
  **Source** link straight to the code.
- **Logos & screenshots come from the repo itself** — screenshots as
  `img.png, img1.png … img9.png` and the tile logo as `logo.png` or
  `icon.png` in the repo root. Both are detected at publish time and
  hotlinked from raw.githubusercontent.com; nothing is ever uploaded.
- Redeploys are automatic when the repo changes (see hosting below).

## PWA

- **Installable** — web app manifest (`public/manifest.webmanifest`) with branded
  PNG icons (regular + maskable), standalone display and dark theme color.
- **Offline-first** — a service worker (`public/sw.js`) precaches the app shell,
  serves static build assets cache-first, and keeps page navigations working
  with a network-first + cache fallback and an offline notice. It stays dormant
  in development so hot reload is never cached.

## Hosting on Cloudflare Pages

1. Push this repository to GitHub.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**,
   pick this repository.
3. Build settings:
   - **Framework preset**: Next.js (Static HTML) — or leave none
   - **Build command**: `bun install && bun run build` (or `npx next build` / `npm run build`)
   - **Build output directory**: `out`
4. Deploy. Add a custom domain from *Pages → Custom domains* when ready.
5. Set `ADMIN_TOKEN` (a long random string) in *Pages → Settings →
   Environment variables* — it unlocks the `/apex` review console that
   approves published works.

## Stack

- [Next.js 16](https://nextjs.org) (App Router, static export) + TypeScript
- [Tailwind CSS 4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com)
- TanStack Query, Lucide icons, Framer Motion, next-themes
- Hand-rolled service worker (no PWA dependency, fully auditable)

## Develop

```bash
bun install
bun run dev       # http://localhost:3000 (service worker disabled in dev)
bun run lint
bun run build     # static export into out/
bun run preview   # serve out/ at http://localhost:8788
```

## License

[MIT](./LICENSE)
