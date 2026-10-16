/**
 * upgrade.js — W.H. Academy
 * Page controller for upgrade.html ("Change your plan": upgrade, or move to a lower plan).
 *
 *   student/upgradeStatus   -> the plans this student can move to + the fee for each + the reasons list
 *   student/upgradeRequest  -> send the request (admin approves it in the admin panel)
 *   student/upgradeCancel   -> take back a request that is still waiting
 *
 * All money is worked out by the server from the pricing-page prices; this page only shows it.
 * One fee rule: an upgrade costs the difference between the two plans for the days left in this
 * month (today counts); from the 1st of next month the full new fee applies. A move to a lower
 * plan costs nothing now; the lower fee starts on the 1st of next month.
 * A reason is required for every request (it helps the academy improve).
 */
(function () {
  'use strict';

  const esc = (v) => Utils.escapeHtml(v == null ? '' : String(v));
  const root = () => Utils.qs('#up-root');
  const money = (n) => '₨' + Number(n || 0).toLocaleString('en-US');
  const WHATSAPP = 'https://wa.me/923295215703';
  const POLL_MS = 15000;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const RANK = { Basic: 1, Plus: 2, Max: 3 };

  // What each plan adds on top of the one below (same as the public "Student Dashboard Explained" page).
  const GAINS = {
    Plus: [
      'Recorded lectures and WhatsApp support',
      'Monthly mock tests',
      'Rechecking of your Boss Battle marking',
      'Past Papers shelf',
      'New advanced games as they arrive'
    ],
    Max: [
      'Interactive subject Animations',
      'Weekly tests and past-paper sessions',
      'Detailed notes',
      'One free live class every week for each of your subjects'
    ]
  };

  let status = null;
  let picked = null;      // tier the student tapped, before sending
  let draft = { reason: '', note: '', sent: false, ref: '' };
  let busy = false;
  let timer = null;

  // "15 October 2026" — always day, month and year in full.
  function fmtDate(iso) {
    if (!iso) return '';
    const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));   // a calendar date (no time): never shift it by time zone
    if (plain) return Number(plain[3]) + ' ' + MONTHS[Number(plain[2]) - 1] + ' ' + plain[1];
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  // "1 November 2026": the first day of the month after `iso`, in Pakistan time (the academy's calendar).
  function nextMonthLabel(iso) {
    const t = new Date((iso ? new Date(iso).getTime() : Date.now()) + 5 * 3600 * 1000);
    if (isNaN(t.getTime())) return '';
    const m = t.getUTCMonth();
    return '1 ' + MONTHS[(m + 1) % 12] + ' ' + (m === 11 ? t.getUTCFullYear() + 1 : t.getUTCFullYear());
  }

  function waLink(text) { return WHATSAPP + '?text=' + encodeURIComponent(text); }

  // Keep the cached plan honest: once a change is approved, drop the old cache so every
  // page (lock cards, Animations, Rechecking, the dashboard card...) sees the new plan on its next load.
  function syncPlanCache(toTier) {
    try {
      const cached = Storage.getCachedDashboard();
      const cur = cached && cached.data ? String(cached.data.plan || '') : '';
      if (cur !== toTier) Storage.set('dashboard_cache', null);
    } catch (e) { /* storage unavailable: nothing to do */ }
  }

  const isUp = (o) => o && o.direction === 'up';

  // ---------------------------------------------------------------- views

  function recentBanner(r) {
    if (!r) return '';
    if (r.status === 'Approved') {
      return '<div class="up-banner up-banner--ok" role="status"><b>You are now on the ' + esc(r.toTier) + ' plan.</b> ' +
        'Approved on ' + esc(fmtDate(r.decidedAt)) + '. ' + (r.kind === 'Downgrade' ? '' : 'Your new features are open. ') +
        '<a href="dashboard.html">Go to your dashboard</a></div>';
    }
    if (r.status === 'Rejected') {
      return '<div class="up-banner up-banner--no" role="status"><b>Your last plan change request was not approved.</b>' +
        (r.adminNote ? ' ' + esc(r.adminNote) : '') + ' You can send a new request below or message us on WhatsApp.</div>';
    }
    return '';
  }

  // The fee is worked out from what the dashboard really unlocks. An account that opens EVERY subject of
  // the class (older accounts) pays the all-subjects fee, so say so; otherwise name the subjects counted.
  function currentLine(s) {
    const n = Number(s.subjectCount) || 0;
    const subs = s.allSubjects ? 'All ' + n + ' subjects' : n + ' subject' + (n === 1 ? '' : 's');
    const names = Array.isArray(s.subjectNames) ? s.subjectNames.filter(Boolean) : [];
    const basis = s.allSubjects
      ? 'Your dashboard opens every subject of your class, so the all-subjects fee applies.'
      : (names.length ? 'Fee counted for: ' + names.join(', ') + '.' : '');
    return '<div class="up-current"><span>Your plan: <b>' + esc(s.currentTier) + '</b></span>' +
      '<span>Monthly fee: <b>' + money(s.currentFee) + '</b></span><span>' + esc(subs) + '</span>' +
      (basis ? '<span class="up-basis">' + esc(basis) + '</span>' : '') + '</div>';
  }

  function dueBlock(o) {
    if (!isUp(o)) {
      return '<p class="up-due up-due--down">Nothing to pay now.<br>From <b>' + esc(o.effectiveLabel) + '</b> your monthly fee is <b>' + money(o.newFee) + '</b>.</p>';
    }
    const span = o.daysLeft >= o.daysInMonth
      ? 'for ' + esc(o.monthName)
      : 'for the rest of ' + esc(o.monthName) + ' (' + o.daysLeft + ' day' + (o.daysLeft === 1 ? '' : 's') + ', today counts)';
    return '<p class="up-due">Pay now: <b>' + money(o.dueNow) + '</b> ' + span +
      '.<br>From <b>' + esc(o.effectiveLabel) + '</b> your monthly fee is <b>' + money(o.newFee) + '</b>.</p>';
  }

  // Features a student would lose by moving from the current plan down to `o.tier`.
  function lostFeatures(o) {
    const from = RANK[status.currentTier] || 0, to = RANK[o.tier] || 0;
    const out = [];
    ['Plus', 'Max'].forEach((t) => { if (RANK[t] > to && RANK[t] <= from) (GAINS[t] || []).forEach((g) => out.push(g)); });
    return out;
  }

  function optionCard(o) {
    const up = isUp(o);
    let body;
    if (up) {
      const gains = [];
      ['Plus', 'Max'].forEach((t) => { if (RANK[t] <= RANK[o.tier] && RANK[t] > (RANK[status.currentTier] || 0)) (GAINS[t] || []).forEach((g) => gains.push(g)); });
      body = '<p class="up-sub">What you get</p><ul>' + gains.map((p) => '<li>' + esc(p) + '</li>').join('') + '</ul>';
    } else {
      const lost = lostFeatures(o);
      body = lost.length
        ? '<p class="up-sub">You will no longer have</p><ul class="up-lost">' + lost.map((p) => '<li>' + esc(p) + '</li>').join('') + '</ul>'
        : '<ul></ul>';
    }
    return '<article class="up-card' + (o.tier === 'Max' ? ' up-card--max' : '') + (up ? '' : ' up-card--down') + (picked === o.tier ? ' is-picked' : '') + '">' +
      (up && o.tier === 'Max' ? '<span class="up-ribbon">BEST VALUE</span>' : '') +
      '<h3>' + esc(o.tier) + '</h3>' +
      '<div class="up-card__fee">' + money(o.newFee) + ' <small>/ month</small></div>' +
      body + dueBlock(o) +
      '<button type="button" class="btn ' + (up ? 'btn--primary' : 'btn--secondary') + '" style="margin-top:.9rem;" data-up="pick" data-tier="' + esc(o.tier) + '">' +
        (up ? 'Upgrade to ' : 'Move to ') + esc(o.tier) + '</button>' +
    '</article>';
  }

  function reasonOptions(dir) {
    const list = (status.reasons && status.reasons[dir]) || [];
    return '<option value="">Choose a reason…</option>' +
      list.map((r) => '<option value="' + esc(r.code) + '"' + (draft.reason === r.code ? ' selected' : '') + '>' + esc(r.label) + '</option>').join('');
  }

  function confirmPanel(o) {
    const up = isUp(o), dir = up ? 'up' : 'down';
    const rows = up
      ? '<div class="up-row"><span>Upgrade fee now (' + (o.daysLeft >= o.daysInMonth ? esc(o.monthName) : 'rest of ' + esc(o.monthName) + ', ' + o.daysLeft + ' days') + ')</span><strong>' + money(o.dueNow) + '</strong></div>' +
        '<div class="up-row"><span>From ' + esc(o.effectiveLabel) + ', every month</span><strong>' + money(o.newFee) + '</strong></div>'
      : '<div class="up-row"><span>Fee to pay now</span><strong>Nothing</strong></div>' +
        '<div class="up-row"><span>From ' + esc(o.effectiveLabel) + ', every month</span><strong>' + money(o.newFee) + ' <small class="up-was">(now ' + money(status.currentFee) + ')</small></strong></div>';
    const q = up
      ? 'What did you like about W.H. Academy, and what do you want from the ' + esc(o.tier) + ' plan?'
      : 'What did not work for you? Your honest feedback helps us improve.';
    const ph = up
      ? 'e.g. I liked the Boss Battle papers and now I want past papers and rechecking too.'
      : 'e.g. I mostly use the games and do not need the other features right now.';
    return '<section class="up-confirm" id="up-confirm">' +
      '<h2>' + (up ? 'Upgrade request' : 'Plan change request') + '</h2>' +
      '<div class="up-rows">' +
        '<div class="up-row"><span>Plan</span><strong>' + esc(status.currentTier) + ' → ' + esc(o.tier) + '</strong></div>' + rows +
      '</div>' +
      '<label class="up-field"><span>' + (up ? 'Why do you want to upgrade?' : 'Why do you want to move to a lower plan?') + ' <em>(required)</em></span>' +
        '<select class="input" id="up-reason" required>' + reasonOptions(dir) + '</select></label>' +
      '<label class="up-field"><span>' + q + ' <em>(required)</em></span>' +
        '<textarea class="input up-text" id="up-note" rows="4" maxlength="500" placeholder="' + esc(ph) + '">' + esc(draft.note) + '</textarea>' +
        '<small class="up-hint" id="up-count">' + draft.note.trim().length + ' / 500 · at least 10 characters</small></label>' +
      (up
        ? '<label class="up-check"><input type="checkbox" id="up-sent"' + (draft.sent ? ' checked' : '') + '> <span>I have already sent the upgrade fee</span></label>' +
          '<label class="up-field"><span>Payment reference or sender name (optional)</span>' +
            '<input class="input" id="up-ref" maxlength="120" autocomplete="off" value="' + esc(draft.ref) + '" placeholder="e.g. JazzCash / bank transfer reference"></label>'
        : '') +
      '<p class="up-error" id="up-error" role="alert" hidden></p>' +
      '<p class="up-note">' + (up
        ? 'Your new plan opens after W.H. Academy confirms the fee and approves your request. Need payment details? <a href="' + esc(waLink('Assalam o Alaikum, I want to upgrade to ' + o.tier + '. Please share the payment details.')) + '" target="_blank" rel="noopener">Message us on WhatsApp</a>.'
        : 'Your current plan stays as it is until W.H. Academy approves this change.') + '</p>' +
      '<div class="up-actions">' +
        '<button type="button" class="btn btn--primary" data-up="submit"' + (busy ? ' disabled' : '') + '>' + (up ? 'Send upgrade request' : 'Send request') + '</button>' +
        '<button type="button" class="btn btn--secondary" data-up="back">Back</button>' +
      '</div>' +
    '</section>';
  }

  function viewOptions() {
    const opts = status.options || [];
    const ups = opts.filter(isUp), downs = opts.filter((o) => !isUp(o));
    const sel = opts.find((o) => o.tier === picked) || null;
    let html = currentLine(status);
    if (ups.length) html += '<h2 class="up-h">Upgrade your plan</h2><div class="up-grid">' + ups.map(optionCard).join('') + '</div>';
    if (downs.length) html += '<h2 class="up-h up-h--down">Move to a lower plan</h2><div class="up-grid">' + downs.map(optionCard).join('') + '</div>';
    return html + (sel ? confirmPanel(sel) : '');
  }

  function viewPending(p) {
    const up = p.kind !== 'Downgrade';
    const refLine = p.feeReference ? ' (reference: ' + esc(p.feeReference) + ')' : '';
    const money1 = up
      ? '<div class="up-row"><span>Upgrade fee now</span><strong>' + money(p.dueNow) + '</strong></div>'
      : '<div class="up-row"><span>Fee to pay now</span><strong>Nothing</strong></div>';
    const fromLine = p.effectiveFrom
      ? '<div class="up-row"><span>New monthly fee, from ' + esc(fmtDate(p.effectiveFrom)) + '</span><strong>' + money(p.newFee) + '</strong></div>'
      : '<div class="up-row"><span>New monthly fee, from ' + esc(nextMonthLabel(p.requestedAt)) + '</span><strong>' + money(p.newFee) + '</strong></div>';
    let ask = '';
    if (up) {
      ask = p.feeSent
        ? '<div class="up-ask">You told us the upgrade fee is sent' + refLine + '. W.H. Academy will confirm it and approve your request.</div>'
        : '<div class="up-ask"><b>Have you sent the upgrade fee' + (p.dueNow > 0 ? ' of ' + money(p.dueNow) : '') + '?</b> ' +
          'Your new plan opens after W.H. Academy receives it. If you have not sent it yet, message us on WhatsApp for the payment details.<br>' +
          '<a class="btn btn--primary btn--sm" style="margin-top:.6rem;" href="' + esc(waLink('Assalam o Alaikum, I requested an upgrade to ' + p.toTier + '. Please share the payment details.')) + '" target="_blank" rel="noopener">Message on WhatsApp</a></div>';
    } else {
      ask = '<div class="up-ask">Your current plan stays as it is until W.H. Academy approves this change.</div>';
    }
    return '<section class="up-wait" role="status">' +
      '<h2>⏳ Waiting for admin approval</h2>' +
      '<p style="margin:0 0 .6rem;">Your request to move to <b>' + esc(p.toTier) + '</b> has reached W.H. Academy. You do not need to send it again.</p>' +
      '<div class="up-rows">' +
        '<div class="up-row"><span>Plan</span><strong>' + esc(p.fromTier) + ' → ' + esc(p.toTier) + '</strong></div>' + money1 + fromLine +
        (p.reason ? '<div class="up-row"><span>Your reason</span><strong class="up-wrap">' + esc(p.reason) + '</strong></div>' : '') +
        '<div class="up-row"><span>Requested on</span><strong>' + esc(fmtDate(p.requestedAt)) + '</strong></div>' +
      '</div>' + ask +
      '<div class="up-actions"><button type="button" class="btn btn--secondary btn--sm" data-up="cancel" data-id="' + esc(p.requestId) + '">Cancel this request</button></div>' +
    '</section>';
  }

  function viewNotEligible(s) {
    return '<div class="card" style="padding:1.2rem;"><h2 style="margin:0 0 .4rem;">Plan change is not available yet</h2><p style="margin:0 0 .8rem;">' + esc(s.reason) + '</p>' +
      '<a class="btn btn--primary btn--sm" href="' + esc(waLink('Assalam o Alaikum, I would like to change my plan.')) + '" target="_blank" rel="noopener">Message on WhatsApp</a>' +
    '</div>';
  }

  function render() {
    const el = root(); if (!el) return;
    if (!status) { el.innerHTML = '<p class="muted">Loading…</p>'; return; }
    let html = recentBanner(status.recent);
    if (status.pending) html += viewPending(status.pending);
    else if (!status.eligible) html += viewNotEligible(status);
    else html += viewOptions();
    el.innerHTML = html;
    if (status.pending) startPolling(); else stopPolling();
  }

  // ---------------------------------------------------------------- data

  async function load(silent) {
    try {
      const wasPending = !!(status && status.pending);
      const before = status ? JSON.stringify(status) : '';
      status = await Api.request('student/upgradeStatus', {});
      if (silent && before === JSON.stringify(status)) return;   // nothing changed: do not redraw
      if (status.recent && status.recent.status === 'Approved') syncPlanCache(status.recent.toTier);
      if (wasPending && !status.pending && status.recent && status.recent.status === 'Approved' && window.Notifications) {
        Notifications.toast('Your plan is now ' + status.recent.toTier + '.', 'success');
      }
      render();
    } catch (err) {
      if (!silent || !status) {
        const el = root();
        if (el) el.innerHTML = '<div class="up-banner up-banner--no">' + esc((err && err.message) || 'Could not load your plan options.') +
          ' <button type="button" class="btn btn--secondary btn--sm" data-up="retry">Try again</button></div>';
      }
    }
  }

  function startPolling() {
    if (timer) return;
    timer = window.setInterval(() => { if (!document.hidden) load(true); }, POLL_MS);
  }
  function stopPolling() { if (timer) { window.clearInterval(timer); timer = null; } }

  function showError(msg, focusId) {
    const e = Utils.qs('#up-error');
    if (e) { e.textContent = msg; e.hidden = !msg; }
    const f = focusId && Utils.qs('#' + focusId);
    if (f && f.focus) f.focus();
  }

  async function submit(btn) {
    if (busy || !picked) return;
    const opt = (status.options || []).find((o) => o.tier === picked);
    if (!opt) return;
    // Read the fields straight from the form (the draft is only a safety copy).
    const reasonEl = Utils.qs('#up-reason'), noteEl = Utils.qs('#up-note'), sent = Utils.qs('#up-sent'), ref = Utils.qs('#up-ref');
    const reason = reasonEl ? reasonEl.value : '';
    const note = noteEl ? noteEl.value.trim() : '';
    if (!reason) { showError(isUp(opt) ? 'Please choose why you want to upgrade.' : 'Please choose why you want to move to a lower plan.', 'up-reason'); return; }
    if (note.length < 10) { showError('Please write a few words about it (at least 10 characters).', 'up-note'); return; }
    showError('');
    busy = true; if (btn) btn.disabled = true;
    try {
      await Api.request('student/upgradeRequest', {
        toTier: picked, reason, reasonNote: note,
        feeSent: isUp(opt) && !!(sent && sent.checked),
        feeReference: isUp(opt) && ref ? ref.value.trim() : ''
      });
      picked = null; draft = { reason: '', note: '', sent: false, ref: '' };
      if (window.Notifications) Notifications.toast('Request sent. Waiting for admin approval.', 'success');
      busy = false;
      await load(false);
      window.scrollTo && window.scrollTo(0, 0);
    } catch (err) {
      busy = false; if (btn) btn.disabled = false;
      const msg = (err && err.message) || 'Could not send your request.';
      showError(msg);
      if (window.Notifications) Notifications.toast(msg, 'error');
      if (/already have a plan change request/i.test(msg)) { picked = null; await load(false); }
    }
  }

  async function cancel(id) {
    if (!id || busy) return;
    if (!window.confirm('Cancel this request?')) return;
    busy = true;
    try {
      await Api.request('student/upgradeCancel', { requestId: id });
      if (window.Notifications) Notifications.toast('Request cancelled.', 'info');
    } catch (err) {
      if (window.Notifications) Notifications.toast((err && err.message) || 'Could not cancel.', 'error');
    }
    busy = false;
    await load(false);
  }

  // ---------------------------------------------------------------- events

  document.addEventListener('wha:ready', () => {
    if (Router.currentPageName() !== 'upgrade.html') return;
    const el = root(); if (!el) return;
    el.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-up]'); if (!b) return;
      const act = b.getAttribute('data-up');
      if (act === 'pick') {
        const next = b.getAttribute('data-tier');
        const o = (status.options || []).find((x) => x.tier === next), cur = (status.options || []).find((x) => x.tier === picked);
        if (!cur || !o || cur.direction !== o.direction) draft.reason = '';   // reasons differ for upgrade / downgrade
        picked = next; render();
        const c = Utils.qs('#up-confirm'); if (c && c.scrollIntoView) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      else if (act === 'back') { picked = null; render(); }
      else if (act === 'submit') submit(b);
      else if (act === 'cancel') cancel(b.getAttribute('data-id'));
      else if (act === 'retry') load(false);
    });
    // Keep what the student typed if the page redraws (e.g. they tap another plan).
    el.addEventListener('input', (e) => {
      const t = e.target; if (!t || !t.id) return;
      if (t.id === 'up-note') {
        draft.note = t.value;
        const c = Utils.qs('#up-count'); if (c) c.textContent = t.value.trim().length + ' / 500 · at least 10 characters';
      } else if (t.id === 'up-ref') draft.ref = t.value;
      showError('');
    });
    el.addEventListener('change', (e) => {
      const t = e.target; if (!t || !t.id) return;
      if (t.id === 'up-reason') draft.reason = t.value;
      else if (t.id === 'up-sent') draft.sent = !!t.checked;
      showError('');
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && status && status.pending) load(true); });
    load(false);
  });
})();
