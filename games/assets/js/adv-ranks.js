/**
 * adv-ranks.js — W.H. Academy  (Advanced Ranks, Max plan)
 * The Game Rank leaderboard of the Advanced Games, same class band, NICKNAMES ONLY.
 * One "Game" dropdown: All games, or a single game. Each name carries the rank shield (the per-rank SVG badge)
 * of the game it was earned in: Neon Racer = chrome "speed" shield, Auto Defense = "core" hexagon.
 *   All          -> every game's shield next to the name (both boards merged by nickname)
 *   single game  -> only that game's shield
 * Completely separate from leaderboard.js (the XP Ranks page for the basic games / all plans).
 * Data: game/leaderboard {game, limit} -> { track, rows:[{position,nickname,level,rankName,me}], me:{position,level} }.
 */
(function () {
  'use strict';
  var root = document.getElementById('adv-content');
  if (!root) return;
  var esc = function (v) { return Utils.escapeHtml(String(v == null ? '' : v)); };

  var RANK_NAMES = ['Spark','Ember','Glow','Pulse','Flux','Volt','Surge','Blaze','Storm','Vortex','Aura','Nebula','Eclipse','Phantom','Zenith','Titan','Cosmic','Quantum','Infinity','Omega'];
  var BAND_COLORS = ['#0d9488', '#7c3aed', '#c026d3', '#d97706'];
  var GAMES = [{ id: 'racer', label: 'Neon Racer', skin: 'speed' }, { id: 'defense', label: 'Auto Defense', skin: 'core' }];
  var BANDS = [{ id: 'all', label: 'All ranks' }, { id: '0', label: 'Spark – Flux' }, { id: '1', label: 'Volt – Vortex' }, { id: '2', label: 'Aura – Zenith' }, { id: '3', label: 'Titan – Omega' }];
  var SIZES = [10, 20, 50];

  var game = 'all', limit = 20, band = 'all', query = '';
  var boards = null;            // { racer: data, defense: data } for the games currently shown
  var badgeMod = null;
  var boardEl, listEl;

  function idxOf(name) { var i = RANK_NAMES.indexOf(name); return i < 0 ? 0 : i; }
  function bandOf(name) { return Math.min(3, Math.floor(idxOf(name) / 5)); }
  function gameById(id) { return GAMES.filter(function (g) { return g.id === id; })[0]; }

  // Proper rank shield from the game engine (ES module). Plain shield if it cannot load.
  function loadBadge() {
    try { return import('../../advanced/engine/ui/badge.js').then(function (m) { badgeMod = m; }, function () { badgeMod = null; }); }
    catch (e) { return Promise.resolve(); }
  }
  function shield(g, rankName, size) {
    var i = idxOf(rankName);
    if (badgeMod && badgeMod.badgeSVG) { try { return badgeMod.badgeSVG(i, { skin: g.skin, size: size, label: false }); } catch (e) { /* fall through */ } }
    var c = BAND_COLORS[bandOf(rankName)];
    return '<svg viewBox="0 0 100 100" width="' + size + '" height="' + size + '" aria-hidden="true"><path d="M50 5 90 18v34C90 74 72 88 50 96 28 88 10 74 10 52V18z" fill="#11143a" stroke="' + c + '" stroke-width="4"/></svg>';
  }

  function selectHtml(id, label, opts, cur) {
    return '<label class="adv-tf"><span>' + label + '</span><select class="select" id="' + id + '">' + opts.map(function (o) {
      return '<option value="' + esc(o.v) + '"' + (String(o.v) === String(cur) ? ' selected' : '') + '>' + esc(o.t) + '</option>';
    }).join('') + '</select></label>';
  }

  function shell() {
    root.innerHTML =
      '<div class="adv-toolbar">' +
        selectHtml('adv-game', 'Game', [{ v: 'all', t: 'All games' }].concat(GAMES.map(function (g) { return { v: g.id, t: g.label }; })), game) +
        selectHtml('adv-size', 'Show', SIZES.map(function (n) { return { v: n, t: 'Top ' + n }; }), limit) +
        selectHtml('adv-band', 'Rank group', BANDS.map(function (b) { return { v: b.id, t: b.label }; }), band) +
        '<label class="adv-tf adv-tf--find"><span>Find a player</span><input type="search" id="adv-find" class="input" placeholder="Nickname" maxlength="24" autocomplete="off"></label>' +
        '<button type="button" class="btn btn--secondary" id="adv-jump">Jump to me</button>' +
      '</div>' +
      '<div id="adv-board" class="adv-stage" aria-live="polite"></div>';
    boardEl = document.getElementById('adv-board');
    document.getElementById('adv-game').addEventListener('change', function (e) { game = e.target.value; loadBoard(); });
    document.getElementById('adv-size').addEventListener('change', function (e) { limit = +e.target.value; loadBoard(); });
    document.getElementById('adv-band').addEventListener('change', function (e) { band = e.target.value; renderList(); });
    document.getElementById('adv-find').addEventListener('input', function (e) { query = e.target.value.trim().toLowerCase(); renderList(); });
    document.getElementById('adv-jump').addEventListener('click', jumpToMe);
  }

  function jumpToMe() {
    band = 'all'; query = '';
    var b = document.getElementById('adv-band'); if (b) b.value = 'all';
    var f = document.getElementById('adv-find'); if (f) f.value = '';
    renderList();
    var me = boardEl.querySelector('.adv-row--me');
    if (me) { me.scrollIntoView({ behavior: 'smooth', block: 'center' }); me.classList.add('adv-pulse'); setTimeout(function () { me.classList.remove('adv-pulse'); }, 1600); }
    else { var n = boardEl.querySelector('.adv-note--me'); if (n) n.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }

  // One list of players. Each player: { nickname, me, skins:[{game, level, rankName}], best, sum }.
  function buildPlayers() {
    if (game === 'all') {
      // the server sends one list; each player already carries every game's rank
      var ad = boards && boards.all;
      return ((ad && ad.rows) || []).map(function (r) {
        return { nickname: r.nickname, me: !!r.me, position: r.position, skins: (r.skins || []).map(function (k) {
          return { game: gameById(k.game) || GAMES[0], level: +k.level || 0, rankName: k.rankName };
        }) };
      });
    }
    var by = {}, order = [];
    GAMES.forEach(function (g) {
      var d = boards && boards[g.id]; if (!d) return;
      (d.rows || []).forEach(function (r) {
        var key = String(r.nickname || '').toLowerCase();
        var p = by[key];
        if (!p) { p = by[key] = { nickname: r.nickname, me: false, skins: [], best: 0, sum: 0 }; order.push(p); }
        if (r.me) p.me = true;
        p.skins.push({ game: g, level: +r.level || 0, rankName: r.rankName });
        p.best = Math.max(p.best, +r.level || 0); p.sum += (+r.level || 0);
      });
    });
    {
      // single game: keep the server's order and positions
      var d = boards[game];
      var pos = {}; ((d && d.rows) || []).forEach(function (r) { pos[String(r.nickname || '').toLowerCase()] = r.position; });
      order.forEach(function (p) { p.position = pos[String(p.nickname || '').toLowerCase()]; });
      order.sort(function (a, b) { return a.position - b.position; });
    }
    return order;
  }

  function rowHtml(p) {
    var multi = game === 'all';
    var skins = p.skins.map(function (s) {
      return '<span class="adv-skin" title="' + esc(s.game.label) + '">' + shield(s.game, s.rankName, 34) +
        '<span><b>' + esc(s.rankName) + '</b><small>Level ' + esc(s.level) + (multi ? ' · ' + esc(s.game.label) : '') + '</small></span></span>';
    }).join('');
    return '<li class="adv-row' + (p.me ? ' adv-row--me' : '') + '">' +
      '<span class="adv-pos' + (p.position <= 3 ? ' adv-pos--' + p.position : '') + '">' + esc(p.position) + '</span>' +
      '<span class="adv-nick">' + esc(p.nickname) + (p.me ? '<span class="adv-you">YOU</span>' : '') + '</span>' +
      '<span class="adv-skins">' + skins + '</span></li>';
  }

  function renderList() {
    if (!listEl) return;
    var all = buildPlayers();
    var shown = all.filter(function (p) {
      if (band !== 'all' && !p.skins.some(function (s) { return bandOf(s.rankName) === +band; })) return false;
      if (query && String(p.nickname || '').toLowerCase().indexOf(query) < 0) return false;
      return true;
    });
    var inList = all.some(function (p) { return p.me; });
    var filtered = band !== 'all' || query;
    listEl.innerHTML = shown.length
      ? '<ol class="adv-board">' + shown.map(rowHtml).join('') + '</ol>'
      : '<p class="adv-empty">No one matches this filter in the top ' + all.length + '.</p>';
    var cnt = document.getElementById('adv-count');
    if (cnt) cnt.innerHTML = '<span>' + (game === 'all' ? 'All games' : esc(gameById(game).label)) + '</span><span>' +
      (filtered ? 'Showing ' + shown.length + ' of ' + all.length : 'Top ' + all.length) + '</span>';
    var note = document.getElementById('adv-notice');
    if (note) note.innerHTML = inList ? '' : '<p class="adv-note adv-note--me">You are not in the top ' + limit + ' yet. Keep climbing, or choose Top 50 to look further.</p>';
  }

  function mineChips() {
    var show = game === 'all' ? GAMES : [gameById(game)];
    return '<div class="adv-mine">' + show.map(function (g) {
      var d = game === 'all' ? (boards.all || {}) : (boards[g.id] || {});
      var m = game === 'all' ? ((d.me && d.me.games && d.me.games[g.id]) || {}) : (d.me || {});
      return '<div class="adv-mine__chip"><span class="adv-mine__pos">#' + esc(m.position || '—') + '</span><span class="adv-mine__txt"><b>' + esc(g.label) + '</b><small>Level ' + esc(m.level || 1) + ' · ' +
        (d.track === 'middle' ? 'Classes 6–8' : 'Classes 9–12') + ' ladder</small></span></div>';
    }).join('') + '</div>';
  }

  function renderBoard() {
    var empty = !(boards[game] && (boards[game].rows || []).length);
    if (empty) {
      boardEl.innerHTML = '<div class="adv-surface adv-empty">No one is on the board yet. Play ' + (game === 'all' ? 'a game' : esc(gameById(game).label)) + ' and be the first!</div>';
      listEl = null; return;
    }
    boardEl.innerHTML = mineChips() +
      '<div class="adv-boardcard"><div class="adv-count" id="adv-count"></div><div id="adv-list"></div></div>' +
      '<div id="adv-notice"></div>' +
      '<p class="adv-note">Only game nicknames are shown, never real names. Everyone here is on the same class ladder as you.' +
      '</p>';
    listEl = document.getElementById('adv-list');
    renderList();
  }

  var token = 0;
  function loadBoard() {
    var my = ++token;
    boardEl.innerHTML = '<div class="skeleton skeleton--card"></div>';
    var ids = [game];
    Promise.all([loadBadge()].concat(ids.map(function (id) { return Api.request('game/leaderboard', { game: id, limit: limit }); }))).then(function (res) {
      if (my !== token) return;
      boards = {}; ids.forEach(function (id, i) { boards[id] = res[i + 1]; });
      renderBoard();
    }).catch(function (e) {
      if (my !== token) return;
      var locked = e && (e.code === 'FORBIDDEN' || e.code === 'PLAN_REQUIRED');
      if (locked) { root.innerHTML = Plan.lockHtml('advRanks'); return; }
      boardEl.innerHTML = '<div class="adv-surface adv-empty"><p>' + esc((e && e.message) || 'Could not load the board.') + '</p>' +
        '<button type="button" class="btn btn--secondary btn--sm" id="adv-retry">Try again</button></div>';
      var b = document.getElementById('adv-retry'); if (b) b.addEventListener('click', loadBoard);
    });
  }

  Plan.get().then(function (plan) {
    if (!Plan.allows(plan, 'advRanks')) { root.innerHTML = Plan.lockHtml('advRanks'); return; }
    shell(); loadBoard();
  }).catch(function () { shell(); loadBoard(); });
})();
