# Orthotopy

> Every work in its right place — a free, open publishing home for developers and creators.

Orthotopy is an open platform where developers and creators publish their works —
apps, tools, games, music, design, writing — without platform fees, ads or
gatekeeping. Works are hosted by their makers and listed in an open catalog that
lives entirely in this repository.

The site is a **fully static export** (`next build` → `out/`), so it can be
hosted for free on Cloudflare Pages, GitHub Pages, Netlify or any static host.
It also ships as a **PWA**: installable on Android, iOS and desktop, with
offline support.

## How the catalog works

- `public/catalog/works.json` is the single source of truth — one JSON object
  per work (title, tagline, kind, category, creator, icon, gradient).
- **Publishing a work**: the *Publish* button on the site opens a prefilled
  GitHub issue containing the ready-to-merge JSON. A maintainer appends it to
  `works.json`, merges, and the next deploy lists it.
- Editing the JSON directly and opening a pull request works too.
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
5. Optional, for ads: set the environment variable
   `NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX` in *Pages → Settings →
   Environment variables* and rebuild — the AdSense loader is included in the
   page automatically. See `docs/` notes in the README section below for the
   `ads.txt` step.

## Advertising (Google AdSense)

- The site includes an env-gated AdSense loader in `src/app/layout.tsx` — it
  renders nothing until `NEXT_PUBLIC_ADSENSE_CLIENT` is set.
- After Google approves the site, create `public/ads.txt` containing
  `google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0` so it is served
  from the site root.
- A privacy policy covering ad cookies lives at `/privacy`
  (`src/app/privacy/page.tsx`) and is linked from the footer.

> **AdMob vs AdSense**: AdMob is for native mobile apps (Android/iOS). For this
> website use **AdSense**. AdMob becomes relevant again if/when Orthotopy ships
> a packaged Android app.

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
