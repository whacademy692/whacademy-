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

  var host, titleEl, metaEl;

  async function resolveProfile() {
    var cached = Storage.getCachedDashboard();
    if (cached && cached.data && cached.data.profile) return cached.data.profile;
    try { var data = await Api.dashboard.compose(); Storage.setCachedDashboard(data); return data.profile; }
    catch (e) { return null; }
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
    var profile = await resolveProfile();
    if (!(await Plan.can('animations'))) {
      host.textContent = '';
      host.innerHTML = Plan.lockHtml('animations', { message: 'Interactive subject animations are part of the Max plan. Upgrade to Max to open them.' });
      return;
    }
    var found = findAllowed(profile, id);
    if (!found) { message('This animation is not available for you', 'It may belong to another class or subject.'); return; }

    document.title = found.anim.title + ' — W.H. Academy';
    titleEl.textContent = found.anim.title;
    metaEl.textContent = 'Class ' + found.classLevel + ' · ' + found.subjectName + ' · Chapter ' + found.chapter.n + ' · ' + found.chapter.title;

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
  }

  document.addEventListener('wha:ready', function () {
    if (Router.currentPageName() !== 'anim-player.html') return;
    host = Utils.qs('#anim-host'); titleEl = Utils.qs('#anim-title'); metaEl = Utils.qs('#anim-meta');
    start();
  });
})();
