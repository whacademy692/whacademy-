/**
 * notifications-center.js — W.H. Academy Student Notification Center
 * STEP 18B — 2026-09-25
 *
 * Uses the existing authenticated Supabase routes:
 *   notifications/list
 *   notifications/markRead
 *   notifications/markAllRead
 *
 * Security:
 * - renders backend text with textContent, never innerHTML;
 * - never reads Enrollments/adminNotes directly;
 * - backend decides which notifications this Student may see.
 */
(function notificationCenterBootstrap() {
  'use strict';

  if (window.WhaNotificationCenter) return;

  const POLL_MS = 30000;
  const TYPE_LABELS = {
    AccountStatus: 'Account',
    Broadcast: 'Announcement',
    BossResult: 'Boss Battle',
    Recheck: 'Rechecking',
    StreakReminder: 'Streak'
  };

  let state = {
    notifications: [],
    unreadCount: 0,
    loadedOnce: false,
    loading: false
  };
  let pollTimer = null;
  let panelOpen = false;
  let initialized = false;
  let initialSeenIds = new Set();

  let pushState = {
    supported: false,
    permission: (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'),
    subscribed: false,
    loading: false,
    loaded: false
  };

  const bellSvg =
    '<svg viewBox="0 0 24 24" stroke-width="2" aria-hidden="true">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M18 8a6 6 0 10-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/>' +
    '<path stroke-linecap="round" d="M10 21h4"/>' +
    '</svg>';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function formatTime(value) {
    const d = new Date(String(value || ''));
    if (Number.isNaN(d.getTime())) return '';
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(d);
    } catch (_) {
      return d.toLocaleString();
    }
  }

  function typeLabel(type) {
    return TYPE_LABELS[String(type || '')] || 'Notification';
  }

  function badgeText(count) {
    const n = Number(count) || 0;
    return n > 99 ? '99+' : String(n);
  }

  function updateBadges() {
    document.querySelectorAll('[data-wha-notification-count]').forEach((badge) => {
      const count = Number(state.unreadCount) || 0;
      badge.textContent = badgeText(count);
      badge.hidden = count <= 0;
      badge.setAttribute('aria-label', count + ' unread notification' + (count === 1 ? '' : 's'));
    });
  }

  function makeBellButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wha-dashboard-notification-bell';
    btn.setAttribute('data-wha-notification-trigger', '1');
    btn.setAttribute('aria-label', 'Open notifications');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.title = 'Notifications';
    btn.innerHTML =
      '<span class="wha-dashboard-notification-bell__icon">' + bellSvg + '</span>' +
      '<span class="wha-notification-count" data-wha-notification-count hidden>0</span>';
    btn.addEventListener('click', openPanel);
    return btn;
  }

  function ensureTriggers() {
    // Product decision (2026-09-25):
    // Student Notification Center is represented by ONE familiar bell in the
    // dashboard's top-right area. It must not appear as a sidebar navigation item.
    if (Router.currentPageName() !== 'dashboard.html') return;
    if (document.querySelector('[data-wha-notification-trigger]')) {
      updateBadges();
      return;
    }

    const host = el('div', 'wha-dashboard-notification-host');
    host.setAttribute('data-wha-notification-host', '1');
    host.appendChild(makeBellButton());

    // Insert inside the main dashboard surface when possible. The host itself is
    // fixed to the viewport, so this remains stable across current dashboard markup.
    const main = document.querySelector('main, .main-content, .dashboard, .content, body');
    (main || document.body).appendChild(host);

    updateBadges();
  }


  function pushSupported() {
    return 'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window &&
      window.isSecureContext;
  }

  function browserTimezoneContext() {
    let timezoneName = '';
    try {
      timezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch (_) {}

    return {
      timezoneName,
      timezoneOffsetMinutes: new Date().getTimezoneOffset()
    };
  }

  function base64UrlToUint8Array(value) {
    const padding = '='.repeat((4 - (value.length % 4)) % 4);
    const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
    return out;
  }

  function pushStatusText() {
    if (!pushState.supported) return 'Device alerts are not supported in this browser.';
    if (pushState.permission === 'denied') return 'Device alerts are blocked in browser settings.';
    if (pushState.subscribed) return 'Device alerts are on — W.H. Academy can notify you even when the app is closed.';
    if (pushState.permission === 'granted') return 'Permission is allowed. Turn on device alerts for this browser.';
    return 'Turn on device alerts to receive important reminders when the app is closed.';
  }

  function renderPushControl() {
    const card = document.getElementById('wha-push-control');
    const status = document.getElementById('wha-push-status');
    const button = document.getElementById('wha-push-toggle');
    if (!card || !status || !button) return;

    card.hidden = !pushState.supported && pushState.permission === 'unsupported';
    status.textContent = pushStatusText();
    button.disabled = pushState.loading || !pushState.supported || pushState.permission === 'denied';
    button.textContent = pushState.loading
      ? 'Please wait…'
      : (pushState.subscribed ? 'Turn off device alerts' : 'Enable device alerts');
  }

  async function readBrowserPushSubscription() {
    if (!pushSupported()) return null;
    const registration = await navigator.serviceWorker.ready;
    return registration.pushManager.getSubscription();
  }

  async function loadPushState() {
    pushState.supported = pushSupported();
    pushState.permission = pushState.supported ? Notification.permission : 'unsupported';
    if (!pushState.supported) {
      pushState.loaded = true;
      renderPushControl();
      return;
    }

    try {
      const localSub = await readBrowserPushSubscription();
      pushState.subscribed = !!localSub;

      // Re-sync the existing subscription silently on dashboard load.
      // This is idempotent and also refreshes timezone metadata needed by the
      // automatic reminder scheduler. No permission prompt occurs here.
      if (localSub && navigator.onLine) {
        await Api.request('push/publicConfig', {});
        await Api.request('push/subscribe', {
          subscription: localSub.toJSON(),
          userAgent: navigator.userAgent || '',
          platform: (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '',
          ...browserTimezoneContext()
        });
      }
    } catch (_) {
      // Push readiness must never break the in-app Notification Center.
    } finally {
      pushState.loaded = true;
      renderPushControl();
    }
  }

  async function enablePushFromUserGesture() {
    if (pushState.loading || !pushSupported()) return;
    pushState.loading = true;
    renderPushControl();

    try {
      const permission = await Notification.requestPermission();
      pushState.permission = permission;
      if (permission !== 'granted') {
        if (window.Notifications && typeof Notifications.toast === 'function') {
          Notifications.toast(
            permission === 'denied'
              ? 'Device notifications are blocked in your browser settings.'
              : 'Device notifications were not enabled.',
            permission === 'denied' ? 'error' : 'info'
          );
        }
        return;
      }

      const config = await Api.request('push/publicConfig', {});
      const publicKey = String((config && config.vapidPublicKey) || '');
      if (!publicKey) throw new Error('Push configuration is unavailable.');

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(publicKey)
        });
      }

      await Api.request('push/subscribe', {
        subscription: subscription.toJSON(),
        userAgent: navigator.userAgent || '',
        platform: (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '',
        ...browserTimezoneContext()
      });

      pushState.subscribed = true;
      if (window.Notifications && typeof Notifications.toast === 'function') {
        Notifications.toast('Device alerts are now enabled for this browser.', 'success');
      }
    } catch (err) {
      if (window.Notifications && typeof Notifications.toast === 'function') {
        Notifications.toast((err && err.message) || 'Could not enable device alerts.', 'error');
      }
    } finally {
      pushState.loading = false;
      renderPushControl();
    }
  }

  async function disablePushFromUserGesture() {
    if (pushState.loading || !pushSupported()) return;
    pushState.loading = true;
    renderPushControl();

    try {
      const subscription = await readBrowserPushSubscription();
      if (subscription) {
        try {
          await Api.request('push/unsubscribe', { endpoint: subscription.endpoint });
        } finally {
          await subscription.unsubscribe();
        }
      }

      pushState.subscribed = false;
      if (window.Notifications && typeof Notifications.toast === 'function') {
        Notifications.toast('Device alerts are off for this browser.', 'success');
      }
    } catch (err) {
      if (window.Notifications && typeof Notifications.toast === 'function') {
        Notifications.toast((err && err.message) || 'Could not turn off device alerts.', 'error');
      }
    } finally {
      pushState.loading = false;
      renderPushControl();
    }
  }

  async function togglePushFromUserGesture() {
    if (pushState.subscribed) await disablePushFromUserGesture();
    else await enablePushFromUserGesture();
  }

  function ensurePanel() {
    if (document.getElementById('wha-notification-backdrop')) return;

    const backdrop = el('div', 'wha-notification-backdrop');
    backdrop.id = 'wha-notification-backdrop';
    backdrop.hidden = true;
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) closePanel();
    });

    const panel = el('section', 'wha-notification-panel');
    panel.id = 'wha-notification-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'wha-notification-title');

    const header = el('div', 'wha-notification-panel__header');
    const headingWrap = el('div', 'wha-notification-panel__heading');
    const heading = el('h2', '', 'Notifications');
    heading.id = 'wha-notification-title';
    const subtitle = el('p', '', 'Updates from W.H. Academy');
    headingWrap.append(heading, subtitle);

    const closeBtn = el('button', 'wha-notification-close', '×');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close notifications');
    closeBtn.addEventListener('click', closePanel);

    header.append(headingWrap, closeBtn);

    const pushControl = el('div', 'wha-push-control');
    pushControl.id = 'wha-push-control';
    const pushCopy = el('div', 'wha-push-control__copy');
    pushCopy.append(
      el('strong', '', 'Device alerts'),
      el('p', '', '')
    );
    pushCopy.querySelector('p').id = 'wha-push-status';
    const pushToggle = el('button', 'wha-push-toggle', 'Enable device alerts');
    pushToggle.type = 'button';
    pushToggle.id = 'wha-push-toggle';
    pushToggle.addEventListener('click', togglePushFromUserGesture);
    pushControl.append(pushCopy, pushToggle);

    const toolbar = el('div', 'wha-notification-toolbar');
    const unreadText = el('span', 'wha-notification-toolbar__count', '');
    unreadText.id = 'wha-notification-unread-text';
    const markAll = el('button', 'wha-notification-mark-all', 'Mark all as read');
    markAll.type = 'button';
    markAll.id = 'wha-notification-mark-all';
    markAll.addEventListener('click', markAllRead);
    toolbar.append(unreadText, markAll);

    const body = el('div', 'wha-notification-list');
    body.id = 'wha-notification-list';
    body.setAttribute('aria-live', 'polite');

    panel.append(header, pushControl, toolbar, body);
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);
  }

  function render() {
    ensurePanel();
    updateBadges();
    renderPushControl();

    const list = document.getElementById('wha-notification-list');
    const unreadText = document.getElementById('wha-notification-unread-text');
    const markAll = document.getElementById('wha-notification-mark-all');
    if (!list || !unreadText || !markAll) return;

    const count = Number(state.unreadCount) || 0;
    unreadText.textContent = count
      ? count + ' unread'
      : 'You are all caught up';
    markAll.hidden = count <= 0;
    markAll.disabled = state.loading;

    list.replaceChildren();

    if (state.loading && !state.loadedOnce) {
      const loading = el('div', 'wha-notification-state');
      loading.append(
        el('div', 'wha-notification-state__icon', '…'),
        el('strong', '', 'Loading notifications'),
        el('p', '', 'Getting your latest updates.')
      );
      list.appendChild(loading);
      return;
    }

    if (!state.notifications.length) {
      const empty = el('div', 'wha-notification-state');
      empty.append(
        el('div', 'wha-notification-state__icon', '✓'),
        el('strong', '', 'No notifications yet'),
        el('p', '', 'Account updates, results, rechecking updates and announcements will appear here.')
      );
      list.appendChild(empty);
      return;
    }

    state.notifications.forEach((item) => {
      const card = el('article', 'wha-notification-item' + (item.isRead ? '' : ' is-unread'));
      card.dataset.notificationId = String(item.notificationId || '');

      const top = el('div', 'wha-notification-item__top');
      const type = el('span', 'wha-notification-type', typeLabel(item.notificationType));
      const time = el('time', 'wha-notification-time', formatTime(item.createdAt));
      if (item.createdAt) time.dateTime = String(item.createdAt);
      top.append(type, time);

      const titleRow = el('div', 'wha-notification-item__title-row');
      if (!item.isRead) {
        const dot = el('span', 'wha-notification-unread-dot');
        dot.setAttribute('aria-label', 'Unread');
        titleRow.appendChild(dot);
      }
      titleRow.appendChild(el('h3', 'wha-notification-item__title', item.title || 'W.H. Academy notification'));

      const message = el('p', 'wha-notification-item__message', item.message || '');

      card.append(top, titleRow, message);

      if (!item.isRead) {
        const footer = el('div', 'wha-notification-item__footer');
        const readBtn = el('button', 'wha-notification-read-btn', 'Mark as read');
        readBtn.type = 'button';
        readBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          markRead(item.notificationId);
        });
        footer.appendChild(readBtn);
        card.appendChild(footer);

        card.addEventListener('click', (event) => {
          if (event.target.closest('button')) return;
          markRead(item.notificationId);
        });
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', 'Mark notification as read: ' + (item.title || 'Notification'));
        card.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            markRead(item.notificationId);
          }
        });
      }

      list.appendChild(card);
    });
  }

  function normalizeListing(payload) {
    const list = Array.isArray(payload && payload.notifications) ? payload.notifications : [];
    return {
      notifications: list.map((item) => ({
        notificationId: String(item.notificationId || ''),
        notificationType: String(item.notificationType || ''),
        title: String(item.title || ''),
        message: String(item.message || ''),
        data: item.data && typeof item.data === 'object' ? item.data : {},
        createdAt: String(item.createdAt || ''),
        expiresAt: item.expiresAt || null,
        isRead: !!item.isRead,
        readAt: item.readAt || null
      })).filter((item) => item.notificationId),
      unreadCount: Math.max(0, Number(payload && payload.unreadCount) || 0)
    };
  }

  function maybeToastNewItems(nextList) {
    const currentIds = new Set(nextList.map((n) => n.notificationId));
    if (!state.loadedOnce) {
      initialSeenIds = currentIds;
      return;
    }

    const fresh = nextList.filter((n) => !n.isRead && !initialSeenIds.has(n.notificationId));
    fresh.slice(0, 2).forEach((item) => {
      if (window.Notifications && typeof Notifications.toast === 'function') {
        Notifications.toast((item.title ? item.title + ': ' : '') + item.message, 'info');
      }
    });
    initialSeenIds = currentIds;
  }

  async function refresh(options) {
    const opts = options || {};
    if (state.loading || !navigator.onLine) return;
    state.loading = true;
    if (panelOpen) render();

    try {
      const now = new Date();
      const localDate = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
      ].join('-');
      const payload = await Api.request('notifications/list', {
        localDate,
        timezoneOffsetMinutes: now.getTimezoneOffset()
      });
      const normalized = normalizeListing(payload);
      maybeToastNewItems(normalized.notifications);
      state.notifications = normalized.notifications;
      state.unreadCount = normalized.unreadCount;
      state.loadedOnce = true;
    } catch (err) {
      if (opts.userInitiated && window.Notifications && typeof Notifications.toast === 'function') {
        Notifications.toast((err && err.message) || 'Could not load notifications.', 'error');
      }
    } finally {
      state.loading = false;
      render();
    }
  }

  async function markRead(notificationId) {
    const id = String(notificationId || '');
    if (!id) return;
    const target = state.notifications.find((item) => item.notificationId === id);
    if (!target || target.isRead) return;

    target.isRead = true;
    target.readAt = new Date().toISOString();
    state.unreadCount = Math.max(0, state.unreadCount - 1);
    render();

    try {
      await Api.request('notifications/markRead', { notificationId: id });
    } catch (err) {
      target.isRead = false;
      target.readAt = null;
      state.unreadCount += 1;
      render();
      if (window.Notifications && typeof Notifications.toast === 'function') {
        Notifications.toast((err && err.message) || 'Could not mark this notification as read.', 'error');
      }
    }
  }

  async function markAllRead() {
    const unread = state.notifications.filter((item) => !item.isRead);
    if (!unread.length) return;

    unread.forEach((item) => {
      item.isRead = true;
      item.readAt = new Date().toISOString();
    });
    const previousCount = state.unreadCount;
    state.unreadCount = 0;
    render();

    try {
      await Api.request('notifications/markAllRead', {});
    } catch (err) {
      unread.forEach((item) => {
        item.isRead = false;
        item.readAt = null;
      });
      state.unreadCount = previousCount;
      render();
      if (window.Notifications && typeof Notifications.toast === 'function') {
        Notifications.toast((err && err.message) || 'Could not mark notifications as read.', 'error');
      }
    }
  }

  function openPanel() {
    ensurePanel();
    const backdrop = document.getElementById('wha-notification-backdrop');
    if (!backdrop) return;
    panelOpen = true;
    backdrop.hidden = false;
    requestAnimationFrame(() => backdrop.classList.add('is-open'));
    document.body.classList.add('wha-notification-open');
    render();
    refresh({ userInitiated: true });
    const closeBtn = backdrop.querySelector('.wha-notification-close');
    if (closeBtn) closeBtn.focus();
  }

  function closePanel() {
    const backdrop = document.getElementById('wha-notification-backdrop');
    if (!backdrop) return;
    panelOpen = false;
    backdrop.classList.remove('is-open');
    document.body.classList.remove('wha-notification-open');
    window.setTimeout(() => {
      if (!panelOpen) backdrop.hidden = true;
    }, 180);
    const trigger = document.querySelector('[data-wha-notification-trigger]');
    if (trigger) trigger.focus();
  }

  function startPolling() {
    if (pollTimer) window.clearInterval(pollTimer);
    pollTimer = window.setInterval(() => {
      if (!document.hidden && navigator.onLine) refresh();
    }, POLL_MS);

    window.addEventListener('focus', () => refresh());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refresh();
    });
    window.addEventListener('online', () => refresh());
  }

  function init() {
    if (initialized) return;
    initialized = true;

    ensureTriggers();
    ensurePanel();
    render();
    refresh();
    loadPushState();
    startPolling();

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && panelOpen) closePanel();
    });

    window.WhaNotificationCenter = {
      open: openPanel,
      close: closePanel,
      refresh: () => refresh({ userInitiated: true })
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
