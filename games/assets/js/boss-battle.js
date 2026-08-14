/**
 * boss-battle.js — W.H. Academy
 * The student-facing Boss-Battle tab. Three views inside one page:
 *
 *   LIST     the three level lanes (L1 chapter / L2 subject / L3 class) with
 *            each level's ACTIVE paper, plus a Past Papers shelf.
 *   ATTEMPT  a single paper rendered as an attractive, federal-board-style
 *            form: MCQ options, short-answer boxes (3-4 lines) and long-answer
 *            boxes (8-10 lines). Submitted in-app.
 *   RESULT   the student's own submission — "awaiting result" until a teacher
 *            grades it, then per-question marks + correction feedback.
 *
 * Everything is scoped server-side to the signed-in student's class + subjects
 * (BossBattle.gs), so this file never sends a class or subject.
 */

(function () {

  const esc = (v) => Utils.escapeHtml(v == null ? '' : String(v));

  const LEVEL_META = {
    L1: { label: 'Level 1', tag: 'Chapter', blurb: 'One chapter, one subject.', cls: 'l1' },
    L2: { label: 'Level 2', tag: 'Subject', blurb: 'The whole subject / book.', cls: 'l2' },
    L3: { label: 'Level 3', tag: 'Class',   blurb: 'A combined class-wide paper.', cls: 'l3' }
  };

  // In-memory cache of the paper currently open in the attempt view, so submit
  // can validate against the same question set the student saw.
  let currentPaper = null;

  // ---- view switching ----------------------------------------------------

  function el(id) { return Utils.qs('#' + id); }

  function showView(name) {
    ['bb-skeleton', 'bb-error', 'bb-list-view', 'bb-attempt-view', 'bb-result-view']
      .forEach((v) => { const n = el(v); if (n) n.hidden = (v !== name); });
    const hero = el('bb-hero');
    if (hero) hero.hidden = (name === 'bb-attempt-view'); // give the paper full focus
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showError() { showView('bb-error'); }

  // ---- LIST view ---------------------------------------------------------

  function statusPill(paper) {
    if (!paper.attempted) return '<span class="bb-pill bb-pill--new">New · not attempted</span>';
    if (paper.graded) {
      return '<span class="bb-pill bb-pill--graded">Result: ' + esc(paper.awardedMarks) +
        ' / ' + esc(paper.totalMarks) + '</span>';
    }
    return '<span class="bb-pill bb-pill--pending">Submitted · awaiting result</span>';
  }

  function paperMetaLine(paper) {
    const bits = [];
    if (paper.subject) bits.push(esc(paper.subject));
    if (paper.chapterRef) {
      const chap = String(paper.chapterRef).split('/').pop().replace(/[-_]/g, ' ');
      bits.push(esc(chap));
    }
    bits.push(esc(paper.questionCount) + ' questions');
    bits.push(esc(paper.totalMarks) + ' marks');
    return bits.join('  ·  ');
  }

  function activePaperCard(paper) {
    const attempted = paper.attempted;
    const btnLabel = !attempted ? 'Enter Battle' : (paper.graded ? 'View result' : 'View submission');
    return '' +
      '<article class="bb-paper-card">' +
        '<div class="bb-paper-card__body">' +
          '<h4 class="bb-paper-card__title">' + esc(paper.title) + '</h4>' +
          '<p class="bb-paper-card__meta">' + paperMetaLine(paper) + '</p>' +
          statusPill(paper) +
        '</div>' +
        '<button class="btn ' + (attempted ? 'btn--secondary' : 'btn--primary') + ' bb-open-btn" ' +
          'data-paper-id="' + esc(paper.paperId) + '">' + btnLabel + '</button>' +
      '</article>';
  }

  function levelLane(levelKey, papers) {
    const meta = LEVEL_META[levelKey];
    const inner = papers.length
      ? papers.map(activePaperCard).join('')
      : '<div class="bb-empty-lane">No active paper for this level yet. Check back soon.</div>';
    return '' +
      '<section class="bb-lane bb-lane--' + meta.cls + '">' +
        '<div class="bb-lane__head">' +
          '<div class="bb-lane__badge" aria-hidden="true">' + meta.label.split(' ')[1] + '</div>' +
          '<div>' +
            '<h3 class="bb-lane__title">' + esc(meta.label) + ' <span class="bb-lane__tag">' + esc(meta.tag) + '</span></h3>' +
            '<p class="bb-lane__blurb">' + esc(meta.blurb) + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="bb-lane__papers">' + inner + '</div>' +
      '</section>';
  }

  function pastPapersSection(pastPapers) {
    if (!pastPapers || !pastPapers.length) return '';
    const cards = pastPapers.map((p) =>
      '<article class="bb-past-card">' +
        '<div class="bb-past-card__body">' +
          '<h4 class="bb-past-card__title">' + esc(p.title) + '</h4>' +
          '<p class="bb-paper-card__meta">' + paperMetaLine(p) + '</p>' +
        '</div>' +
        '<button class="btn btn--secondary btn--sm bb-open-btn" data-paper-id="' + esc(p.paperId) + '">View paper</button>' +
      '</article>'
    ).join('');
    return '' +
      '<section class="bb-past">' +
        '<h3 class="bb-section-title">Past Papers <span class="bb-muted-note">practice only · not ranked</span></h3>' +
        '<div class="bb-past__grid">' + cards + '</div>' +
      '</section>';
  }

  function renderList(activeData, pastData) {
    const papers = (activeData && activeData.papers) || [];
    const byLevel = { L1: [], L2: [], L3: [] };
    papers.forEach((p) => { if (byLevel[p.level]) byLevel[p.level].push(p); });

    const subtitle = el('bb-hero-subtitle');
    if (subtitle && activeData.student) {
      const name = (activeData.student.fullName || '').split(' ')[0] || 'Champion';
      subtitle.textContent = 'Ready, ' + name + '? Beat the boss, earn the badge.';
    }

    const view = el('bb-list-view');
    view.innerHTML =
      '<div class="bb-lanes">' +
        levelLane('L1', byLevel.L1) +
        levelLane('L2', byLevel.L2) +
        levelLane('L3', byLevel.L3) +
      '</div>' +
      pastPapersSection((pastData && pastData.papers) || []);

    Utils.qsa('.bb-open-btn', view).forEach((btn) => {
      btn.addEventListener('click', () => openPaper(btn.getAttribute('data-paper-id')));
    });

    showView('bb-list-view');
  }

  // ---- ATTEMPT view ------------------------------------------------------

  const TYPE_PARTS = [
    { type: 'mcq',   heading: 'Part A — Multiple Choice', hint: 'Choose one option.' },
    { type: 'short', heading: 'Part B — Short Questions',  hint: 'Answer briefly.' },
    { type: 'long',  heading: 'Part C — Long Questions',   hint: 'Answer in detail.' }
  ];

  function mcqBlock(q, num, readOnly, savedAnswer) {
    const opts = (q.options || []).map((opt, i) => {
      const checked = (String(savedAnswer) === String(i)) ? 'checked' : '';
      const chosen = checked ? ' bb-opt--chosen' : '';
      return '' +
        '<label class="bb-opt' + chosen + '">' +
          '<input type="radio" name="' + esc(q.qId) + '" value="' + i + '" ' + checked +
            (readOnly ? ' disabled' : '') + '>' +
          '<span class="bb-opt__mark">' + String.fromCharCode(65 + i) + '</span>' +
          '<span class="bb-opt__text">' + esc(opt) + '</span>' +
        '</label>';
    }).join('');
    return questionShell(q, num, '<div class="bb-opts">' + opts + '</div>');
  }

  // Hard character cap per question — the federal-board "fixed space" rule.
  // Prefer an explicit backend value (q.maxChars / q.answerLimit); otherwise
  // derive a sane cap from the answer space (~80 chars per visible line),
  // clamped so a 3-line short box and a 14-line long box both stay reasonable.
  function answerCharLimit(q, rows) {
    const explicit = Number(q.maxChars != null ? q.maxChars : q.answerLimit);
    if (explicit > 0) return explicit;
    return Utils.clamp(rows * 80, 120, 2000);
  }

  function writtenBlock(q, num, readOnly, savedAnswer) {
    const rows = Utils.clamp(Number(q.maxLines) || (q.type === 'long' ? 10 : 4), 3, 14);
    const limit = answerCharLimit(q, rows);
    const val = savedAnswer != null ? esc(savedAnswer) : '';
    const used = savedAnswer != null ? String(savedAnswer).length : 0;
    const box =
      '<textarea class="bb-answer" data-qid="' + esc(q.qId) + '" rows="' + rows + '" ' +
        'maxlength="' + limit + '" ' +
        'placeholder="' + (readOnly ? '' : 'Write your answer here…') + '" ' +
        (readOnly ? 'readonly' : '') + '>' + val + '</textarea>' +
      // Counter only while attempting — a read-only past/submitted view doesn't need it.
      (readOnly ? '' :
        '<div class="bb-answer-meta">' +
          '<span class="bb-answer-count" data-count-for="' + esc(q.qId) + '">' +
            used + ' / ' + limit + ' characters' +
          '</span>' +
        '</div>');
    return questionShell(q, num, box);
  }

  function questionShell(q, num, inner) {
    return '' +
      '<div class="bb-q">' +
        '<div class="bb-q__head">' +
          '<span class="bb-q__num">' + num + '</span>' +
          '<p class="bb-q__text">' + esc(q.text).replace(/\n/g, '<br>') + '</p>' +
          '<span class="bb-q__marks">' + esc(q.marks) + '</span>' +
        '</div>' +
        inner +
      '</div>';
  }

  function renderAttempt(data) {
    currentPaper = data.paper;
    const paper = data.paper;
    const readOnly = !!data.readOnly;
    const saved = (data.submission && data.submission.items) ? {} : null;
    if (data.submission && data.submission.items) {
      data.submission.items.forEach((it) => { saved[it.qId] = it.yourAnswer; });
    }

    let bodyHtml = '';
    TYPE_PARTS.forEach((part) => {
      const qs = paper.questions.filter((q) => q.type === part.type);
      if (!qs.length) return;
      bodyHtml += '<div class="bb-part"><div class="bb-part__head"><h3>' + esc(part.heading) +
        '</h3><span>' + esc(part.hint) + '</span></div>';
      qs.forEach((q, i) => {
        const num = (part.type === 'mcq' ? (i + 1) : (part.type === 'short' ? (i + 1) : (i + 1)));
        const sa = saved ? saved[q.qId] : null;
        bodyHtml += (q.type === 'mcq')
          ? mcqBlock(q, num, readOnly, sa)
          : writtenBlock(q, num, readOnly, sa);
      });
      bodyHtml += '</div>';
    });

    const banner = readOnly
      ? '<div class="bb-readonly-note">' +
          (paper.status === 'Past'
            ? 'This is a past paper — practice only, not graded or ranked.'
            : 'You have already submitted this paper. This is a read-only view.') +
        '</div>'
      : '<div class="bb-attempt-warn">Once you submit, your answers are final — you cannot change them.</div>';

    const submitBar = readOnly ? '' :
      '<div class="bb-submitbar">' +
        '<span class="bb-submitbar__count" id="bb-answered-count">0 answered</span>' +
        '<button class="btn btn--primary bb-submit-btn" id="bb-submit">Submit paper</button>' +
      '</div>';

    el('bb-attempt-view').innerHTML =
      '<div class="bb-paper-sheet">' +
        '<div class="bb-paper-topbar">' +
          '<button class="btn btn--tertiary btn--sm bb-back" id="bb-back">‹ Back to Arena</button>' +
          '<span class="bb-paper-topbar__marks">Total: ' + esc(paper.totalMarks) + ' marks</span>' +
        '</div>' +
        '<header class="bb-paper-head">' +
          '<span class="bb-paper-head__level bb-chip--' + (LEVEL_META[paper.level] ? LEVEL_META[paper.level].cls : 'l1') + '">' +
            esc(paper.level) + ' · ' + esc(LEVEL_META[paper.level] ? LEVEL_META[paper.level].tag : '') + '</span>' +
          '<h2 class="bb-paper-head__title">' + esc(paper.title) + '</h2>' +
          (paper.description ? '<p class="bb-paper-head__desc">' + esc(paper.description) + '</p>' : '') +
        '</header>' +
        banner +
        '<div class="bb-paper-body">' + bodyHtml + '</div>' +
        submitBar +
      '</div>';

    el('bb-back').addEventListener('click', loadList);

    if (!readOnly) {
      const view = el('bb-attempt-view');
      const updateCount = () => {
        let answered = 0;
        paper.questions.forEach((q) => {
          if (q.type === 'mcq') {
            if (view.querySelector('input[name="' + CSS.escape(q.qId) + '"]:checked')) answered++;
          } else {
            const ta = view.querySelector('textarea[data-qid="' + CSS.escape(q.qId) + '"]');
            if (ta && ta.value.trim()) answered++;
          }
        });
        const c = el('bb-answered-count');
        if (c) c.textContent = answered + ' / ' + paper.questions.length + ' answered';
      };
      Utils.qsa('.bb-opt input', view).forEach((inp) => {
        inp.addEventListener('change', () => {
          // highlight the chosen option within its group
          const group = view.querySelectorAll('.bb-opt input[name="' + CSS.escape(inp.name) + '"]');
          group.forEach((g) => g.closest('.bb-opt').classList.toggle('bb-opt--chosen', g.checked));
          updateCount();
        });
      });
      Utils.qsa('.bb-answer', view).forEach((ta) => {
        ta.addEventListener('input', () => {
          updateCount();
          const qid = ta.getAttribute('data-qid');
          const meta = view.querySelector('.bb-answer-count[data-count-for="' + CSS.escape(qid) + '"]');
          if (meta) {
            const max = ta.getAttribute('maxlength');
            meta.textContent = ta.value.length + ' / ' + max + ' characters';
            meta.classList.toggle('bb-answer-count--full', !!max && ta.value.length >= Number(max));
          }
        });
      });
      el('bb-submit').addEventListener('click', () => submitPaper(paper));
      updateCount();
    }

    showView('bb-attempt-view');
  }

  function collectAnswers(paper) {
    const view = el('bb-attempt-view');
    const answers = {};
    paper.questions.forEach((q) => {
      if (q.type === 'mcq') {
        const sel = view.querySelector('input[name="' + CSS.escape(q.qId) + '"]:checked');
        if (sel) answers[q.qId] = Number(sel.value);
      } else {
        const ta = view.querySelector('textarea[data-qid="' + CSS.escape(q.qId) + '"]');
        if (ta && ta.value.trim()) answers[q.qId] = ta.value.trim();
      }
    });
    return answers;
  }

  async function submitPaper(paper) {
    const answers = collectAnswers(paper);
    const answeredCount = Object.keys(answers).length;
    const total = paper.questions.length;

    let message = 'Submit your paper now? Your answers will be final.';
    if (answeredCount < total) {
      message = 'You have answered ' + answeredCount + ' of ' + total +
        ' questions. Unanswered questions get no marks. Submit anyway?';
    }
    if (!window.confirm(message)) return;

    const btn = el('bb-submit');
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }

    try {
      await Api.bossBattle.submit(paper.paperId, answers);
      Notifications.toast('Paper submitted! Your teacher will grade it soon.', 'success');
      openPaper(paper.paperId); // reloads → shows the "awaiting result" view
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Submit paper'; }
      const msg = (err && err.message) ? err.message : 'Could not submit. Please try again.';
      Notifications.toast(msg, 'error');
    }
  }

  // ---- RESULT view -------------------------------------------------------

  function renderResult(submission, paperTitle) {
    const graded = submission.graded;
    const items = submission.items || [];

    // Percentage (spec §4) — only when we have a positive total to divide by.
    const total = Number(submission.totalMarks);
    const pct = (graded && total > 0)
      ? Math.round((Number(submission.awardedMarks) / total) * 100)
      : null;

    // Overall teacher feedback (spec §4, "if provided"). Renders only when the
    // backend actually sends it — populate submission.overallFeedback on the
    // grade endpoint. teacherFeedback / overallComment are accepted as aliases.
    const overall = submission.overallFeedback || submission.teacherFeedback || submission.overallComment || '';
    const overallBlock = (graded && overall)
      ? '<div class="bb-result-overall">' +
          '<span class="bb-result-overall__label">Overall feedback</span>' +
          '<p class="bb-result-overall__body">' + esc(overall).replace(/\n/g, '<br>') + '</p>' +
        '</div>'
      : '';

    const header = graded
      ? '<div class="bb-result-score">' +
          '<div class="bb-result-score__ring"><span>' + esc(submission.awardedMarks) + '</span>' +
          '<small>/ ' + esc(submission.totalMarks) + '</small></div>' +
          '<div><h2 class="bb-result-score__title">Battle graded!</h2>' +
          (pct != null ? '<p class="bb-result-score__pct">' + pct + '%</p>' : '') +
          '<p class="bb-result-score__sub">Here is your teacher\'s feedback, question by question.</p></div>' +
        '</div>'
      : '<div class="bb-result-pending">' +
          '<div class="bb-result-pending__spinner" aria-hidden="true"></div>' +
          '<div><h2 class="bb-result-pending__title">Submitted — awaiting result</h2>' +
          '<p class="bb-result-pending__sub">Your paper is in. Your teacher will grade it and your marks + ' +
          'feedback will appear right here.</p></div>' +
        '</div>';

    const rows = items.map((it, i) => {
      const yourAns = (it.type === 'mcq')
        ? mcqAnswerLabel(it)
        : (it.yourAnswer ? esc(it.yourAnswer).replace(/\n/g, '<br>') : '<em class="bb-muted-note">No answer given</em>');
      const gradedBlock = graded
        ? '<div class="bb-result-q__graded">' +
            '<span class="bb-pill bb-pill--graded">' +
              (it.awardedMarks == null ? '—' : esc(it.awardedMarks)) + ' / ' + esc(it.marks) + '</span>' +
            (it.correction ? '<p class="bb-result-q__fb"><strong>Teacher:</strong> ' +
              esc(it.correction).replace(/\n/g, '<br>') + '</p>' : '') +
          '</div>'
        : '';
      return '' +
        '<div class="bb-result-q">' +
          '<div class="bb-q__head"><span class="bb-q__num">' + (i + 1) + '</span>' +
            '<p class="bb-q__text">' + esc(it.text).replace(/\n/g, '<br>') + '</p>' +
            '<span class="bb-q__marks">' + esc(it.marks) + '</span></div>' +
          '<div class="bb-result-q__ans"><span class="bb-result-q__label">Your answer</span>' +
            '<div class="bb-result-q__ansbody">' + yourAns + '</div></div>' +
          gradedBlock +
        '</div>';
    }).join('');

    el('bb-result-view').innerHTML =
      '<div class="bb-paper-sheet">' +
        '<div class="bb-paper-topbar">' +
          '<button class="btn btn--tertiary btn--sm" id="bb-result-back">‹ Back to Arena</button>' +
        '</div>' +
        '<h2 class="bb-paper-head__title" style="margin-bottom:var(--space-4);">' + esc(paperTitle || submission.paperTitle || 'Your submission') + '</h2>' +
        header +
        overallBlock +
        '<div class="bb-paper-body">' + rows + '</div>' +
      '</div>';

    el('bb-result-back').addEventListener('click', loadList);
    showView('bb-result-view');
  }

  function mcqAnswerLabel(it) {
    if (it.yourAnswer === '' || it.yourAnswer == null) return '<em class="bb-muted-note">No answer given</em>';
    const idx = Number(it.yourAnswer);
    const opt = (it.options && it.options[idx] != null) ? it.options[idx] : '';
    return '<strong>' + String.fromCharCode(65 + idx) + '.</strong> ' + esc(opt);
  }

  // ---- flow --------------------------------------------------------------

  async function openPaper(paperId) {
    showView('bb-skeleton');
    try {
      const data = await Api.bossBattle.paper(paperId);
      // Already submitted an active paper (or a graded one) → straight to result.
      if (data.submission) {
        renderResult(data.submission, data.paper.title);
        return;
      }
      renderAttempt(data);
    } catch (err) {
      Notifications.toast((err && err.message) || 'Could not open this paper.', 'error');
      loadList();
    }
  }

  async function loadList() {
    showView('bb-skeleton');
    try {
      const [active, past] = await Promise.all([
        Api.bossBattle.activePapers(),
        Api.bossBattle.pastPapers().catch(() => ({ papers: [] }))
      ]);
      renderList(active, past);
    } catch (err) {
      showError();
    }
  }

  document.addEventListener('wha:ready', () => {
    if (Router.currentPageName() !== 'boss-battle.html') return;
    const retry = el('bb-retry');
    if (retry) retry.addEventListener('click', loadList);

    // Optional deep-link: boss-battle.html?paper=<id> opens straight into it.
    const deep = Router.getQueryParam('paper');
    if (deep) { openPaper(deep); } else { loadList(); }
  });
})();
