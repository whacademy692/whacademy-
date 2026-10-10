/**
 * sw.js — W.H. Academy Service Worker
 *
 * Cache-first for static assets (engine/UI shell), network-first with
 * offline fallback for chapter content.
 */
// Bump on every frontend deploy.
const CACHE_VERSION = 'wha-v91';
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const STATIC_ASSETS = [
  'welcome.html', 'login.html', 'dashboard.html', 'profile.html', 'settings.html',
  'games.html', 'leaderboard.html', 'revision.html', 'achievements.html', 'boss-battle.html', 'badges.html',
  'progress.html',
  'assets/css/pages/boss-battle.css', 'assets/js/boss-battle.js', 'assets/js/badges.js',
  'assets/css/pages/boss-steps.css', 'assets/css/pages/boss-badges.css', 'assets/js/katex-render.js',
  'assets/vendor/katex/katex.min.js', 'assets/vendor/katex/katex.min.css',
  'assets/css/variables.css', 'assets/css/main.css', 'assets/css/layout.css',
  'assets/css/components.css', 'assets/css/animations.css', 'assets/css/responsive.css',
  'assets/css/pages/login.css', 'assets/css/pages/dashboard.css', 'assets/css/pages/games.css',
  'assets/css/pages/profile.css', 'assets/css/pages/settings.css',
  'assets/css/notifications-center.css',
  'assets/js/utils.js', 'assets/js/storage.js', 'assets/js/api.js', 'assets/js/router.js',
  'assets/js/auth.js', 'assets/js/dashboard.js', 'assets/js/games.js', 'assets/js/profile.js',
  'assets/js/leaderboard.js', 'assets/js/revision.js', 'assets/js/progress.js', 'assets/js/animations.js',
  'assets/js/notifications.js', 'assets/js/notifications-center.js', 'assets/js/app.js',
  'assets/js/scope.js', 'assets/js/content-registry.js',
  'manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      Promise.all(STATIC_ASSETS.map((asset) =>
        cache.add(asset).catch(() => {
          console.warn('[sw] could not pre-cache:', asset);
        })
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith('wha-') && key !== STATIC_CACHE)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

/* Closed-app Web Push delivery. Payload is produced by the trusted backend. */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = {
      title: 'W.H. Academy',
      body: event.data ? event.data.text() : 'You have a new W.H. Academy update.'
    };
  }

  const title = String(payload.title || 'W.H. Academy').slice(0, 140);
  const body = String(payload.body || payload.message || 'You have a new W.H. Academy update.').slice(0, 500);

  let targetUrl = new URL('dashboard.html', self.registration.scope).href;
  try {
    const candidate = new URL(String(payload.url || 'dashboard.html'), self.registration.scope);
    if (candidate.origin === self.location.origin &&
        candidate.pathname.startsWith(new URL(self.registration.scope).pathname)) {
      targetUrl = candidate.href;
    }
  } catch (_) {}

  const options = {
    body,
    tag: String(payload.tag || 'wha-update').slice(0, 120),
    renotify: !!payload.renotify,
    data: {
      url: targetUrl,
      notificationId: String(payload.notificationId || '')
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  let targetUrl = new URL('dashboard.html', self.registration.scope).href;
  try {
    const candidate = new URL(
      String((event.notification.data && event.notification.data.url) || 'dashboard.html'),
      self.registration.scope
    );
    if (candidate.origin === self.location.origin &&
        candidate.pathname.startsWith(new URL(self.registration.scope).pathname)) {
      targetUrl = candidate.href;
    }
  } catch (_) {}

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        try {
          if (new URL(client.url).origin === self.location.origin) {
            if ('navigate' in client) await client.navigate(targetUrl);
            return client.focus();
          }
        } catch (_) {}
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  const isChapterContent = url.pathname.includes('/games/classes/') &&
    (url.pathname.endsWith('.json') || url.pathname.endsWith('.html') ||
     url.pathname.endsWith('.css') || url.pathname.endsWith('.js'));

  if (isChapterContent) {
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

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networked = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networked;
    })
  );
});
