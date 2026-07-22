/**
 * router.js — W.H. Academy
 * This is a multi-page app (each screen is its own HTML file, per the
 * Information Architecture's real-directory-per-screen URL structure).
 * router.js's job is narrower than a SPA router: route guards (auth
 * required / role required), active-nav-state, and small in-page
 * "screen" swapping for the login/registration/OTP flow, which lives on
 * one physical page (login.html) but has multiple logical steps.
 */

const Router = (() => {

  // admin.html is listed here because router.js's guard only knows about the
  // STUDENT session. An admin holds an admin_token and no session_token, so
  // the guard would bounce them to login.html, which is the wrong sign-in
  // screen entirely. admin.js does its own guard against the admin token and
  // shows its own sign-in step.
  const PUBLIC_PAGES = ['welcome.html', 'login.html', 'chapter.html', 'admin.html', ''];

  function currentPageName() {
    const path = window.location.pathname;
    return path.substring(path.lastIndexOf('/') + 1) || 'welcome.html';
  }

  /** Redirects to login if this is a protected page and no session token exists. */
  function guardAuthenticatedPage() {
    const page = currentPageName();
    if (PUBLIC_PAGES.includes(page)) return true;
    const token = Storage.getToken();
    if (!token) {
      window.location.href = `login.html?redirect=${encodeURIComponent(page)}`;
      return false;
    }
    return true;
  }

  /** Marks the correct bottom-nav / sidebar item as aria-current. */
  function highlightActiveNav() {
    const page = currentPageName();
    Utils.qsa('[data-nav-page]').forEach((el) => {
      if (el.dataset.navPage === page) {
        el.setAttribute('aria-current', 'page');
      } else {
        el.removeAttribute('aria-current');
      }
    });
  }

  /** Renders a breadcrumb trail from a simple {label, href}[] descriptor. */
  function renderBreadcrumb(containerEl, trail) {
    if (!containerEl) return;
    containerEl.innerHTML = '';
    containerEl.setAttribute('aria-label', 'Breadcrumb');
    trail.forEach((item, index) => {
      const isLast = index === trail.length - 1;
      if (index > 0) {
        const sep = Utils.createEl('span', { class: 'breadcrumb__sep', 'aria-hidden': 'true', text: '/' });
        containerEl.appendChild(sep);
      }
      if (isLast) {
        containerEl.appendChild(Utils.createEl('span', { class: 'breadcrumb__current', text: item.label, 'aria-current': 'page' }));
      } else {
        const cls = index === 0 ? 'breadcrumb__full' : 'breadcrumb__full';
        containerEl.appendChild(Utils.createEl('a', { class: cls, href: item.href, text: item.label }));
      }
    });
  }

  /**
   * Switches between logical "steps" on a single physical page (used by
   * login.html for Login / Forgot PIN / OTP / Registration screens).
   * Each step is a <section data-step="stepName"> element.
   */
  function showStep(stepName) {
    const sections = Utils.qsa('[data-step]');
    if (!sections.length) return false;

    // Fail visibly, not blankly. This used to hide EVERY section whenever the
    // name matched nothing (a typo, a stale link, ?step=xyz), leaving an empty
    // card with no heading, no form and no error — the page looked broken.
    // Now an unknown step is simply refused and whatever is on screen stays.
    const exists = sections.some((section) => section.dataset.step === stepName);
    if (!exists) {
      console.warn(`Router.showStep: no [data-step="${stepName}"] on this page — ignoring.`);
      return false;
    }

    sections.forEach((section) => {
      const isActive = section.dataset.step === stepName;
      section.hidden = !isActive;
      if (isActive) {
        const heading = section.querySelector('h1, h2');
        if (heading) {
          heading.setAttribute('tabindex', '-1');
          heading.focus();
        }
        Notifications.announce(`${stepName.replace(/-/g, ' ')} step`);
      }
    });
    return true;
  }

  function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function goTo(page) {
    window.location.href = page;
  }

  function logoutAndRedirect() {
    const token = Storage.getToken();
    Storage.clearToken();
    Storage.set('dashboard_cache', null);
    if (token) { Api.auth.logout(token).catch(() => {}); }
    window.location.href = 'login.html';
  }

  return {
    currentPageName, guardAuthenticatedPage, highlightActiveNav,
    renderBreadcrumb, showStep, getQueryParam, goTo, logoutAndRedirect
  };
})();
