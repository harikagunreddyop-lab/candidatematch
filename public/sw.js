/**
 * Minimal service worker for PWA installability.
 * Required by Chrome/Edge to show "Install" / "Add to desktop".
 * No fetch handling = all requests go to network (app always fresh).
 */
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
