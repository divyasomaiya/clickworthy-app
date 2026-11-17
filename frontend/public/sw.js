const CACHE_NAME = 'clickworthy-cache-v1';
const OFFLINE_URL = '/offline.html';

// Caching only essential, non-sensitive static assets
const URLS_TO_CACHE = [
  '/',
  OFFLINE_URL,
  '/icon-192x192.png',
  '/icon-512x512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(URLS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. NEVER cache API requests (like /api/*)
  // 2. NEVER cache authentication endpoints
  // 3. NEVER cache dynamic gallery or event pages containing sensitive images
  const isApiRequest = url.pathname.startsWith('/api/');
  const isDynamicRoute = url.pathname.startsWith('/gallery/') || url.pathname.startsWith('/dashboard/');

  if (isApiRequest || isDynamicRoute) {
    return; // Pass through to network normally
  }

  // Handle navigation requests (e.g., refreshing an HTML page)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(OFFLINE_URL);
      })
    );
    return;
  }

  // Handle other static assets (CSS, JS, images)
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        return response; // Return from cache
      }
      return fetch(event.request); // Fallback to network
    })
  );
});
