/**
 * leaderboard.js — W.H. Academy
 * Local-scope leaderboard only (Dashboard doc §32) — ranks whichever
 * profiles share this device, or shows a "Your Best" personal view
 * when only one profile exists. Never a fabricated ranking.
 */

(function () {

  function renderPersonalBest(entry) {
    const container = Utils.qs('#leaderboard-content');
    container.innerHTML = '';
    container.appendChild(Utils.createEl('div', { class: 'card--stat card' }, [
      Utils.createEl('p', { class: 'card--stat__label', text: 'Your Best' }),
      Utils.createEl('span', { class: 'card--stat__value', text: entry.xpTotal.toLocaleString() }),
      Utils.createEl('p', { class: 'text-body-sm', text: 'Total XP earned' })
    ]));
  }

  function renderLocalBoard(entries) {
    const container = Utils.qs('#leaderboard-content');
    container.innerHTML = '';
    const list = Utils.createEl('div', { class: 'stack-sm' });
    entries.forEach((entry, index) => {
      list.appendChild(Utils.createEl('div', { class: 'card cluster', style: 'justify-content:space-between;' }, [
        Utils.createEl('span', { class: 'cluster' }, [
          Utils.createEl('span', { class: 'badge badge--neutral', text: `#${index + 1}` }),
          Utils.createEl('span', { text: entry.displayName })
        ]),
        Utils.createEl('span', { style: 'font-weight:700;', text: `${entry.xpTotal.toLocaleString()} XP` })
      ]));
    });
    container.appendChild(list);
  }

  async function loadLeaderboard() {
    try {
      const knownProfiles = Storage.get('known_device_profiles', [Storage.getStudentId()]).filter(Boolean);
      if (knownProfiles.length <= 1) {
        const data = await Api.leaderboard.personalBest();
        renderPersonalBest(data);
      } else {
        const data = await Api.leaderboard.local(knownProfiles);
        renderLocalBoard(data.leaderboard);
      }
    } catch (err) {
      Notifications.error('Could not load the leaderboard.');
    }
  }

  document.addEventListener('wha:ready', () => {
    if (Router.currentPageName() !== 'leaderboard.html') return;
    loadLeaderboard();
  });
})();
