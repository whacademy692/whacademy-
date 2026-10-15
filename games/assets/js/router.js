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

  /**
   * Adds the "Badges" item to the sidebar + bottom-nav on every page that has
   * the app shell, so the tab appears app-wide without editing each page's
   * markup. Idempotent — skips if the item is already present (e.g. badges.html
   * ships it hard-coded).
   */
  function injectBadgesNav() {
    const icon = '<svg viewBox="0 0 24 24" stroke-width="2"><circle cx="12" cy="8" r="5"/>' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M8.5 12.5L7 21l5-3 5 3-1.5-8.5"/></svg>';
    const sidebar = document.querySelector('.sidebar__nav');
    if (sidebar && !sidebar.querySelector('[data-nav-page="badges.html"]')) {
      const a = document.createElement('a');
      a.className = 'sidebar__item';
      a.href = 'badges.html';
      a.setAttribute('data-nav-page', 'badges.html');
      a.innerHTML = icon + ' Badges';
      const anchor = sidebar.querySelector('[data-nav-page="revision.html"]') ||
        sidebar.querySelector('[data-nav-page="profile.html"]');
      if (anchor) sidebar.insertBefore(a, anchor); else sidebar.appendChild(a);
    }
    const bottom = document.querySelector('.bottom-nav');
    if (bottom && !bottom.querySelector('[data-nav-page="badges.html"]')) {
      const b = document.createElement('a');
      b.className = 'bottom-nav__item';
      b.href = 'badges.html';
      b.setAttribute('data-nav-page', 'badges.html');
      b.innerHTML = icon + ' Badges';
      const anchorB = bottom.querySelector('[data-nav-page="profile.html"]');
      if (anchorB) bottom.insertBefore(b, anchorB); else bottom.appendChild(b);
    }
  }

  /**
   * Adds the "My Progress" item to the sidebar + bottom-nav on every page with
   * the app shell — same app-wide injection approach as Badges. Idempotent.
   */
  function injectProgressNav() {
    const icon = '<svg viewBox="0 0 24 24" stroke-width="2" fill="none">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M4 20V10M10 20V4M16 20v-6M20 20H3"/></svg>';
    const sidebar = document.querySelector('.sidebar__nav');
    if (sidebar && !sidebar.querySelector('[data-nav-page="progress.html"]')) {
      const a = document.createElement('a');
      a.className = 'sidebar__item';
      a.href = 'progress.html';
      a.setAttribute('data-nav-page', 'progress.html');
      a.innerHTML = icon + ' My Progress';
      const anchor = sidebar.querySelector('[data-nav-page="profile.html"]');
      if (anchor) sidebar.insertBefore(a, anchor); else sidebar.appendChild(a);
    }
    const bottom = document.querySelector('.bottom-nav');
    if (bottom && !bottom.querySelector('[data-nav-page="progress.html"]')) {
      const b = document.createElement('a');
      b.className = 'bottom-nav__item';
      b.href = 'progress.html';
      b.setAttribute('data-nav-page', 'progress.html');
      b.innerHTML = icon + ' Progress';
      const anchorB = bottom.querySelector('[data-nav-page="profile.html"]');
      if (anchorB) bottom.insertBefore(b, anchorB); else bottom.appendChild(b);
    }
  }

  /**
   * Adds the "Guide" (help) item to the sidebar + bottom-nav on every page —
   * same app-wide injection approach as Badges / My Progress. Idempotent.
   */
  function injectGuideNav() {
    const icon = '<svg viewBox="0 0 24 24" stroke-width="2" fill="none">' +
      '<circle cx="12" cy="12" r="9"/><path stroke-linecap="round" stroke-linejoin="round" d="M9.6 9a2.4 2.4 0 114.6 1c0 1.4-2.2 1.8-2.2 3.3M12 17h.01"/></svg>';
    const sidebar = document.querySelector('.sidebar__nav');
    if (sidebar && !sidebar.querySelector('[data-nav-page="guide.html"]')) {
      const a = document.createElement('a');
      a.className = 'sidebar__item';
      a.href = 'guide.html';
      a.setAttribute('data-nav-page', 'guide.html');
      a.innerHTML = icon + ' Guide';
      const anchor = sidebar.querySelector('[data-nav-page="profile.html"]');
      if (anchor) sidebar.insertBefore(a, anchor); else sidebar.appendChild(a);
    }
    const bottom = document.querySelector('.bottom-nav');
    if (bottom && !bottom.querySelector('[data-nav-page="guide.html"]')) {
      const b = document.createElement('a');
      b.className = 'bottom-nav__item';
      b.href = 'guide.html';
      b.setAttribute('data-nav-page', 'guide.html');
      b.innerHTML = icon + ' Guide';
      const anchorB = bottom.querySelector('[data-nav-page="profile.html"]');
      if (anchorB) bottom.insertBefore(b, anchorB); else bottom.appendChild(b);
    }
  }

  /**
   * Adds the "Animations" item (interactive subject animations) to the sidebar +
   * bottom-nav on every page with the app shell — same app-wide injection as
   * Badges / My Progress / Guide, placed right after "Chapters". Idempotent.
   * Which animations a student actually sees is decided by scope.js on the
   * Animations page itself, so the tab is safe to show to everyone.
   */
  function injectAnimationsNav() {
    const icon = '<svg viewBox="0 0 24 24" stroke-width="2" fill="none">' +
      '<circle cx="12" cy="12" r="9"/><path stroke-linecap="round" stroke-linejoin="round" d="M10 8.6l5.4 3.4-5.4 3.4V8.6z"/></svg>';
    const sidebar = document.querySelector('.sidebar__nav');
    if (sidebar && !sidebar.querySelector('[data-nav-page="animations.html"]')) {
      const a = document.createElement('a');
      a.className = 'sidebar__item';
      a.href = 'animations.html';
      a.setAttribute('data-nav-page', 'animations.html');
      a.innerHTML = icon + ' Animations';
      const after = sidebar.querySelector('[data-nav-page="games.html"]');
      if (after && after.nextSibling) sidebar.insertBefore(a, after.nextSibling);
      else sidebar.appendChild(a);
    }
    const bottom = document.querySelector('.bottom-nav');
    if (bottom && !bottom.querySelector('[data-nav-page="animations.html"]')) {
      const b = document.createElement('a');
      b.className = 'bottom-nav__item';
      b.href = 'animations.html';
      b.setAttribute('data-nav-page', 'animations.html');
      b.innerHTML = icon + ' Animate';
      const afterB = bottom.querySelector('[data-nav-page="games.html"]');
      if (afterB && afterB.nextSibling) bottom.insertBefore(b, afterB.nextSibling);
      else bottom.appendChild(b);
    }
  }

  /**
   * "Upgrade Plan" button. Sits at the very top of the sidebar (above Dashboard)
   * and as a small pill in the phone top bar, on every page that has the app
   * shell. Injected from here so no page's markup has to change, and its style is
   * injected too so it works on pages that do not load upgrade.css.
   * It stays hidden until the plan is known: a student with no plan on file keeps
   * full access and has nothing to upgrade. Max students see "Change Plan"
   * because the only thing left for them is a lower plan.
   */
  function ensureUpgradeStyle() {
    if (document.getElementById('wha-upg-style')) return;
    const st = document.createElement('style');
    st.id = 'wha-upg-style';
    st.textContent =
      '.wha-upg[hidden]{display:none!important}' +
      '.wha-upg{display:flex;align-items:center;justify-content:center;gap:8px;box-sizing:border-box;' +
        'text-decoration:none;font-weight:800;letter-spacing:.01em;white-space:nowrap;cursor:pointer;' +
        'color:#3b2300!important;text-shadow:none!important;' +
        'background:linear-gradient(135deg,#fde68a,#f59e0b 62%,#f97316);' +
        'border:1px solid rgba(255,255,255,.55);' +
        'box-shadow:0 6px 16px rgba(245,158,11,.35),inset 0 1px 0 rgba(255,255,255,.55);' +
        'transition:filter .15s ease,box-shadow .15s ease}' +
      '.wha-upg:hover{filter:brightness(1.06);box-shadow:0 8px 20px rgba(245,158,11,.5),inset 0 1px 0 rgba(255,255,255,.55)}' +
      '.wha-upg:focus-visible{outline:3px solid #fff;outline-offset:2px}' +
      '.wha-upg__icon{width:18px;height:18px;flex:0 0 18px;fill:none;stroke:currentColor;stroke-width:2.4}' +
      '.wha-upg--side{width:100%;min-height:49px;padding:10px 13px;border-radius:13px;font-size:1rem;margin-bottom:4px}' +
      '.wha-upg--pill{padding:7px 12px;border-radius:999px;font-size:.78rem;line-height:1}' +
      '.wha-upg--pill .wha-upg__icon{width:14px;height:14px;flex-basis:14px}' +
      '.wha-upg-strip{display:flex;justify-content:flex-end;padding:10px 16px 0}' +
      '.wha-upg-strip[hidden]{display:none!important}' +
      '@media(min-width:1024px){.wha-upg-strip{display:none!important}}' +
      '@media(max-width:400px){.wha-upg--pill{padding:6px 10px;font-size:.72rem}.wha-upg--pill .wha-upg__icon{display:none}}';
    document.head.appendChild(st);
  }

  function makeUpgradeLink(kind) {
    const a = document.createElement('a');
    a.className = 'wha-upg ' + kind;
    a.href = 'upgrade.html';
    a.hidden = true;
    a.setAttribute('data-upgrade-nav', '');
    a.innerHTML = '<svg class="wha-upg__icon" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M12 19V5M5 12l7-7 7 7"/></svg>' +
      '<span class="wha-upg__t"></span>';
    return a;
  }

  /** Shows / labels the button for a plan name ('' = unknown -> hidden). */
  function setUpgradePlan(plan) {
    const tier = (typeof Plan !== 'undefined' && Plan.normalize) ? Plan.normalize(plan) : String(plan || '');
    const known = tier === 'Basic' || tier === 'Plus' || tier === 'Max';
    const max = tier === 'Max';
    document.querySelectorAll('[data-upgrade-nav]').forEach((el) => {
      el.hidden = !known;
      const pill = el.classList.contains('wha-upg--pill');
      const t = el.querySelector('.wha-upg__t');
      if (t) t.textContent = max ? (pill ? 'Change plan' : 'Change Plan') : (pill ? 'Upgrade' : 'Upgrade Plan');
      if (el.parentElement && el.parentElement.classList.contains('wha-upg-strip')) el.parentElement.hidden = !known;
      el.setAttribute('aria-label', max ? 'Change your plan' : 'Upgrade your plan');
      el.setAttribute('title', known ? ('Your plan: ' + tier) : '');
    });
  }

  function injectUpgradeNav() {
    if (!Storage.getToken()) return;
    const side = document.querySelector('.sidebar__nav');
    const top = document.querySelector('.top-bar.hide-desktop');
    if (!side && !top) return;
    ensureUpgradeStyle();
    if (side && !side.querySelector('[data-upgrade-nav]')) {
      side.insertBefore(makeUpgradeLink('wha-upg--side'), side.firstChild);
    }
    if (top && !top.querySelector('[data-upgrade-nav]')) {
      const holder = top.querySelector('.top-bar__actions') || top;
      holder.insertBefore(makeUpgradeLink('wha-upg--pill'), holder.firstChild);
    } else if (!top && side && !document.querySelector('.wha-upg--pill')) {
      // A page with a sidebar but no phone top bar (e.g. Badges): give the pill a slim strip of its own.
      const main = document.querySelector('main');
      if (main) {
        const strip = document.createElement('div');
        strip.className = 'wha-upg-strip';
        strip.hidden = true;
        strip.appendChild(makeUpgradeLink('wha-upg--pill'));
        main.insertBefore(strip, main.firstChild);
      }
    }
    // Plan comes from the cached dashboard when it has one; otherwise it is fetched
    // once. The dashboard page reports its own fresh plan through setUpgradePlan,
    // so it never needs this extra lookup.
    const cached = Storage.getCachedDashboard();
    if (cached && cached.data && Object.prototype.hasOwnProperty.call(cached.data, 'plan')) {
      setUpgradePlan(cached.data.plan);
    } else if (currentPageName() !== 'dashboard.html' && typeof Plan !== 'undefined') {
      Plan.get().then(setUpgradePlan).catch(() => {});
    }
  }

  /** Marks the correct bottom-nav / sidebar item as aria-current. */
  function highlightActiveNav() {
    injectBadgesNav();
    injectProgressNav();
    injectGuideNav();
    injectAnimationsNav();
    injectUpgradeNav();
    const page = currentPageName();
    Utils.qsa('[data-nav-page]').forEach((el) => {
      if (el.dataset.navPage === page) {
        el.setAttribute('aria-current', 'page');
      } else {
        el.removeAttribute('aria-current');
      }
    });
    // The bottom bar scrolls sideways on phones: bring the current tab into view.
    const bn = document.querySelector('.bottom-nav');
    const cur = bn && bn.querySelector('[aria-current="page"]');
    if (bn && cur) bn.scrollLeft = Math.max(0, cur.offsetLeft - (bn.clientWidth - cur.offsetWidth) / 2);
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
    currentPageName, guardAuthenticatedPage, highlightActiveNav, setUpgradePlan,
    renderBreadcrumb, showStep, getQueryParam, goTo, logoutAndRedirect
  };
})();

/**
 * Plan — W.H. Academy (Basic / Plus / Max)
 * One place that decides which plan unlocks which feature in the student app.
 * It reads the student's plan from the dashboard/compose payload (data.plan),
 * using the cached dashboard when it already carries a plan and fetching once
 * when it does not (e.g. a cache saved before plan support existed).
 *
 * HOW TO CHANGE THE RULES: edit FEATURES below. Nothing else needs touching.
 * The lock card's main button opens upgrade.html, where the student sends an upgrade request.
 *
 * An unknown/empty plan (an old enrolment with no tier set, or a failed
 * lookup) keeps FULL access. This mirrors the backend, which only refuses an
 * explicit "Basic". This is a UI-level gate; the server stays the authority
 * (it already refuses Rechecking for Basic).
 */
const Plan = (() => {
  const RANK = { Basic: 1, Plus: 2, Max: 3 };
  const LEGACY = { Starter: 'Basic', Pro: 'Plus', Advanced: 'Max' };
  const WHATSAPP = 'https://wa.me/923295215703';

  // feature key -> lowest plan that includes it.
  const FEATURES = {
    animations:    { min: 'Max',  label: 'Animations' },
    rechecking:    { min: 'Plus', label: 'Rechecking' },
    pastPapers:    { min: 'Plus', label: 'Past Papers' },
    advancedGames: { min: 'Plus', label: 'Advanced games' }
  };

  let pending = null;

  function normalize(value) {
    const v = String(value == null ? '' : value).trim();
    return LEGACY[v] || v;
  }

  async function fetchPlan() {
    const cached = Storage.getCachedDashboard();
    if (cached && cached.data && Object.prototype.hasOwnProperty.call(cached.data, 'plan')) {
      return normalize(cached.data.plan);
    }
    try {
      const data = await Api.dashboard.compose();
      Storage.setCachedDashboard(data);
      return normalize(data && data.plan);
    } catch (e) {
      return '';
    }
  }

  /** Resolves to 'Basic' | 'Plus' | 'Max' | '' (unknown). Looked up once per page. */
  function get() {
    if (!pending) pending = fetchPlan();
    return pending;
  }

  /** Pure check: does this plan include the feature? Unknown plan = yes. */
  function allows(plan, feature) {
    const f = FEATURES[feature];
    const rank = RANK[normalize(plan)];
    if (!f || !rank) return true;
    return rank >= RANK[f.min];
  }

  async function can(feature) { return allows(await get(), feature); }

  /** Upgrade card (HTML string, static text only). opts: { title, message } */
  function lockHtml(feature, opts) {
    const f = FEATURES[feature] || { min: 'Plus', label: 'This feature' };
    const o = opts || {};
    const who = f.min === 'Max' ? 'the Max plan' : 'the Plus and Max plans';
    const title = Utils.escapeHtml(o.title || (f.label + ' is included in ' + who));
    const message = Utils.escapeHtml(o.message || 'Pick a higher plan and W.H. Academy opens it for you once the fee is confirmed.');
    const href = WHATSAPP + '?text=' + encodeURIComponent('Assalam o Alaikum, I would like to upgrade my plan to unlock ' + f.label + '.');
    return '<div class="card plan-lock" role="note" style="text-align:center;padding:1.75rem 1rem;">' +
      '<div aria-hidden="true" style="font-size:2rem;line-height:1;">🔒</div>' +
      '<h3 style="margin:.6rem 0 .3rem;">' + title + '</h3>' +
      '<p class="muted" style="margin:0 0 1rem;">' + message + '</p>' +
      '<a class="btn btn--primary btn--sm" href="upgrade.html">See upgrade options</a> ' +
      '<a class="btn btn--secondary btn--sm" href="' + href + '" target="_blank" rel="noopener">Ask on WhatsApp</a>' +
      '<p style="margin:.9rem 0 0;font-size:.85rem;"><button type="button" class="btn btn--quiet btn--sm" data-plan-refresh>Already upgraded? Refresh my plan</button></p>' +
    '</div>';
  }

  // "I already upgraded": drop the cached dashboard so the new plan is fetched fresh.
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('[data-plan-refresh]');
    if (!b) return;
    Storage.set('dashboard_cache', null);
    window.location.reload();
  });

  return { get, can, allows, lockHtml, normalize, FEATURES };
})();
