// Srujaan Share Market Institute Management System — Service Worker Cache Invalidation
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => caches.delete(key)));
    }).then(() => self.clients.claim())
  );
});

// Always fetch fresh network resources for scripts and documents
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;
  return;
});

