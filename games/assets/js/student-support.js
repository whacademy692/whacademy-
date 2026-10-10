/** Student Support UI — frontend-only draft stage, 2026-09-15. */
(function () {
  'use strict';
  const KEY = 'wha:support_issue_draft:v1';

  function qs(s) { return document.querySelector(s); }
  function activate(which) {
    const recheck = which === 'recheck';
    const t1 = qs('#rc-tab-recheck'), t2 = qs('#rc-tab-issue');
    const p1 = qs('#rc-panel-recheck'), p2 = qs('#rc-panel-issue');
    if (!t1 || !t2 || !p1 || !p2) return;
    t1.classList.toggle('is-active', recheck); t1.setAttribute('aria-selected', recheck ? 'true' : 'false');
    t2.classList.toggle('is-active', !recheck); t2.setAttribute('aria-selected', !recheck ? 'true' : 'false');
    p1.hidden = !recheck; p2.hidden = recheck;
  }

  function loadDraft() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { return {}; }
  }
  function saveDraft(d) { localStorage.setItem(KEY, JSON.stringify(d)); }

  document.addEventListener('wha:ready', function () {
    if (Router.currentPageName() !== 'rechecking.html') return;
    const t1 = qs('#rc-tab-recheck'), t2 = qs('#rc-tab-issue');
    if (t1) t1.addEventListener('click', function () { activate('recheck'); });
    if (t2) t2.addEventListener('click', function () { activate('issue'); });

    const page = qs('#support-page');
    const category = qs('#support-category');
    const message = qs('#support-message');
    const form = qs('#support-issue-form');
    const clear = qs('#support-clear');
    const status = qs('#support-status');
    if (!form || !page || !category || !message || !status) return;

    const draft = loadDraft();
    page.value = draft.page || window.location.pathname;
    category.value = draft.category || 'navigation';
    message.value = draft.message || '';

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const text = message.value.trim();
      if (!text) {
        status.textContent = 'Write a short description before saving the draft.';
        message.focus();
        return;
      }
      saveDraft({ category: category.value, page: page.value, message: text, savedAt: new Date().toISOString() });
      status.textContent = 'Draft saved on this browser. It has not been sent to Admin yet.';
    });

    if (clear) clear.addEventListener('click', function () {
      localStorage.removeItem(KEY);
      category.value = 'navigation';
      page.value = window.location.pathname;
      message.value = '';
      status.textContent = 'Draft cleared.';
    });
  });
})();
