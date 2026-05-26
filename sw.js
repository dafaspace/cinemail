// ── Cache version — bump this string on every deploy to force refresh ──────────
const CACHE_VERSION = "v81";
const CACHE_NAME = "cinemail-" + CACHE_VERSION;

// Files to cache for offline use
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./logo.png",
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

  // ONLY handle same-origin GET requests. Never intercept cross-origin calls
  // (Supabase API, TMDB proxy, Google Fonts, etc.) — let the browser handle them
  // natively. Intercepting them and falling back to an uncached match returns
  // `undefined`, which crashes the request ("Failed to convert value to 'Response'").
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  // Always fetch HTML fresh from network (never serve stale app shell)
  if (event.request.mode === "navigate" || url.pathname.endsWith(".html")) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request).then(r => r || caches.match("./index.html")))
    );
    return;
  }

  // Other same-origin assets: network-first, fall back to cache (never undefined)
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(r => r || Response.error()))
  );
});

// ── Message: force update from page ──────────────────────────────────────────
self.addEventListener("message", event => {
  if (event.data === "skipWaiting") self.skipWaiting();
});
