# Orthotopy

**Every app in its right place.**

A free, open, cross-platform app store for independent developers and creators — powered entirely by GitHub Releases. One Flutter codebase ships the store to **Android, Windows, macOS, Linux and the Web**, and every platform reads the same live catalog so they always stay in sync.

| | |
|---|---|
| Website | https://reorthotope.github.io/Orthotopy/ |
| Releases | https://github.com/reorthotope/Orthotopy/releases/latest |
| Catalog | [`catalog/catalog.json`](catalog/catalog.json) |
| License | MIT |

[![Release](https://img.shields.io/github/v/release/reorthotope/Orthotopy?label=release&color=10b981)](https://github.com/reorthotope/Orthotopy/releases/latest)
[![CI](https://github.com/reorthotope/Orthotopy/actions/workflows/ci.yml/badge.svg)](https://github.com/reorthotope/Orthotopy/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-10b981)](LICENSE)

---

## Why

Publishing software is already solved — it's called GitHub Releases. What's missing is *discovery*. Orthotopy is a thin, friendly layer on top of the thing you already do:

1. You attach builds to a GitHub Release.
2. You add one JSON entry to this repo's catalog via a pull request.
3. Every Orthotopy client — web, Android, desktop — picks your app up on its next launch. No store update, no review queue, no fees.

## Features

- **Browse apps & games** with live search, category filters and platform awareness.
- **One-click install** — the Install button resolves the right asset in the repo's latest release and triggers a direct download:
  - stable asset names use `…/releases/latest/download/<asset>` (always the newest build with that name);
  - versioned asset names use a catalog-provided `assetRegex`, resolved at runtime via `api.github.com`;
  - anything unresolved falls back to the release page itself.
- **Trending apps & trending creators** — computed on-device from catalog stats (latest-release downloads, stars), so it works offline and stays honest.
- **Cross-platform sync** — the catalog is fetched live from `raw.githubusercontent.com`, cached on-device, and bundled as an offline fallback.
- **Dark-first Material 3** design with an emerald identity, light mode toggle and adaptive navigation (bottom bar on phones, rail on desktop).

## Install

Grab the build for your platform from the [latest release](https://github.com/reorthotope/Orthotopy/releases/latest):

| Platform | Artifact |
|---|---|
| Android | `Orthotopy-android.apk` (universal, debug-signed for sideloading) |
| Windows | `Orthotopy-windows-x64.zip` |
| macOS | `Orthotopy-macos-universal.zip` (unsigned — right-click → Open) |
| Linux | `Orthotopy-linux-x64.tar.gz` (GTK bundle) |
| Web | https://reorthotope.github.io/Orthotopy/ |

Or self-host the web bundle anywhere static files are served (`Orthotopy-web.zip`).

## Publish your app

Orthotopy is a pull-request store. See the in-app **Publish** tab or follow these steps:

**1. Ship it on GitHub** — attach a build for each platform to a Release of your repository.

**2. Add an entry to `catalog/catalog.json`** (schema: [`orthotopy.schema.json`](orthotopy.schema.json)):

```json
{
  "id": "my-app",
  "name": "My App",
  "tagline": "One line that sells it",
  "category": "utilities",
  "repo": "you/my-app",
  "developer": { "name": "You", "handle": "you" },
  "platforms": ["android", "linux"],
  "tags": ["tool"],
  "install": {
    "targets": [
      { "platform": "android", "assetRegex": "^my-app-.*\\.apk$" }
    ]
  }
}
```

The `repo` field points at your GitHub repository — stars and download counts are what drive trending. Each install target is either:

- `url` — a stable direct link like `https://github.com/you/my-app/releases/latest/download/my-app.apk`, or
- `assetRegex` — a regular expression matched against the asset names of your **latest release**; the first match is downloaded. Use this when your asset names embed a version number.

**3. Open a pull request.** Once merged, the listing is live for every client within seconds — clients fetch the catalog from `raw.githubusercontent.com` on each launch and cache it offline.

## Architecture

```
┌────────────────────────── one Flutter codebase ──────────────────────────┐
│  lib/models/catalog.dart        immutable catalog models                 │
│  lib/data/catalog_repository.dart  remote → on-device cache → bundled    │
│  lib/data/install_resolver.dart    GitHub Release asset resolution       │
│  lib/state/catalog_provider.dart   browse filters, trending, theming     │
│  lib/pages/…                   home · browse · detail · creators · publish│
│  lib/widgets/…                 adaptive shell, cards, install button      │
└──────────────────────────────────────────────────────────────────────────┘
        │ web            │ android         │ linux/windows/macos
   GitHub Pages      release APK       release bundles (CI-built)
```

- **Data**: `catalog/catalog.json` is the single source of truth. The app tries the live copy first, then its cached copy, then the bundled snapshot — so it works fully offline and always converges to the newest catalog.
- **Distribution**: the store itself is distributed through its own mechanism — GitHub Releases, built by [`workflows/release.yml`](.github/workflows/release.yml) on every `v*` tag (APK, Windows, macOS, Linux, Web + Pages deploy).

## Development

Prerequisites: [Flutter](https://docs.flutter.dev/get-started/install) (stable channel).

```bash
flutter pub get
flutter analyze          # zero-issue policy
flutter test             # model + widget tests
flutter run -d chrome    # web
flutter build web --release --base-href "/Orthotopy/"
```

To cut a release: `git tag v0.1.x && git push origin v0.1.x` — CI builds all five targets and publishes the release with artifacts.

## Roadmap

- [ ] In-app download manager for Android (download + launch install intent directly)
- [ ] Signed release builds & auto-update checks
- [ ] User accounts with install history and "my library" sync
- [ ] App screenshots in catalog entries
- [ ] Catalog REST/JSON feed for third-party clients

## Notes

- Download/star counts are snapshots taken when catalog entries are updated; the Orthotopy client treats them as display data only.
- Orthotopy is an independent, community project and is not affiliated with GitHub.
- Only list software you have the right to distribute.
