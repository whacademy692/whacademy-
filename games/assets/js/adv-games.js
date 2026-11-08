/**
 * adv-games.js — W.H. Academy  (Advanced Games hub, Max plan)
 * Shows the student's nickname + Game Rank per game and opens Neon Racer.
 * Data: game/profile (server is the authority; it also refuses non-Max / non-6-12 students).
 * Does NOT touch the XP Ranks (leaderboard.html) — Game Rank / Game XP / coins are separate.
 */
(function () {
  'use strict';
  var root = document.getElementById('adv-content');
  if (!root) return;
  var esc = function (v) { return Utils.escapeHtml(String(v == null ? '' : v)); };

  var SVG = {
    car: '<svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="rbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a1b6e"/><stop offset="1" stop-color="#0a0e2c"/></linearGradient><radialGradient id="rsun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd166"/><stop offset="1" stop-color="#ff3fb4" stop-opacity="0"/></radialGradient></defs><rect width="64" height="64" rx="16" fill="url(#rbg)"/><circle cx="32" cy="17" r="13" fill="url(#rsun)"/><polygon points="32,15 6,62 58,62" fill="#1c2352"/><polygon points="32,15 32,62 14,62" fill="#232b63"/><path d="M32 18v6M32 28v7M32 40v9M32 53v9" stroke="#ffc83d" stroke-width="2" stroke-linecap="round"/><path d="M10 54 32 15M54 54 32 15" stroke="#19e6c1" stroke-width="1.4" opacity=".8" stroke-linecap="round"/><rect x="19" y="39" width="26" height="12" rx="4" fill="#ff3b5c"/><path d="M24 39l3-7h10l3 7z" fill="#c81d44"/><path d="M27.6 38l2-4.6h4.8l2 4.6z" fill="#0b1230"/><rect x="21" y="42" width="6" height="3" rx="1.2" fill="#ffe34d"/><rect x="37" y="42" width="6" height="3" rx="1.2" fill="#ffe34d"/><rect x="17" y="47" width="7" height="6" rx="2" fill="#070a1c"/><rect x="40" y="47" width="7" height="6" rx="2" fill="#070a1c"/><rect x="20" y="49" width="24" height="2" rx="1" fill="#8f1239"/></svg>',
    shield: '<svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="dbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#12507c"/><stop offset="1" stop-color="#061226"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#dbg)"/><path d="M9 52a23 23 0 0 1 46 0z" fill="#19e6c1" fill-opacity=".14" stroke="#19e6c1" stroke-width="1.8"/><rect x="12" y="51" width="40" height="7" rx="3" fill="#2b4478"/><rect x="22" y="53" width="20" height="2" rx="1" fill="#19e6c1" opacity=".8"/><g transform="rotate(28 32 46)"><rect x="29.4" y="22" width="5.2" height="24" rx="2" fill="#cfe0ff"/></g><circle cx="32" cy="48" r="6.5" fill="#8fb3ff"/><circle cx="32" cy="48" r="2.4" fill="#0b1a3a"/><path d="M42 26 49 17" stroke="#ffe34d" stroke-width="2.4" stroke-linecap="round"/><circle cx="50" cy="15" r="9" fill="none" stroke="#ffc83d" stroke-width="1.6" stroke-dasharray="3 3"/><ellipse cx="50" cy="15" rx="6" ry="3.4" fill="#ff4d6d"/><path d="M43 11h14" stroke="#e8f0ff" stroke-width="1.6" stroke-linecap="round"/><circle cx="50" cy="15.2" r="1.5" fill="#fff"/></svg>',
    coin: '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#ffc83d"/><circle cx="12" cy="12" r="5.6" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="1.6"/></svg>',
    bolt: '<svg width="22" height="22" viewBox="0 0 24 24" fill="#19e6c1" aria-hidden="true"><path d="M13.6 2 4.5 13.4a.6.6 0 0 0 .5 1h5.1l-1.2 7.4a.4.4 0 0 0 .7.3l9.4-11.7a.6.6 0 0 0-.5-1h-5.3l1.7-6.7a.4.4 0 0 0-.7-.4z"/></svg>'
  };

  var GAMES = [
    { id: 'racer',   icon: 'car', title: 'Neon Racer', desc: 'Drive down the road and pick the right answer gate. Wrong gate = crash and a lost heart.', href: 'advanced/racer/racer.html', live: true },
    { id: 'defense', icon: 'shield', title: 'Auto Defense', desc: 'Four drones attack your base. Aim your turrets at the drone carrying the right answer. Miss and the base takes the hit.', href: 'advanced/defense/defense.html', live: true }
  ];

  var RANK_NAMES = ['Spark','Ember','Glow','Pulse','Flux','Volt','Surge','Blaze','Storm','Vortex','Aura','Nebula','Eclipse','Phantom','Zenith','Titan','Cosmic','Quantum','Infinity','Omega'];
  var BAND_COLORS = ['#0d9488', '#7c3aed', '#c026d3', '#d97706'];
  var SKIN = { racer: 'speed', defense: 'core' };
  var badgeMod = null;

  // The proper rank shield comes from the game engine (ES module). If it cannot load, a plain shield is drawn instead.
  function loadBadge() {
    try { return import('../../advanced/engine/ui/badge.js').then(function (m) { badgeMod = m; }, function () { badgeMod = null; }); }
    catch (e) { return Promise.resolve(); }
  }
  function shield(gameId, rankName, size) {
    var i = RANK_NAMES.indexOf(rankName); if (i < 0) i = 0;
    if (badgeMod && badgeMod.badgeSVG) { try { return badgeMod.badgeSVG(i, { skin: SKIN[gameId] || 'speed', size: size, label: false }); } catch (e) { /* fall through */ } }
    var c = BAND_COLORS[Math.min(3, Math.floor(i / 5))];
    return '<svg viewBox="0 0 100 100" width="' + size + '" height="' + size + '" aria-hidden="true"><path d="M50 5 90 18v34C90 74 72 88 50 96 28 88 10 74 10 52V18z" fill="#11143a" stroke="' + c + '" stroke-width="4"/></svg>';
  }

  function lock(opts) { root.innerHTML = Plan.lockHtml('advGames', opts); }

  function gameCard(g, prog) {
    var rank = '';
    if (g.live && prog) {
      rank = prog.placementDone
        ? '<div class="adv-card__rank" style="--rk:' + BAND_COLORS[Math.min(3, Math.floor(RANK_NAMES.indexOf(prog.rankName) / 5))] + '">' + shield(g.id, prog.rankName, 48) + '<div><b>' + esc(prog.rankName) + '</b><small>Level ' + esc(prog.level) + (prog.runs ? ' · ' + esc(prog.runs) + ' runs' : '') + '</small></div></div>'
        : '<div class="adv-card__rank adv-card__rank--new">Not placed yet — your first run finds your level.</div>';
    }
    var act = g.live
      ? '<a class="btn btn--primary" href="' + g.href + '">' + (prog && prog.runs ? 'Play ' : 'Start ') + esc(g.title) + '</a>'
      : '<span class="adv-pill">Coming soon</span>';
    return '<article class="adv-card adv-card--' + g.id + (g.live ? '' : ' adv-soon') + '">' +
      '<div class="adv-card__head"><div class="adv-card__art" aria-hidden="true">' + SVG[g.icon] + '</div>' +
      '<div><h2 class="adv-card__title">' + esc(g.title) + '</h2><p class="adv-card__desc">' + esc(g.desc) + '</p></div></div>' +
      rank + act + '</article>';
  }

  function render(p) {
    root.innerHTML =
      '<section class="adv-hero"><div><div class="adv-hero__label">Your game name</div><div class="adv-hero__nick">' + esc(p.nickname || '—') + '</div>' +
      '<div class="adv-hero__meta">Class ' + esc(p.classLevel) + ' ladder (' + (p.track === 'middle' ? 'Classes 6–8' : 'Classes 9–12') + ')</div></div>' +
      '<div class="adv-stats"><div class="adv-stat">' + SVG.coin + '<div><b>' + esc(p.coins || 0) + '</b><span>Coins</span></div></div>' +
      '<div class="adv-stat">' + SVG.bolt + '<div><b>' + esc(p.gameXp || 0) + '</b><span>Game XP</span></div></div></div></section>' +
      '<div class="adv-games">' + GAMES.map(function (g) { return gameCard(g, p.games && p.games[g.id]); }).join('') + '</div>' +
      '<p class="adv-note">Game Rank, Game XP and coins here are separate from your normal XP and Ranks. ' +
      'Your Game Rank is shown to other students by your nickname only — never your real name. ' +
      '<a href="advanced-ranks.html">See the Advanced Ranks leaderboard</a>.</p>';
  }

  function fail(e) {
    var msg = (e && e.message) || 'Could not load. Please try again.';
    root.innerHTML = '<div class="adv-surface adv-empty"><p>' + esc(msg) + '</p><button type="button" class="btn btn--secondary btn--sm" id="adv-retry">Try again</button></div>';
    var b = document.getElementById('adv-retry'); if (b) b.addEventListener('click', load);
  }

  function load() {
    root.innerHTML = '<div class="skeleton skeleton--card"></div><div class="skeleton skeleton--card"></div>';
    Plan.get().then(function (plan) {
      if (!Plan.allows(plan, 'advGames')) { lock(); return; }
      return Api.request('game/profile', {}).then(function (p) {
        if (!p || !p.eligible) {
          if (p && p.reason === 'class') root.innerHTML = '<div class="adv-surface adv-empty"><h3>Advanced Games are for Class 6 to 12</h3><p>Your class is not in this range yet.</p></div>';
          else lock();
          return;
        }
        return loadBadge().then(function () { render(p); });
      });
    }).catch(fail);
  }
  load();
})();
