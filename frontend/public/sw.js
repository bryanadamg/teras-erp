// Minimal service worker — presence + fetch handler satisfies Chrome PWA install criteria.
// Pass-through: does not cache or intercept, so /api and /static proxying is unaffected.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
