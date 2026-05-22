/**
 * HoC PWA Service Worker
 *
 * Cache-first for static assets, network-first for API calls.
 * Enables offline capability and instant page loads.
 */

const CACHE_NAME = "hoc-v1";
const STATIC_URLS = ["/", "/index.html", "/manifest.json"];

// ─── Install ─────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_URLS)));
  self.skipWaiting();
});

// ─── Activate ────────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

// ─── Fetch Strategy ──────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and WebSocket
  if (request.method !== "GET") {
    return;
  }
  if (url.protocol === "ws:" || url.protocol === "wss:") {
    return;
  }

  // API calls: network-first
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/rpc")) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Static assets: cache-first
  if (
    url.pathname.match(/\.(js|css|png|jpg|svg|woff2?|ico|webp)$/) ||
    url.pathname === "/" ||
    url.pathname === "/index.html"
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Everything else: network-first
  event.respondWith(networkFirst(request));
});

// ─── Strategies ──────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response("Offline", { status: 503 });
  }
}
