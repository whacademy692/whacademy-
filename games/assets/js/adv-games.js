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

  var GAMES = [
    { id: 'racer',   icon: '🏎️', title: 'Neon Racer', desc: 'Steer through traffic — answer the MCQ at every gate. Wrong answer = lose a heart.', href: 'advanced/racer/racer.html', live: true },
    { id: 'defense', icon: '🛡️', title: 'Auto Defense', desc: 'Your tower fires only when you answer right. Hold the line for as many waves as you can.', href: '', live: false }
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
    return '<div class="card adv-game' + (g.live ? '' : ' adv-soon') + '">' +
      '<div class="adv-game__art" aria-hidden="true">' + g.icon + '</div>' +
      '<div class="adv-game__body"><h2 class="adv-game__title">' + esc(g.title) + '</h2><p class="adv-game__desc">' + esc(g.desc) + '</p>' + lvl + '</div>' +
      '<div class="adv-game__act">' + act + '</div></div>';
  }

  function render(p) {
    var best = p.games && p.games.racer;
    root.innerHTML =
      '<div class="card adv-me"><div><div class="adv-me__nick">' + esc(p.nickname || '—') + '</div>' +
      '<div class="adv-me__meta">Your game name · Class ' + esc(p.classLevel) + ' ladder (' + (p.track === 'middle' ? 'Classes 6–8' : 'Classes 9–12') + ')</div></div>' +
      '<div class="adv-stats"><div class="adv-stat"><b>' + esc(p.coins || 0) + '</b><span>Coins</span></div>' +
      '<div class="adv-stat"><b>' + esc(p.gameXp || 0) + '</b><span>Game XP</span></div></div></div>' +
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
