// Retire the old locator. The World Cup project at /marcolin/worldcup/ is separate.
const TARGET = "https://joshuaxbrull.github.io/marcolin/harleydavidson/";
function destination(source) { const old = new URL(source), next = new URL(TARGET); next.search = old.search; next.hash = old.hash; return next.href; }
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => /^hd-eyewear-(shell|tiles)-v[1-4]$/.test(key)).map(key => caches.delete(key)));
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  await self.registration.unregister();
  for (const client of clients.filter(client => client.url.startsWith(self.registration.scope))) client.navigate(destination(client.url)).catch(() => {});
})()));
self.addEventListener("fetch", event => {
  if (event.request.mode === "navigate") event.respondWith(Response.redirect(destination(event.request.url), 302));
});
