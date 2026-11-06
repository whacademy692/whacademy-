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

  var GAMES = [{ id: 'racer', label: '🏎️ Neon Racer' }, { id: 'defense', label: '🛡️ Auto Defense' }];
  var current = 'racer';
  var tabsEl, boardEl;

  function shell() {
    root.innerHTML =
      '<div class="adv-tabs" role="tablist" aria-label="Game">' + GAMES.map(function (g) {
        return '<button type="button" class="adv-tab" role="tab" data-game="' + g.id + '" aria-selected="' + (g.id === current) + '">' + g.label + '</button>';
      }).join('') + '</div><div id="adv-board" class="stack-sm" aria-live="polite"></div>';
    tabsEl = root.querySelector('.adv-tabs');
    boardEl = document.getElementById('adv-board');
    tabsEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-game]'); if (!b || b.dataset.game === current) return;
      current = b.dataset.game;
      Array.prototype.forEach.call(tabsEl.children, function (t) { t.setAttribute('aria-selected', String(t.dataset.game === current)); });
      loadBoard();
    });
  }

  function renderBoard(d) {
    var rows = (d && d.rows) || [];
    var game = GAMES.filter(function (g) { return g.id === current; })[0];
    if (!rows.length) {
      boardEl.innerHTML = '<div class="card adv-empty">' + (current === 'defense'
        ? 'Auto Defense is coming soon — the board opens when the game does.'
        : 'No one is on the board yet. Play ' + esc(game.label.replace(/^\S+\s/, '')) + ' and be the first!') + '</div>';
      return;
    }
    var mine = d.me || {};
    var inList = rows.some(function (r) { return r.me; });
    boardEl.innerHTML =
      '<div class="card adv-mine"><span class="muted">Your position</span><b>#' + esc(mine.position || '—') + '</b>' +
      '<span class="muted">Level ' + esc(mine.level || 1) + ' · ' + (d.track === 'middle' ? 'Classes 6–8' : 'Classes 9–12') + ' ladder</span></div>' +
      '<div class="card"><ol class="adv-board">' + rows.map(function (r) {
        return '<li class="adv-row' + (r.me ? ' adv-row--me' : '') + '">' +
          '<span class="adv-pos">' + esc(r.position) + '</span>' +
          '<span class="adv-nick">' + esc(r.nickname) + (r.me ? '<span class="adv-you">YOU</span>' : '') + '</span>' +
          '<span class="adv-rank" style="background:' + rankColor(r.rankName) + '">' + esc(r.rankName) + '</span>' +
          '<span class="adv-lvl">Lv ' + esc(r.level) + '</span></li>';
      }).join('') + '</ol></div>' +
      (inList ? '' : '<p class="adv-note">You are not in the top ' + rows.length + ' yet — keep climbing.</p>') +
      '<p class="adv-note">Only game nicknames are shown, never real names. Everyone here is on the same class ladder as you.</p>';
  }

  function loadBoard() {
    boardEl.innerHTML = '<div class="skeleton skeleton--card"></div>';
    Api.request('game/leaderboard', { game: current, limit: 20 }).then(renderBoard).catch(function (e) {
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
