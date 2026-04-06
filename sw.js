const CACHE = "movie-night-v1";
const ASSETS = [
  "./movie-night.html",
  "./manifest.json"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  // For OMDb API calls — always try network first
  if (e.request.url.includes("omdbapi.com") || e.request.url.includes("anthropic.com")) {
    e.respondWith(fetch(e.request).catch(() => new Response("offline", { status: 503 })));
    return;
  }
  // For app shell — cache first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
