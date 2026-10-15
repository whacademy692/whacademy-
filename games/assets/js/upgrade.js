/**
 * upgrade.js — W.H. Academy
 * Page controller for upgrade.html ("Upgrade your plan").
 *
 *   student/upgradeStatus   -> what this student can upgrade to + the fee for each
 *   student/upgradeRequest  -> send the request (admin approves it in the admin panel)
 *   student/upgradeCancel   -> take back a request that is still waiting
 *
 * All money is worked out by the server; this page only shows it. One fee rule:
 * the upgrade fee is the difference between the two plans for the days left in
 * this month (today counts); from next month the full new fee applies.
 */
(function () {
  'use strict';

  const esc = (v) => Utils.escapeHtml(v == null ? '' : String(v));
  const root = () => Utils.qs('#up-root');
  const money = (n) => '₨' + Number(n || 0).toLocaleString('en-US');
  const WHATSAPP = 'https://wa.me/923295215703';
  const POLL_MS = 15000;

  // What each plan opens (same as the public "Student Dashboard Explained" page).
  const PERKS = {
    Plus: [
      'Everything in Basic',
      'Recorded lectures and WhatsApp support',
      'Monthly mock tests',
      'Rechecking of your Boss Battle marking',
      'Past Papers shelf',
      'New advanced games as they arrive'
    ],
    Max: [
      'Everything in Plus',
      'Interactive subject Animations',
      'Weekly tests and past-paper sessions',
      'Detailed notes',
      'One free live class every week for each of your subjects'
    ]
  };

  let status = null;
  let picked = null;      // tier the student tapped, before sending
  let busy = false;
  let timer = null;

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function waLink(text) { return WHATSAPP + '?text=' + encodeURIComponent(text); }

  // Keep the cached plan honest: once an upgrade is approved, drop the old cache so every
  // page (lock cards, Animations, Rechecking...) sees the new plan on its next load.
  function syncPlanCache(toTier) {
    try {
      const cached = Storage.getCachedDashboard();
      const cur = cached && cached.data ? String(cached.data.plan || '') : '';
      if (cur !== toTier) Storage.set('dashboard_cache', null);
    } catch (e) { /* storage unavailable: nothing to do */ }
  }

  // ---------------------------------------------------------------- views

  function recentBanner(r) {
    if (!r) return '';
    if (r.status === 'Approved') {
      return '<div class="up-banner up-banner--ok" role="status"><b>You are now on the ' + esc(r.toTier) + ' plan.</b> ' +
        'Approved on ' + esc(fmtDate(r.decidedAt)) + '. Your new features are open. ' +
        '<a href="dashboard.html">Go to your dashboard</a></div>';
    }
    if (r.status === 'Rejected') {
      return '<div class="up-banner up-banner--no" role="status"><b>Your last upgrade request was not approved.</b>' +
        (r.adminNote ? ' ' + esc(r.adminNote) : '') + ' You can send a new request below or message us on WhatsApp.</div>';
    }
    return '';
  }

  function currentLine(s) {
    const subs = s.subjectCount + ' subject' + (s.subjectCount === 1 ? '' : 's');
    return '<div class="up-current"><span>Your plan: <b>' + esc(s.currentTier) + '</b></span>' +
      '<span>Monthly fee: <b>' + money(s.currentFee) + '</b></span><span>' + esc(subs) + '</span></div>';
  }

  function dueBlock(o) {
    if (o.needsReview) {
      return '<p class="up-due">W.H. Academy will confirm your upgrade fee after you send the request.</p>';
    }
    const span = o.daysLeft >= o.daysInMonth
      ? 'for ' + esc(o.monthName)
      : 'for the rest of ' + esc(o.monthName) + ' (' + o.daysLeft + ' day' + (o.daysLeft === 1 ? '' : 's') + ', today counts)';
    return '<p class="up-due">Pay now: <b>' + money(o.dueNow) + '</b> ' + span +
      '.<br>From 1 ' + esc(o.nextMonthName) + ' your monthly fee is <b>' + money(o.newFee) + '</b>.</p>';
  }

  function optionCard(o) {
    const perks = (PERKS[o.tier] || []).map((p) => '<li>' + esc(p) + '</li>').join('');
    return '<article class="up-card' + (o.tier === 'Max' ? ' up-card--max' : '') + (picked === o.tier ? ' is-picked' : '') + '">' +
      (o.tier === 'Max' ? '<span class="up-ribbon">BEST VALUE</span>' : '') +
      '<h2>' + esc(o.tier) + '</h2>' +
      '<div class="up-card__fee">' + money(o.newFee) + ' <small>/ month</small></div>' +
      '<ul>' + perks + '</ul>' +
      dueBlock(o) +
      '<button type="button" class="btn btn--primary" style="margin-top:.9rem;" data-up="pick" data-tier="' + esc(o.tier) + '">Upgrade to ' + esc(o.tier) + '</button>' +
    '</article>';
  }

  function confirmPanel(o) {
    const due = o.needsReview
      ? '<div class="up-row"><span>Upgrade fee now</span><strong>Confirmed by W.H. Academy</strong></div>'
      : '<div class="up-row"><span>Upgrade fee now (' + (o.daysLeft >= o.daysInMonth ? esc(o.monthName) : 'rest of ' + esc(o.monthName) + ', ' + o.daysLeft + ' days') + ')</span><strong>' + money(o.dueNow) + '</strong></div>';
    return '<section class="up-confirm" id="up-confirm">' +
      '<h2>Send your upgrade request</h2>' +
      '<div class="up-rows">' +
        '<div class="up-row"><span>Plan</span><strong>' + esc(status.currentTier) + ' → ' + esc(o.tier) + '</strong></div>' +
        due +
        '<div class="up-row"><span>From 1 ' + esc(o.nextMonthName) + ', every month</span><strong>' + money(o.newFee) + '</strong></div>' +
      '</div>' +
      '<label class="up-check"><input type="checkbox" id="up-sent"> <span>I have already sent the upgrade fee</span></label>' +
      '<label class="up-field"><span>Payment reference or sender name (optional)</span>' +
        '<input class="input" id="up-ref" maxlength="120" autocomplete="off" placeholder="e.g. JazzCash / bank transfer reference"></label>' +
      '<p class="up-note">Your new plan opens after W.H. Academy confirms the fee and approves your request. Need payment details? <a href="' + esc(waLink('Assalam o Alaikum, I want to upgrade to ' + o.tier + '. Please share the payment details.')) + '" target="_blank" rel="noopener">Message us on WhatsApp</a>.</p>' +
      '<div class="up-actions">' +
        '<button type="button" class="btn btn--primary" data-up="submit"' + (busy ? ' disabled' : '') + '>Send upgrade request</button>' +
        '<button type="button" class="btn btn--secondary" data-up="back">Back</button>' +
      '</div>' +
    '</section>';
  }

  function viewOptions() {
    const opts = status.options || [];
    const sel = opts.find((o) => o.tier === picked) || null;
    return currentLine(status) +
      '<div class="up-grid">' + opts.map(optionCard).join('') + '</div>' +
      (sel ? confirmPanel(sel) : '');
  }

  function viewPending(p) {
    const refLine = p.feeReference ? ' (reference: ' + esc(p.feeReference) + ')' : '';
    const dueLine = p.dueNow > 0
      ? '<div class="up-row"><span>Upgrade fee now</span><strong>' + money(p.dueNow) + '</strong></div>'
      : '<div class="up-row"><span>Upgrade fee now</span><strong>Confirmed by W.H. Academy</strong></div>';
    const ask = p.feeSent
      ? '<div class="up-ask">You told us the upgrade fee is sent' + refLine + '. W.H. Academy will confirm it and approve your request.</div>'
      : '<div class="up-ask"><b>Have you sent the upgrade fee' + (p.dueNow > 0 ? ' of ' + money(p.dueNow) : '') + '?</b> ' +
        'Your new plan opens after W.H. Academy receives it. If you have not sent it yet, message us on WhatsApp for the payment details.<br>' +
        '<a class="btn btn--primary btn--sm" style="margin-top:.6rem;" href="' + esc(waLink('Assalam o Alaikum, I requested an upgrade to ' + p.toTier + '. Please share the payment details.')) + '" target="_blank" rel="noopener">Message on WhatsApp</a></div>';
    return '<section class="up-wait" role="status">' +
      '<h2>⏳ Waiting for admin approval</h2>' +
      '<p style="margin:0 0 .6rem;">Your request to move to <b>' + esc(p.toTier) + '</b> has reached W.H. Academy. You do not need to send it again.</p>' +
      '<div class="up-rows">' +
        '<div class="up-row"><span>Plan</span><strong>' + esc(p.fromTier) + ' → ' + esc(p.toTier) + '</strong></div>' +
        dueLine +
        '<div class="up-row"><span>New monthly fee (from next month)</span><strong>' + money(p.newFee) + '</strong></div>' +
        '<div class="up-row"><span>Requested on</span><strong>' + esc(fmtDate(p.requestedAt)) + '</strong></div>' +
      '</div>' + ask +
      '<div class="up-actions"><button type="button" class="btn btn--secondary btn--sm" data-up="cancel" data-id="' + esc(p.requestId) + '">Cancel this request</button></div>' +
    '</section>';
  }

  function viewNotEligible(s) {
    const isMax = /Max plan/.test(s.reason || '');
    return '<div class="card" style="padding:1.2rem;"><h2 style="margin:0 0 .4rem;">' +
      (isMax ? 'You are on our top plan' : 'Upgrade is not available yet') + '</h2><p style="margin:0 0 .8rem;">' + esc(s.reason) + '</p>' +
      (isMax ? '' : '<a class="btn btn--primary btn--sm" href="' + esc(waLink('Assalam o Alaikum, I would like to upgrade my plan.')) + '" target="_blank" rel="noopener">Message on WhatsApp</a>') +
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

  async function submit(btn) {
    if (busy || !picked) return;
    const sent = Utils.qs('#up-sent'), ref = Utils.qs('#up-ref');
    busy = true; if (btn) btn.disabled = true;
    try {
      await Api.request('student/upgradeRequest', {
        toTier: picked,
        feeSent: !!(sent && sent.checked),
        feeReference: ref ? ref.value.trim() : ''
      });
      picked = null;
      if (window.Notifications) Notifications.toast('Request sent. Waiting for admin approval.', 'success');
      busy = false;
      await load(false);
      window.scrollTo && window.scrollTo(0, 0);
    } catch (err) {
      busy = false; if (btn) btn.disabled = false;
      if (window.Notifications) Notifications.toast((err && err.message) || 'Could not send your request.', 'error');
      if (err && /already have an upgrade request/i.test(err.message || '')) { picked = null; await load(false); }
    }
  }

  async function cancel(id) {
    if (!id || busy) return;
    if (!window.confirm('Cancel this upgrade request?')) return;
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
      if (act === 'pick') { picked = b.getAttribute('data-tier'); render(); const c = Utils.qs('#up-confirm'); if (c && c.scrollIntoView) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      else if (act === 'back') { picked = null; render(); }
      else if (act === 'submit') submit(b);
      else if (act === 'cancel') cancel(b.getAttribute('data-id'));
      else if (act === 'retry') load(false);
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && status && status.pending) load(true); });
    load(false);
  });
})();
