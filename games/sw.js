/**
 * sw.js — W.H. Academy Service Worker
 *
 * Cache-first for static assets (engine/UI shell), network-first with
 * offline fallback for chapter content — Software Architecture §14's
 * differentiated caching strategy.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE CHANGED (v12)
 * ---------------------------------------------------------------------------
 * The previous version served the app shell CACHE-FIRST from a cache whose
 * name never changed:
 *
 *     const CACHE_VERSION = 'wha-v1';                       // never bumped
 *     caches.match(request).then((cached) => cached || fetch(request))
 *
 * `activate` deletes every 'wha-' cache EXCEPT the current one — but since the
 * name was constant, the old cache was always "the current one" and was never
 * cleared. Cache-first then meant a device that had loaded the site once would
 * keep running THAT COPY of api.js / auth.js / login.html forever. New files
 * shipped to GitHub Pages were downloaded by nobody. A hard refresh does not
 * help: the service worker intercepts the request before the network is
 * consulted at all.
 *
 * That is how the v12 Forgot-PIN release reached a browser with a NEW backend
 * and an OLD api.js: the old wrapper called otp/verify without a `purpose`, the
 * backend looked for a 'Registration' row, the row was 'PasswordReset', and the
 * student was told no code had ever been requested.
 *
 * Two changes fix it, and fix it for every future release too:
 *
 *   1. CACHE_VERSION is bumped. Bump it EVERY time you ship frontend files —
 *      that is what makes `activate` drop the stale cache. It is the one line
 *      in this project that must not be forgotten on a deploy.
 *
 *   2. The shell is now STALE-WHILE-REVALIDATE instead of cache-first: the
 *      cached copy is served immediately (so the app still opens instantly and
 *      still works offline), while a fresh copy is fetched in the background
 *      and written to the cache for next time. Worst case after a deploy is
 *      ONE stale load, not a permanently frozen app. Belt and braces alongside
 *      the version bump, so a forgotten bump degrades to a small delay rather
 *      than to a silent, unfixable-by-the-user breakage.
 */

// ⚠️  BUMP THIS on every frontend deploy. See the note above.
const CACHE_VERSION = 'wha-v12';
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
  'assets/js/notifications.js', 'assets/js/app.js',
  // These two were missing from the list, so the dashboard and Classes pages
  // could not resolve which chapters a student may see while offline.
  'assets/js/scope.js', 'assets/js/content-registry.js',
  'manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      // Cached one at a time rather than with cache.addAll(), which is atomic:
      // a single missing or renamed file would reject the whole install and
      // leave the site with NO service worker at all. A missing asset should
      // cost that one asset, nothing more.
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
      keys.filter((key) => key.startsWith('wha-') && key !== STATIC_CACHE).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return; // never cache API POST calls

  // Only ever handle same-origin requests. Anything else (fonts, the Apps
  // Script /exec endpoint, analytics) goes straight to the network untouched.
  if (url.origin !== self.location.origin) return;

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

  // Stale-while-revalidate for the app shell: answer instantly from cache,
  // refresh the cache from the network in the background. See the header note
  // — this is what stops a shipped fix from being invisible to a device that
  // has visited before.
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
        .catch(() => cached); // offline: whatever we already have

      return cached || networked;
    })
  );
});
