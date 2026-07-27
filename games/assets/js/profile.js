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

    form.addEventListener('change', () => {
      Storage.setSettings({
        theme: form.theme.value,
        textSize: form.textSize.value
      });
      const root = document.documentElement;
      root.setAttribute('data-text-size', form.textSize.value);
      root.setAttribute('data-theme', form.theme.value);
      Notifications.success('Settings saved.');
    });
  }

  function initChangePin() {
    const form = Utils.qs('#change-pin-form');
    if (!form) return;
    const step1 = Utils.qs('#pin-step-1');
    const step2 = Utils.qs('#pin-step-2');
    const sendBtn = Utils.qs('#pin-send-code-btn');
    const changeBtn = Utils.qs('#pin-change-btn');
    const note = Utils.qs('#pin-code-note');

    // Step 1 — verify the current PIN, which triggers an emailed code.
    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        const currentPin = form.currentPin.value;
        if (!currentPin) { Notifications.error('Please enter your current PIN.'); return; }
        sendBtn.disabled = true;
        Api.auth.requestPinChange(currentPin)
          .then((res) => {
            if (res && res.success === false) {
              Notifications.error(res.errorMessage || 'Could not send the code.');
              return;
            }
            if (note) {
              note.textContent = (res && res.sentTo)
                ? ('We emailed a code to ' + res.sentTo + '. Enter it below with your new PIN.')
                : 'We emailed you a code. Enter it below with your new PIN.';
            }
            if (step1) step1.hidden = true;
            if (step2) step2.hidden = false;
            Notifications.success('Verification code sent.');
          })
          .catch((err) => {
            Notifications.error((err && err.message) ? err.message : 'Could not send the code.');
          })
          .finally(() => { sendBtn.disabled = false; });
      });
    }

    // Step 2 — enter the code + the new PIN.
    if (changeBtn) {
      changeBtn.addEventListener('click', () => {
        const otpCode = form.otpCode.value;
        const newPin = form.newPin.value;
        const confirmPin = form.confirmPin.value;
        if (!otpCode || !newPin || !confirmPin) {
          Notifications.error('Please fill in the code and both new-PIN fields.');
          return;
        }
        if (newPin !== confirmPin) {
          Notifications.error('New PIN and confirmation do not match.');
          return;
        }
        changeBtn.disabled = true;
        Api.auth.confirmPinChange(otpCode, newPin, confirmPin)
          .then((res) => {
            if (res && res.success === false) {
              Notifications.error(res.errorMessage || 'Could not change your PIN.');
              return;
            }
            Notifications.success('Your PIN has been changed.');
            form.reset();
            if (step2) step2.hidden = true;
            if (step1) step1.hidden = false;
          })
          .catch((err) => {
            Notifications.error((err && err.message) ? err.message : 'Could not change your PIN.');
          })
          .finally(() => { changeBtn.disabled = false; });
      });
    }
  }

  document.addEventListener('wha:ready', () => {
    const page = Router.currentPageName();
    if (page === 'profile.html') {
      loadIdentity();
      loadProfileAnalytics().catch(() => Notifications.error('Could not load your analytics.'));
      loadAchievementsList();
      loadCertificatesList();
    }
    if (page === 'settings.html') { initSettingsPage(); initChangePin(); }
    if (page === 'achievements.html') { loadAchievementsList(); loadCertificatesList(); }
  });
})();
