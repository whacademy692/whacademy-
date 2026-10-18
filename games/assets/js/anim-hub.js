/**
 * anim-hub.js — W.H. Academy
 * The "Animations" tab. Lists the interactive animations a student is ENTITLED
 * to, grouped subject → chapter, using the same scope gate as the Chapters tab
 * (scope.js, fail-closed): a Class 8 Maths student sees only Class 8 Maths
 * animations; an unreadable scope shows nothing.
 *
 * A chapter that declares `sections` in anim-registry.js (a textbook chapter:
 * Theory · 7.1 · 7.2 · 7.3 …) is shown as tabs, and each tab is a list of
 * questions — tap one to open just that question's animation. A chapter without
 * `sections` is shown as the plain card grid.
 * The open tab is kept in the address (animations.html#7-7.1) so "Back" from the
 * player lands on the same tab.
 */
(function () {
  'use strict';

  var ACCENT = {
    phys: 'physics', chem: 'chemistry', bio: 'biology', math: 'mathematics', cs: 'computerscience',
    science: 'science', geography: 'geography', history: 'history'
  };
  var ICON = { phys: '⚛️', chem: '🧪', bio: '🧬', math: '📐', cs: '💻', science: '🔬', geography: '🌍', history: '📜' };

  var profileCache = null;
  var allRows = [];
  var query = '';
  var tabState = {};                 // chapter number → open section key
  var focusTab = null;               // [chapter number, key] to re-focus after a tab re-render
  var openCh = null;                 // {key, n} of the chapter the student opened, or null (show chapter cards)

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
          rows.push({
            subjectKey: subj.key, subjectName: subj.name, classLevel: scope.classLevel,
            chapterN: ch.n, chapterTitle: ch.title, sections: ch.sections || null, anim: a
          });
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

  function playerHref(a) { return 'anim-player.html?a=' + encodeURIComponent(a.id); }

  /* ------------------------------------------------------------------ plain card (chapters without sections) */
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
      href: playerHref(a),
      style: accentStyle(row.subjectKey)
    }, kids);
  }

  /* ------------------------------------------------------------------ question row (chapters with sections) */
  function qrow(row) {
    var a = row.anim, st = savedState(a.id), theory = a.section === 'theory';
    var meta = [];
    if (a.level) meta.push(Utils.createEl('span', { class: 'anim-qrow__lvl anim-qrow__lvl--' + String(a.level).toLowerCase(), text: a.level }));
    if (st) meta.push(Utils.createEl('span', { class: 'anim-qrow__st' + (st === 'done' ? ' is-done' : ''), text: st === 'done' ? '✓ Done' : 'In progress' }));
    var textKids = [];
    if (theory) {
      textKids.push(Utils.createEl('span', { class: 'anim-qrow__title', text: a.title }));
      if (a.summary) textKids.push(Utils.createEl('span', { class: 'anim-qrow__text', text: a.summary }));
    } else {
      textKids.push(Utils.createEl('span', { class: 'anim-qrow__text', text: a.question || a.summary || a.title }));
    }
    return Utils.createEl('a', {
      class: 'anim-qrow' + (st === 'done' ? ' is-done' : ''),
      href: playerHref(a),
      title: theory ? a.title : (a.label || a.title)
    }, [
      Utils.createEl('span', { class: 'anim-qrow__chip', text: a.label || a.title }),
      Utils.createEl('span', { class: 'anim-qrow__body' }, textKids),
      Utils.createEl('span', { class: 'anim-qrow__meta' }, meta)
    ]);
  }

  /** rows of one section, grouped by `group` in the order the registry lists them */
  function groupedList(rows) {
    var order = [], by = {};
    rows.forEach(function (r) {
      var g = r.anim.group || '';
      if (!by[g]) { by[g] = []; order.push(g); }
      by[g].push(r);
    });
    var kids = [];
    order.forEach(function (g) {
      if (g) {
        kids.push(Utils.createEl('h5', { class: 'anim-qgroup', text: g }, [
          Utils.createEl('span', { class: 'anim-qgroup__n', text: String(by[g].length) })
        ]));
      }
      kids.push(Utils.createEl('div', { class: 'anim-qlist' }, by[g].map(qrow)));
    });
    return kids;
  }

  function doneCount(rows) { return rows.filter(function (r) { return savedState(r.anim.id) === 'done'; }).length; }

  function comingSoon(sec) {
    return Utils.createEl('div', { class: 'anim-soon' }, [
      Utils.createEl('span', { class: 'anim-soon__ico', 'aria-hidden': 'true', text: '🚧' }),
      Utils.createEl('p', { class: 'anim-soon__t', text: 'Coming soon' }),
      Utils.createEl('p', { class: 'anim-soon__s', text: (sec.label === 'Theory' ? 'Theory' : 'Section ' + sec.label) + ' animations are being made — check back soon.' })
    ]);
  }

  /* ------------------------------------------------------------------ tabbed chapter */
  function validKey(ch, key) {
    return (ch.sections || []).some(function (s) { return s.key === key; });
  }

  function chapterTabs(g, ch) {
    var sections = ch.sections;
    var open = tabState[ch.n];
    if (!validKey(ch, open)) open = sections[0].key;
    tabState[ch.n] = open;
    var by = {};
    ch.rows.forEach(function (r) { var k = r.anim.section || sections[0].key; (by[k] = by[k] || []).push(r); });

    var tablist = Utils.createEl('div', { class: 'anim-ctabs', role: 'tablist', 'aria-label': 'Chapter ' + ch.n + ' sections' });
    var tabEls = [];
    sections.forEach(function (s) {
      var n = (by[s.key] || []).length, on = s.key === open;
      var b = Utils.createEl('button', {
        class: 'anim-ctab' + (on ? ' is-on' : '') + (n ? '' : ' is-soon'), type: 'button', role: 'tab', id: 'anim-tab-' + ch.n + '-' + s.key,
        'aria-selected': on ? 'true' : 'false', 'aria-controls': 'anim-panel-' + ch.n, tabIndex: on ? 0 : -1,
        title: n ? '' : 'Coming soon'
      }, [
        Utils.createEl('span', { class: 'anim-ctab__l', text: s.label }),
        n ? Utils.createEl('span', { class: 'anim-ctab__n', text: String(n) }) : null
      ]);
      b.addEventListener('click', function () { selectTab(ch.n, s.key); });
      b.addEventListener('keydown', function (e) {
        var i = tabEls.indexOf(b), j = -1;
        if (e.key === 'ArrowRight') j = (i + 1) % tabEls.length;
        else if (e.key === 'ArrowLeft') j = (i - 1 + tabEls.length) % tabEls.length;
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = tabEls.length - 1;
        if (j >= 0) { e.preventDefault(); selectTab(ch.n, sections[j].key, true); }
      });
      tabEls.push(b); tablist.appendChild(b);
    });

    var sec = sections.filter(function (s) { return s.key === open; })[0];
    var rows = by[open] || [];
    var headBits = [Utils.createEl('h4', { class: 'anim-cpanel__title', text: (sec.label === 'Theory' ? 'Theory' : sec.label) + (sec.title ? ' · ' + sec.title : '') })];
    if (rows.length) {
      var d = doneCount(rows);
      headBits.push(Utils.createEl('p', {
        class: 'anim-cpanel__meta',
        text: rows.length + (rows.length === 1 ? ' animation' : ' animations') + (d ? ' · ' + d + ' done' : '')
      }));
    }
    var panelKids = [Utils.createEl('div', { class: 'anim-cpanel__head' }, headBits)];
    if (rows.length) groupedList(rows).forEach(function (n) { panelKids.push(n); });
    else panelKids.push(comingSoon(sec));
    var panel = Utils.createEl('div', { class: 'anim-cpanel', role: 'tabpanel', id: 'anim-panel-' + ch.n, 'aria-labelledby': 'anim-tab-' + ch.n + '-' + open }, panelKids);
    return Utils.createEl('div', { class: 'anim-chapter', 'data-chapter': String(ch.n) }, [tablist, panel]);
  }

  function selectTab(n, key, refocus) {
    tabState[n] = key;
    try { history.replaceState(null, '', '#' + n + '-' + key); } catch (e) { /* ignore */ }
    if (refocus) focusTab = [n, key];
    render();
  }

  /* ------------------------------------------------------------------ search results for a tabbed chapter */
  function chapterSearch(g, ch, hits) {
    var sections = ch.sections, kids = [];
    sections.forEach(function (s) {
      var rows = hits.filter(function (r) { return (r.anim.section || sections[0].key) === s.key; });
      if (!rows.length) return;
      kids.push(Utils.createEl('h4', { class: 'anim-cpanel__title anim-cpanel__title--s', text: s.label + (s.title ? ' · ' + s.title : '') }));
      kids.push(Utils.createEl('div', { class: 'anim-qlist' }, rows.map(qrow)));
    });
    return Utils.createEl('div', { class: 'anim-chapter anim-chapter--search' }, kids);
  }

  /* ------------------------------------------------------------------ chapter card (landing) */
  function isOpen(group, ch) {
    return !!openCh && openCh.n === ch.n && (openCh.key === null || openCh.key === group.key);
  }
  function openChapter(key, n) {
    openCh = { key: key, n: n };
    var sec = tabState[n];
    try { history.replaceState(null, '', '#' + n + (sec ? '-' + sec : '')); } catch (e) { /* ignore */ }
    render();
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { /* ignore */ }
  }
  function closeChapter() {
    openCh = null;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
    render();
  }
  function chapterCard(group, ch) {
    var total = ch.rows.length, done = doneCount(ch.rows);
    var pct = total ? Math.round(done / total * 100) : 0;
    var secLabels = (ch.sections || []).map(function (s) { return s.label; }).join(' · ');
    var card = Utils.createEl('button', { class: 'anim-chcard' + (done === total && total ? ' is-done' : ''), type: 'button', style: accentStyle(group.key) }, [
      Utils.createEl('span', { class: 'anim-chcard__n', 'aria-hidden': 'true', text: 'Ch ' + ch.n }),
      Utils.createEl('span', { class: 'anim-chcard__body' }, [
        Utils.createEl('span', { class: 'anim-chcard__title', text: ch.title }),
        Utils.createEl('span', { class: 'anim-chcard__meta', text: total + (total === 1 ? ' animation' : ' animations') + (secLabels ? ' · ' + secLabels : '') }),
        Utils.createEl('span', { class: 'anim-chcard__bar' }, [Utils.createEl('span', { class: 'anim-chcard__fill', style: 'width:' + pct + '%' })]),
        Utils.createEl('span', { class: 'anim-chcard__done', text: done + ' / ' + total + ' done' })
      ]),
      Utils.createEl('span', { class: 'anim-chcard__go', 'aria-hidden': 'true', text: '→' })
    ]);
    card.addEventListener('click', function () { openChapter(group.key, ch.n); });
    return card;
  }

  /* ------------------------------------------------------------------ page */
  function section(group) {
    var head = Utils.createEl('div', { class: 'subject-group__head', style: accentStyle(group.key) }, [
      Utils.createEl('span', { class: 'subject-group__icon', 'aria-hidden': 'true', text: ICON[group.key] || '🎬' }),
      Utils.createEl('div', { class: 'subject-group__titles' }, [
        Utils.createEl('h2', { class: 'subject-group__name', text: group.name }),
        Utils.createEl('p', { class: 'subject-group__meta', text: 'Class ' + group.classLevel + ' · ' + group.count + (group.count === 1 ? ' animation' : ' animations') })
      ])
    ]);
    var kids = [head];

    // While searching, show matching chapters' lists directly (no card step).
    if (query) {
      group.chapters.forEach(function (ch) {
        kids.push(Utils.createEl('h3', { class: 'anim-chapterhead', text: 'Chapter ' + ch.n + ' · ' + ch.title }));
        if (ch.sections && ch.sections.length) kids.push(chapterSearch(group, ch, ch.rows));
        else kids.push(Utils.createEl('div', { class: 'card-grid' }, ch.rows.map(card)));
      });
      return Utils.createEl('section', { class: 'subject-group', style: accentStyle(group.key) }, kids);
    }

    // Did the student open one of this group's chapters?
    var opened = group.chapters.filter(function (ch) { return isOpen(group, ch); })[0];
    if (opened) {
      var back = Utils.createEl('button', { class: 'anim-chback', type: 'button' }, [
        Utils.createEl('span', { 'aria-hidden': 'true', text: '← ' }),
        Utils.createEl('span', { text: 'All chapters' })
      ]);
      back.addEventListener('click', closeChapter);
      kids.push(back);
      kids.push(Utils.createEl('h3', { class: 'anim-chapterhead', text: 'Chapter ' + opened.n + ' · ' + opened.title }));
      if (opened.sections && opened.sections.length) kids.push(chapterTabs(group, opened));
      else kids.push(Utils.createEl('div', { class: 'card-grid' }, opened.rows.map(card)));
      return Utils.createEl('section', { class: 'subject-group', style: accentStyle(group.key) }, kids);
    }

    // Otherwise: a grid of chapter cards to pick from.
    kids.push(Utils.createEl('p', { class: 'anim-chhint', text: 'Pick a chapter to open its animations.' }));
    kids.push(Utils.createEl('div', { class: 'anim-chgrid' }, group.chapters.map(function (ch) { return chapterCard(group, ch); })));
    return Utils.createEl('section', { class: 'subject-group', style: accentStyle(group.key) }, kids);
  }

  function group(rows) {
    var order = [], by = {};
    rows.forEach(function (r) {
      var g = by[r.subjectKey];
      if (!g) { g = by[r.subjectKey] = { key: r.subjectKey, name: r.subjectName, classLevel: r.classLevel, chapters: [], chIdx: {}, count: 0 }; order.push(g); }
      var c = g.chIdx[r.chapterN];
      if (!c) { c = g.chIdx[r.chapterN] = { n: r.chapterN, title: r.chapterTitle, sections: r.sections, rows: [] }; g.chapters.push(c); }
      c.rows.push(r); g.count++;
    });
    order.forEach(function (g) { g.chapters.sort(function (a, b) { return a.n - b.n; }); });
    return order;
  }

  function matches(r, q) {
    var a = r.anim;
    return (a.title + ' ' + (a.topic || '') + ' ' + (a.label || '') + ' ' + (a.question || '') + ' ' + (a.group || '') + ' ' + r.chapterTitle + ' ' + r.subjectName)
      .toLowerCase().indexOf(q) !== -1;
  }

  function render() {
    var box = Utils.qs('#anim-grid');
    if (!box) return;
    box.textContent = '';
    var rows = allRows, q = (query || '').toLowerCase().trim();
    var hits = rows.filter(function (r) { return !q || matches(r, q); });
    if (!hits.length) {
      box.appendChild(Utils.createEl('div', { class: 'empty-state' }, [
        Utils.createEl('p', { class: 'empty-state__title', text: rows.length ? 'Nothing found' : 'No animations for your subjects yet' }),
        Utils.createEl('p', { text: rows.length ? 'Try a different word.' : 'New animations are added chapter by chapter — check back soon.' })
      ]));
      return;
    }
    // with a search word the chapter shows its matches only; the tabbed view needs ALL rows of the chapter
    group(q ? hits : rows).forEach(function (g) { box.appendChild(section(g)); });
    if (focusTab) {
      var el = document.getElementById('anim-tab-' + focusTab[0] + '-' + focusTab[1]);
      focusTab = null;
      if (el) { try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    }
  }

  /** "#7-7.1" → open chapter 7 on tab 7.1 (so "Back" from the player lands right). */
  function readHash() {
    var h = window.location.hash || '';
    var m = /^#(\d+)-(.+)$/.exec(h);
    if (m) { var n = parseInt(m[1], 10); tabState[n] = decodeURIComponent(m[2]); openCh = { key: null, n: n }; return; }
    var m2 = /^#(\d+)$/.exec(h);
    if (m2) { openCh = { key: null, n: parseInt(m2[1], 10) }; return; }
    openCh = null;
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
    allRows = entitledRows(profile);
    readHash();
    render();
    var input = Utils.qs('#anim-search');
    if (input) input.addEventListener('input', Utils.debounce(function (e) { query = e.target.value || ''; render(); }, 200));
    var search = Utils.qs('#anim-searchwrap');
    if (search && !allRows.length) search.hidden = true;
    window.addEventListener('hashchange', function () { readHash(); if (!query) render(); });
  });
})();
