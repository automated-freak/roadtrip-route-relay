/* Route Relay — minimal service worker (offline shell + installability).
   Cache-first for the app shell; network-only for config.js (its apiBase
   points at the tunnel URL, which changes when the tunnel restarts, so it must
   never be served from a stale cache). Bump CACHE_VERSION when shell assets change. */

const CACHE_VERSION = 'rr-v2';
const CACHE_NAME = `route-relay-${CACHE_VERSION}`;

const SHELL = [
  './index.html',
  './styles.css',
  './app.js',
  './link-parser.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only handle same-origin requests; let cross-origin (e.g. the API) pass through.
  if (url.origin !== self.location.origin) return;

  // config.js must always hit the network — never serve a stale tunnel URL.
  if (url.pathname.endsWith('/config.js')) {
    event.respondWith(fetch(req));
    return;
  }

  // For navigation requests, serve the cached shell (offline SPA).
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => cached || fetch(req))
    );
    return;
  }

  // Cache-first for the static shell, with a network fallback + background refresh.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
