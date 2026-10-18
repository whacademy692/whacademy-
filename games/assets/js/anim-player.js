/**
 * anim-player.js — W.H. Academy
 * Page controller for anim-player.html?a=<animation id>.
 *   1. finds the animation in the catalogue (anim-registry.js)
 *   2. checks the student's enrolled scope allows it (fail-closed, UI-level)
 *   3. fetches its JSON spec and mounts the sealed player (anim-ui.js)
 * The page has no sidebar and no bottom nav: the only way out is "Back".
 */
(function () {
  'use strict';

  var host, titleEl, metaEl, qBox, qLabel, qText, qNav, backEl;

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /** the profile saved by the dashboard (only trusted when it carries a scope) */
  function cachedProfile() {
    var c = null;
    try { c = Storage.getCachedDashboard(); } catch (e) { c = null; }
    return (c && c.data && c.data.profile && c.data.profile.enrolledScope) ? c.data.profile : null;
  }

  /**
   * The student's profile. First open of a link (new tab / cold cache / slow network) used to fail once and show
   * "not available"; now it waits for the dashboard cache, asks the server again a few times, and only gives up
   * (→ null, which shows "Try again", never "not available") after that. `force` skips the cache (stale-scope check).
   */
  async function resolveProfile(force) {
    var p = force ? null : cachedProfile();
    if (p) return p;
    var gaps = [0, 600, 1400, 2800];
    for (var i = 0; i < gaps.length; i++) {
      if (gaps[i]) await sleep(gaps[i]);
      if (!force) { p = cachedProfile(); if (p) return p; }     // another script may have filled the cache meanwhile
      try {
        var data = await Api.dashboard.compose();
        if (data && data.profile) { try { Storage.setCachedDashboard(data); } catch (e) { /* ignore */ } return data.profile; }
      } catch (e) { /* retry */ }
    }
    return null;
  }

  function findAllowed(profile, id) {
    if (!profile || !window.WHA_Scope || !window.WHA_ANIMS) return null;
    var scope = window.WHA_Scope.parse(profile.enrolledScope), hit = null;
    window.WHA_Scope.allowedSubjects(scope, window.WHA_ANIMS).forEach(function (subj) {
      (subj.chapters || []).forEach(function (ch) {
        (ch.animations || []).forEach(function (a) {
          if (a.id === id) hit = { anim: a, chapter: ch, subjectName: subj.name, classLevel: scope.classLevel };
        });
      });
    });
    return hit;
  }

  /** the tab (section) this animation lives under, e.g. { key: '7.1', label: '7.1', title: "Pythagoras' Theorem" } */
  function sectionOf(found) {
    var key = found.anim.section;
    if (!key) return null;
    var hit = null;
    (found.chapter.sections || []).forEach(function (s) { if (s.key === key) hit = s; });
    return hit || { key: key, label: key, title: '' };
  }

  function sectionName(found) {
    var s = sectionOf(found);
    return s ? (s.label === 'Theory' ? 'Theory' : s.label + (s.title ? ' ' + s.title : '')) : found.chapter.title;
  }

  /** Question card above the animation + Back → the same tab of the hub + Previous / Next question. */
  function showQuestion(found) {
    var a = found.anim, sec = sectionOf(found);
    if (backEl && sec) backEl.setAttribute('href', 'animations.html#' + found.chapter.n + '-' + encodeURIComponent(sec.key));
    if (!qBox) return;
    if (!(a.question && a.label)) { qBox.hidden = true; return; }
    qLabel.textContent = a.label;
    qText.textContent = a.question;
    qNav.textContent = '';
    var list = (found.chapter.animations || []).filter(function (x) { return (x.section || '') === (a.section || ''); });
    var i = list.indexOf(a);
    // keep the order the hub shows: the registry order inside the section
    function link(item, text, aria, arrowFirst) {
      var el = Utils.createEl('a', { href: item ? 'anim-player.html?a=' + encodeURIComponent(item.id) : '#', text: text });
      el.setAttribute('aria-label', item ? aria + ': ' + item.label : aria);
      if (!item) el.setAttribute('aria-disabled', 'true');
      return el;
    }
    if (i >= 0 && list.length > 1) {
      qNav.appendChild(link(list[i - 1] || null, '‹ Prev', 'Previous question'));
      qNav.appendChild(link(list[i + 1] || null, 'Next ›', 'Next question'));
      qNav.hidden = false;
    } else qNav.hidden = true;
    qBox.hidden = false;
  }

  function message(title, sub, retry) {
    host.textContent = '';
    var box = Utils.createEl('div', { class: 'anim-fatal' }, [
      Utils.createEl('p', { class: 'anim-fatal__t', text: title }),
      Utils.createEl('p', { class: 'anim-fatal__s', text: sub })
    ]);
    if (retry) {
      var b = Utils.createEl('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'Try again' });
      b.style.marginTop = '12px';
      b.addEventListener('click', start);
      box.appendChild(b);
    }
    host.appendChild(box);
  }

  async function start() {
    host.textContent = '';
    host.appendChild(Utils.createEl('p', { class: 'anim-loading', text: 'Loading animation…' }));
    var id = Router.getQueryParam('a');
    if (!id) { message('No animation chosen', 'Go back and pick one from the list.'); return; }
    var profile = await resolveProfile(false);
    if (!profile) { message('Could not check your account', 'Your connection may be slow. Please try again.', true); return; }
    if (!(await Plan.can('animations'))) {
      host.textContent = '';
      host.innerHTML = Plan.lockHtml('animations', { message: 'Interactive subject animations are part of the Max plan. Upgrade to Max to open them.' });
      return;
    }
    var found = findAllowed(profile, id);
    if (!found) {                                   // the cached scope may be stale — ask the server once before saying "no"
      var fresh = await resolveProfile(true);
      if (fresh) found = findAllowed(fresh, id);
    }
    if (!found) { message('This animation is not available for you', 'It may belong to another class or subject.'); return; }

    var a = found.anim, isQ = !!(a.question && a.label);
    document.title = (isQ ? a.label : a.title) + ' — W.H. Academy';
    titleEl.textContent = isQ ? a.label : a.title;
    metaEl.textContent = 'Class ' + found.classLevel + ' · ' + found.subjectName + ' · Chapter ' + found.chapter.n + ' · ' + sectionName(found);
    showQuestion(found);

    var spec;
    try {
      var res = await fetch(found.anim.file, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      spec = await res.json();
    } catch (e) {
      message('Could not load the animation', navigator.onLine === false ? 'You seem to be offline. Connect and try again.' : 'Please try again in a moment.', true);
      return;
    }
    if (!spec || typeof spec !== 'object') { message('Could not load the animation', 'The file looks damaged.', true); return; }
    spec.id = found.anim.id;                  // the catalogue id is the single source of truth
    if (!spec.title) spec.title = found.anim.title;

    host.textContent = '';
    window.__whaAnim = window.WHA_Anim.mountPlayer(host, spec, {
      store: Storage,
      debug: Router.getQueryParam('debug') === '1'
    });
    // the question belongs with the drawing: on a wide screen it sits at the top of the LEFT column (above the figure,
    // solution on the right); on a phone the same card stays above the figure.
    var left = host.querySelector('.anim-left');
    if (left && qBox && !qBox.hidden) left.insertBefore(qBox, left.firstChild);

    // player chrome: theme menu, settings sheet, resizable split, auto/manual,
    // first-run intro, and the "all questions" jump list (anim-controls.js)
    if (window.WHA_AnimControls && window.__whaAnim && window.__whaAnim.engine) {
      try { window.WHA_AnimControls.enhance({ engine: window.__whaAnim.engine, found: found, store: Storage }); }
      catch (e) { if (window.console) console.warn('[anim] controls failed', e); }
    }
  }

  // If the app never finishes starting (offline / a very slow first load) don't leave "Loading animation…" forever.
  setTimeout(function () {
    var h = Utils.qs('#anim-host');
    if (!h || !h.querySelector('.anim-loading') || (window.__whaAnim && window.__whaAnim.engine)) return;
    h.textContent = '';
    var box = Utils.createEl('div', { class: 'anim-fatal' }, [
      Utils.createEl('p', { class: 'anim-fatal__t', text: 'This is taking longer than usual' }),
      Utils.createEl('p', { class: 'anim-fatal__s', text: 'Your connection may be slow or offline. Tap Try again.' })
    ]);
    var rb = Utils.createEl('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'Try again' });
    rb.style.marginTop = '12px'; rb.addEventListener('click', function () { window.location.reload(); });
    box.appendChild(rb); h.appendChild(box);
  }, 15000);

  document.addEventListener('wha:ready', function () {
    if (Router.currentPageName() !== 'anim-player.html') return;
    host = Utils.qs('#anim-host'); titleEl = Utils.qs('#anim-title'); metaEl = Utils.qs('#anim-meta');
    qBox = Utils.qs('#anim-question'); qLabel = Utils.qs('#anim-question-label'); qText = Utils.qs('#anim-question-text');
    qNav = Utils.qs('#anim-question-nav'); backEl = Utils.qs('#anim-back');
    start();
  });
})();
