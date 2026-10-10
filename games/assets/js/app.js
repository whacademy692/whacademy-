/**
 * app.js — W.H. Academy
 * Bootstraps every page: applies stored settings (theme, text size),
 * enforces the auth guard, wires common chrome (nav, logout, offline
 * indicator), and registers the service worker for offline support.
 * Runs on every page via a single shared <script> include.
 */
(function bootstrap() {
  var VALID_THEMES = ['light', 'dark', 'ocean', 'forest', 'sunset',
                      'grape', 'rose', 'candy', 'aurora', 'gold', 'midnight'];

  // Account-status enforcement:
  // v9.1 re-checks the student's enrollment on every protected backend request.
  // This lightweight heartbeat makes the same rule take effect even when the
  // student is sitting idle on a dashboard page and is not currently making
  // another API request.
  const SESSION_HEARTBEAT_MS = 10000;
  let sessionCheckInFlight = false;
  let sessionRedirecting = false;
  let sessionHeartbeatTimer = null;

  function applySettings(options) {
    const settings = Storage.getSettings();
    const root = document.documentElement;
    const theme = VALID_THEMES.indexOf(settings.theme) >= 0 ? settings.theme : 'light';
    const instant = !options || options.instant !== false;

    if (instant) root.classList.add('wha-theme-switching');
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-text-size', settings.textSize || 'default');

    if (instant) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => root.classList.remove('wha-theme-switching'));
      });
    }
  }

  // Apply saved theme immediately when app.js executes so page navigation does
  // not briefly paint the default/previous theme before normal bootstrap.
  applySettings({ instant: true });

  function supportNavMarkup() {
    return '<svg viewBox="0 0 24 24" stroke-width="2" aria-hidden="true">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M4 5.5A2.5 2.5 0 016.5 3h11A2.5 2.5 0 0120 5.5v8a2.5 2.5 0 01-2.5 2.5H11l-4.5 4v-4A2.5 2.5 0 014 13.5v-8z"/>' +
      '<path stroke-linecap="round" d="M8 8h8M8 11.5h5"/>' +
      '</svg><span>Support &amp; Rechecking</span>';
  }

  function ensureSupportNav() {
    const nav = Utils.qs('.sidebar__nav');
    if (!nav) return;
    let link = nav.querySelector('a[href$="rechecking.html"], a[data-nav-page="rechecking.html"]');
    if (!link) {
      link = document.createElement('a');
      link.className = 'sidebar__item';
      link.href = 'rechecking.html';
      link.setAttribute('data-nav-page', 'rechecking.html');
      link.innerHTML = supportNavMarkup();
      const profileLink = nav.querySelector('a[href$="profile.html"], a[data-nav-page="profile.html"]');
      if (profileLink) nav.insertBefore(link, profileLink);
      else nav.appendChild(link);
    } else {
      link.classList.add('sidebar__item');
      link.setAttribute('data-nav-page', 'rechecking.html');
      link.innerHTML = supportNavMarkup();
    }
  }

  function wireCommonChrome() {
    const logoutBtn = Utils.qs('[data-action="logout"]');
    if (logoutBtn) logoutBtn.addEventListener('click', () => Router.logoutAndRedirect());
    const themeToggle = Utils.qs('[data-action="toggle-theme"]');
    if (themeToggle) {
      themeToggle.addEventListener('click', () => {
        const current = Storage.getSettings().theme;
        const currentIndex = VALID_THEMES.indexOf(current);
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % VALID_THEMES.length : 0;
        const next = VALID_THEMES[nextIndex];
        Storage.setSettings({ theme: next });
        applySettings({ instant: true });
        document.querySelectorAll('[data-action="toggle-theme"]').forEach((button) => {
          button.setAttribute('title', 'Theme: ' + next);
          button.setAttribute('aria-label', 'Current theme ' + next + '. Switch to next theme');
        });
      });
    }
    ensureSupportNav();
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
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  function isProtectedStudentPage() {
    const page = Router.currentPageName();
    return !['welcome.html', 'login.html', 'chapter.html', 'admin.html', ''].includes(page);
  }

  function saveAccountStatusNotice(result) {
    const message = String(
      (result && result.errorMessage) ||
      'Your W.H. Academy account is not currently active. Please contact W.H. Academy if you need help.'
    );
    Storage.set('auth_notice', {
      kind: 'account-status',
      message,
      accountStatus: String((result && result.accountStatus) || ''),
      studentVisibleReason: String((result && result.studentVisibleReason) || ''),
      statusChangedAt: String((result && result.statusChangedAt) || ''),
      savedAt: Date.now()
    });
  }

  async function endStudentSession(result) {
    if (sessionRedirecting) return;
    sessionRedirecting = true;

    const code = String((result && result.errorCode) || '');
    const isAccountStatus = code === 'AUTH_002';

    if (isAccountStatus) saveAccountStatusNotice(result);

    const token = Storage.getToken();
    if (token) {
      // Best effort: revoke this browser's current JWT as well as clearing it
      // locally. If the network drops, v9.1 still blocks the token server-side
      // while the account is inactive.
      try { await Api.auth.logout(token); } catch (e) {}
    }

    Storage.clearToken();
    Storage.set('dashboard_cache', null);

    const reason = isAccountStatus ? 'account-status' : 'expired';
    window.location.replace('login.html?reason=' + encodeURIComponent(reason));
  }

  async function verifyStudentSessionNow() {
    if (sessionRedirecting || sessionCheckInFlight) return;
    if (!isProtectedStudentPage() || !Storage.getToken() || !navigator.onLine) return;

    sessionCheckInFlight = true;
    try {
      const result = await Api.request('auth/verifySession', {});
      if (result && result.isValid === false) {
        await endStudentSession(result);
      }
    } catch (err) {
      // auth/verifySession currently returns invalid-session details as data,
      // but handle auth errors too so this remains safe if the backend envelope
      // is tightened later.
      const code = String((err && err.code) || '');
      if (['AUTH_002', 'AUTH_003', 'AUTH_004'].includes(code)) {
        await endStudentSession({
          errorCode: code,
          errorMessage: (err && err.message) || ''
        });
      }
      // Network errors deliberately do NOT log the student out. The backend
      // remains authoritative as soon as connectivity returns.
    } finally {
      sessionCheckInFlight = false;
    }
  }

  function startStudentSessionHeartbeat() {
    if (!isProtectedStudentPage() || !Storage.getToken()) return;

    verifyStudentSessionNow();

    sessionHeartbeatTimer = window.setInterval(
      verifyStudentSessionNow,
      SESSION_HEARTBEAT_MS
    );

    window.addEventListener('focus', verifyStudentSessionNow);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) verifyStudentSessionNow();
    });
    window.addEventListener('online', verifyStudentSessionNow);

    window.addEventListener('beforeunload', () => {
      if (sessionHeartbeatTimer) window.clearInterval(sessionHeartbeatTimer);
    }, { once: true });
  }


  function loadNotificationCenterAssets() {
    if (!isProtectedStudentPage() || !Storage.getToken() || Router.currentPageName() !== 'dashboard.html') return;

    if (!document.querySelector('link[data-wha-notification-center]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'assets/css/notifications-center.css?v=20260925';
      link.setAttribute('data-wha-notification-center', '1');
      document.head.appendChild(link);
    }

    if (!document.querySelector('script[data-wha-notification-center]')) {
      const script = document.createElement('script');
      script.src = 'assets/js/notifications-center.js?v=20260925';
      script.async = true;
      script.setAttribute('data-wha-notification-center', '1');
      document.head.appendChild(script);
    }
  }

  function showStoredAuthNotice() {
    if (Router.currentPageName() !== 'login.html') return;
    if (Router.getQueryParam('reason') !== 'account-status') return;

    const notice = Storage.get('auth_notice', null);
    Storage.remove('auth_notice');

    if (notice && notice.message && window.Notifications) {
      Notifications.error(notice.message);
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

    // On login.html this consumes the one-time safe account-status message.
    // On authenticated pages this starts immediate status/session enforcement.
    showStoredAuthNotice();
    startStudentSessionHeartbeat();
    loadNotificationCenterAssets();

    document.dispatchEvent(new CustomEvent('wha:ready'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
