/*
 * Service worker to enable offline caching of assets and map tiles.
 */
const CACHE_NAME = 'osm-explorer-cache-v1';
// List of core files to cache during installation
const CORE_ASSETS = [
  './',
  '/index.html',
  '/style.css',
  '/main.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  // Pre-cache core assets
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  // Clean up old caches if necessary
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
          return null;
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const requestURL = new URL(event.request.url);
  // Only handle http(s) requests
  if (requestURL.protocol.startsWith('http')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        // Return cached response if found
        if (cachedResponse) {
          return cachedResponse;
        }
        // Otherwise fetch from network and cache a copy
        return fetch(event.request)
          .then((networkResponse) => {
            // Skip opaque responses (e.g. cross-origin requests without CORS)
            if (!networkResponse || networkResponse.type === 'opaque') {
              return networkResponse;
            }
            return caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse.clone());
              return networkResponse;
            });
          })
          .catch(() => {
            // If offline and not cached, return nothing (could fallback to offline page)
            return undefined;
          });
      })
    );
  }
});