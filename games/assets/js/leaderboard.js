/**
 * leaderboard.js — W.H. Academy  (Ranks page)
 *
 * Shows, for the signed-in student:
 *   - total XP earned across all game types for the current/in-progress chapter
 *   - the average XP % that unlocks the Boss Battle (>= 70%)
 *   - how many questions are red-carded (burnt out)
 *   - XP earned in each individual game type, with a progress bar
 *
 * Per-type XP + the average come from the backend
 * (leaderboard/gameXpBreakdown). The backend scopes practice XP by
 * chapterRef::mechanicId, so this page MUST resolve a chapterRef before asking
 * for the breakdown. Older code accidentally called gameXpBreakdown with only
 * questionCounts, which shifted that object into the chapterRef argument and
 * made every rank value display as 0 even while dashboard XP was correct.
 */
(function () {
  'use strict';

  var BOSS_UNLOCK_PERCENT = 70;

  // The system's fixed set of game types: mechanicId + friendly label, plus
  // the per-type question count used to work out each type's max XP and the
  // overall average. If a chapter's banks change size (e.g. 50 -> 500) or a
  // new game type is added, update THIS one list.
  var GAME_TYPES = [
    { id: 'mcq-arena',                label: 'Multiple Choice',   count: 50 },
    { id: 'speed-challenge',          label: 'Speed Quiz',        count: 50 },
    { id: 'rapid-fire',               label: 'Rapid Fire',        count: 50 },
    { id: 'true-false-sprint',        label: 'True or False',     count: 50 },
    { id: 'fill-in-the-blank',        label: 'Fill in the Blank', count: 50 },
    { id: 'matching-grid',            label: 'Match the Pairs',   count: 50 },
    { id: 'drag-drop-classification', label: 'Sort into Groups',  count: 50 },
    { id: 'ordering-sequencing',      label: 'Put in Order',      count: 50 }
  ];

  function questionCounts() {
    var c = {};
    GAME_TYPES.forEach(function (t) { c[t.id] = t.count; });
    return c;
  }

  // Resolve the chapter whose XP breakdown should be shown.
  // 1) Prefer the dashboard's authoritative in-progress chapter.
  // 2) Fall back to local chapter/practice state so the page still works if
  //    the dashboard cache has not been refreshed yet.
  // 3) If neither exists, refresh dashboard data once and try again.
  function chapterRefFromDashboardData(data) {
    var rec = data && data.recommendation;
    var ref = rec && rec.data && rec.data.chapterRef;
    return ref ? String(ref) : '';
  }

  function chapterRefFromCache() {
    try {
      var cached = Storage.getCachedDashboard && Storage.getCachedDashboard();
      return chapterRefFromDashboardData(cached && cached.data);
    } catch (e) {
      return '';
    }
  }

  function chapterRefFromLocalState() {
    try {
      // stageprog keys are written by chapter-engine whenever a chapter stage
      // changes. Prefer them over practice keys because Theory-only visits can
      // exist before the student has answered a game question.
      var stageKeys = Storage.list ? Storage.list('stageprog:') : [];
      if (stageKeys && stageKeys.length) {
        var stageKey = stageKeys[stageKeys.length - 1];
        if (stageKey.indexOf('stageprog:') === 0) {
          return stageKey.slice('stageprog:'.length);
        }
      }

      var practiceKeys = Storage.list ? Storage.list('practice:') : [];
      if (practiceKeys && practiceKeys.length) {
        var practiceKey = practiceKeys[practiceKeys.length - 1];
        if (practiceKey.indexOf('practice:') === 0) {
          return practiceKey.slice('practice:'.length);
        }
      }
    } catch (e) {
      // localStorage unavailable/private mode — backend refresh below can still work.
    }
    return '';
  }

  function resolveChapterRef() {
    var cached = chapterRefFromCache();
    if (cached) return Promise.resolve(cached);

    var local = chapterRefFromLocalState();
    if (local) return Promise.resolve(local);

    if (Api.dashboard && Api.dashboard.compose) {
      return Api.dashboard.compose().then(function (data) {
        return chapterRefFromDashboardData(data) || '';
      });
    }

    return Promise.resolve('');
  }

  // Count red-carded (burnt-out) questions across every chapter on THIS device.
  function countRedCards() {
    var total = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf('wha:practice:') !== 0) continue;
        var data = JSON.parse(localStorage.getItem(k) || '{}');
        Object.keys(data).forEach(function (mechanicId) {
          var q = (data[mechanicId] && data[mechanicId].q) || {};
          Object.keys(q).forEach(function (id) { if (q[id] && q[id].redCard) total++; });
        });
      }
    } catch (e) { /* storage unreadable — treat as 0 */ }
    return total;
  }

  function bar(percent) {
    var track = Utils.createEl('div', { class: 'rank-bar' });
    var fill = Utils.createEl('div', { class: 'rank-bar__fill' });
    fill.style.width = Math.max(0, Math.min(100, Number(percent) || 0)) + '%';
    track.appendChild(fill);
    return track;
  }

  function renderBreakdown(data) {
    var container = Utils.qs('#leaderboard-content');
    container.innerHTML = '';
    var avg = Number(data.averagePercent) || 0;
    var unlocked = avg >= BOSS_UNLOCK_PERCENT;

    // Prefer the backend's tamper-resistant, cross-device count; fall back to
    // this device's tally only if an older backend has not sent one yet.
    var redCards = (typeof data.redCards === 'number') ? data.redCards : countRedCards();

    // --- Overall summary card ---
    container.appendChild(Utils.createEl('div', { class: 'card rank-summary' }, [
      Utils.createEl('p', { class: 'card--stat__label', text: 'Total XP earned' }),
      Utils.createEl('span', { class: 'rank-summary__xp', text: String(Number(data.totalXp) || 0) }),
      Utils.createEl('div', { class: 'rank-summary__meta' }, [
        Utils.createEl('div', {}, [
          Utils.createEl('span', { class: 'rank-summary__num', text: avg + '%' }),
          Utils.createEl('p', { class: 'text-body-sm', text: 'Average XP' })
        ]),
        Utils.createEl('div', {}, [
          Utils.createEl('span', { class: 'rank-summary__num', text: String(redCards) }),
          Utils.createEl('p', { class: 'text-body-sm', text: redCards === 1 ? 'Red card' : 'Red cards' })
        ])
      ]),
      bar(avg),
      Utils.createEl('p', {
        class: 'rank-boss' + (unlocked ? ' rank-boss--on' : ''),
        text: unlocked
          ? 'Boss Battle unlocked — 70% average reached!'
          : (BOSS_UNLOCK_PERCENT - avg) + '% more average XP to unlock the Boss Battle'
      })
    ]));

    // --- Per-game-type list ---
    container.appendChild(Utils.createEl('h2', { class: 'rank-h2', text: 'XP by game type' }));

    var byId = {};
    (data.perType || []).forEach(function (t) { byId[t.mechanicId] = t; });
    var list = Utils.createEl('div', { class: 'stack-sm' });
    GAME_TYPES.forEach(function (gt) {
      var t = byId[gt.id] || { xp: 0, maxXp: gt.count * 5, percent: 0 };
      list.appendChild(Utils.createEl('div', { class: 'card rank-row' }, [
        Utils.createEl('div', { class: 'rank-row__top' }, [
          Utils.createEl('span', { class: 'rank-row__name', text: gt.label }),
          Utils.createEl('span', { class: 'rank-row__xp', text: (Number(t.xp) || 0) + ' XP' })
        ]),
        bar(t.percent),
        Utils.createEl('p', { class: 'rank-row__sub text-body-sm',
          text: (Number(t.percent) || 0) + '% of ' + (Number(t.maxXp) || 0) + ' max XP' })
      ]));
    });
    container.appendChild(list);
  }

  function renderError() {
    var container = Utils.qs('#leaderboard-content');
    container.innerHTML = '';
    container.appendChild(Utils.createEl('div', { class: 'card' }, [
      Utils.createEl('p', { text: 'Could not load your XP right now. Check your connection and try again.' })
    ]));
  }

  function load() {
    if (!Api.leaderboard || !Api.leaderboard.gameXpBreakdown) {
      renderError();
      return;
    }

    resolveChapterRef()
      .then(function (chapterRef) {
        if (!chapterRef) throw new Error('No chapter context available for leaderboard.');
        return Api.leaderboard.gameXpBreakdown(chapterRef, questionCounts());
      })
      .then(function (data) { renderBreakdown(data || {}); })
      .catch(function () { renderError(); });
  }

  document.addEventListener('wha:ready', function () {
    if (Router.currentPageName() !== 'leaderboard.html') return;
    load();
  });
})();
