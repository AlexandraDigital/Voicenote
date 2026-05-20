const CACHE = "voicenotes-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/css/style.css",
  "/js/app.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// External API URLs that should bypass cache (network-first)
const API_ENDPOINTS = [
  "voicenote-worker.futuresuccess105.workers.dev",
  "api.notion.com"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
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
  // Check if this is an external API request
  const isApiRequest = API_ENDPOINTS.some(endpoint => e.request.url.includes(endpoint));

  if (isApiRequest) {
    // Network-first strategy for APIs: try network, fall back to cache, then fail
    e.respondWith(
      fetch(e.request)
        .then(response => {
          // Only cache successful responses
          if (response.ok && (response.status === 200 || response.status === 201)) {
            const clonedResponse = response.clone();
            caches.open(CACHE).then(cache => cache.put(e.request, clonedResponse));
          }
          return response;
        })
        .catch(() => {
          // Network failed, try cache
          return caches.match(e.request).then(cached => {
            if (cached) return cached;
            // No cache either, return error response
            return new Response(
              JSON.stringify({ error: "Network unavailable and no cache available" }),
              { status: 503, headers: { "Content-Type": "application/json" } }
            );
          });
        })
    );
  } else {
    // Cache-first strategy for app assets (existing behavior)
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  }
});
