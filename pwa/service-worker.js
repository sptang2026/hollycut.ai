/* Replaced with build-specific, public assets by scripts/build-pwa.mjs. */
const CACHE_NAME = __CACHE_NAME__;
const PRECACHE = __PRECACHE__;
const STATIC_PATHS = new Set(PRECACHE);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const previous = (await caches.keys()).filter(key => key.startsWith('hollycut-shell-') && key !== CACHE_NAME);
    // Keep one older shell for another tab that has not reloaded yet.
    await Promise.all(previous.slice(0, -1).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // Never handle API requests, user images, POSTs or third-party content.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')) {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch (error) {
        const cached = await (await caches.open(CACHE_NAME)).match('/index.html');
        if (cached) return cached;
        throw error;
      }
    })());
    return;
  }
  if (!STATIC_PATHS.has(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(url.pathname);
    return cached || fetch(request);
  })());
});
