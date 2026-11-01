/*
 * Orthotopy Store service worker.
 *
 * Strategy:
 *  - App shell (/, manifest, icons) is precached at install time.
 *  - Static build assets (/_next/static, icons, fonts) are cache-first.
 *  - Page navigations are network-first with a cache + shell fallback,
 *    so the store still opens offline.
 *  - API and other same-origin GETs go straight to the network (fresh data);
 *    failures simply fall through to the offline page shell.
 */
const VERSION = "orthotopy-store-pwa-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const STATIC_CACHE = `${VERSION}-static`;

const SHELL_URLS = [
  "/",
  "/manifest.webmanifest",
  "/orthotopy.svg",
  "/favicon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/orthotopy.svg" ||
    url.pathname === "/favicon.png" ||
    url.pathname === "/manifest.webmanifest"
  );
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = (await cache.match(request)) || (fallback && (await cache.match(fallback)));
    if (hit) return hit;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(request, RUNTIME_CACHE, "/").catch(
        () =>
          new Response(
            "<!doctype html><meta charset=\"utf-8\"><title>Orthotopy Store — offline</title>" +
              "<body style=\"background:#0b120e;color:#e2e8e4;font-family:system-ui;" +
              "display:grid;place-items:center;min-height:100vh;text-align:center\">" +
              "<div><h1 style=\"font-size:1.4rem\">You're offline</h1>" +
              "<p style=\"opacity:.7\">Orthotopy Store will reconnect automatically.</p></div>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          )
      )
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // API + other same-origin GETs: network first, no stale fallback for data.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
  }
});
