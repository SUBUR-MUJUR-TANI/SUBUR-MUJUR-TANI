const CACHE = 'subur-mujur-tani-pwa-v10-admin-final';
const SHELL = [
  '/index.html',
  '/login.html',
  '/manifest.webmanifest',
  '/pwa-register.js',
  '/navigasi.css',
  '/navigasi.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Network-first for HTML so Firebase/Biteship-related UI is not stuck on an old copy.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('/index.html'))));
    return;
  }
  event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(res => {
    if (res.ok) { const copy=res.clone(); caches.open(CACHE).then(c=>c.put(req,copy)); }
    return res;
  })));
});
