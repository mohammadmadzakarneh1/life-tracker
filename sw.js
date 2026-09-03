// Offline shell.
//
// Code (HTML/JS/CSS/manifest) is network-first: a deploy must never leave a browser
// running yesterday's JavaScript against today's HTML. That mismatch is not
// theoretical — a cache-first version of this file shipped new tabs whose routes
// lived in a cached older app.js, so tapping them did nothing.
//
// Only genuinely static assets (icons) are cache-first. The cache still exists so
// the app opens offline; it is just no longer allowed to win a race against the
// network when the network is available.
const CACHE = 'life-tracker-v7';

const SHELL = [
  './',
  'index.html',
  'css/styles.css',
  'js/app.js',
  'js/auth.js',
  'js/config.js',
  'js/db.js',
  'js/ui.js',
  'js/nav.js',
  'js/strings.js',
  'js/views/today.js',
  'js/views/tasks.js',
  'js/views/university.js',
  'js/views/projects.js',
  'js/views/habits.js',
  'js/views/calendar.js',
  'js/views/money.js',
  'js/views/progress.js',
  'js/views/settings.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // One missing file would reject addAll and abort the whole install, so add
      // them individually and tolerate failures. `cache: 'reload'` keeps the HTTP
      // cache from seeding this install with stale copies.
      .then((c) =>
        Promise.allSettled(SHELL.map((url) => c.add(new Request(url, { cache: 'reload' }))))
      )
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

  const url = new URL(request.url);

  // Navigations and app code: network first, cache only as the offline fallback.
  const isCode = /\.(js|css|html|webmanifest)$/.test(url.pathname);

  if (request.mode === 'navigate' || isCode) {
    e.respondWith(
      // `cache: 'reload'` bypasses the browser's HTTP cache. GitHub Pages serves
      // these files with max-age=600, so a plain fetch() can hand back JavaScript
      // that is up to ten minutes old — network-first is worthless against that.
      // Requesting by URL rather than passing `request` is deliberate: a navigate
      // Request cannot be reconstructed with a different cache mode.
      fetch(request.url, { cache: 'reload', credentials: 'same-origin' })
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(request).then((r) =>
            r ?? (request.mode === 'navigate' ? caches.match('index.html') : undefined)
          )
        )
    );
    return;
  }

  // Icons and other immutable assets: cache first, refreshed in the background.
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
