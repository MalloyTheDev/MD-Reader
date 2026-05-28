// MD Reader web - simple offline cache (stale-while-revalidate) for same-origin GETs.
// Versioned cache key so a deploy invalidates old entries. Never caches POST/PUT/DELETE,
// never intercepts cross-origin requests (no AI, fonts are bundled with the app).
const CACHE = 'mdreader-web-v1'

self.addEventListener('install', (event) => {
  // Activate this SW as soon as it's installed; old clients keep their cache until reload.
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      const cached = await cache.match(req)
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone()).catch(() => {})
          return res
        })
        .catch(() => cached)
      return cached || network
    })()
  )
})
