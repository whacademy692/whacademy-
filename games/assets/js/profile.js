/**
 * profile.js — W.H. Academy
 * Drives profile.html (analytics/achievements/certificates tabs) and
 * settings.html (preferences form).
 */

(function () {

  // Fills the identity hero (name, class, Student ID, Total XP, current streak)
  // from the dashboard payload, which already carries all of it. A cached copy
  // paints instantly; a fresh call then updates it.
  function fillIdentity(data) {
    if (!data) return;
    var profile = data.profile || {};
    var name = (profile.fullName || '').trim();
    var id = profile.studentId || (Storage.getStudentId && Storage.getStudentId()) || '';

    var nameEl = Utils.qs('#profile-name');
    if (nameEl) nameEl.textContent = name || 'Student';

    var avatarEl = Utils.qs('#profile-avatar');
    if (avatarEl) avatarEl.textContent = (name ? name.charAt(0) : (id ? id.charAt(0) : 'S')).toUpperCase();

    var codeEl = Utils.qs('#profile-code');
    if (codeEl) codeEl.textContent = id || '';

    var classEl = Utils.qs('#profile-class');
    if (classEl) {
      if (profile.classLevel) { classEl.textContent = 'Class ' + profile.classLevel; classEl.hidden = false; }
      else { classEl.hidden = true; }
    }

    var xpEl = Utils.qs('#hero-xp');
    if (xpEl && typeof data.xpTotal === 'number') xpEl.textContent = data.xpTotal.toLocaleString();

    var streakEl = Utils.qs('#hero-streak');
    var current = (data.streak && data.streak.currentStreak != null) ? data.streak.currentStreak : null;
    if (streakEl && current != null) streakEl.textContent = current;
  }

  async function loadIdentity() {
    var cached = (Storage.getCachedDashboard && Storage.getCachedDashboard()) || null;
    if (cached && cached.data) fillIdentity(cached.data);
    try {
      var data = await Api.dashboard.compose();
      fillIdentity(data);
    } catch (err) { /* keep cached/fallback values */ }
  }

  async function loadProfileAnalytics() {
    const [weekly, monthly, lifetime] = await Promise.all([
      Api.analytics.weekly(), Api.analytics.monthly(), Api.analytics.lifetime()
    ]);

    const weeklyEl = Utils.qs('#analytics-weekly');
    if (weeklyEl) {
      weeklyEl.querySelector('[data-field="accuracy"]').textContent = Utils.formatPercent(weekly.accuracy);
      weeklyEl.querySelector('[data-field="sessions"]').textContent = weekly.sessionCount;
    }
    const monthlyEl = Utils.qs('#analytics-monthly');
    if (monthlyEl) {
      monthlyEl.querySelector('[data-field="accuracy"]').textContent = Utils.formatPercent(monthly.accuracy);
      const deltaEl = monthlyEl.querySelector('[data-field="delta"]');
      const deltaPct = Utils.formatPercent(Math.abs(monthly.accuracyDelta));
      deltaEl.textContent = monthly.accuracyDelta >= 0 ? `+${deltaPct} this month` : `-${deltaPct} this month`;
      deltaEl.className = `badge ${monthly.accuracyDelta >= 0 ? 'badge--success' : 'badge--warning'}`;
    }
    const lifetimeEl = Utils.qs('#analytics-lifetime');
    if (lifetimeEl) {
      const xpCell = lifetimeEl.querySelector('[data-field="xp"]');
      if (xpCell) xpCell.textContent = lifetime.xpTotal.toLocaleString();
      const certCell = lifetimeEl.querySelector('[data-field="certificates"]');
      if (certCell) certCell.textContent = lifetime.certificateCount;
      const streakCell = lifetimeEl.querySelector('[data-field="streak"]');
      if (streakCell) streakCell.textContent = lifetime.longestStreak;
    }
  }

  async function loadAchievementsList() {
    const container = Utils.qs('#achievements-grid');
    if (!container) return;
    try {
      const data = await Api.achievements.list();
      container.innerHTML = '';
      if (!data.achievements || data.achievements.length === 0) {
        container.appendChild(Utils.createEl('div', { class: 'empty-state' }, [
          Utils.createEl('p', { class: 'empty-state__title', text: 'No achievements yet' }),
          Utils.createEl('p', { text: 'Keep learning — your first achievement is closer than you think.' })
        ]));
        return;
      }
      data.achievements.forEach((a) => {
        container.appendChild(Utils.createEl('div', { class: 'achievement-card' }, [
          Utils.createEl('div', { class: 'badge badge--info', text: a.category }),
          Utils.createEl('p', { class: 'achievement-card__title', text: a.achievementId.replace(/-/g, ' ') }),
          Utils.createEl('p', { class: 'text-caption', text: Utils.formatFriendlyDate(a.unlockedAt) })
        ]));
      });
    } catch (err) {
      Notifications.error('Could not load achievements.');
    }
  }

  async function loadCertificatesList() {
    const container = Utils.qs('#certificates-grid');
    if (!container) return;
    try {
      const data = await Api.certificates.list();
      container.innerHTML = '';
      if (!data.certificates || data.certificates.length === 0) {
        container.appendChild(Utils.createEl('div', { class: 'empty-state' }, [
          Utils.createEl('p', { class: 'empty-state__title', text: 'No certificates yet' }),
          Utils.createEl('p', { text: 'Finish a chapter to earn your first certificate.' })
        ]));
        return;
      }
      data.certificates.forEach((c) => {
        container.appendChild(Utils.createEl('div', { class: 'card' }, [
          Utils.createEl('p', { style: 'font-weight:700;', text: c.scopeRef.replace(/[/_]/g, ' ') }),
          Utils.createEl('p', { class: 'text-caption', text: `Issued ${Utils.formatFriendlyDate(c.issuedAt)}` })
        ]));
      });
    } catch (err) {
      Notifications.error('Could not load certificates.');
    }
  }

  function initSettingsPage() {
    const form = Utils.qs('#settings-form');
    if (!form) return;
    const settings = Storage.getSettings();

    form.theme.value = settings.theme;
    form.textSize.value = settings.textSize;
    form.soundEnabled.checked = settings.soundEnabled;
    if (form.easyReading) form.easyReading.checked = settings.easyReading;

    form.addEventListener('change', (e) => {
      const easyReading = form.easyReading ? form.easyReading.checked : false;
      Storage.setSettings({
        theme: form.theme.value,
        textSize: form.textSize.value,
        soundEnabled: form.soundEnabled.checked,
        easyReading: easyReading
      });

      const root = document.documentElement;
      root.setAttribute('data-text-size', form.textSize.value);
      root.setAttribute('data-theme', form.theme.value);
      if (easyReading) root.setAttribute('data-reading', 'easy');
      else root.removeAttribute('data-reading');

      // When sound is switched on, play a short confirmation so it's obvious
      // the setting is live.
      if (e.target === form.soundEnabled && form.soundEnabled.checked && window.Sound) {
        Sound.play('toggle');
      }
      Notifications.success('Settings saved.');
    });
  }

  document.addEventListener('wha:ready', () => {
    const page = Router.currentPageName();
    if (page === 'profile.html') {
      loadIdentity();
      loadProfileAnalytics().catch(() => Notifications.error('Could not load your analytics.'));
      loadAchievementsList();
      loadCertificatesList();
    }
    if (page === 'settings.html') initSettingsPage();
    if (page === 'achievements.html') { loadAchievementsList(); loadCertificatesList(); }
  });
})();
