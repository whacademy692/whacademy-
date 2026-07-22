/**
 * ============================================================================
 * admin.js — drives admin.html
 * ----------------------------------------------------------------------------
 * Rehan's own console. The point of it is that day-to-day work never requires
 * opening the Google Sheet.
 *
 * THE MODEL, stated once so it is not forgotten: this panel is a LAYER OVER the
 * enrollment sheet, not a replacement for it. Setting a status here writes the
 * same word into the same cell that typing it by hand would. Nothing downstream
 * is told the panel did it — Enrollment.gs, StudentID.gs and Auth.gs all read
 * the cell they always read. Editing the sheet directly keeps working
 * identically, and stays available whenever the panel is not.
 *
 * SESSION: the admin token lives in its own storage slot
 * (Storage.getAdminToken), never in session_token — see storage.js.
 *
 * NOT HERE YET (agreed next stage): OTP on a new device, the device list, and
 * remote sign-out. Until then a leaked admin password is enough on its own, so
 * the URL is worth keeping to yourself.
 * ============================================================================
 */

/** @namespace Admin */
const Admin = (() => {

  /** Rows currently on screen, so an action can find its student again. */
  let currentResults = [];
  /** The row the status dialog is currently about. */
  let pendingRow = null;

  const STATUSES = ['Active', 'Pending', 'Suspended', 'Expired'];

  // ---------------------------------------------------------------- helpers

  function setButtonLoading(button, isLoading) {
    if (!button) return;
    button.disabled = isLoading;
    button.setAttribute('aria-busy', isLoading ? 'true' : 'false');
  }

  /**
   * Every value below comes from a Google Sheet that people type into by hand,
   * so it is treated as untrusted text and never as markup.
   */
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function normalizeStatus(status) {
    const raw = String(status || '').trim();
    // Statuses are read case-insensitively and trimmed everywhere in the
    // backend, so a hand-typed "active " must display as Active here too.
    const match = STATUSES.find((s) => s.toLowerCase() === raw.toLowerCase());
    return match || (raw ? raw : 'Pending');
  }

  function statusBadgeClass(status) {
    switch (normalizeStatus(status)) {
      case 'Active': return 'badge--success';
      case 'Suspended': return 'badge--error';
      case 'Expired': return 'badge--neutral';
      default: return 'badge--warning';
    }
  }

  function endAdminSession(message) {
    Storage.clearAdminToken();
    currentResults = [];
    const results = Utils.qs('#admin-results');
    if (results) results.innerHTML = '';
    const stats = Utils.qs('#admin-stats');
    if (stats) stats.innerHTML = '';
    Router.showStep('admin-signin');
    if (message) Notifications.error(message);
  }

  /** True when the error means the admin session is no longer good. */
  function isAuthError(err) {
    const code = err && err.code;
    return code === 'AUTH_001' || code === 'AUTH_002' || code === 'AUTH_003' || code === 'AUTH_004';
  }

  function handleApiError(err, fallbackMessage) {
    if (isAuthError(err)) {
      endAdminSession('Your admin session has ended. Please sign in again.');
      return;
    }
    Notifications.error((err && err.message) || fallbackMessage);
  }

  // ------------------------------------------------------------- rendering

  function renderStats(stats) {
    const host = Utils.qs('#admin-stats');
    if (!host) return;
    if (!stats) { host.innerHTML = ''; return; }

    const byStatus = stats.byStatus || {};
    const byClass = stats.byClassLevel || {};

    const tile = (value, label) =>
      `<div class="admin-tile"><span class="admin-tile__value">${escapeHtml(value)}</span>` +
      `<span class="admin-tile__label">${escapeHtml(label)}</span></div>`;

    const statusTiles = Object.keys(byStatus).sort()
      .map((status) => tile(byStatus[status], status)).join('');

    const classRows = Object.keys(byClass).sort()
      .map((level) =>
        `<li class="admin-bar"><span class="admin-bar__label">Class ${escapeHtml(level)}</span>` +
        `<span class="admin-bar__value">${escapeHtml(byClass[level])}</span></li>`).join('');

    host.innerHTML =
      `<div class="admin-tiles">${tile(stats.totalEnrollments || 0, 'Total enrolled')}${statusTiles}</div>` +
      (classRows ? `<div class="admin-panel"><h2 class="admin-panel__title">By class</h2><ul class="admin-bars">${classRows}</ul></div>` : '');
  }

  function renderResults(results, query) {
    const host = Utils.qs('#admin-results');
    currentResults = Array.isArray(results) ? results : [];

    if (!currentResults.length) {
      host.innerHTML =
        '<div class="empty-state">' +
        '<h2 class="empty-state__title">No students matched</h2>' +
        (query
          ? `<p class="admin-muted">Nothing found for &ldquo;${escapeHtml(query)}&rdquo;. Try part of a name, an email, or a Student ID.</p>`
          : '<p class="admin-muted">There are no enrollment rows yet.</p>') +
        '</div>';
      return;
    }

    const rows = currentResults.map((student) => {
      const studentId = String(student.studentId || '').trim();
      const status = normalizeStatus(student.status);
      // The row is addressed by Student ID when it has one, and by enrollment
      // ID when it does not — a row awaiting activation has no Student ID yet.
      const rowKey = studentId || String(student.enrollmentId || '');

      // Only meaningful once an ID exists: before that, "no account" is simply
      // where everyone starts and says nothing worth flagging.
      const accountCell = !studentId
        ? '<span class="admin-muted">—</span>'
        : student.hasAccount
          ? '<span class="admin-dot admin-dot--ok">Registered</span>'
          : '<span class="admin-dot admin-dot--warn">No account yet</span>';

      return (
        '<tr>' +
        `<td><div class="admin-name">${escapeHtml(student.fullName || '—')}</div>` +
        `<div class="admin-sub">${escapeHtml(student.email || '')}</div></td>` +
        `<td class="admin-id">${studentId ? escapeHtml(studentId) : '<span class="admin-muted">not issued</span>'}</td>` +
        `<td>${escapeHtml(student.enrolledScope || '—')}</td>` +
        `<td>${accountCell}</td>` +
        `<td><span class="badge ${statusBadgeClass(status)}">${escapeHtml(status)}</span></td>` +
        `<td class="admin-actions">` +
        `<button class="btn btn--secondary btn--sm" data-action="status" data-key="${escapeHtml(rowKey)}">Change status</button>` +
        '</td></tr>'
      );
    }).join('');

    host.innerHTML =
      '<div class="admin-table-wrap"><table class="data-table admin-table">' +
      '<thead><tr><th>Student</th><th>Student ID</th><th>Scope</th><th>Account</th><th>Status</th><th></th></tr></thead>' +
      `<tbody>${rows}</tbody></table></div>` +
      `<p class="admin-count admin-muted">${currentResults.length} shown</p>`;
  }

  // --------------------------------------------------------------- actions

  async function loadStats() {
    try {
      renderStats(await Api.admin.statistics());
    } catch (err) {
      // Counts are a nicety; the console stays usable without them. An auth
      // failure still ends the session.
      if (isAuthError(err)) handleApiError(err);
    }
  }

  async function runSearch(query, submitBtn) {
    setButtonLoading(submitBtn, true);
    try {
      const data = await Api.admin.searchStudents(query);
      renderResults((data && data.results) || [], query);
    } catch (err) {
      handleApiError(err, 'Could not load students. Please try again.');
    } finally {
      setButtonLoading(submitBtn, false);
    }
  }

  function refreshCurrentSearch() {
    const input = Utils.qs('#admin-query');
    return runSearch(input ? input.value.trim() : '', null);
  }

  async function handleSearchSubmit(event) {
    event.preventDefault();
    const form = event.target;
    await runSearch(form.query.value.trim(), form.querySelector('[type="submit"]'));
  }

  function openStatusDialog(rowKey) {
    const student = currentResults.find((s) =>
      String(s.studentId || '').trim() === rowKey || String(s.enrollmentId || '') === rowKey);
    if (!student) return;

    pendingRow = rowKey;
    const studentId = String(student.studentId || '').trim();

    Utils.qs('#status-student-name').textContent = student.fullName || rowKey;
    Utils.qs('#status-student-id').textContent = studentId || 'Student ID not issued yet';
    Utils.qs('#status-reason').value = '';

    // Pre-select where the student actually is, so the dialog opens showing the
    // truth rather than an empty choice.
    const current = normalizeStatus(student.status);
    Utils.qsa('#status-form input[name="status"]').forEach((radio) => {
      radio.checked = radio.value === current;
    });

    Utils.qs('#status-dialog').hidden = false;
    const checked = Utils.qs('#status-form input[name="status"]:checked');
    (checked || Utils.qs('#status-form input[name="status"]')).focus();
  }

  function closeStatusDialog() {
    pendingRow = null;
    Utils.qs('#status-dialog').hidden = true;
  }

  async function handleStatusSubmit(event) {
    event.preventDefault();
    if (!pendingRow) { closeStatusDialog(); return; }

    const form = event.target;
    const chosen = form.querySelector('input[name="status"]:checked');
    if (!chosen) {
      Notifications.error('Choose a status first.');
      return;
    }

    const reason = form.reason.value.trim();
    const submitBtn = form.querySelector('[type="submit"]');
    const rowKey = pendingRow;

    setButtonLoading(submitBtn, true);
    try {
      const data = await Api.admin.setStatus(rowKey, chosen.value, reason);
      closeStatusDialog();

      // The backend reports a partial outcome when the status saved but Student
      // ID generation failed. Say so plainly instead of a blanket "Saved".
      if (data && data.warning) {
        Notifications.error(data.warning);
      } else if (chosen.value === 'Active' && data && data.studentId) {
        Notifications.success(`Set to Active. Student ID ${data.studentId} is ready.`);
      } else {
        Notifications.success(`Status set to ${chosen.value}.`);
      }

      await Promise.all([refreshCurrentSearch(), loadStats()]);
    } catch (err) {
      handleApiError(err, 'Could not change the status.');
    } finally {
      setButtonLoading(submitBtn, false);
    }
  }

  async function handleSignIn(event) {
    event.preventDefault();
    const form = event.target;
    const email = form.email.value.trim();
    const sharedSecret = form.sharedSecret.value;
    const submitBtn = form.querySelector('[type="submit"]');

    if (!email || !sharedSecret) {
      Notifications.error('Enter both your email and your admin password.');
      return;
    }

    setButtonLoading(submitBtn, true);
    try {
      const data = await Api.admin.login(email, sharedSecret);
      if (!data || !data.token) throw new Error('The server did not return a session.');
      Storage.setAdminToken(data.token);
      form.reset();
      enterConsole(email);
    } catch (err) {
      // Admin.adminLogin answers "Not authorized." for both a wrong email and a
      // wrong password, deliberately — it does not reveal which. Pass that
      // through rather than inventing something friendlier and less true.
      Notifications.error((err && err.message) || 'Could not sign in.');
    } finally {
      setButtonLoading(submitBtn, false);
    }
  }

  function showView(name) {
    Utils.qsa('[data-view-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.viewPanel !== name;
    });
    Utils.qsa('[data-view]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.view === name);
    });
    if (name === 'overview') loadStats();
  }

  function enterConsole(email) {
    const who = Utils.qs('#admin-who');
    if (who && email) who.textContent = email;
    Router.showStep('admin-console');
    showView('students');
    // Open on the full list — the panel is most useful when it already shows
    // everyone rather than an empty screen waiting to be searched.
    runSearch('', null);
    loadStats();
  }

  // ------------------------------------------------------------------ init

  function initAdminPage() {
    const signInForm = Utils.qs('#admin-signin-form');
    const searchForm = Utils.qs('#admin-search-form');
    const statusForm = Utils.qs('#status-form');

    if (signInForm) signInForm.addEventListener('submit', handleSignIn);
    if (searchForm) searchForm.addEventListener('submit', handleSearchSubmit);
    if (statusForm) statusForm.addEventListener('submit', handleStatusSubmit);

    // Row buttons are rebuilt on every search, so listen once on the container.
    const results = Utils.qs('#admin-results');
    if (results) {
      results.addEventListener('click', (event) => {
        const button = event.target.closest('[data-action="status"]');
        if (button) openStatusDialog(button.dataset.key);
      });
    }

    document.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-action], [data-view]');
      if (!trigger) return;
      if (trigger.dataset.action === 'admin-signout') endAdminSession();
      if (trigger.dataset.action === 'close-status') closeStatusDialog();
      if (trigger.dataset.action === 'refresh-stats') loadStats();
      if (trigger.dataset.view) showView(trigger.dataset.view);
    });

    document.addEventListener('keydown', (event) => {
      const dialog = Utils.qs('#status-dialog');
      if (event.key === 'Escape' && dialog && !dialog.hidden) closeStatusDialog();
    });

    // An admin token decides which step opens. It is not proof of anything on
    // its own — every route re-checks it server-side — it just avoids showing
    // a sign-in form to someone already signed in.
    if (Storage.getAdminToken()) {
      enterConsole(null);
    } else {
      Router.showStep('admin-signin');
    }
  }

  return { initAdminPage };
})();
