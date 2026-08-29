// Offline shell. Bump CACHE when you change any file below, otherwise browsers
// that already installed the app keep serving the old copy.
const CACHE = 'life-tracker-v2';

const SHELL = [
  './',
  'index.html',
  'css/styles.css',
  'js/app.js',
  'js/auth.js',
  'js/config.js',
  'js/db.js',
  'js/ui.js',
  'js/views/dashboard.js',
  'js/views/tasks.js',
  'js/views/calendar.js',
  'js/views/habits.js',
  'js/views/mood.js',
  'js/views/workouts.js',
  'js/views/expenses.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // One missing file would reject addAll and abort the whole install, so add
      // them individually and tolerate failures.
      .then((c) => Promise.allSettled(SHELL.map((url) => c.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;

  // Only ever touch our own GET requests. Supabase and the CDN must always hit
  // the network — serving a stale API response would show stale data.
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // Navigations: network first so a redeploy is picked up, cache as the offline fallback.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r ?? caches.match('index.html')))
    );
    return;
  }

  // Static assets: cache first, refresh in the background.
  e.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached ?? network;
    })
  );
});
