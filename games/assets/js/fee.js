/**
 * fee.js — W.H. Academy
 * The student Fee page: month-by-month invoices (accordion) from student/fee.
 * Shows the dashboard fee + online/live-class fee + total, Paid/Pending, and the
 * due-window / lock note. Read-only for the student — the admin marks months paid.
 */
(function () {
  'use strict';

  const root = () => document.getElementById('fee-root');
  const esc = (v) => (window.Utils && Utils.escapeHtml ? Utils.escapeHtml(v)
    : String(v == null ? '' : v).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));

  function money(n) { n = Number(n) || 0; return 'Rs ' + n.toLocaleString('en-US'); }

  function noteHtml(d) {
    const locked = !!d.locked;
    const cls = 'fee-note' + (locked ? ' fee-locked' : '');
    let msg = 'Please submit your fee between the <b>' + d.dueFrom + '–' + d.dueTo +
      '</b> of each month. If the current month stays unpaid, your dashboard is locked from the <b>' + d.lockDay + 'th</b>.';
    if (locked) {
      msg = '<b>Your dashboard is locked.</b> You have not submitted <b>' + esc(d.currentLabel) +
        '</b> fee (total ' + money(d.currentTotal) + '). If you have already paid, tap the WhatsApp button below and send your Name, Student ID and Father name — once confirmed, your access returns.';
    }
    return '<div class="' + cls + '">' + msg + '</div>';
  }

  function waButton(d) {
    if (!d.whatsappUrl) return '';
    return '<a class="fee-wa" href="' + esc(d.whatsappUrl) + '" target="_blank" rel="noopener">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.2-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.2-.2.2-.3.3-.5.1-.2.1-.4 0-.5-.1-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3z"/><path d="M12 0C5.4 0 0 5.4 0 12c0 2.1.6 4.1 1.5 5.9L0 24l6.3-1.5c1.7.9 3.7 1.5 5.7 1.5 6.6 0 12-5.4 12-12S18.6 0 12 0zm0 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7.9.9-3.6-.2-.4c-1-1.6-1.5-3.4-1.5-5.3C2.1 6.4 6.6 1.9 12 1.9S21.9 6.4 21.9 12 17.5 21.8 12 21.8z"/></svg>' +
      'I have paid — message on WhatsApp</a>';
  }

  function onlineHtml(d) {
    if (!d.onlineClasses) return '';
    return '<div class="fee-note" style="margin-top:14px">You are enrolled in <b>online / live classes</b> — ' +
      money(d.onlineFee) + '/month is added to your dashboard fee.</div>';
  }

  function invoiceLines(m) {
    const inv = m.invoice || {};
    const lines = Array.isArray(inv.lines) ? inv.lines : [];
    let html = '';
    lines.forEach(function (ln) {
      html += '<div class="fee-line"><span>' + esc(ln.label) + '</span><span>' + money(ln.amount) + '</span></div>';
    });
    if (!lines.length) {
      html += '<div class="fee-line"><span>Dashboard fee</span><span>' + money(m.dashboardFee) + '</span></div>';
    }
    if (Number(m.onlineFee) > 0) {
      html += '<div class="fee-line"><span>Online / live classes</span><span>' + money(m.onlineFee) + '</span></div>';
    }
    html += '<div class="fee-line fee-line--total"><span>Total</span><span>' + money(m.totalFee) + '</span></div>';
    if (m.status === 'Paid' && m.paidAt) {
      html += '<div class="fee-line" style="color:var(--text-muted,#64748b);font-size:.82rem"><span>Paid on</span><span>' +
        esc(fmtDate(m.paidAt)) + '</span></div>';
    }
    return html;
  }

  function fmtDate(iso) {
    if (!iso) return '';
    try {
      if (window.Utils && Utils.formatFriendlyDate) return Utils.formatFriendlyDate(iso);
      var d = new Date(iso); if (isNaN(d)) return '';
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) { return ''; }
  }

  function monthCard(m) {
    const pill = m.status === 'Paid'
      ? '<span class="fee-pill fee-pill--paid">Paid</span>'
      : '<span class="fee-pill fee-pill--due">Pending</span>';
    const sub = 'Dashboard ' + money(m.dashboardFee) + (Number(m.onlineFee) > 0 ? ' + Online ' + money(m.onlineFee) : '');
    return '<div class="fee-card' + (m.isCurrent ? ' is-open' : '') + '" data-fee-card>' +
      '<div class="fee-card__head" data-fee-toggle>' +
        '<div><div class="fee-card__m">' + esc(m.label) + (m.isCurrent ? ' · this month' : '') + '</div>' +
          '<div class="fee-card__sub">' + sub + '</div></div>' +
        '<div class="fee-card__right"><div style="text-align:right"><div class="fee-card__total">' + money(m.totalFee) + '</div>' + pill + '</div>' +
          '<svg class="fee-caret" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></div>' +
      '</div>' +
      '<div class="fee-card__body">' + invoiceLines(m) + '</div>' +
    '</div>';
  }

  function render(d) {
    d = d || {};
    const months = Array.isArray(d.months) ? d.months : [];
    let html = noteHtml(d);
    if (d.locked) html += waButton(d);
    html += onlineHtml(d);
    html += '<div style="margin-top:18px">';
    html += months.length ? months.map(monthCard).join('')
      : '<p class="text-muted">No fee months yet.</p>';
    html += '</div>';
    const host = root(); if (!host) return;
    host.innerHTML = html;
    host.querySelectorAll('[data-fee-toggle]').forEach(function (h) {
      h.addEventListener('click', function () {
        const card = h.closest('[data-fee-card]'); if (card) card.classList.toggle('is-open');
      });
    });
  }

  async function load() {
    const host = root(); if (!host) return;
    try {
      const d = await Api.fee.mine();
      render(d);
    } catch (err) {
      console.error('[fee] load failed:', err);
      host.innerHTML = '<p class="text-muted">Could not load your fee details. Please refresh to try again.</p>';
    }
  }

  document.addEventListener('wha:ready', function () { load(); });
})();
