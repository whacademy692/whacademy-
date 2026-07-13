/**
 * notifications.js — W.H. Academy
 * Toast notification surface. Design System §9.13: aria-live, pausable
 * on hover/focus, never the sole carrier of critical information.
 */

const Notifications = (() => {

  const DEFAULT_DURATION_MS = 4000;
  let region = null;

  function ensureRegion() {
    if (region) return region;
    region = document.createElement('div');
    region.className = 'toast-region';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.appendChild(region);
    return region;
  }

  const ICONS = {
    success: '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" class="toast__icon"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>',
    error: '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" class="toast__icon"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" d="M12 8v5M12 16h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" class="toast__icon"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" d="M12 16v-4M12 8h.01"/></svg>'
  };

  /**
   * @param {string} message
   * @param {('success'|'error'|'info')} [type='info']
   * @param {number} [durationMs]
   */
  function toast(message, type = 'info', durationMs = DEFAULT_DURATION_MS) {
    const el = ensureRegion();
    const toastEl = document.createElement('div');
    toastEl.className = `toast toast--${type}`;
    toastEl.innerHTML = `${ICONS[type] || ICONS.info}<span class="toast__message"></span>`;
    toastEl.querySelector('.toast__message').textContent = message;

    el.appendChild(toastEl);

    let remaining = durationMs;
    let timer = null;
    let startedAt = Date.now();

    function startTimer() {
      startedAt = Date.now();
      timer = setTimeout(dismiss, remaining);
    }
    function pauseTimer() {
      clearTimeout(timer);
      remaining -= (Date.now() - startedAt);
    }
    function dismiss() {
      toastEl.dataset.leaving = 'true';
      toastEl.addEventListener('animationend', () => toastEl.remove(), { once: true });
    }

    toastEl.addEventListener('mouseenter', pauseTimer);
    toastEl.addEventListener('mouseleave', startTimer);
    toastEl.addEventListener('focusin', pauseTimer);
    toastEl.addEventListener('focusout', startTimer);

    startTimer();
    return { dismiss };
  }

  function success(message, durationMs) { return toast(message, 'success', durationMs); }
  function error(message, durationMs) { return toast(message, 'error', durationMs); }
  function info(message, durationMs) { return toast(message, 'info', durationMs); }

  /** Announces a message to assistive tech without a visible toast (for silent state changes). */
  function announce(message) {
    const liveEl = document.getElementById('aria-live-announcer') || (() => {
      const el = document.createElement('div');
      el.id = 'aria-live-announcer';
      el.className = 'sr-only';
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
      return el;
    })();
    liveEl.textContent = '';
    // Force a DOM reflow so repeated identical announcements still fire.
    void liveEl.offsetWidth;
    liveEl.textContent = message;
  }

  return { toast, success, error, info, announce };
})();
