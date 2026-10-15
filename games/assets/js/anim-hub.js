/**
 * anim-hub.js — W.H. Academy
 * The "Animations" tab. Lists the interactive animations a student is ENTITLED
 * to, grouped subject → chapter, using the same scope gate as the Chapters tab
 * (scope.js, fail-closed): a Class 8 Maths student sees only Class 8 Maths
 * animations; an unreadable scope shows nothing.
 */
(function () {
  'use strict';

  var ACCENT = {
    phys: 'physics', chem: 'chemistry', bio: 'biology', math: 'mathematics', cs: 'computerscience',
    science: 'science', geography: 'geography', history: 'history'
  };
  var ICON = { phys: '⚛️', chem: '🧪', bio: '🧬', math: '📐', cs: '💻', science: '🔬', geography: '🌍', history: '📜' };

  var profileCache = null;
  async function resolveProfile() {
    if (profileCache) return profileCache;
    var profile = null;
    var cached = Storage.getCachedDashboard();
    if (cached && cached.data && cached.data.profile) profile = cached.data.profile;
    else {
      try { var data = await Api.dashboard.compose(); Storage.setCachedDashboard(data); profile = data.profile; }
      catch (e) { profile = null; }
    }
    profileCache = profile;
    return profile;
  }

  /** Flatten the allowed registry into one row per animation. */
  function entitledRows(profile) {
    if (!window.WHA_Scope || !window.WHA_ANIMS || !profile) return [];
    var scope = window.WHA_Scope.parse(profile.enrolledScope);
    var rows = [];
    window.WHA_Scope.allowedSubjects(scope, window.WHA_ANIMS).forEach(function (subj) {
      (subj.chapters || []).forEach(function (ch) {
        (ch.animations || []).forEach(function (a) {
          rows.push({ subjectKey: subj.key, subjectName: subj.name, classLevel: scope.classLevel, chapterN: ch.n, chapterTitle: ch.title, anim: a });
        });
      });
    });
    return rows;
  }

  function savedState(id) {
    try {
      var s = Storage.get('anim:' + id, null);
      if (s && s.completed) return 'done';
      if (s && (s.values || s.colors)) return 'started';
    } catch (e) { /* ignore */ }
    return '';
  }

  function accentStyle(key) {
    var a = ACCENT[key];
    return a ? '--subject-accent: var(--subject-' + a + '-primary); --subject-accent-tint: var(--subject-' + a + '-secondary);' : '';
  }

  function card(row) {
    var a = row.anim, st = savedState(a.id);
    var meta = ['Chapter ' + row.chapterN];
    if (a.minutes) meta.push(a.minutes + ' min');
    if (a.level) meta.push(a.level);
    var body = [
      Utils.createEl('p', { class: 'card--nav__title', text: a.title }),
      Utils.createEl('p', { class: 'card--nav__meta', text: meta.join(' · ') })
    ];
    if (a.summary) body.push(Utils.createEl('p', { class: 'anim-hubcard__desc', text: a.summary }));
    var kids = [
      Utils.createEl('div', { class: 'card--nav__icon' }, [
        Utils.createEl('span', { 'aria-hidden': 'true', text: a.icon || ICON[row.subjectKey] || '🎬' })
      ]),
      Utils.createEl('div', { class: 'card--nav__body' }, body)
    ];
    if (st) kids.push(Utils.createEl('span', { class: 'badge anim-hubcard__badge', text: st === 'done' ? '✓ Done' : 'In progress' }));
    return Utils.createEl('a', {
      class: 'card card--nav card--interactive anim-hubcard' + (st === 'done' ? ' is-done' : ''),
      href: 'anim-player.html?a=' + encodeURIComponent(a.id),
      style: accentStyle(row.subjectKey)
    }, kids);
  }

  function section(group) {
    var head = Utils.createEl('div', { class: 'subject-group__head', style: accentStyle(group.key) }, [
      Utils.createEl('span', { class: 'subject-group__icon', 'aria-hidden': 'true', text: ICON[group.key] || '🎬' }),
      Utils.createEl('div', { class: 'subject-group__titles' }, [
        Utils.createEl('h2', { class: 'subject-group__name', text: group.name }),
        Utils.createEl('p', { class: 'subject-group__meta', text: 'Class ' + group.classLevel + ' · ' + group.count + (group.count === 1 ? ' animation' : ' animations') })
      ])
    ]);
    var kids = [head];
    group.chapters.forEach(function (ch) {
      kids.push(Utils.createEl('h3', { class: 'anim-chapterhead', text: 'Chapter ' + ch.n + ' · ' + ch.title }));
      kids.push(Utils.createEl('div', { class: 'card-grid' }, ch.rows.map(card)));
    });
    return Utils.createEl('section', { class: 'subject-group', style: accentStyle(group.key) }, kids);
  }

  function group(rows) {
    var order = [], by = {};
    rows.forEach(function (r) {
      var g = by[r.subjectKey];
      if (!g) { g = by[r.subjectKey] = { key: r.subjectKey, name: r.subjectName, classLevel: r.classLevel, chapters: [], chIdx: {}, count: 0 }; order.push(g); }
      var c = g.chIdx[r.chapterN];
      if (!c) { c = g.chIdx[r.chapterN] = { n: r.chapterN, title: r.chapterTitle, rows: [] }; g.chapters.push(c); }
      c.rows.push(r); g.count++;
    });
    order.forEach(function (g) { g.chapters.sort(function (a, b) { return a.n - b.n; }); });
    return order;
  }

  function render(rows, q) {
    var box = Utils.qs('#anim-grid');
    if (!box) return;
    box.textContent = '';
    var query = (q || '').toLowerCase();
    var hits = rows.filter(function (r) {
      return !query || (r.anim.title + ' ' + (r.anim.topic || '') + ' ' + r.chapterTitle + ' ' + r.subjectName).toLowerCase().indexOf(query) !== -1;
    });
    if (!hits.length) {
      box.appendChild(Utils.createEl('div', { class: 'empty-state' }, [
        Utils.createEl('p', { class: 'empty-state__title', text: rows.length ? 'Nothing found' : 'No animations for your subjects yet' }),
        Utils.createEl('p', { text: rows.length ? 'Try a different word.' : 'New animations are added chapter by chapter — check back soon.' })
      ]));
      return;
    }
    group(hits).forEach(function (g) { box.appendChild(section(g)); });
  }

  document.addEventListener('wha:ready', async function () {
    if (Router.currentPageName() !== 'animations.html') return;
    var profile = await resolveProfile();
    // Animations are a Max-plan feature. Everyone else sees an upgrade card.
    if (!(await Plan.can('animations'))) {
      var lockBox = Utils.qs('#anim-grid');
      if (lockBox) lockBox.innerHTML = Plan.lockHtml('animations', { message: 'Interactive subject animations are part of the Max plan. Upgrade to Max to open them.' });
      var lockSearch = Utils.qs('#anim-searchwrap');
      if (lockSearch) lockSearch.hidden = true;
      return;
    }
    var rows = entitledRows(profile);
    render(rows, '');
    var input = Utils.qs('#anim-search');
    if (input) input.addEventListener('input', Utils.debounce(function (e) { render(rows, e.target.value); }, 200));
    var search = Utils.qs('#anim-searchwrap');
    if (search && !rows.length) search.hidden = true;
  });
})();
