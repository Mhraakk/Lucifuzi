// Beatris service worker.
// - API calls are never cached (they carry personal data and must be fresh).
// - Fonts, the three.js bundle and icons: stale-while-revalidate (instant load, refreshed in the background).
// - App code and pages: network-first with a cache fallback, so online users always get the latest deploy
//   and the app still opens on a flaky connection.
const CACHE = 'beatris-v16';
const PRECACHE = ['/', '/app.css', '/js/app.mjs', '/js/core.mjs', '/js/ui.mjs', '/js/crown.mjs', '/js/calc.mjs', '/icon.svg', '/manifest.webmanifest', '/fonts/estedad-arabic-var.woff2', '/fonts/estedad-latin-var.woff2', '/fonts/naskh-arabic-var.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const isStatic = (p) => p.startsWith('/vendor/') || p.startsWith('/fonts/') || /\.(png|svg|woff2)$/.test(p);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // coin photographs are large and immutable: the browser's HTTP cache handles them, not the SW cache
  if (url.pathname.startsWith('/media/') || /^\/coins\/photos\/[^/]+\.(webp|jpg|png|json)$/.test(url.pathname)) return;

  if (isStatic(url.pathname)) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(req);
        const net = fetch(req).then((r) => (r.ok && c.put(req, r.clone()), r)).catch(() => hit);
        return hit || net;
      }),
    );
    return;
  }
  e.respondWith(
    fetch(req)
      .then((r) => {
        if (r.ok) caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? '/' : req, r.clone()));
        return r;
      })
      .catch(async () => (await caches.match(req.mode === 'navigate' ? '/' : req)) || (await caches.match('/')) || Response.error()),
  );
});
