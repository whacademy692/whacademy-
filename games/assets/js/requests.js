/**
 * requests.js — W.H. Academy
 * "Requests" section of settings.html: a student (or parent, using the student's account) can ask to
 *   - Leave W.H. Academy                 (reason is asked)
 *   - Correct wrong information          (tick one or many things + the correct value for each)
 *   - Delete their data                  (needs a tick to confirm)
 *
 *   student/request/list     -> my requests + which kinds are already waiting + the fields that can be corrected
 *   student/request/create   -> send a request (admin handles it in the admin panel "Requests" tab)
 *   student/request/cancel   -> take back a request that is still waiting
 *
 * Each kind can wait only once at a time; the three kinds are independent of each other.
 * What a request does is decided by the admin; nothing happens to the account until then.
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

  let data = null;           // { requests, waiting, fields, lists }
  let open = null;           // which form is showing
  let busy = false;
  let draft = emptyDraft();

  function emptyDraft() { return { reason: '', note: '', confirm: false, changes: {} }; }

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

  // A short reference the student can quote on WhatsApp (the full id is long).
  function ref(id) { return 'RQ-' + String(id || '').replace(/^REQ-/, '').slice(0, 8).toUpperCase(); }

  function statusBadge(r) {
    const t = r.type, s = r.status;
    if (s === 'Pending') return '<span class="badge badge--warning">Waiting</span>';
    if (s === 'Approved') return '<span class="badge badge--info">' + (t === 'Deletion' ? 'Approved, deletion in progress' : 'Approved') + '</span>';
    if (s === 'Done') return '<span class="badge badge--success">Done</span>';
    if (s === 'Rejected') return '<span class="badge badge--error">Not approved</span>';
    return '<span class="badge badge--neutral">' + esc(s) + '</span>';
  }

  const fieldsList = () => ((data && (data.fields || (data.lists && data.lists.correction))) || []);

  // ------------------------------------------------------------------ views

  function cards() {
    const waiting = (data && data.waiting) || {};
    return '<div class="rq-grid">' + ORDER.map((t) => {
      const w = !!waiting[t];
      return '<button type="button" class="rq-card rq-card--' + t.toLowerCase() + (open === t ? ' is-open' : '') + '" data-rq="open" data-type="' + t + '"' + (w ? ' disabled' : '') + '>' +
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

  function deletionWaitingNote() {
    const w = (data && data.waiting) || {};
    return w.Deletion
      ? '<div class="rq-note rq-note--warn">You have already asked us to <b>delete your data</b>. If that is approved your account will be closed, so this request may not be needed. You can still send it.</div>'
      : '';
  }

  function formLeave() {
    const lists = (data && data.lists) || {};
    return '<h3>Leave W.H. Academy</h3>' + deletionWaitingNote() +
      '<label class="rq-field"><span>Why do you want to leave? <em>(required)</em></span>' +
        '<select class="input" id="rq-reason">' + options(lists.leave, draft.reason, 'Choose a reason…') + '</select></label>' +
      noteField('Anything you would like to tell us?', 'Your honest feedback helps us improve.', false) +
      '<div class="rq-note rq-note--warn"><b>Please know:</b><ul>' +
        '<li>After W.H. Academy approves, your account is closed and you can no longer log in.</li>' +
        '<li>Fees already paid are not returned, also for the month you leave (see the <a href="../terms.html#refund" target="_blank" rel="noopener">Terms</a>).</li>' +
        '<li>Your records, including your dashboard data and game scores, may be kept for record-keeping and backup. If you want them deleted, send a “Delete my data” request.</li>' +
      '</ul></div>';
  }

  function fieldRow(f) {
    const on = Object.prototype.hasOwnProperty.call(draft.changes, f.code);
    const cur = f.current ? 'Now: ' + esc(f.current) : 'Not given yet';
    let input = '';
    if (on) {
      const val = esc(draft.changes[f.code]);
      const type = f.code === 'email' ? 'email' : f.code === 'whatsapp' ? 'tel' : 'text';
      const mode = f.code === 'classLevel' || f.code === 'whatsapp' ? ' inputmode="' + (f.code === 'whatsapp' ? 'tel' : 'numeric') + '"' : '';
      input = '<input class="input rq-fld__input" data-val="' + esc(f.code) + '" type="' + type + '"' + mode + ' maxlength="300" autocomplete="off" value="' + val + '" placeholder="Write the correct ' + esc(f.label.toLowerCase()) + '" aria-label="Correct ' + esc(f.label) + '">';
    }
    return '<div class="rq-fld' + (on ? ' is-on' : '') + '">' +
      '<label class="rq-fld__head"><input type="checkbox" data-fld="' + esc(f.code) + '"' + (on ? ' checked' : '') + '>' +
        '<span class="rq-fld__name">' + esc(f.label) + '</span><span class="rq-fld__cur">' + cur + '</span></label>' + input + '</div>';
  }

  function otherRow() {
    const on = Object.prototype.hasOwnProperty.call(draft.changes, 'other');
    return '<div class="rq-fld' + (on ? ' is-on' : '') + '">' +
      '<label class="rq-fld__head"><input type="checkbox" data-fld="other"' + (on ? ' checked' : '') + '>' +
        '<span class="rq-fld__name">Something else</span><span class="rq-fld__cur">Anything not in the list</span></label>' +
      (on ? '<textarea class="input rq-fld__input rq-fld__other" data-val="other" rows="2" maxlength="300" placeholder="Tell us what is wrong and what it should be" aria-label="Something else">' + esc(draft.changes.other) + '</textarea>' : '') +
      '</div>';
  }

  function formCorrection() {
    const n = Object.keys(draft.changes).length;
    return '<h3>Correct my information</h3>' + deletionWaitingNote() +
      '<p class="rq-help">Tick <b>everything</b> that is wrong, then write the correct information for each one. You can send as many as you need in a single request.</p>' +
      '<div class="rq-fields">' + fieldsList().map(fieldRow).join('') + otherRow() + '</div>' +
      '<p class="rq-count">' + (n ? n + ' selected' : 'Nothing selected yet') + '</p>' +
      noteField('Anything else we should know?', 'For example: my father’s name is spelt wrongly on my card.', false) +
      '<div class="rq-note">W.H. Academy checks your request and updates the information. When it is done we tell you here, and we list exactly what was changed so you can confirm it. You can also message us on <a href="' + esc(WHATSAPP) + '" target="_blank" rel="noopener">WhatsApp</a>.</div>';
  }

  function formDeletion() {
    const w = (data && data.waiting) || {};
    const others = [];
    if (w.Leave) others.push('leave');
    if (w.Correction) others.push('correction');
    return '<h3>Delete my data</h3>' +
      '<div class="rq-note rq-note--danger"><b>Your account will be closed.</b> If W.H. Academy approves this request, you can no longer log in to your dashboard.' +
        (others.length ? ' Your waiting ' + others.join(' and ') + ' request will not be needed any more.' : '') + '</div>' +
      '<div class="rq-note rq-note--warn"><b>If W.H. Academy approves, we will:</b><ul>' +
        '<li>delete your personal details (name, contact details, address, school) and your learning activity, game scores and Boss Battle answers,</li>' +
        '<li>close your account.</li>' +
      '</ul><b>We keep</b> only minimal fee and payment records that we need for our accounts. <b>This cannot be undone.</b></div>' +
      '<label class="rq-check"><input type="checkbox" id="rq-confirm"' + (draft.confirm ? ' checked' : '') + '> ' +
        '<span>I understand that my account will be closed, and I want my data deleted.</span></label>' +
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

  // What a Correction asked for, for both the new (changes[]) and the old single-field shape.
  function changesOf(r) {
    const d = r.details || {};
    if (Array.isArray(d.changes)) return d.changes;
    if (d.field || d.newValue) return [{ label: d.fieldLabel || r.reason, newValue: d.newValue }];
    return [];
  }

  function detailLine(r) {
    if (r.type === 'Correction') {
      const ch = changesOf(r);
      const list = ch.length
        ? '<ul class="rq-item__changes">' + ch.map((c) => '<li><b>' + esc(c.label) + ':</b> ' +
            (c.current ? '<s>' + esc(c.current) + '</s> → ' : '') + esc(c.newValue) + '</li>').join('') + '</ul>'
        : '';
      return list + (r.reasonNote ? '<p class="rq-item__body">' + esc(r.reasonNote) + '</p>' : '');
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
        '<div class="rq-item__when">Ref ' + esc(ref(r.requestId)) + ' · Sent ' + esc(fmtDate(r.requestedAt)) + (r.decidedAt && r.status !== 'Pending' ? ' · Updated ' + esc(fmtDate(r.decidedAt)) : '') + '</div>' +
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

  function showError(msg, focusSel) {
    const e = Utils.qs('#rq-error');
    if (e) { e.textContent = msg; e.hidden = !msg; }
    const f = focusSel && Utils.qs(focusSel);
    if (f && f.focus) f.focus();
  }

  function readForm() {
    // Copy only the fields that are on screen, so a field that is not showing keeps its draft.
    const pick = (id, key) => { const el = Utils.qs('#' + id); if (el) draft[key] = el.value; };
    pick('rq-reason', 'reason');
    pick('rq-note', 'note');
    const c = Utils.qs('#rq-confirm'); if (c) draft.confirm = !!c.checked;
    const el = root();
    if (el) {
      el.querySelectorAll('[data-val]').forEach((inp) => {
        const code = inp.getAttribute('data-val');
        if (Object.prototype.hasOwnProperty.call(draft.changes, code)) draft.changes[code] = inp.value;
      });
    }
  }

  function labelOf(code) {
    if (code === 'other') return 'Something else';
    const f = fieldsList().find((x) => x.code === code);
    return f ? f.label : code;
  }

  async function submit(btn) {
    if (busy || !open) return;
    readForm();
    const note = draft.note.trim();
    const body = { type: open, note };
    if (open === 'Leave') {
      if (!draft.reason) return showError('Please choose why you want to leave.', '#rq-reason');
      if (draft.reason === 'other' && note.length < 5) return showError('Please write a few words about your reason.', '#rq-note');
      body.reason = draft.reason;
    } else if (open === 'Correction') {
      const codes = Object.keys(draft.changes);
      if (!codes.length) return showError('Please tick at least one thing that needs to be corrected.');
      const changes = [];
      for (const code of codes) {
        const v = String(draft.changes[code] || '').trim();
        if (v.length < (code === 'other' ? 3 : 1)) return showError('Please write the correct information for “' + labelOf(code) + '”, or untick it.', '[data-val="' + code + '"]');
        changes.push({ field: code, newValue: v });
      }
      body.changes = changes;
    } else {
      if (!draft.confirm) return showError('Please tick the box to confirm that you want your data deleted.', '#rq-confirm');
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
    el.addEventListener('change', (e) => {
      const t = e.target;
      const code = t && t.getAttribute && t.getAttribute('data-fld');
      if (code) {
        readForm();
        if (t.checked) { if (!Object.prototype.hasOwnProperty.call(draft.changes, code)) draft.changes[code] = ''; }
        else delete draft.changes[code];
        render();
        if (t.checked) { const inp = Utils.qs('[data-val="' + code + '"]'); if (inp && inp.focus) inp.focus(); }
        return;
      }
      readForm(); showError('');
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && data) load(true); });
    // A status change made by the admin shows up without a reload (only while no form is being filled).
    setInterval(() => { if (!document.hidden && data && !open && !busy) load(true); }, 45000);
    load(false);
  });
})();
