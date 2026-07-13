/**
 * sw.js — W.H. Academy Service Worker
 * Cache-first for static assets (engine/UI shell), network-first with
 * offline fallback for chapter content — Software Architecture §14's
 * differentiated caching strategy.
 */

const CACHE_VERSION = 'wha-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const STATIC_ASSETS = [
  'welcome.html', 'login.html', 'dashboard.html', 'profile.html', 'settings.html',
  'games.html', 'leaderboard.html', 'revision.html', 'achievements.html',
  'assets/css/variables.css', 'assets/css/main.css', 'assets/css/layout.css',
  'assets/css/components.css', 'assets/css/animations.css', 'assets/css/responsive.css',
  'assets/css/pages/login.css', 'assets/css/pages/dashboard.css', 'assets/css/pages/games.css',
  'assets/css/pages/profile.css', 'assets/css/pages/settings.css',
  'assets/js/utils.js', 'assets/js/storage.js', 'assets/js/api.js', 'assets/js/router.js',
  'assets/js/auth.js', 'assets/js/dashboard.js', 'assets/js/games.js', 'assets/js/profile.js',
  'assets/js/leaderboard.js', 'assets/js/revision.js', 'assets/js/animations.js',
  'assets/js/notifications.js', 'assets/js/app.js', 'manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('wha-') && key !== STATIC_CACHE).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return; // never cache API POST calls

  const isChapterContent = url.pathname.includes('/games/classes/') &&
    (url.pathname.endsWith('content.json') || url.pathname.endsWith('.html') || url.pathname.endsWith('.css') || url.pathname.endsWith('.js'));

  if (isChapterContent) {
    // Network-first, falling back to cache when offline — chapter
    // content should stay fresh when possible, but remain usable
    // offline once visited.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for the static app shell (engine, styles, UI).
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
