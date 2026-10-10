/**
 * W.H. Academy — Student Rechecking Center (Step 15D / lifetime-control v2)
 * Destination: games/assets/js/rechecking.js
 * Classification: PRODUCTION-PORTABLE
 *
 * Works with the already-deployed rechecking.html and Step15B backend.
 * Key v2 behavior:
 * - Resolved requests remain visible in Student history.
 * - NeedsStudentInfo re-opens the SAME request for Student clarification.
 * - Student revision calls bossbattle/recheck/revise (no duplicate claim).
 * - Before/after marking snapshots remain visible.
 */
(function () {
  'use strict';

  const esc = (value) => Utils.escapeHtml(value == null ? '' : String(value));
  const el = (id) => Utils.qs('#' + id);
  let current = null;

  function statusLabel(request) {
    const r = request || {};

    if (r.archivedAt) {
      return '<span class="rc-status rc-status--resolved">Archived</span>';
    }
    if (r.status === 'Open' && r.adminReviewStatus === 'NeedsStudentInfo') {
      return '<span class="rc-status rc-status--open">Action needed · update your claim</span>';
    }
    if (r.status === 'Open' && r.adminReviewStatus === 'NeedsReview') {
      return '<span class="rc-status rc-status--open">Sent back for another teacher review</span>';
    }
    if (r.status === 'Open') {
      return '<span class="rc-status rc-status--open">Under recheck</span>';
    }
    if (r.finalOutcome === 'CheckingCorrect') {
      return '<span class="rc-status rc-status--confirmed">Complete · checking confirmed correct</span>';
    }
    if (r.adminReviewStatus === 'Confirmed') {
      return '<span class="rc-status rc-status--confirmed">Complete · Admin confirmed</span>';
    }
    return '<span class="rc-status rc-status--resolved">Rechecked · Admin review pending</span>';
  }

  function answerText(item) {
    if (Array.isArray(item.yourSteps) && item.yourSteps.length) {
      return item.yourSteps.map((step) => step && step.text ? step.text : '').filter(Boolean).join(' → ');
    }
    if (Array.isArray(item.yourAnswer)) return item.yourAnswer.join(' → ');
    if (
      item.type === 'mcq' &&
      item.options &&
      item.yourAnswer !== '' &&
      item.options[Number(item.yourAnswer)] != null
    ) {
      return String.fromCharCode(65 + Number(item.yourAnswer)) + '. ' + item.options[Number(item.yourAnswer)];
    }
    return String(item.yourAnswer || 'No answer given');
  }

  function questionRows(data, mode, selectedIds) {
    const selected = new Set(selectedIds || []);
    const disabled = mode === 'locked' ? ' disabled' : '';
    return (data.items || []).map((item, index) => {
      const checked = selected.has(String(item.qId)) ? ' checked' : '';
      return (
        '<label class="rc-q">' +
          '<input type="checkbox" data-qid="' + esc(item.qId) + '"' + checked + disabled + '>' +
          '<div>' +
            '<div class="rc-q__text">Q' + (index + 1) + '. ' + esc(item.text) + '</div>' +
            '<div class="rc-q__meta">Your answer: ' + esc(answerText(item)) +
              (item.correction ? ' · Teacher feedback: ' + esc(item.correction) : '') +
            '</div>' +
          '</div>' +
          '<div class="rc-q__marks">' + esc(item.awardedMarks) + ' / ' + esc(item.marks) + '</div>' +
        '</label>'
      );
    }).join('');
  }

  function paperHeader(data) {
    return (
      '<div class="rc-paper-top">' +
        '<div>' +
          '<span class="rc-id">Paper ID · ' + esc(data.paperId) + '</span>' +
          '<h2 style="margin:.55rem 0 .2rem;">' + esc(data.paperTitle) + '</h2>' +
          '<p class="muted" style="margin:0;">' + esc(data.subject || 'Class-wide') + ' · Class ' + esc(data.classLevel) + '</p>' +
        '</div>' +
        '<div class="rc-score">' + esc(data.awardedMarks) + ' / ' + esc(data.totalMarks) + '</div>' +
      '</div>'
    );
  }

  function renderNewClaim(data) {
    const rows = questionRows(data, 'editable', []);
    return (
      '<div style="margin-top:1rem;">' +
        '<strong>Select the question(s) you want rechecked</strong>' +
        rows +
        '<label class="field rc-reason">' +
          '<span class="field__label">Why do you think the marking is incorrect?</span>' +
          '<textarea class="input" id="rc-reason" rows="4" maxlength="1500" placeholder="Be specific, e.g. Q3 working is correct but 0 marks were awarded."></textarea>' +
        '</label>' +
        '<button class="btn btn--primary" id="rc-submit" type="button">Submit rechecking claim</button>' +
      '</div>'
    );
  }

  function renderRevision(data, request) {
    const rows = questionRows(data, 'editable', request.claimedQuestionIds || []);
    return (
      '<div style="margin-top:1rem;">' +
        '<div class="rc-empty" style="text-align:left;margin-bottom:1rem;">' +
          '<strong>Admin needs more information from you.</strong>' +
          (request.adminNote ? '<br><span class="muted">Admin note: ' + esc(request.adminNote) + '</span>' : '') +
          '<br><span class="muted">Edit the same claim below. This will update request <strong>' + esc(request.requestId) + '</strong>; it will not create a duplicate.</span>' +
        '</div>' +
        '<strong>Update the question(s) in your claim</strong>' +
        rows +
        '<label class="field rc-reason">' +
          '<span class="field__label">Revised explanation</span>' +
          '<textarea class="input" id="rc-reason" rows="4" maxlength="1500">' + esc(request.studentReason || '') + '</textarea>' +
        '</label>' +
        '<button class="btn btn--primary" id="rc-revise" type="button">Resubmit this same claim</button>' +
      '</div>'
    );
  }

  function renderLockedOpen(request) {
    let text = 'You already have an open rechecking request for this paper.';
    if (request.adminReviewStatus === 'NeedsReview') {
      text = 'Admin sent this same request back for another teacher review.';
    }
    return (
      '<div class="rc-empty" style="margin-top:1rem;">' +
        esc(text) + '<br>' + statusLabel(request) +
        '<div class="muted" style="margin-top:.5rem;">Request ID · ' + esc(request.requestId) + '</div>' +
      '</div>'
    );
  }

  function renderPaper(data) {
    current = data;
    const open = data.openRequest;
    let body = '';

    if (!open) {
      body = renderNewClaim(data);
    } else if (open.adminReviewStatus === 'NeedsStudentInfo') {
      body = renderRevision(data, open);
    } else {
      body = renderLockedOpen(open);
    }

    el('rc-paper').innerHTML = '<section class="rc-paper-card">' + paperHeader(data) + body + '</section>';

    const submit = el('rc-submit');
    if (submit) submit.addEventListener('click', submitClaim);

    const revise = el('rc-revise');
    if (revise) revise.addEventListener('click', reviseClaim);
  }

  async function loadPaper() {
    const id = el('rc-paper-id').value.trim();
    if (!id) {
      Notifications.toast('Enter a Paper ID.', 'error');
      return;
    }

    el('rc-paper').innerHTML = '<p class="muted">Loading paper…</p>';
    try {
      renderPaper(await Api.request('bossbattle/recheck/lookup', { paperId: id }));
    } catch (error) {
      el('rc-paper').innerHTML = '<div class="rc-empty">' + esc(error.message || 'Could not find that paper.') + '</div>';
    }
  }

  function selectedQuestionIds() {
    return Utils.qsa('#rc-paper input[data-qid]:checked')
      .map((node) => node.getAttribute('data-qid'))
      .filter(Boolean);
  }

  async function submitClaim() {
    const ids = selectedQuestionIds();
    const reason = el('rc-reason').value.trim();

    if (!ids.length) {
      Notifications.toast('Select at least one question.', 'error');
      return;
    }
    if (reason.length < 5) {
      Notifications.toast('Explain the rechecking reason briefly.', 'error');
      return;
    }

    const button = el('rc-submit');
    button.disabled = true;
    button.textContent = 'Submitting…';

    try {
      await Api.request('bossbattle/recheck/request', {
        paperId: current.paperId,
        questionIds: ids,
        reason: reason
      });
      Notifications.toast('Rechecking request sent to Admin and the subject teacher.', 'success');
      await loadPaper();
      await loadHistory();
    } catch (error) {
      Notifications.toast(error.message || 'Could not submit the request.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Submit rechecking claim';
    }
  }

  async function reviseClaim() {
    const request = current && current.openRequest;
    if (!request || request.adminReviewStatus !== 'NeedsStudentInfo') {
      Notifications.toast('This request is not waiting for a student update.', 'error');
      return;
    }

    const ids = selectedQuestionIds();
    const reason = el('rc-reason').value.trim();

    if (!ids.length) {
      Notifications.toast('Select at least one question.', 'error');
      return;
    }
    if (reason.length < 5) {
      Notifications.toast('Explain your revised claim briefly.', 'error');
      return;
    }

    const button = el('rc-revise');
    button.disabled = true;
    button.textContent = 'Resubmitting…';

    try {
      const result = await Api.request('bossbattle/recheck/revise', {
        requestId: request.requestId,
        questionIds: ids,
        reason: reason
      });

      if (result && result.requestId && String(result.requestId) !== String(request.requestId)) {
        throw new Error('The revised claim did not keep the same Request ID.');
      }

      Notifications.toast('Your clarification was added to the same rechecking request.', 'success');
      await loadPaper();
      await loadHistory();
    } catch (error) {
      Notifications.toast(error.message || 'Could not update this rechecking request.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Resubmit this same claim';
    }
  }

  function diffBlock(request) {
    const before = request.beforeSnapshot || {};
    const after = request.resolutionSnapshot || {};
    const changes = Array.isArray(after.changes) ? after.changes : [];
    const changed = changes.filter((item) => item && (item.marksChanged || item.correctionChanged));

    if (!changed.length && !after.awardedMarks && after.awardedMarks !== 0) return '';

    return (
      '<div class="rc-diff">' +
        '<div class="rc-before"><strong>Before</strong><br>Total: ' + esc(before.awardedMarks) + ' / ' + esc(before.totalMarks) + '</div>' +
        '<div class="rc-after"><strong>After</strong><br>Total: ' + esc(after.awardedMarks) + ' / ' + esc(after.totalMarks) + '</div>' +
      '</div>'
    );
  }

  function outcomeText(request) {
    if (request.finalOutcome === 'CheckingCorrect') return 'Final outcome: Original checking confirmed correct.';
    if (request.finalOutcome === 'Corrected') return 'Final outcome: Marking/feedback corrected.';
    return '';
  }

  function renderHistory(rows) {
    const host = el('rc-history-list');
    if (!rows.length) {
      host.innerHTML = '<div class="rc-empty">No rechecking requests yet.</div>';
      return;
    }

    host.innerHTML = rows.map((request) => {
      const actionNeeded = request.status === 'Open' && request.adminReviewStatus === 'NeedsStudentInfo';
      const action = actionNeeded
        ? '<div style="margin-top:.75rem;"><button class="btn btn--primary btn--sm" type="button" data-edit-request="' + esc(request.requestId) + '" data-paper-id="' + esc(request.paperId) + '">Edit / clarify this claim</button></div>'
        : '';
      const outcome = outcomeText(request);
      const revisionInfo = Number(request.studentRevisionCount) > 0
        ? '<p class="muted">Student revisions: ' + esc(request.studentRevisionCount) + '</p>'
        : '';

      return (
        '<article class="rc-request">' +
          '<div class="rc-paper-top">' +
            '<div><span class="rc-id">' + esc(request.paperId) + '</span>' +
            '<div style="margin-top:.45rem;font-weight:750;">Request ' + esc(request.requestId) + '</div></div>' +
            statusLabel(request) +
          '</div>' +
          '<p><strong>Claim:</strong> ' + esc(request.studentReason) + '</p>' +
          '<p class="muted">Questions: ' + esc((request.claimedQuestionIds || []).join(', ')) + ' · ' + esc(request.createdAt ? new Date(request.createdAt).toLocaleString() : '') + '</p>' +
          diffBlock(request) +
          (request.teacherNote ? '<p><strong>Rechecker note:</strong> ' + esc(request.teacherNote) + '</p>' : '') +
          (request.adminNote ? '<p><strong>Admin note:</strong> ' + esc(request.adminNote) + '</p>' : '') +
          (outcome ? '<p><strong>' + esc(outcome) + '</strong></p>' : '') +
          revisionInfo +
          action +
        '</article>'
      );
    }).join('');

    Utils.qsa('#rc-history-list [data-edit-request]').forEach((button) => {
      button.addEventListener('click', async function () {
        const paperId = button.getAttribute('data-paper-id') || '';
        if (!paperId) return;
        el('rc-paper-id').value = paperId;
        await loadPaper();
        el('rc-paper').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  async function loadHistory() {
    try {
      const data = await Api.request('bossbattle/recheck/myRequests', {});
      renderHistory(data.requests || []);
    } catch (error) {
      el('rc-history-list').innerHTML = '<div class="rc-empty">Could not load rechecking history.</div>';
    }
  }

  document.addEventListener('wha:ready', () => {
    if (Router.currentPageName() !== 'rechecking.html') return;

    el('rc-load').addEventListener('click', loadPaper);
    el('rc-paper-id').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') loadPaper();
    });
    el('rc-refresh').addEventListener('click', loadHistory);

    const paperFromQuery = Router.getQueryParam('paper');
    if (paperFromQuery) {
      el('rc-paper-id').value = paperFromQuery;
      loadPaper();
    }

    loadHistory();
  });
})();
