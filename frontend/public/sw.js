const CACHE_NAME = 'clickworthy-cache-v2';
const OFFLINE_URL = '/offline.html';

// Caching only essential, non-sensitive static assets for public pages
const URLS_TO_CACHE = [
  '/',
  OFFLINE_URL,
  '/icon-192x192.png',
  '/icon-512x512.png'
];

// Check whether the service worker is executing on localhost or loopback
const isLocalhost = Boolean(
  self.location.hostname === 'localhost' ||
  self.location.hostname === '[::1]' ||
  self.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/)
);

self.addEventListener('install', (event) => {
  if (isLocalhost) {
    // In local development, activate immediately and avoid caching
    self.skipWaiting();
    return;
  }

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(URLS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  if (isLocalhost) {
    // In local development, delete all caches and unregister
    event.waitUntil(
      caches.keys().then((names) => {
        return Promise.all(names.map((name) => caches.delete(name)));
      })
      .then(() => self.registration.unregister())
      .then(() => self.clients.claim())
    );
    return;
  }

  // In production, remove outdated caches
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

function isPrivateOrDynamicRoute(pathname) {
  const cleanPath = pathname.replace(/\/+$/, '') || '/';
  return (
    cleanPath === '/dashboard' ||
    cleanPath.startsWith('/dashboard/') ||
    cleanPath === '/login' ||
    cleanPath.startsWith('/login/') ||
    cleanPath === '/gallery' ||
    cleanPath.startsWith('/gallery/') ||
    cleanPath === '/guest' ||
    cleanPath.startsWith('/guest/') ||
    cleanPath.startsWith('/api/')
  );
}

self.addEventListener('fetch', (event) => {
  // 1. Never intercept anything on localhost / local development
  if (isLocalhost) {
    return;
  }

  // 2. Only intercept standard GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // 3. Never intercept external APIs (backend server, Firebase, Google Drive, etc.)
  if (url.origin !== self.location.origin) {
    return;
  }

  // 4. Never intercept Next.js internal build/development chunks or HMR
  if (url.pathname.startsWith('/_next/webpack-hmr') || url.pathname.startsWith('/_next/data/')) {
    return;
  }

  // 5. Exclude private, authenticated, or dynamic content:
  //    - /login, /login/*
  //    - /dashboard, /dashboard/*
  //    - /gallery, /gallery/*
  //    - /api/* (including /api/images/*, /api/upload/*, /api/auth/*)
  if (isPrivateOrDynamicRoute(url.pathname)) {
    return;
  }

  // 6. Handle navigation requests (ONLY for genuinely public pages, like landing page)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(OFFLINE_URL);
      })
    );
    return;
  }

  // 7. Handle static public assets (icons, offline.html)
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        return response;
      }
      return fetch(event.request);
    })
  );
});
