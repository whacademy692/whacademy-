/**
 * adv-ranks.js — W.H. Academy  (Advanced Ranks, Max plan)
 * The Game Rank leaderboard of the Advanced Games, per game, same class band, NICKNAMES ONLY.
 * Completely separate from leaderboard.js (the XP Ranks page for the basic games / all plans).
 * Data: game/leaderboard {game, limit} -> { rows:[{position,nickname,level,rankName,me}], me:{position,level} }.
 */
(function () {
  'use strict';
  var root = document.getElementById('adv-content');
  if (!root) return;
  var esc = function (v) { return Utils.escapeHtml(String(v == null ? '' : v)); };

  var RANK_NAMES = ['Spark','Ember','Glow','Pulse','Flux','Volt','Surge','Blaze','Storm','Vortex','Aura','Nebula','Eclipse','Phantom','Zenith','Titan','Cosmic','Quantum','Infinity','Omega'];
  var BAND_COLORS = ['#0d9488', '#7c3aed', '#c026d3', '#d97706'];
  function rankColor(name) {
    var i = RANK_NAMES.indexOf(name);
    return BAND_COLORS[Math.min(3, Math.max(0, Math.floor((i < 0 ? 0 : i) / 5)))];
  }

  var GAMES = [{ id: 'racer', label: 'Neon Racer' }, { id: 'defense', label: 'Auto Defense' }];
  var BANDS = [{ id: 'all', label: 'All ranks' }, { id: '0', label: 'Spark – Flux' }, { id: '1', label: 'Volt – Vortex' }, { id: '2', label: 'Aura – Zenith' }, { id: '3', label: 'Titan – Omega' }];
  var SIZES = [10, 20, 50];
  var current = 'racer', limit = 20, band = 'all', query = '', lastData = null;
  var tabsEl, boardEl, listEl, ctlEl;

  function bandOf(name) { var i = RANK_NAMES.indexOf(name); return Math.min(3, Math.max(0, Math.floor((i < 0 ? 0 : i) / 5))); }

  function shell() {
    root.innerHTML =
      '<div class="adv-tabs" role="tablist" aria-label="Game">' + GAMES.map(function (g) {
        return '<button type="button" class="adv-tab" role="tab" data-game="' + g.id + '" aria-selected="' + (g.id === current) + '">' + g.label + '</button>';
      }).join('') + '</div>' +
      '<div class="card adv-opts" id="adv-opts">' +
        '<div class="adv-opt-row"><span class="adv-opt-label">Show</span><div class="adv-seg" id="adv-size" role="group" aria-label="How many players">' + SIZES.map(function (n) {
          return '<button type="button" data-size="' + n + '" aria-pressed="' + (n === limit) + '">Top ' + n + '</button>';
        }).join('') + '</div></div>' +
        '<div class="adv-opt-row"><span class="adv-opt-label">Rank</span><div class="adv-seg adv-seg--wrap" id="adv-band" role="group" aria-label="Rank group">' + BANDS.map(function (x) {
          return '<button type="button" data-band="' + x.id + '" aria-pressed="' + (x.id === band) + '">' + (x.id === 'all' ? '' : '<i class="adv-dot adv-dot--' + x.id + '"></i>') + x.label + '</button>';
        }).join('') + '</div></div>' +
        '<div class="adv-opt-row adv-opt-row--find"><input type="search" id="adv-find" class="adv-find" placeholder="Find a nickname" maxlength="24" autocomplete="off" aria-label="Find a nickname">' +
        '<button type="button" class="adv-jump" id="adv-jump">Jump to me</button></div>' +
      '</div>' +
      '<div id="adv-board" class="stack-sm" aria-live="polite"></div>';
    tabsEl = root.querySelector('.adv-tabs');
    boardEl = document.getElementById('adv-board');
    ctlEl = document.getElementById('adv-opts');
    tabsEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-game]'); if (!b || b.dataset.game === current) return;
      current = b.dataset.game;
      Array.prototype.forEach.call(tabsEl.children, function (t) { t.setAttribute('aria-selected', String(t.dataset.game === current)); });
      loadBoard();
    });
    document.getElementById('adv-size').addEventListener('click', function (e) {
      var b = e.target.closest('[data-size]'); if (!b) return; var n = +b.dataset.size; if (n === limit) return;
      limit = n; markPressed('adv-size', 'size', String(n)); loadBoard();
    });
    document.getElementById('adv-band').addEventListener('click', function (e) {
      var b = e.target.closest('[data-band]'); if (!b) return; band = b.dataset.band; markPressed('adv-band', 'band', band); renderList();
    });
    document.getElementById('adv-find').addEventListener('input', function (e) { query = e.target.value.trim().toLowerCase(); renderList(); });
    document.getElementById('adv-jump').addEventListener('click', jumpToMe);
  }
  function markPressed(id, key, val) {
    Array.prototype.forEach.call(document.getElementById(id).children, function (b) { b.setAttribute('aria-pressed', String(b.dataset[key] === val)); });
  }
  function jumpToMe() {
    band = 'all'; query = ''; markPressed('adv-band', 'band', 'all'); var f = document.getElementById('adv-find'); if (f) f.value = '';
    renderList();
    var me = boardEl.querySelector('.adv-row--me');
    if (me) { me.scrollIntoView({ behavior: 'smooth', block: 'center' }); me.classList.add('adv-pulse'); setTimeout(function () { me.classList.remove('adv-pulse'); }, 1600); }
    else { var n = boardEl.querySelector('.adv-note--me'); if (n) n.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }

  function rowHtml(r) {
    return '<li class="adv-row' + (r.me ? ' adv-row--me' : '') + '">' +
      '<span class="adv-pos' + (r.position <= 3 ? ' adv-pos--' + r.position : '') + '">' + esc(r.position) + '</span>' +
      '<span class="adv-who"><span class="adv-nick">' + esc(r.nickname) + (r.me ? '<span class="adv-you">YOU</span>' : '') + '</span>' +
      '<span class="adv-rank" style="background:' + rankColor(r.rankName) + '">' + esc(r.rankName) + '</span></span>' +
      '<span class="adv-lvl"><small>Level</small>' + esc(r.level) + '</span></li>';
  }

  function renderList() {
    var d = lastData; if (!d) return;
    var rows = d.rows || [];
    var shown = rows.filter(function (r) {
      if (band !== 'all' && bandOf(r.rankName) !== +band) return false;
      if (query && String(r.nickname || '').toLowerCase().indexOf(query) < 0) return false;
      return true;
    });
    var inList = rows.some(function (r) { return r.me; });
    var filtered = band !== 'all' || query;
    listEl.innerHTML = shown.length
      ? '<ol class="adv-board">' + shown.map(rowHtml).join('') + '</ol>'
      : '<p class="adv-empty">No one matches this filter in the top ' + rows.length + '.</p>';
    var cnt = document.getElementById('adv-count');
    if (cnt) cnt.textContent = filtered ? 'Showing ' + shown.length + ' of ' + rows.length : 'Top ' + rows.length;
    var note = document.getElementById('adv-notice');
    if (note) note.innerHTML = inList ? '' : '<p class="adv-note adv-note--me">You are not in the top ' + rows.length + ' yet. Keep climbing, or choose Top 50 to look further.</p>';
  }

  function renderBoard(d) {
    lastData = d;
    var rows = (d && d.rows) || [];
    var game = GAMES.filter(function (g) { return g.id === current; })[0];
    if (!rows.length) {
      boardEl.innerHTML = '<div class="card adv-empty">' + 'No one is on the board yet. Play ' + esc(game.label) + ' and be the first!' + '</div>';
      return;
    }
    var mine = d.me || {};
    boardEl.innerHTML =
      '<div class="card adv-mine"><span class="muted">Your position</span><b>#' + esc(mine.position || '—') + '</b>' +
      '<span class="muted">Level ' + esc(mine.level || 1) + ' · ' + (d.track === 'middle' ? 'Classes 6–8' : 'Classes 9–12') + ' ladder</span></div>' +
      '<div class="card adv-listcard"><div class="adv-count" id="adv-count"></div><div id="adv-list"></div></div>' +
      '<div id="adv-notice"></div>' +
      '<p class="adv-note">Only game nicknames are shown, never real names. Everyone here is on the same class ladder as you.</p>';
    listEl = document.getElementById('adv-list');
    renderList();
  }

  function loadBoard() {
    boardEl.innerHTML = '<div class="skeleton skeleton--card"></div>';
    Api.request('game/leaderboard', { game: current, limit: limit }).then(renderBoard).catch(function (e) {
      var locked = e && (e.code === 'FORBIDDEN' || e.code === 'PLAN_REQUIRED');
      if (locked) { root.innerHTML = Plan.lockHtml('advRanks'); return; }
      boardEl.innerHTML = '<div class="card adv-empty"><p>' + esc((e && e.message) || 'Could not load the board.') + '</p>' +
        '<button type="button" class="btn btn--secondary btn--sm" id="adv-retry">Try again</button></div>';
      var b = document.getElementById('adv-retry'); if (b) b.addEventListener('click', loadBoard);
    });
  }

  Plan.get().then(function (plan) {
    if (!Plan.allows(plan, 'advRanks')) { root.innerHTML = Plan.lockHtml('advRanks'); return; }
    shell(); loadBoard();
  }).catch(function () { shell(); loadBoard(); });
})();
