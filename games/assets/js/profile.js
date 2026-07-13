/**
 * profile.js — W.H. Academy
 * Drives profile.html (analytics/achievements/certificates tabs) and
 * settings.html (preferences form).
 */

(function () {

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
      lifetimeEl.querySelector('[data-field="xp"]').textContent = lifetime.xpTotal.toLocaleString();
      lifetimeEl.querySelector('[data-field="certificates"]').textContent = lifetime.certificateCount;
      lifetimeEl.querySelector('[data-field="streak"]').textContent = lifetime.longestStreak;
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
    form.motionReduced.checked = settings.motionReduced;
    form.soundEnabled.checked = settings.soundEnabled;
    form.teacherModeEnabled.checked = settings.teacherModeEnabled;

    form.addEventListener('change', () => {
      Storage.setSettings({
        theme: form.theme.value,
        textSize: form.textSize.value,
        motionReduced: form.motionReduced.checked,
        soundEnabled: form.soundEnabled.checked,
        teacherModeEnabled: form.teacherModeEnabled.checked
      });
      document.documentElement.setAttribute('data-text-size', form.textSize.value);
      document.documentElement.setAttribute('data-theme', form.theme.value === 'dark' ? 'dark' : 'light');
      Notifications.success('Settings saved.');
    });

    const exportBtn = Utils.qs('#export-progress-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const cached = Storage.getCachedDashboard();
        const blob = new Blob([JSON.stringify(cached, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = Utils.createEl('a', { href: url, download: 'wha-progress-export.json' });
        a.click();
        URL.revokeObjectURL(url);
        Notifications.success('Your progress export has downloaded.');
      });
    }
  }

  document.addEventListener('wha:ready', () => {
    const page = Router.currentPageName();
    if (page === 'profile.html') {
      loadProfileAnalytics().catch(() => Notifications.error('Could not load your analytics.'));
      loadAchievementsList();
      loadCertificatesList();
    }
    if (page === 'settings.html') initSettingsPage();
    if (page === 'achievements.html') { loadAchievementsList(); loadCertificatesList(); }
  });
})();
