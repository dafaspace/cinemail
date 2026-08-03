// ── Cache version — bump this string on every deploy to force refresh ──────────
const CACHE_VERSION = "v143";
const CACHE_NAME = "cinemail-" + CACHE_VERSION;

// Files to cache for offline use
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./logo.png",
  "./exceljs.min.js",
];

// Minimal branded offline page — last-resort fallback so a home-screen launch with
// no network AND an evicted cache shows a friendly screen (auto-reloading when back
// online) instead of the browser's error page. Never replaces the cached app shell.
function offlineFallback() {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cinemail</title><body style="margin:0;background:#0e081c;color:#e8e8ee;font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center"><div style="padding:24px"><div style="font-size:44px">🎬</div><h2 style="font-weight:600;margin:10px 0 6px">You're offline</h2><p style="color:#8a8a96;font-size:14px;margin:0">Cinemail will reload automatically when you're back online.</p></div><script>addEventListener("online",function(){location.reload()});setInterval(function(){if(navigator.onLine)location.reload()},3000)</script>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

// ── Install: cache core files ─────────────────────────────────────────────────
self.addEventListener("install", event => {
  // Skip waiting — activate immediately without waiting for old SW to die
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // Cache each item independently. addAll() is atomic: one failed or oversized
      // asset (e.g. exceljs) would otherwise silently prevent index.html — the app
      // shell — from being cached at all, leaving nothing to fall back to offline.
      Promise.allSettled(PRECACHE.map(url =>
        fetch(url, { cache: "reload" }).then(r => (r && r.ok) ? cache.put(url, r) : null)
      ))
    )
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
        .catch(() => caches.match(event.request)
          .then(r => r || caches.match("./index.html"))
          .then(r => r || offlineFallback())) // never return undefined → never a raw browser error
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
