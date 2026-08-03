/**
 * leaderboard.js — W.H. Academy  (Ranks page)
 *
 * Shows, for the signed-in student:
 *   - total XP earned across all game types
 *   - the average XP % that unlocks the Boss Battle (>= 70%)
 *   - how many questions are red-carded (burnt out) on this device
 *   - XP earned in each individual game type, with a progress bar
 *
 * Per-type XP + the average come from the backend
 * (leaderboard/gameXpBreakdown). Red-card counts are read from this device's
 * practice storage, because burnout is tracked per device (like the engine).
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
    // Prefer the backend's tamper-proof, cross-device count; fall back to this
    // device's own tally only if an older backend hasn't sent one yet.
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
          ? 'Boss Battle unlocked — 90% average reached!'
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
    if (!Api.leaderboard || !Api.leaderboard.gameXpBreakdown) { renderError(); return; }
    Api.leaderboard.gameXpBreakdown(questionCounts())
      .then(function (data) { renderBreakdown(data || {}); })
      .catch(function () { renderError(); });
  }

  document.addEventListener('wha:ready', function () {
    if (Router.currentPageName() !== 'leaderboard.html') return;
    load();
  });
})();
