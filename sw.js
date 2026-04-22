// ── Cache version — bump this string on every deploy to force refresh ──────────
const CACHE_VERSION = "v9";
const CACHE_NAME = "movie-night-" + CACHE_VERSION;

// Files to cache for offline use
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.json",
];

// ── Install: cache core files ─────────────────────────────────────────────────
self.addEventListener("install", event => {
  // Skip waiting — activate immediately without waiting for old SW to die
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE).catch(() => {}))
  );
});

// ── Activate: delete ALL old caches ──────────────────────────────────────────
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log("[SW] Deleting old cache:", key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim()) // take control of all open pages immediately
  );
});

// ── Fetch: network-first strategy for HTML, cache-first for assets ────────────
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // Never cache non-GET requests (PATCH, POST, DELETE etc.)
  if (event.request.method !== "GET") return;

  // Always fetch HTML fresh from network (never serve stale app shell)
  if (event.request.mode === "navigate" || url.pathname.endsWith(".html")) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Update cache with fresh version
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request)) // fallback to cache if offline
    );
    return;
  }

  // For everything else: network-first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── Message: force update from page ──────────────────────────────────────────
self.addEventListener("message", event => {
  if (event.data === "skipWaiting") self.skipWaiting();
});
