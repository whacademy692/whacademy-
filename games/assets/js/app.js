/**
 * app.js — W.H. Academy
 * Bootstraps every page: applies stored settings (theme, text size),
 * enforces the auth guard, wires common chrome (nav, logout, offline
 * indicator), and registers the service worker for offline support.
 * Runs on every page via a single shared <script> include.
 */

(function bootstrap() {

  function applySettings() {
    const settings = Storage.getSettings();
    const root = document.documentElement;

    // Always write an explicit theme. Light is the default and the fallback —
    // we never leave this unset, because an unset theme previously allowed the
    // device's OS dark-mode preference to take over the whole platform.
    root.setAttribute('data-theme', settings.theme === 'dark' ? 'dark' : 'light');
    root.setAttribute('data-text-size', settings.textSize);
    if (settings.motionReduced) root.setAttribute('data-motion-reduced', 'true');
  }

  function wireCommonChrome() {
    const logoutBtn = Utils.qs('[data-action="logout"]');
    if (logoutBtn) logoutBtn.addEventListener('click', () => Router.logoutAndRedirect());

    const themeToggle = Utils.qs('[data-action="toggle-theme"]');
    if (themeToggle) {
      themeToggle.addEventListener('click', () => {
        const current = Storage.getSettings().theme;
        const next = current === 'dark' ? 'light' : 'dark';
        Storage.setSettings({ theme: next });
        applySettings();
      });
    }

    Router.highlightActiveNav();
  }

  function showOfflineIndicator() {
    let banner = Utils.qs('#offline-banner');
    if (!navigator.onLine) {
      if (!banner) {
        banner = Utils.createEl('div', {
          id: 'offline-banner',
          class: 'badge badge--warning',
          role: 'status',
          style: 'position:fixed;top:var(--space-3);left:50%;transform:translateX(-50%);z-index:1150;'
        }, 'You are offline — some features may be limited.');
        document.body.appendChild(banner);
      }
    } else if (banner) {
      banner.remove();
      Api.flushPendingQueue();
    }
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {
        // Offline support degrades gracefully if registration fails —
        // never blocks the app from working online.
      });
    }
  }

  function init() {
    applySettings();
    if (!Router.guardAuthenticatedPage()) return;
    wireCommonChrome();
    showOfflineIndicator();
    window.addEventListener('online', showOfflineIndicator);
    window.addEventListener('offline', showOfflineIndicator);
    registerServiceWorker();

    document.dispatchEvent(new CustomEvent('wha:ready'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
