/**
 * requests.js — W.H. Academy
 * "Requests" section of settings.html: a student (or parent, using the student's account) can ask to
 *   - Leave W.H. Academy                 (reason is asked)
 *   - Correct wrong information          (which information + the correct value)
 *   - Delete their data                  (needs a tick to confirm)
 *
 *   student/request/list     -> my requests + which kinds are already waiting + the reason lists
 *   student/request/create   -> send a request (admin handles it in the admin panel "Requests" tab)
 *   student/request/cancel   -> take back a request that is still waiting
 *
 * What each request does is decided by the admin; nothing happens to the account until then.
 */
(function () {
  'use strict';

  const esc = (v) => Utils.escapeHtml(v == null ? '' : String(v));
  const root = () => Utils.qs('#requests-root');
  const WHATSAPP = 'https://wa.me/923295215703';
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const TYPES = {
    Leave: {
      title: 'Leave W.H. Academy',
      sub: 'Tell us you want to stop. We ask why, so we can improve.'
    },
    Correction: {
      title: 'Correct my information',
      sub: 'Name, class, WhatsApp number or anything else that is wrong.'
    },
    Deletion: {
      title: 'Delete my data',
      sub: 'Ask us to delete your personal data and close your account.'
    }
  };
  const ORDER = ['Leave', 'Correction', 'Deletion'];

  let data = null;           // { requests, waiting, lists }
  let open = null;           // which form is showing
  let busy = false;
  let draft = emptyDraft();

  function emptyDraft() { return { reason: '', field: '', newValue: '', note: '', confirm: false }; }

  function toast(msg, type) {
    if (!window.Notifications) return;
    if (type === 'error' && Notifications.error) return Notifications.error(msg);
    if (type === 'success' && Notifications.success) return Notifications.success(msg);
    if (Notifications.toast) Notifications.toast(msg, type);
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function statusBadge(r) {
    const t = r.type, s = r.status;
    if (s === 'Pending') return '<span class="badge badge--warning">Waiting</span>';
    if (s === 'Approved') return '<span class="badge badge--info">' + (t === 'Deletion' ? 'Approved, deletion in progress' : 'Approved') + '</span>';
    if (s === 'Done') return '<span class="badge badge--success">Done</span>';
    if (s === 'Rejected') return '<span class="badge badge--error">Not approved</span>';
    return '<span class="badge badge--neutral">' + esc(s) + '</span>';
  }

  // ------------------------------------------------------------------ views

  function cards() {
    const waiting = (data && data.waiting) || {};
    return '<div class="rq-grid">' + ORDER.map((t) => {
      const w = !!waiting[t];
      return '<button type="button" class="rq-card' + (open === t ? ' is-open' : '') + '" data-rq="open" data-type="' + t + '"' + (w ? ' disabled' : '') + '>' +
        '<span class="rq-card__top"><span class="rq-card__title">' + esc(TYPES[t].title) + '</span>' +
        (w ? '<span class="badge badge--warning">Waiting</span>' : '') + '</span>' +
        '<span class="rq-card__sub">' + (w ? 'You already sent this request. W.H. Academy will handle it soon.' : esc(TYPES[t].sub)) + '</span>' +
      '</button>';
    }).join('') + '</div>';
  }

  function options(list, selected, placeholder) {
    return '<option value="">' + esc(placeholder) + '</option>' + (list || []).map((o) =>
      '<option value="' + esc(o.code) + '"' + (selected === o.code ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('');
  }

  function noteField(label, placeholder, required) {
    return '<label class="rq-field"><span>' + esc(label) + (required ? '' : ' <em>(optional)</em>') + '</span>' +
      '<textarea class="input rq-text" id="rq-note" rows="3" maxlength="500" placeholder="' + esc(placeholder) + '">' + esc(draft.note) + '</textarea></label>';
  }

  function formLeave() {
    const lists = (data && data.lists) || {};
    return '<h3>Leave W.H. Academy</h3>' +
      '<label class="rq-field"><span>Why do you want to leave? <em>(required)</em></span>' +
        '<select class="input" id="rq-reason">' + options(lists.leave, draft.reason, 'Choose a reason…') + '</select></label>' +
      noteField('Anything you would like to tell us?', 'Your honest feedback helps us improve.', false) +
      '<div class="rq-note rq-note--warn"><b>Please know:</b><ul>' +
        '<li>After W.H. Academy approves, your account is closed and you can no longer log in.</li>' +
        '<li>Fees already paid are not returned, also for the month you leave (see the <a href="../terms.html#refund" target="_blank" rel="noopener">Terms</a>).</li>' +
        '<li>Your records, including your dashboard data and game scores, may be kept for record-keeping and backup. If you want them deleted, send a “Delete my data” request.</li>' +
      '</ul></div>';
  }

  function formCorrection() {
    const lists = (data && data.lists) || {};
    return '<h3>Correct my information</h3>' +
      '<label class="rq-field"><span>Which information is wrong? <em>(required)</em></span>' +
        '<select class="input" id="rq-field">' + options(lists.correction, draft.field, 'Choose…') + '</select></label>' +
      '<label class="rq-field"><span>What is the correct information? <em>(required)</em></span>' +
        '<input class="input" id="rq-value" maxlength="300" autocomplete="off" value="' + esc(draft.newValue) + '" placeholder="Write it exactly as it should be"></label>' +
      noteField('Anything else we should know?', 'For example: my father’s name is spelt wrongly on my card.', false) +
      '<div class="rq-note">W.H. Academy checks your request and updates the information. We tell you here when it is done. You can also message us on <a href="' + esc(WHATSAPP) + '" target="_blank" rel="noopener">WhatsApp</a>.</div>';
  }

  function formDeletion() {
    return '<h3>Delete my data</h3>' +
      '<div class="rq-note rq-note--warn"><b>If W.H. Academy approves, we will:</b><ul>' +
        '<li>delete your personal details (name, contact details, address, school) and your learning activity, game scores and Boss Battle answers,</li>' +
        '<li>close your account, so you can no longer log in.</li>' +
      '</ul><b>We keep</b> only minimal fee and payment records that we need for our accounts. <b>This cannot be undone.</b></div>' +
      '<label class="rq-check"><input type="checkbox" id="rq-confirm"' + (draft.confirm ? ' checked' : '') + '> ' +
        '<span>I understand, and I want my data deleted.</span></label>' +
      noteField('Anything you would like to tell us?', 'You do not have to give a reason.', false);
  }

  function formPanel() {
    if (!open) return '';
    const body = open === 'Leave' ? formLeave() : open === 'Correction' ? formCorrection() : formDeletion();
    return '<section class="rq-form" id="rq-form">' + body +
      '<p class="rq-error" id="rq-error" role="alert" hidden></p>' +
      '<div class="rq-actions">' +
        '<button type="button" class="btn btn--primary" data-rq="submit"' + (busy ? ' disabled' : '') + '>Send request</button>' +
        '<button type="button" class="btn btn--secondary" data-rq="close">Close</button>' +
      '</div></section>';
  }

  function detailLine(r) {
    if (r.type === 'Correction' && r.details && r.details.newValue) {
      return '<p class="rq-item__body"><b>' + esc(r.details.fieldLabel || r.reason) + ':</b> ' + esc(r.details.newValue) + '</p>' +
        (r.reasonNote ? '<p class="rq-item__body">' + esc(r.reasonNote) + '</p>' : '');
    }
    const reason = r.type === 'Leave' && r.reason ? '<b>Reason:</b> ' + esc(r.reason) : '';
    const note = r.reasonNote ? (reason ? ' — ' : '') + esc(r.reasonNote) : '';
    return (reason || note) ? '<p class="rq-item__body">' + reason + note + '</p>' : '';
  }

  function listPanel() {
    const rows = (data && data.requests) || [];
    if (!rows.length) return '<h3 class="rq-h">My requests</h3><p class="rq-empty">You have not sent any request yet.</p>';
    return '<h3 class="rq-h">My requests</h3><div class="rq-list">' + rows.map((r) =>
      '<article class="rq-item">' +
        '<div class="rq-item__top"><span class="rq-item__title">' + esc((TYPES[r.type] || {}).title || r.type) + '</span>' + statusBadge(r) + '</div>' +
        '<div class="rq-item__when">Sent ' + esc(fmtDate(r.requestedAt)) + (r.decidedAt && r.status !== 'Pending' ? ' · Updated ' + esc(fmtDate(r.decidedAt)) : '') + '</div>' +
        detailLine(r) +
        (r.adminNote && r.status !== 'Cancelled' ? '<div class="rq-item__admin"><b>W.H. Academy:</b> ' + esc(r.adminNote) + '</div>' : '') +
        (r.status === 'Pending' ? '<button type="button" class="btn btn--secondary btn--sm" data-rq="cancel" data-id="' + esc(r.requestId) + '">Cancel this request</button>' : '') +
      '</article>').join('') + '</div>';
  }

  function render() {
    const el = root(); if (!el) return;
    if (!data) { el.innerHTML = '<p class="rq-empty">Loading…</p>'; return; }
    el.innerHTML = cards() + formPanel() + listPanel();
  }

  // ------------------------------------------------------------------ data

  async function load(silent) {
    try {
      data = await Api.request('student/request/list', {});
      render();
    } catch (err) {
      if (silent && data) return;
      const el = root();
      if (el) {
        el.innerHTML = '<p class="rq-error" role="alert">' + esc((err && err.message) || 'Could not load your requests.') +
          '</p><div class="rq-actions"><button type="button" class="btn btn--secondary btn--sm" data-rq="retry">Try again</button></div>';
      }
    }
  }

  function showError(msg, focusId) {
    const e = Utils.qs('#rq-error');
    if (e) { e.textContent = msg; e.hidden = !msg; }
    const f = focusId && Utils.qs('#' + focusId);
    if (f && f.focus) f.focus();
  }

  function readForm() {
    // Copy only the fields that are on screen, so a field that is not showing keeps its draft.
    const pick = (id, key) => { const el = Utils.qs('#' + id); if (el) draft[key] = el.value; };
    pick('rq-reason', 'reason');
    pick('rq-field', 'field');
    pick('rq-value', 'newValue');
    pick('rq-note', 'note');
    const c = Utils.qs('#rq-confirm'); if (c) draft.confirm = !!c.checked;
  }

  async function submit(btn) {
    if (busy || !open) return;
    readForm();
    const note = draft.note.trim();
    const body = { type: open, note };
    if (open === 'Leave') {
      if (!draft.reason) return showError('Please choose why you want to leave.', 'rq-reason');
      if (draft.reason === 'other' && note.length < 5) return showError('Please write a few words about your reason.', 'rq-note');
      body.reason = draft.reason;
    } else if (open === 'Correction') {
      if (!draft.field) return showError('Please choose which information is wrong.', 'rq-field');
      if (draft.newValue.trim().length < 2) return showError('Please write the correct information.', 'rq-value');
      body.field = draft.field; body.newValue = draft.newValue.trim();
    } else {
      if (!draft.confirm) return showError('Please tick the box to confirm that you want your data deleted.', 'rq-confirm');
      body.confirm = true;
    }
    showError('');
    busy = true; if (btn) btn.disabled = true;
    try {
      await Api.request('student/request/create', body);
      open = null; draft = emptyDraft(); busy = false;
      toast('Request sent. W.H. Academy will handle it and tell you here.', 'success');
      await load(false);
    } catch (err) {
      busy = false; if (btn) btn.disabled = false;
      const msg = (err && err.message) || 'Could not send your request.';
      showError(msg);
      toast(msg, 'error');
      if (/already have this kind/i.test(msg)) { open = null; await load(false); }
    }
  }

  async function cancel(id) {
    if (!id || busy) return;
    if (!window.confirm('Cancel this request?')) return;
    busy = true;
    try {
      await Api.request('student/request/cancel', { requestId: id });
      toast('Request cancelled.', 'success');
    } catch (err) {
      toast((err && err.message) || 'Could not cancel.', 'error');
    }
    busy = false;
    await load(false);
  }

  // ------------------------------------------------------------------ events

  document.addEventListener('wha:ready', () => {
    if (Router.currentPageName() !== 'settings.html') return;
    const el = root(); if (!el) return;
    el.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-rq]'); if (!b || b.disabled) return;
      const act = b.getAttribute('data-rq');
      if (act === 'open') {
        readForm();
        const t = b.getAttribute('data-type');
        if (open !== t) draft = emptyDraft();
        open = open === t ? null : t;
        render();
        const f = Utils.qs('#rq-form'); if (open && f && f.scrollIntoView) f.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      else if (act === 'close') { readForm(); open = null; render(); }
      else if (act === 'submit') submit(b);
      else if (act === 'cancel') cancel(b.getAttribute('data-id'));
      else if (act === 'retry') load(false);
    });
    // Keep what was typed, and clear the red message once the student edits something.
    el.addEventListener('input', () => { readForm(); showError(''); });
    el.addEventListener('change', () => { readForm(); showError(''); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && data) load(true); });
    load(false);
  });
})();
