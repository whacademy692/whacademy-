/**
 * games.js — W.H. Academy
 * "Your Classes" hub. Browses the chapters a student is ENTITLED to see, then
 * links into each chapter's self-contained folder for actual gameplay.
 *
 * Content now comes from the shared registry (content-registry.js) and is gated
 * by the student's enrolledScope (scope.js) — the SAME two modules the dashboard
 * uses, so both screens can never disagree about who sees what. A Class 9 Biology
 * student sees Biology (and their other enrolled subjects); Chemistry never
 * appears for them.
 *
 * Adding a new game is a one-line edit in content-registry.js (fill in the
 * chapter's `game` url). No change here, and every already-enrolled student in
 * that class/subject sees it immediately.
 */
(function () {
  'use strict';

  // Subject accent keys the design system knows about; fall back gracefully.
  var ACCENT = {
    phys: 'physics', chem: 'chemistry', bio: 'biology', math: 'math', cs: 'cs',
    science: 'science', geography: 'geography', history: 'history'
  };
  var ICON = {
    phys: '⚛️', chem: '🧪', bio: '🧬', math: '📐', cs: '💻',
    science: '🔬', geography: '🌍', history: '📜'
  };

  var scopeCache = null;

  /** Resolve the student's scope: cached dashboard first, else fetch it. */
  async function resolveScope() {
    if (scopeCache) return scopeCache;

    var profile = null;
    var cached = Storage.getCachedDashboard();
    if (cached && cached.data && cached.data.profile) {
      profile = cached.data.profile;
    } else {
      try {
        var data = await Api.dashboard.compose();
        Storage.setCachedDashboard(data);
        profile = data.profile;
      } catch (e) {
        profile = null;
      }
    }
    scopeCache = { profile: profile };
    return scopeCache;
  }

  /** All chapters the student may see, flattened, each tagged with its subject. */
  function entitledChapters(profile) {
    if (!window.WHA_Scope || !window.WHA_CONTENT || !profile) return [];
    var scope = window.WHA_Scope.parse(profile.enrolledScope);
    var subjects = window.WHA_Scope.allowedSubjects(scope, window.WHA_CONTENT);

    var rows = [];
    subjects.forEach(function (subject) {
      subject.chapters.forEach(function (ch) {
        rows.push({
          subjectKey: subject.key,
          subjectName: subject.name,
          classLevel: scope.classLevel,
          title: ch.title,
          n: ch.n,
          game: ch.game,
          notes: ch.notes,
          quiz: ch.quiz
        });
      });
    });
    return rows;
  }

  function chapterCard(row) {
    var accent = ACCENT[row.subjectKey] || 'brand-ink';
    var playable = !!row.game;

    var children = [
      Utils.createEl('div', { class: 'card--nav__icon' }, [
        Utils.createEl('span', { 'aria-hidden': 'true', text: ICON[row.subjectKey] || '📘' })
      ]),
      Utils.createEl('div', { class: 'card--nav__body' }, [
        Utils.createEl('p', { class: 'card--nav__title', text: row.title }),
        Utils.createEl('p', { class: 'card--nav__meta',
          text: 'Class ' + row.classLevel + ' · ' + row.subjectName })
      ])
    ];

    if (playable) {
      return Utils.createEl('a', {
        class: 'card card--nav card--interactive',
        href: row.game,
        style: '--subject-accent: var(--subject-' + accent + '-primary); --subject-accent-tint: var(--subject-' + accent + '-secondary);'
      }, children);
    }
    // Not yet playable — a visible, greyed card labelled with its status.
    children.push(Utils.createEl('span', { class: 'badge', style: 'margin-left:auto;', text: 'Coming soon' }));
    return Utils.createEl('div', { class: 'card card--nav', style: 'opacity:0.55;' }, children);
  }

  function renderGrid(rows, filterText) {
    var container = Utils.qs('#chapters-grid');
    if (!container) return;
    container.innerHTML = '';

    var query = (filterText || '').toLowerCase();
    var matches = rows.filter(function (r) {
      return !query ||
        r.title.toLowerCase().indexOf(query) !== -1 ||
        r.subjectName.toLowerCase().indexOf(query) !== -1;
    });

    if (matches.length === 0) {
      container.appendChild(Utils.createEl('div', { class: 'empty-state' }, [
        Utils.createEl('p', { class: 'empty-state__title',
          text: rows.length === 0 ? 'No classes yet' : 'No chapters found' }),
        Utils.createEl('p', {
          text: rows.length === 0
            ? 'Your enrolled subjects will appear here once content is ready.'
            : 'Try a different search term.' })
      ]));
      return;
    }

    // Playable chapters first, then coming-soon — most useful at the top.
    matches.sort(function (a, b) { return (b.game ? 1 : 0) - (a.game ? 1 : 0); });
    matches.forEach(function (r) { container.appendChild(chapterCard(r)); });
  }

  function initSearch(rows) {
    var searchInput = Utils.qs('#chapter-search');
    if (searchInput) {
      searchInput.addEventListener('input',
        Utils.debounce(function (e) { renderGrid(rows, e.target.value); }, 200));
    }
  }

  document.addEventListener('wha:ready', async function () {
    if (Router.currentPageName() !== 'games.html') return;
    var ctx = await resolveScope();
    var rows = entitledChapters(ctx.profile);
    renderGrid(rows, '');
    initSearch(rows);
  });
})();
