/**
 * badges.js — W.H. Academy
 * The Badges page: a personal, motivational header based on the student's own
 * badge progress, their earned badges, and the class-scoped "Battle Bosses"
 * board (badges + rank only — never anyone's papers or marks).
 *
 * Data comes from the existing endpoints: bossbattle/myBadges (own, with
 * percents) and bossbattle/rankingBoard (class board, no percents).
 */
(function () {
  'use strict';

  const el = (id) => document.getElementById(id);
  const esc = (v) => (window.Utils && Utils.escapeHtml ? Utils.escapeHtml(v)
    : String(v == null ? '' : v).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));

  function badgeChip(b, withPercent) {
    const lvl = esc(b.level || '');
    const pct = (withPercent && b.percent != null) ? ' <em>' + esc(b.percent) + '%</em>' : '';
    return '<span class="bb-badge bb-badge--' + lvl.toLowerCase() + '" title="' + esc(b.label || '') + '">' +
      '<span class="bb-badge__lvl">' + lvl + '</span>' + esc(b.label || '') + pct + '</span>';
  }

  function medal(rank) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return '#' + rank;
  }

  // The motivational message is chosen from the student's OWN badge progress.
  function motivation(my) {
    const levels = {};
    (my.badges || []).forEach((b) => { levels[b.level] = true; });
    if (levels.L3) {
      return { emoji: '🏆', title: 'Champion!', text: 'You\u2019ve earned the L3 badge — the top prize. Outstanding work, keep it up!' };
    }
    if (levels.L1 && levels.L2) {
      return { emoji: '🔥', title: 'So close!', text: 'L1 and L2 done — the L3 badge is within reach. Finish strong across your subjects!' };
    }
    if (levels.L1) {
      return { emoji: '💪', title: 'Great start!', text: 'You\u2019ve earned L1 badge(s). Now aim for the L2 subject badge — keep going!' };
    }
    if (my.l3status === 'pending') {
      return { emoji: '⏳', title: 'Almost there!', text: 'Your L3 badge is pending — finish your remaining L3 papers to lock it in.' };
    }
    return { emoji: '🚀', title: 'You can do it!', text: 'No badges yet — score 50% or more on any boss paper to earn your first one. Keep working, you\u2019ve got this!' };
  }

  function render(my, board) {
    const m = motivation(my);
    const myBadges = (my.badges || []);
    const rows = (board.board || []);
    const cls = board.classLevel ? ('Class ' + board.classLevel) : 'your class';

    const banner =
      '<div class="bb-motivation">' +
        '<span class="bb-motivation__emoji" aria-hidden="true">' + m.emoji + '</span>' +
        '<div><div class="bb-motivation__title">' + esc(m.title) + '</div>' +
        '<p class="bb-motivation__text">' + esc(m.text) + '</p></div>' +
      '</div>';

    const ownStrip = myBadges.length
      ? '<div class="bb-own-badges"><span class="bb-mybadges__label">Your badges (' + myBadges.length + ')</span>' +
          myBadges.map((b) => badgeChip(b, true)).join('') + '</div>'
      : '';

    const boardRows = rows.length
      ? rows.map((row) =>
          '<div class="bb-rank-row' + (row.isYou ? ' bb-rank-row--you' : '') + '">' +
            '<span class="bb-rank-row__pos">' + medal(row.rank) + '</span>' +
            '<div class="bb-rank-row__main">' +
              '<div class="bb-rank-row__name">' + esc(row.studentName) + (row.isYou ? ' <span class="bb-you-tag">you</span>' : '') + '</div>' +
              '<div class="bb-rank-row__badges">' + (row.badges || []).map((b) => badgeChip(b, false)).join('') + '</div>' +
            '</div>' +
            '<span class="bb-rank-row__count">' + esc(row.badgeCount) + '</span>' +
          '</div>').join('')
      : '<p class="bb-muted-note" style="margin-top:var(--space-5);">No one in ' + esc(cls) + ' has a badge yet. Be the first!</p>';

    el('badges-root').innerHTML =
      '<div class="bb-board">' +
        banner +
        ownStrip +
        '<div class="bb-board__head" style="margin-top:var(--space-6);">' +
          '<h2 class="bb-board__title">🏆 Battle Bosses</h2>' +
          '<p class="bb-board__sub">Badge-holders in ' + esc(cls) + '. Badges only — no one sees anyone\u2019s papers.</p>' +
        '</div>' +
        '<div class="bb-board__list">' + boardRows + '</div>' +
      '</div>';
  }

  async function load() {
    try {
      const [my, board] = await Promise.all([
        Api.bossBattle.myBadges(),
        Api.bossBattle.rankingBoard().catch(() => ({ board: [] }))
      ]);
      render(my || { badges: [] }, board || { board: [] });
    } catch (err) {
      console.error('[badges] load failed:', err);
      el('badges-root').innerHTML =
        '<div class="bb-board"><p class="bb-muted-note" style="margin-top:var(--space-6);">Could not load your badges. Please refresh to try again.</p></div>';
    }
  }

  document.addEventListener('wha:ready', () => {
    if (Router.currentPageName() !== 'badges.html') return;
    load();
  });
})();
