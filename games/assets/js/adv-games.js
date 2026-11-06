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
    car: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17H3.5a1 1 0 0 1-1-1v-3.4a2.6 2.6 0 0 1 .8-1.9L5.2 8.4A2 2 0 0 1 6.6 7.8h6.6a2 2 0 0 1 1.5.7L17 11h2.6a2 2 0 0 1 1.9 2v3a1 1 0 0 1-1 1H19"/><circle cx="7.5" cy="17" r="2.2"/><circle cx="16.5" cy="17" r="2.2"/><path d="M9.7 17h4.6M5 11h10"/></svg>',
    shield: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21.5s7.5-3.6 7.5-9.6V5.3L12 2.5 4.5 5.3v6.6c0 6 7.5 9.6 7.5 9.6z"/></svg>',
    coin: '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#ffc83d"/><circle cx="12" cy="12" r="5.6" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="1.6"/></svg>',
    bolt: '<svg width="22" height="22" viewBox="0 0 24 24" fill="#19e6c1" aria-hidden="true"><path d="M13.6 2 4.5 13.4a.6.6 0 0 0 .5 1h5.1l-1.2 7.4a.4.4 0 0 0 .7.3l9.4-11.7a.6.6 0 0 0-.5-1h-5.3l1.7-6.7a.4.4 0 0 0-.7-.4z"/></svg>'
  };

  var GAMES = [
    { id: 'racer',   icon: 'car', title: 'Neon Racer', desc: 'Drive down the road and pick the right answer gate. Wrong gate = crash and a lost heart.', href: 'advanced/racer/racer.html', live: true },
    { id: 'defense', icon: 'shield', title: 'Auto Defense', desc: 'Your tower fires only when you answer right. Hold the line for as many waves as you can.', href: '', live: false }
  ];

  function lock(opts) { root.innerHTML = Plan.lockHtml('advGames', opts); }

  function gameCard(g, prog) {
    var lvl = '';
    if (g.live && prog) {
      lvl = '<p class="adv-game__lvl">' + (prog.placementDone ? ('Level ' + esc(prog.level) + ' · ' + esc(prog.rankName)) : 'Not placed yet — your first run finds your level') + '</p>';
    }
    var act = g.live
      ? '<a class="btn btn--primary" href="' + g.href + '">' + (prog && prog.runs ? 'Play' : 'Start') + '</a>'
      : '<span class="adv-pill">Coming soon</span>';
    return '<div class="card adv-game adv-game--' + g.id + (g.live ? '' : ' adv-soon') + '">' +
      '<div class="adv-game__art" aria-hidden="true">' + SVG[g.icon] + '</div>' +
      '<div class="adv-game__body"><h2 class="adv-game__title">' + esc(g.title) + '</h2><p class="adv-game__desc">' + esc(g.desc) + '</p>' + lvl + '</div>' +
      '<div class="adv-game__act">' + act + '</div></div>';
  }

  function render(p) {
    var best = p.games && p.games.racer;
    root.innerHTML =
      '<div class="card adv-me"><div><div class="adv-me__nick">' + esc(p.nickname || '—') + '</div>' +
      '<div class="adv-me__meta">Your game name · Class ' + esc(p.classLevel) + ' ladder (' + (p.track === 'middle' ? 'Classes 6–8' : 'Classes 9–12') + ')</div></div>' +
      '<div class="adv-stats"><div class="adv-stat">' + SVG.coin + '<div><b>' + esc(p.coins || 0) + '</b><span>Coins</span></div></div>' +
      '<div class="adv-stat">' + SVG.bolt + '<div><b>' + esc(p.gameXp || 0) + '</b><span>Game XP</span></div></div></div></div>' +
      GAMES.map(function (g) { return gameCard(g, p.games && p.games[g.id]); }).join('') +
      '<p class="adv-note">Game Rank, Game XP and coins here are separate from your normal XP and Ranks. ' +
      'Your Game Rank is shown to other students by your nickname only — never your real name. ' +
      '<a href="advanced-ranks.html">See the Advanced Ranks leaderboard</a>.</p>';
    void best;
  }

  function fail(e) {
    var msg = (e && e.message) || 'Could not load. Please try again.';
    root.innerHTML = '<div class="card adv-empty"><p>' + esc(msg) + '</p><button type="button" class="btn btn--secondary btn--sm" id="adv-retry">Try again</button></div>';
    var b = document.getElementById('adv-retry'); if (b) b.addEventListener('click', load);
  }

  function load() {
    root.innerHTML = '<div class="skeleton skeleton--card"></div><div class="skeleton skeleton--card"></div>';
    Plan.get().then(function (plan) {
      if (!Plan.allows(plan, 'advGames')) { lock(); return; }
      return Api.request('game/profile', {}).then(function (p) {
        if (!p || !p.eligible) {
          if (p && p.reason === 'class') root.innerHTML = '<div class="card adv-empty"><h3>Advanced Games are for Class 6 to 12</h3><p>Your class is not in this range yet.</p></div>';
          else lock();
          return;
        }
        render(p);
      });
    }).catch(fail);
  }
  load();
})();
