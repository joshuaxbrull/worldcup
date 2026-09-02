const SHELL = "hd-shell-v3";
const TILES = "hd-tiles-v3";
const TILE_LIMIT = 450;

const SHELL_URLS = ["./", "./index.html", "./css/styles.css", "./js/main.js", "./data/locations.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => Promise.all(SHELL_URLS.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== SHELL && key !== TILES).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

function isMapAsset(url) {
  return (
    url.hostname.endsWith("tiles.openfreemap.org") ||
    url.hostname.endsWith("arcgisonline.com")
  );
}

function isCdnAsset(url) {
  return (
    url.hostname === "cdn.jsdelivr.net" &&
    /leaflet|maplibre/.test(url.pathname)
  );
}

async function trimTileCache(cache) {
  const keys = await cache.keys();
  const extra = keys.length - TILE_LIMIT;
  if (extra <= 0) return;
  await Promise.all(keys.slice(0, extra).map((key) => cache.delete(key)));
}

async function cacheFirst(request, cacheName, { trim = false } = {}) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type !== "opaque") {
    await cache.put(request, response.clone());
    if (trim) await trimTileCache(cache);
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok && response.type !== "opaque") cache.put(request, response.clone());
      return response;
    })
    .catch(() => hit);
  return hit || refresh;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (isMapAsset(url)) {
    event.respondWith(cacheFirst(request, TILES, { trim: true }));
    return;
  }

  if (url.origin === self.location.origin || isCdnAsset(url)) {
    event.respondWith(staleWhileRevalidate(request, SHELL));
  }
});
