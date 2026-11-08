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
    // Phone: Badges lives in the hamburger drawer (built in buildMobileShell), not the bottom bar.
  }

  /** Adds the "Fee" item to the desktop sidebar (phone: in the drawer). Idempotent. */
  function injectFeeNav() {
    const icon = '<svg viewBox="0 0 24 24" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/>' +
      '<path stroke-linecap="round" d="M3 10h18M7 15h4"/></svg>';
    const sidebar = document.querySelector('.sidebar__nav');
    if (sidebar && !sidebar.querySelector('[data-nav-page="fee.html"]')) {
      const a = document.createElement('a');
      a.className = 'sidebar__item';
      a.href = 'fee.html';
      a.setAttribute('data-nav-page', 'fee.html');
      a.innerHTML = icon + ' Fee';
      const anchor = sidebar.querySelector('[data-nav-page="profile.html"]');
      if (anchor) sidebar.insertBefore(a, anchor); else sidebar.appendChild(a);
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
    // Phone: Progress is one of the three fixed bottom-bar tabs (built in buildMobileShell).
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
    // Phone: Guide lives in the hamburger drawer (built in buildMobileShell).
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
    // Phone: Animate lives in the hamburger drawer (built in buildMobileShell).
  }


  /**
   * Adds the Max-only "Advanced Games" and "Advanced Ranks" items. They are a SEPARATE
   * pair from the normal "Ranks" tab (leaderboard.html = XP of the basic games, all plans):
   * Advanced Ranks is the Game-Rank ladder of Neon Racer / Auto Defense and never mixes with XP.
   * Shown only when the plan is Max (an unknown plan keeps the app's usual "full access" rule;
   * the server is the real gate). Idempotent. Phone: items go in the hamburger drawer.
   */
  const ADV_NAV = [
    { page: 'advanced-games.html', label: 'Advanced Games', feature: 'advGames',
      icon: '<path stroke-linecap="round" stroke-linejoin="round" d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>' },
    { page: 'advanced-ranks.html', label: 'Advanced Ranks', feature: 'advRanks',
      icon: '<path stroke-linecap="round" stroke-linejoin="round" d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 11H5L3 7zM5 21h14"/>' }
  ];
  /** Sidebar icons are CSS masks keyed by href suffix; "advanced-games.html" would wrongly match the Chapters (games.html) rule, so give both new items their own icons. */
  function ensureAdvNavStyle() {
    if (document.getElementById('wha-adv-nav-style')) return;
    const mask = (d) => 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\'%3E%3Cpath fill=\'black\' d=\'' + d + '\'/%3E%3C/svg%3E")';
    const bolt = mask('M13.5 2 4 13.5h6.5L9.5 22 20 9.5h-6.8L13.5 2Z');
    const star = mask('M3 6.5 7.6 10 12 3.5 16.4 10 21 6.5 19.2 18H4.8L3 6.5ZM5 20h14v2H5v-2Z');   // crown (kept the old name)
    const rule = (page, img) => '.sidebar .sidebar__item[data-nav-page="' + page + '"]::before{-webkit-mask-image:' + img + ';mask-image:' + img + '}';
    const st = document.createElement('style');
    st.id = 'wha-adv-nav-style';
    st.textContent = rule('advanced-games.html', bolt) + rule('advanced-ranks.html', star);
    document.head.appendChild(st);
  }
  function addAdvNavItems() {
    try { ensureAdvNavStyle(); } catch (e) { /* icons only */ }
    const page = currentPageName();
    const place = (container, make, anchorSel, fallbackSel) => {
      if (!container) return;
      let last = null;   // keep Games before Ranks: each new item goes right after the previous one
      ADV_NAV.forEach((it) => {
        const have = container.querySelector('[data-nav-page="' + it.page + '"]');
        if (have) { last = have; return; }
        try {
          const a = make(it);
          if (it.page === page) a.setAttribute('aria-current', 'page');
          // Insert after "Ranks" (or before Profile); fall back to appending. Never throw: a failed
          // placement must not make the tabs vanish.
          const anchor = last || container.querySelector(anchorSel);
          const ref = anchor && anchor.parentNode === container ? anchor.nextSibling : container.querySelector(fallbackSel);
          if (ref && ref.parentNode === container) container.insertBefore(a, ref); else container.appendChild(a);
          last = a;
        } catch (e) {
          try { container.appendChild(make(it)); } catch (e2) { console.warn('adv nav', e2); }
        }
      });
    };
    place(document.querySelector('.sidebar__nav'), (it) => {
      const a = document.createElement('a');
      a.className = 'sidebar__item';
      a.href = it.page;
      a.setAttribute('data-nav-page', it.page);
      a.innerHTML = navSvg(it.icon) + ' ' + it.label;
      return a;
    }, '[data-nav-page="leaderboard.html"]', '[data-nav-page="profile.html"]');
    place(document.querySelector('.wha-drawer__panel'), (it) => {
      const tpl = document.createElement('div');
      tpl.innerHTML = drawerLink(it.page, it.label, it.icon);
      return tpl.firstChild;
    }, '[data-nav-page="leaderboard.html"]', '.wha-drawer__sep');
  }
  function removeAdvNavItems() {
    ADV_NAV.forEach((it) => document.querySelectorAll('[data-nav-page="' + it.page + '"]').forEach((el) => el.remove()));
  }

  // The tabs must never blink out. We remember "this student has the Max plan" and keep the tabs
  // on EVERY page: drawn immediately from the remembered flag, re-checked against the live plan,
  // and re-added if some other script rebuilds the menus later.
  let advNavOn = false;
  let advNavTimer = null;
  function setAdvNav(on) {
    advNavOn = !!on;
    try { Storage.set('adv_tabs', advNavOn); } catch (e) { /* ignore */ }
    if (advNavOn) addAdvNavItems(); else removeAdvNavItems();
  }
  function injectAdvNav() {
    if (!Storage.getToken() || typeof Plan === 'undefined') return;
    let remembered = false;
    try { remembered = Storage.get('adv_tabs', false) === true; } catch (e) { /* ignore */ }
    if (remembered) setAdvNav(true);                       // instant, no flicker
    const decide = (plan) => setAdvNav(Plan.allows(plan, 'advGames'));
    const cached = Storage.getCachedDashboard();
    if (cached && cached.data && Object.prototype.hasOwnProperty.call(cached.data, 'plan')) decide(cached.data.plan);
    else if (currentPageName() !== 'dashboard.html') Plan.get().then(decide).catch(() => {});
    advNavPlanHook = decide;                               // dashboard page reports its fresh plan via setUpgradePlan
    if (typeof MutationObserver === 'function' && !advNavObserver) {
      advNavObserver = new MutationObserver(() => {
        if (!advNavOn || advNavTimer) return;
        advNavTimer = setTimeout(() => { advNavTimer = null; if (advNavOn) addAdvNavItems(); }, 60);
      });
      const watch = () => {
        ['.sidebar__nav', '.wha-drawer__panel'].forEach((sel) => {
          const el = document.querySelector(sel);
          if (el && !el.dataset.advWatched) { el.dataset.advWatched = '1'; advNavObserver.observe(el, { childList: true }); }
        });
      };
      watch(); setTimeout(watch, 500); setTimeout(watch, 2000);
    }
    window.addEventListener('pageshow', () => { if (advNavOn) addAdvNavItems(); });
  }
  let advNavObserver = null;
  let advNavPlanHook = null;

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
      '@media(max-width:400px){.wha-upg--pill{padding:6px 10px;font-size:.72rem}.wha-upg--pill .wha-upg__icon{display:none}}' +
      // Basic/Plus: keep the bright gold AND run a moving gradient along the border to pull the eye.
      '.wha-upg--promo{position:relative;isolation:isolate}' +
      '.wha-upg--promo::after{content:"";position:absolute;inset:-2px;border-radius:inherit;z-index:-1;' +
        'background:linear-gradient(90deg,#fbbf24,#ffffff,#f97316,#fde68a,#fbbf24);background-size:300% 100%;' +
        'animation:wha-upg-slide 2.6s linear infinite;filter:saturate(1.1)}' +
      '.wha-upg--promo.wha-upg--pill::after{inset:-2px}' +
      '@keyframes wha-upg-slide{to{background-position:300% 0}}' +
      // Max: nothing left to push, so a calm, light style (no animation, no shout).
      '.wha-upg--max{background:linear-gradient(135deg,#eef2ff,#e0e7ff)!important;color:#3730a3!important;' +
        'border:1px solid rgba(79,70,229,.22)!important;box-shadow:0 2px 8px rgba(79,70,229,.14),inset 0 1px 0 rgba(255,255,255,.6)!important}' +
      '.wha-upg--max:hover{filter:brightness(1.02);box-shadow:0 3px 10px rgba(79,70,229,.2)!important}' +
      '@media(prefers-reduced-motion:reduce){.wha-upg--promo::after{animation:none}}';
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
    if (typeof advNavPlanHook === 'function') { try { advNavPlanHook(plan); } catch (e) {} }
    const tier = (typeof Plan !== 'undefined' && Plan.normalize) ? Plan.normalize(plan) : String(plan || '');
    const known = tier === 'Basic' || tier === 'Plus' || tier === 'Max';
    const max = tier === 'Max';
    document.querySelectorAll('[data-upgrade-nav]').forEach((el) => {
      el.hidden = !known;
      const pill = el.classList.contains('wha-upg--pill');
      el.classList.toggle('wha-upg--max', max);                 // calm, light for Max
      el.classList.toggle('wha-upg--promo', known && !max);     // bright + moving border for Basic/Plus
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
    // Phone: Change/Upgrade Plan now lives inside the hamburger drawer (built in
    // buildMobileShell) instead of a pill crowding the top bar. setUpgradePlan()
    // below shows/labels every [data-upgrade-nav] element, the drawer item included.
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

  /* =====================================================================
     Mobile app shell (phones) — built app-wide so every page is identical.
     Bottom bar = three fixed tabs (Classes · Home(center) · Progress).
     Everything else (Animate, Boss, Revision, Ranks, Badges, Support,
     Guide, Profile, Change Plan, Theme, Log out) lives in a hamburger
     drawer opened from a fixed button in the top-right corner.
     This replaces the old 10-tab sideways-scrolling bar.
     ===================================================================== */
  const NAV_SVG = {
    home: '<path stroke-linecap="round" stroke-linejoin="round" d="M3 12l9-9 9 9M5 10v10h14V10"/>',
    classes: '<rect x="3" y="4" width="18" height="16" rx="2"/><path stroke-linecap="round" d="M7 9h4M7 13h7"/>',
    progress: '<path stroke-linecap="round" stroke-linejoin="round" d="M4 20V10M10 20V4M16 20v-6M20 20H3"/>',
    animate: '<circle cx="12" cy="12" r="9"/><path stroke-linecap="round" stroke-linejoin="round" d="M10 8.6l5.4 3.4-5.4 3.4V8.6z"/>',
    boss: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/><path stroke-linecap="round" stroke-linejoin="round" d="M9.5 12l1.8 1.8L15 9.8"/>',
    revision: '<path stroke-linecap="round" stroke-linejoin="round" d="M4 4v16l4-4h12V4H4z"/>',
    ranks: '<path stroke-linecap="round" stroke-linejoin="round" d="M8 21h8M12 17v4M6 3h12v6a6 6 0 01-12 0V3z"/>',
    badges: '<circle cx="12" cy="8" r="5"/><path stroke-linecap="round" stroke-linejoin="round" d="M8.5 12.5L7 21l5-3 5 3-1.5-8.5"/>',
    support: '<path stroke-linecap="round" stroke-linejoin="round" d="M4 5.5A2.5 2.5 0 016.5 3h11A2.5 2.5 0 0120 5.5v8a2.5 2.5 0 01-2.5 2.5H11l-4.5 4v-4A2.5 2.5 0 014 13.5v-8z"/><path stroke-linecap="round" d="M8 8h8M8 11.5h5"/>',
    guide: '<circle cx="12" cy="12" r="9"/><path stroke-linecap="round" stroke-linejoin="round" d="M15.8 8.2l-2.2 5.4-5.4 2.2 2.2-5.4 5.4-2.2z"/>',
    settings: '<circle cx="12" cy="12" r="3.2"/><path stroke-linecap="round" stroke-linejoin="round" d="M19.4 13.5a7.6 7.6 0 000-3l2-1.6-2-3.4-2.4 1a7.3 7.3 0 00-2.6-1.5L14 2.4h-4l-.4 2.6A7.3 7.3 0 007 6.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 000 3l-2 1.6 2 3.4 2.4-1a7.3 7.3 0 002.6 1.5l.4 2.6h4l.4-2.6a7.3 7.3 0 002.6-1.5l2.4 1 2-3.4-2-1.6z"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path stroke-linecap="round" d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    fee: '<rect x="3" y="5" width="18" height="14" rx="2"/><path stroke-linecap="round" d="M3 10h18M7 15h4"/>',
    theme: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 3a9 9 0 100 18h1.4a1.9 1.9 0 001.6-3 1.9 1.9 0 011.5-3H19a3 3 0 003-3c0-4.5-5-8-11-5.6"/><circle cx="7.5" cy="11" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="7.8" r="1.1" fill="currentColor" stroke="none"/><circle cx="16.3" cy="11" r="1.1" fill="currentColor" stroke="none"/>',
    logout: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>',
    upgrade: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 19V5M5 12l7-7 7 7"/>',
    menu: '<path stroke-linecap="round" d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6L6 18"/>'
  };
  function navSvg(d) { return '<svg viewBox="0 0 24 24" stroke-width="2" fill="none" aria-hidden="true">' + d + '</svg>'; }
  function navTab(href, label, icon) {
    return '<a class="bottom-nav__item" href="' + href + '" data-nav-page="' + href + '">' + navSvg(icon) + label + '</a>';
  }
  function drawerLink(href, label, icon) {
    return '<a class="wha-drawer__item" href="' + href + '" data-nav-page="' + href + '">' + navSvg(icon) + label + '</a>';
  }
  function openDrawer() {
    const d = document.querySelector('.wha-drawer');
    if (d) { d.classList.add('is-open'); document.body.classList.add('wha-drawer-open'); }
  }
  function closeDrawer() {
    const d = document.querySelector('.wha-drawer');
    if (d) { d.classList.remove('is-open'); document.body.classList.remove('wha-drawer-open'); }
  }
  function updateThemeLabel() {
    try {
      const t = (typeof Storage !== 'undefined' && Storage.getSettings) ? (Storage.getSettings().theme || 'light') : 'light';
      document.querySelectorAll('[data-theme-label]').forEach((el) => { el.textContent = t; });
    } catch (e) {}
  }

  function buildMobileShell() {
    const page = currentPageName();
    if (PUBLIC_PAGES.includes(page)) return;
    if (!document.querySelector('.bottom-nav, .sidebar__nav')) return;

    // 1. Bottom bar — rebuilt to exactly three tabs so every page matches.
    let bn = document.querySelector('.bottom-nav');
    if (!bn) {
      bn = document.createElement('nav');
      bn.className = 'bottom-nav';
      bn.setAttribute('aria-label', 'Primary');
      document.body.appendChild(bn);
    }
    if (!bn.dataset.whaRebuilt) {
      bn.innerHTML =
        navTab('games.html', 'Classes', NAV_SVG.classes) +
        '<a class="bottom-nav__item bottom-nav__item--home" href="dashboard.html" data-nav-page="dashboard.html">' +
          '<span class="wha-navcircle">' + navSvg(NAV_SVG.home) + '</span>Home</a>' +
        navTab('progress.html', 'Progress', NAV_SVG.progress);
      bn.dataset.whaRebuilt = '1';
    }

    // 2. Hamburger button (fixed top-right).
    if (!document.querySelector('.wha-burger')) {
      const burger = document.createElement('button');
      burger.type = 'button';
      burger.className = 'wha-burger';
      burger.setAttribute('aria-label', 'Open menu');
      burger.setAttribute('aria-haspopup', 'dialog');
      burger.innerHTML = navSvg(NAV_SVG.menu);
      document.body.appendChild(burger);
      burger.addEventListener('click', openDrawer);
    }

    // 3. Hamburger drawer — everything else.
    if (!document.querySelector('.wha-drawer')) {
      const items = [
        drawerLink('animations.html', 'Animate', NAV_SVG.animate),
        drawerLink('boss-battle.html', 'Boss Battle', NAV_SVG.boss),
        drawerLink('revision.html', 'Revision', NAV_SVG.revision),
        drawerLink('leaderboard.html', 'Ranks', NAV_SVG.ranks),
        drawerLink('badges.html', 'Badges', NAV_SVG.badges),
        drawerLink('rechecking.html', 'Support &amp; Rechecking', NAV_SVG.support),
        drawerLink('guide.html', 'Guide', NAV_SVG.guide),
        drawerLink('fee.html', 'Fee', NAV_SVG.fee),
        drawerLink('profile.html', 'Profile', NAV_SVG.profile),
        drawerLink('settings.html', 'Settings', NAV_SVG.settings),
        '<div class="wha-drawer__sep"></div>',
        '<a class="wha-drawer__item" href="upgrade.html" data-upgrade-nav hidden>' + navSvg(NAV_SVG.upgrade) + '<span class="wha-upg__t">Upgrade Plan</span></a>',
        '<button type="button" class="wha-drawer__item" data-action="toggle-theme">' + navSvg(NAV_SVG.theme) + 'Theme<span class="wha-drawer__sub" data-theme-label></span></button>',
        '<button type="button" class="wha-drawer__item wha-drawer__item--danger" data-action="logout">' + navSvg(NAV_SVG.logout) + 'Log out</button>'
      ].join('');
      const drawer = document.createElement('div');
      drawer.className = 'wha-drawer';
      drawer.innerHTML =
        '<div class="wha-drawer__backdrop" data-drawer-close></div>' +
        '<aside class="wha-drawer__panel" role="dialog" aria-label="Menu" aria-modal="true">' +
          '<div class="wha-drawer__head"><span class="wha-drawer__title">Study Hub</span>' +
          '<button type="button" class="wha-drawer__close" data-drawer-close aria-label="Close menu">' + navSvg(NAV_SVG.close) + '</button></div>' +
          items +
        '</aside>';
      document.body.appendChild(drawer);
      drawer.addEventListener('click', (e) => { if (e.target.closest('[data-drawer-close]')) closeDrawer(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
    }

    updateThemeLabel();
  }

  /**
   * Settings · Theme · Log out are pinned at the bottom of the desktop sidebar on EVERY page.
   * Pages used to ship different footers (some had no Settings, some no Theme), so this makes them
   * all the same without editing each page. Idempotent.
   */
  function injectSidebarFooter() {
    const side = document.querySelector('.sidebar');
    if (!side) return;
    let foot = side.querySelector(':scope > div[style*="margin-top:auto"]') || side.querySelector(':scope > .sidebar__footer');
    if (!foot) { foot = document.createElement('div'); foot.style.marginTop = 'auto'; side.appendChild(foot); }
    foot.classList.add('sidebar__footer');
    let settings = side.querySelector('a[href$="settings.html"]');
    if (!settings) {
      settings = document.createElement('a');
      settings.className = 'sidebar__item';
      settings.href = 'settings.html';
      settings.setAttribute('data-nav-page', 'settings.html');
      settings.textContent = 'Settings';
    }
    let theme = foot.querySelector('[data-action="toggle-theme"]') || side.querySelector('[data-action="toggle-theme"]');
    if (!theme) {
      theme = document.createElement('button');
      theme.type = 'button';
      theme.className = 'sidebar__item';
      theme.style.width = '100%';
      theme.setAttribute('data-action', 'toggle-theme');
      theme.textContent = 'Theme';
    } else {
      theme.textContent = 'Theme';                           // was "Toggle theme"; one name everywhere
    }
    let out = foot.querySelector('[data-action="logout"]') || side.querySelector('[data-action="logout"]');
    if (!out) {
      out = document.createElement('button');
      out.type = 'button';
      out.className = 'sidebar__item';
      out.style.width = '100%';
      out.setAttribute('data-action', 'logout');
      out.textContent = 'Log Out';
    }
    [settings, theme, out].forEach((el) => foot.appendChild(el));   // appendChild moves existing nodes: order = Settings, Theme, Log out
  }

  /** Marks the correct bottom-nav / sidebar item as aria-current. */
  function highlightActiveNav() {
    injectBadgesNav();
    injectProgressNav();
    injectGuideNav();
    injectAnimationsNav();
    injectFeeNav();
    buildMobileShell();   // phone 3-tab bar + drawer; before upgrade so its drawer item exists
    injectUpgradeNav();
    injectAdvNav();       // Max-only Advanced Games / Advanced Ranks (separate from Ranks)
    injectSidebarFooter();
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
    advancedGames: { min: 'Max',  label: 'Advanced games' },
    advGames:      { min: 'Max',  label: 'Advanced Games' },
    advRanks:      { min: 'Max',  label: 'Advanced Ranks' }
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
