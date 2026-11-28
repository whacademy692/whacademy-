/**
 * sw.js — W.H. Academy Service Worker
 *
 * Cache-first for static assets (engine/UI shell), network-first with
 * offline fallback for chapter content.
 */
// Bump on every frontend deploy.
// v142: GitHub Pages sends max-age=600, and cache.add()/fetch() inside a worker honour that browser cache, so a
// just-deployed site kept serving the OLD files (new look for a second after a hard refresh, then old again).
// Fix: pre-cache and revalidate with cache:'reload' / 'no-cache', and app files (html/css/js) are NETWORK-FIRST.
// v174: a failed network fetch + empty cache used to answer undefined -> Chrome "This site can't be reached ERR_FAILED"
// (pages then opened a few seconds later on the next try). Now: one quick retry, then cache, then a friendly self-retrying page.
// v175: Class 11 Physics Unit 3 (Translatory Motion) game content + notes page added.
const CACHE_VERSION = 'wha-v175';
const STATIC_CACHE = `${CACHE_VERSION}-static`;

// Network fetch with ONE quick retry (a cold/failed connection usually works the second time).
function fetchRetry(request) {
  return fetch(request, { cache: 'no-cache' }).catch((err) => {
    console.warn('[sw] network fetch failed, retrying once:', request.url, err && err.message);
    return new Promise((resolve) => setTimeout(resolve, 400)).then(() => fetch(request, { cache: 'no-cache' }));
  });
}

// Last resort when the network AND the cache both have nothing: never hand the browser `undefined`.
function offlineFallback(request) {
  if (request.mode !== 'navigate') return Response.error();
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Reconnecting - W.H. Academy</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
    'background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;text-align:center;padding:24px}h1{font-size:1.25rem;margin:0 0 8px}' +
    'p{margin:0 0 16px;color:#94a3b8}button{background:#4f46e5;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:1rem;cursor:pointer}</style></head>' +
    '<body><div><h1>Reconnecting&hellip;</h1><p id="m">Your connection dropped for a moment. Trying again.</p>' +
    '<button onclick="location.reload()">Try again now</button></div>' +
    '<script>var n=0;setInterval(function(){if(++n<=6)location.reload();else document.getElementById("m").textContent="Still cannot connect. Check your internet and tap Try again."},2500)</script></body></html>';
  return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

const STATIC_ASSETS = [
  'welcome.html', 'login.html', 'dashboard.html', 'profile.html', 'settings.html',
  'games.html', 'leaderboard.html', 'revision.html', 'achievements.html', 'boss-battle.html', 'badges.html',
  'progress.html', 'guide.html', 'advanced-games.html', 'advanced-ranks.html',
  'assets/css/pages/adv.css', 'assets/js/adv-games.js', 'assets/js/adv-ranks.js',
  'animations.html', 'anim-player.html', 'upgrade.html', 'fee.html',
  'assets/css/pages/upgrade.css', 'assets/js/upgrade.js',
  'assets/css/pages/requests.css', 'assets/js/requests.js',
  'assets/css/pages/anim.css', 'assets/js/anim-registry.js', 'assets/js/anim-hub.js', 'assets/js/anim-player.js',
  'assets/js/anim-expr.js', 'assets/js/anim-engine.js', 'assets/js/anim-shapes.js', 'assets/js/anim-ui.js',
  'assets/js/anim-controls.js', 'assets/js/anim-scenes.js', 'assets/css/pages/anim-scenes.css',
  'assets/css/pages/boss-battle.css', 'assets/js/boss-battle.js', 'assets/js/badges.js',
  'assets/css/pages/boss-steps.css', 'assets/css/pages/boss-badges.css', 'assets/js/katex-render.js',
  'assets/css/pages/boss-kpk-exam.css', 'assets/js/boss-kpk-exam.js',
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
  'assets/js/scope.js', 'assets/js/content-registry.js', 'assets/js/fee.js',
  'manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      Promise.all(STATIC_ASSETS.map((asset) =>
        cache.add(new Request(asset, { cache: 'reload' })).catch(() => {
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

  // Chapter content and animation specs: network-first so a corrected lesson
  // reaches students immediately; the cached copy is only the offline fallback.
  // Advanced games (Neon Racer / Auto Defense) are a module graph: every file must come from the SAME deploy,
  // so they are network-first too (cache-first would mix an old racer/scene.js with a new defense.js and break the game).
  const isAdvGame = url.pathname.includes('/games/advanced/') || /\/assets\/js\/adv-(games|ranks)\.js$/.test(url.pathname) ||
    url.pathname.endsWith('/assets/css/pages/adv.css') || /\/advanced-(games|ranks)\.html$/.test(url.pathname);
  const isChapterContent = isAdvGame || (url.pathname.includes('/games/classes/') || url.pathname.includes('/games/anim-data/')) &&
    (url.pathname.endsWith('.json') || url.pathname.endsWith('.html') ||
     url.pathname.endsWith('.css') || url.pathname.endsWith('.js'));

  if (isChapterContent) {
    event.respondWith(
      fetchRetry(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || offlineFallback(event.request)))
    );
    return;
  }

  // App shell (pages, styles, scripts, manifest): network-first so a deploy shows at once; the cache is only the offline fallback.
  // 'no-cache' = always revalidate with the server (a cheap 304 when nothing changed), ignoring GitHub's 10-minute max-age.
  const isAppFile = event.request.mode === 'navigate' || /\.(html|css|js|json)$/.test(url.pathname);
  if (isAppFile) {
    event.respondWith(
      fetchRetry(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || offlineFallback(event.request)))
    );
    return;
  }

  // Everything else (images, fonts): cache-first, refreshed in the background.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networked = fetch(event.request, { cache: 'no-cache' })
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
