/**
 * game.js — W.H. Academy Reusable Chapter Engine
 * ============================================================================
 * IMPORTANT: this file contains ZERO chapter-specific logic. Every piece of
 * subject-matter content (questions, hotspots, theory text) is read from
 * content.json, sitting alongside this file. To add a new chapter for any
 * future subject, copy this folder, replace content.json, and change
 * nothing in this file — exactly as the Complete Game Design Bible and
 * Software Architecture require ("changing only the JSON content").
 *
 * Depends on the shared frontend modules (utils.js, storage.js, api.js,
 * notifications.js, animations.js), loaded before this file.
 * ============================================================================
 */

const ChapterEngine = (() => {

  const STAGES = ['theory', 'lesson', 'practice', 'games', 'boss-battle', 'chapter-checkpoint', 'complete'];
  const STAGE_LABELS = { theory: 'Theory', lesson: 'Explore', practice: 'Practice', games: 'Mini Game', 'boss-battle': 'Boss Battle', 'chapter-checkpoint': 'Checkpoint', complete: 'Complete' };
  const PRACTICE_MASTERY_THRESHOLD = 0.8;

  let content = null;
  let sessionId = null;
  let stageIndex = 0;
  let practiceAttempts = []; // { questionId, correct }
  let wrongQuestionIds = [];
  let hotspotsVisited = new Set();
  let xpEarnedThisSession = 0;
  let coinsEarnedThisSession = 0;

  function fullQuestionId(localId) {
    return `${content.chapterRef}/${localId}`;
  }

  // ---------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------
  async function init() {
    const response = await fetch('content.json');
    content = await response.json();

    document.title = `${content.title} — W.H. Academy`;
    Utils.qs('#chapter-title').textContent = content.title;
    document.documentElement.style.setProperty('--subject-accent', `var(--subject-${content.subjectKey}-primary)`);
    document.documentElement.style.setProperty('--subject-accent-tint', `var(--subject-${content.subjectKey}-secondary)`);

    renderStageStepper();

    try {
      const result = await Api.progress.sessionStart(content.chapterRef, uniqueMechanicIds());
      sessionId = result.sessionId;
    } catch (err) {
      Notifications.error('Could not start your session — your progress may not be saved.');
    }

    goToStage(0);
  }

  function uniqueMechanicIds() {
    const ids = new Set();
    content.practiceQuestions.forEach((q) => ids.add(q.mechanicId));
    if (content.sequencingActivity) ids.add(content.sequencingActivity.mechanicId);
    return Array.from(ids);
  }

  // ---------------------------------------------------------------------
  // Stage stepper + navigation
  // ---------------------------------------------------------------------
  function renderStageStepper() {
    const nav = Utils.qs('#stage-stepper');
    nav.innerHTML = '';
    STAGES.forEach((stage, index) => {
      const item = Utils.createEl('li', {
        class: 'stage-step',
        'data-stage': stage,
        'aria-current': index === stageIndex ? 'step' : null
      }, STAGE_LABELS[stage]);
      nav.appendChild(item);
    });
  }

  function updateStageStepper() {
    Utils.qsa('.stage-step', Utils.qs('#stage-stepper')).forEach((el, index) => {
      el.classList.toggle('stage-step--done', index < stageIndex);
      el.classList.toggle('stage-step--active', index === stageIndex);
      if (index === stageIndex) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
    });
  }

  async function goToStage(index) {
    stageIndex = index;
    updateStageStepper();
    const stage = STAGES[stageIndex];
    const main = Utils.qs('#chapter-stage-content');
    main.innerHTML = '';
    main.focus();

    const renderers = {
      theory: renderTheoryStage,
      lesson: renderLessonStage,
      practice: renderPracticeStage,
      games: renderMiniGameStage,
      'boss-battle': renderBossBattleStage,
      'chapter-checkpoint': renderCheckpointStage,
      complete: renderCompleteStage
    };
    renderers[stage](main);
    Notifications.announce(`${STAGE_LABELS[stage]} stage`);
  }

  async function completeStageAndAdvance(stageName) {
    try {
      await Api.progress.markStageComplete(content.chapterRef, stageName);
    } catch (err) {
      Notifications.error('Could not save your progress for this stage — continuing locally.');
    }
    if (stageIndex < STAGES.length - 1) goToStage(stageIndex + 1);
  }

  // ---------------------------------------------------------------------
  // Stage: Theory
  // ---------------------------------------------------------------------
  function renderTheoryStage(container) {
    const wrap = Utils.createEl('div', { class: 'reading-column stack-lg anim-fade-in-up' });
    content.theory.sections.forEach((section) => {
      wrap.appendChild(Utils.createEl('section', {}, [
        Utils.createEl('h2', { text: section.heading }),
        Utils.createEl('p', { class: 'text-body-lg', text: section.body })
      ]));
    });

    if (content.theory.definitions && content.theory.definitions.length) {
      const defBox = Utils.createEl('div', { class: 'card', style: 'background: var(--color-info-surface);' }, [
        Utils.createEl('p', { class: 'text-caption', text: 'Key Terms' })
      ]);
      content.theory.definitions.forEach((d) => {
        defBox.appendChild(Utils.createEl('p', { class: 'text-body-sm', style: 'margin-top:var(--space-2);' }, [
          Utils.createEl('strong', { text: `${d.term}: ` }),
          document.createTextNode(d.definition)
        ]));
      });
      wrap.appendChild(defBox);
    }

    if (content.theory.examTips && content.theory.examTips.length) {
      const tipBox = Utils.createEl('div', { class: 'card', style: `border-left: 4px solid var(--subject-accent);` }, [
        Utils.createEl('p', { class: 'text-caption', text: 'FBISE Exam Tips' })
      ]);
      content.theory.examTips.forEach((tip) => {
        tipBox.appendChild(Utils.createEl('p', { class: 'text-body-sm', style: 'margin-top:var(--space-2);', text: tip }));
      });
      wrap.appendChild(tipBox);
    }

    wrap.appendChild(Utils.createEl('button', { class: 'btn btn--primary btn--lg', id: 'theory-continue-btn', text: 'Continue' }));
    container.appendChild(wrap);
    Utils.qs('#theory-continue-btn').addEventListener('click', () => completeStageAndAdvance('theory'));
  }

  // ---------------------------------------------------------------------
  // Stage: Interactive Lesson (Hotspot Selection — Game Design Bible §4.1 #8)
  // ---------------------------------------------------------------------
  function renderLessonStage(container) {
    hotspotsVisited.clear();
    const wrap = Utils.createEl('div', { class: 'stack anim-fade-in-up' });
    wrap.appendChild(Utils.createEl('p', { class: 'text-body-sm', text: content.interactiveLesson.instructions }));

    const diagramWrap = Utils.createEl('div', { class: 'hotspot-diagram card' });
    content.interactiveLesson.hotspots.forEach((hotspot) => {
      const btn = Utils.createEl('button', {
        class: 'hotspot-marker',
        style: `left:${hotspot.x}%; top:${hotspot.y}%;`,
        'aria-label': hotspot.label,
        'data-hotspot-id': hotspot.id
      }, Utils.createEl('span', { 'aria-hidden': 'true', text: '+' }));
      btn.addEventListener('click', () => showHotspotFact(hotspot, btn));
      diagramWrap.appendChild(btn);
    });
    wrap.appendChild(diagramWrap);

    const factPanel = Utils.createEl('div', { id: 'hotspot-fact-panel', class: 'card', 'aria-live': 'polite', style: 'min-height:64px;' },
      Utils.createEl('p', { class: 'text-body-sm', text: 'Select a labelled point on the diagram to learn about it.' }));
    wrap.appendChild(factPanel);

    const progressText = Utils.createEl('p', { id: 'hotspot-progress', class: 'text-caption', text: `0 of ${content.interactiveLesson.hotspots.length} explored` });
    wrap.appendChild(progressText);

    const continueBtn = Utils.createEl('button', { class: 'btn btn--primary btn--lg', id: 'lesson-continue-btn', text: 'Continue', disabled: true });
    wrap.appendChild(continueBtn);
    continueBtn.addEventListener('click', () => completeStageAndAdvance('lesson'));

    container.appendChild(wrap);
  }

  function showHotspotFact(hotspot, btnEl) {
    Utils.qs('#hotspot-fact-panel').innerHTML = '';
    Utils.qs('#hotspot-fact-panel').appendChild(Utils.createEl('p', { class: 'text-body-sm' }, [
      Utils.createEl('strong', { text: `${hotspot.label}: ` }),
      document.createTextNode(hotspot.fact)
    ]));
    btnEl.classList.add('hotspot-marker--visited');
    hotspotsVisited.add(hotspot.id);
    Utils.qs('#hotspot-progress').textContent = `${hotspotsVisited.size} of ${content.interactiveLesson.hotspots.length} explored`;
    if (hotspotsVisited.size === content.interactiveLesson.hotspots.length) {
      Utils.qs('#lesson-continue-btn').disabled = false;
    }
  }

  // ---------------------------------------------------------------------
  // Generic mechanic rendering — dispatched by mechanicId, never by subject
  // ---------------------------------------------------------------------
  function renderQuestion(question, container, onComplete, options = {}) {
    const card = Utils.createEl('div', { class: 'card card--question anim-fade-in-up' });
    card.appendChild(Utils.createEl('span', { class: `badge badge--${difficultyBadgeClass(question.difficulty)}`, text: question.difficulty }));
    card.appendChild(Utils.createEl('h3', { style: 'margin-top:var(--space-3);', text: question.prompt }));

    const bodyEl = Utils.createEl('div', { style: 'margin-top:var(--space-4);' });
    card.appendChild(bodyEl);
    container.appendChild(card);

    const renderers = {
      'mcq-arena': renderMcq,
      'true-false-sprint': renderTrueFalse,
      'fill-in-the-blank': renderFillBlank,
      'ordering-sequencing': renderOrdering
    };
    const renderer = renderers[question.mechanicId] || renderMcq;
    renderer(question, bodyEl, card, onComplete, options);
  }

  function difficultyBadgeClass(difficulty) {
    return { Easy: 'success', Medium: 'info', Hard: 'warning', Expert: 'warning', Master: 'error' }[difficulty] || 'neutral';
  }

  function renderFeedback(card, isCorrect, explanation, onContinue) {
    Animations.showAnswerFeedback(card, isCorrect);
    const feedback = Utils.createEl('div', { style: 'margin-top:var(--space-4);' }, [
      Utils.createEl('p', { style: 'font-weight:700;', text: isCorrect ? 'Correct' : 'Not quite' }),
      Utils.createEl('p', { class: 'text-body-sm', text: explanation })
    ]);
    card.appendChild(feedback);
    const nextBtn = Utils.createEl('button', { class: 'btn btn--primary btn--full', style: 'margin-top:var(--space-4);', text: 'Next' });
    card.appendChild(nextBtn);
    nextBtn.focus();
    nextBtn.addEventListener('click', onContinue, { once: true });
  }

  function renderMcq(question, bodyEl, card, onComplete) {
    const optionsList = Utils.createEl('div', { class: 'stack-sm', role: 'radiogroup', 'aria-label': 'Answer options' });
    let answered = false;
    Utils.shuffle(question.payload.options.map((text, i) => ({ text, i }))).forEach((opt) => {
      const btn = Utils.createEl('button', { class: 'btn btn--secondary btn--full', style: 'justify-content:flex-start; text-align:left;', text: opt.text, role: 'radio', 'aria-checked': 'false' });
      btn.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        const isCorrect = opt.i === question.payload.correctIndex;
        submitAttempt(question, isCorrect, { hintsUsed: 0, retries: 0 });
        renderFeedback(card, isCorrect, question.explanation, onComplete);
      });
      optionsList.appendChild(btn);
    });
    bodyEl.appendChild(optionsList);
  }

  function renderTrueFalse(question, bodyEl, card, onComplete) {
    let answered = false;
    const row = Utils.createEl('div', { class: 'cluster' });
    [['True', true], ['False', false]].forEach(([label, value]) => {
      const btn = Utils.createEl('button', { class: 'btn btn--secondary', style: 'flex:1;', text: label });
      btn.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        const isCorrect = value === question.payload.correctBoolean;
        submitAttempt(question, isCorrect, { hintsUsed: 0, retries: 0 });
        renderFeedback(card, isCorrect, question.explanation, onComplete);
      });
      row.appendChild(btn);
    });
    bodyEl.appendChild(row);
  }

  function renderFillBlank(question, bodyEl, card, onComplete) {
    const form = Utils.createEl('form', { class: 'stack-sm' });
    const input = Utils.createEl('input', { class: 'input', type: 'text', 'aria-label': 'Your answer', autocomplete: 'off' });
    form.appendChild(input);
    form.appendChild(Utils.createEl('button', { class: 'btn btn--primary', type: 'submit', text: 'Submit' }));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const normalized = input.value.trim().toLowerCase();
      const isCorrect = question.payload.acceptedAnswers.some((a) => a.toLowerCase() === normalized);
      input.disabled = true;
      form.querySelector('button').disabled = true;
      submitAttempt(question, isCorrect, { hintsUsed: 0, retries: 0 });
      renderFeedback(card, isCorrect, question.explanation, onComplete);
    });
    bodyEl.appendChild(form);
  }

  function renderOrdering(question, bodyEl, card, onComplete) {
    const items = Utils.shuffle(question.payload.items);
    const list = Utils.createEl('ol', { class: 'stack-sm', id: 'ordering-list', style: 'list-style:none;' });
    items.forEach((item, index) => {
      const row = Utils.createEl('li', { class: 'card cluster', style: 'justify-content:space-between; cursor:grab;', draggable: 'true', 'data-value': item }, [
        Utils.createEl('span', { text: item }),
        Utils.createEl('span', { class: 'cluster', style: 'gap:4px;' }, [
          Utils.createEl('button', { type: 'button', class: 'btn btn--icon btn--sm', 'aria-label': `Move ${item} up`, 'data-move': 'up' }, '↑'),
          Utils.createEl('button', { type: 'button', class: 'btn btn--icon btn--sm', 'aria-label': `Move ${item} down`, 'data-move': 'down' }, '↓')
        ])
      ]);
      list.appendChild(row);
    });
    bodyEl.appendChild(list);

    // Keyboard-operable reordering (Interaction Profile I4) — buttons,
    // not drag-only, so this is fully usable without a pointer device.
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-move]');
      if (!btn) return;
      const li = btn.closest('li');
      const direction = btn.dataset.move;
      if (direction === 'up' && li.previousElementSibling) list.insertBefore(li, li.previousElementSibling);
      if (direction === 'down' && li.nextElementSibling) list.insertBefore(li.nextElementSibling, li);
      li.querySelector(`[data-move="${direction}"]`).focus();
    });

    const submitBtn = Utils.createEl('button', { class: 'btn btn--primary btn--full', style: 'margin-top:var(--space-4);', text: 'Check Order' });
    bodyEl.appendChild(submitBtn);
    submitBtn.addEventListener('click', () => {
      const currentOrder = Utils.qsa('li', list).map((li) => li.dataset.value);
      const isCorrect = JSON.stringify(currentOrder) === JSON.stringify(question.payload.correctOrder);
      submitBtn.disabled = true;
      submitAttempt(question, isCorrect, { hintsUsed: 0, retries: 0 });
      renderFeedback(card, isCorrect, question.explanation, () => completeStageAndAdvance('games'));
    });
  }

  async function submitAttempt(question, isCorrect, meta) {
    practiceAttempts.push({ questionId: question.id, correct: isCorrect });
    if (!isCorrect && wrongQuestionIds.indexOf(question.id) === -1) wrongQuestionIds.push(question.id);

    try {
      const result = await Api.progress.recordAttempt(sessionId, {
        questionId: fullQuestionId(question.id),
        mechanicId: question.mechanicId,
        topicTag: question.topicTag,
        difficulty: question.difficulty,
        correct: isCorrect,
        hintsUsed: meta.hintsUsed || 0,
        retries: meta.retries || 0,
        isFirstAttempt: true
      });
      if (result.xpAwarded) {
        xpEarnedThisSession += result.xpAwarded;
        coinsEarnedThisSession += result.coinsAwarded || 0;
        Notifications.success(`+${result.xpAwarded} XP`, 1800);
      }
    } catch (err) {
      Storage.queuePendingWrite('progress/recordAttempt', { sessionId, attemptData: { questionId: fullQuestionId(question.id) } });
    }
  }

  // ---------------------------------------------------------------------
  // Stage: Practice
  // ---------------------------------------------------------------------
  function renderPracticeStage(container) {
    let index = 0;
    const questions = content.practiceQuestions;

    function renderNext() {
      container.innerHTML = '';
      if (index >= questions.length) {
        const accuracy = practiceAttempts.length ? practiceAttempts.filter((a) => a.correct).length / practiceAttempts.length : 0;
        const summary = Utils.createEl('div', { class: 'card', style: 'text-align:center;' }, [
          Utils.createEl('h2', { text: 'Practice Complete' }),
          Utils.createEl('p', { class: 'text-body-lg', text: `Accuracy: ${Utils.formatPercent(accuracy)}` }),
          Utils.createEl('p', { class: 'text-body-sm', text: accuracy >= PRACTICE_MASTERY_THRESHOLD ? 'Boss Battle is now unlocked.' : `Score ${Utils.formatPercent(PRACTICE_MASTERY_THRESHOLD)}+ to unlock Boss Battle. You can retry the Mini Game and Practice again later.` })
        ]);
        summary.appendChild(Utils.createEl('button', { class: 'btn btn--primary btn--lg', style: 'margin-top:var(--space-4);', text: 'Continue' }));
        summary.querySelector('button').addEventListener('click', () => completeStageAndAdvance('practice'));
        container.appendChild(summary);
        return;
      }
      Utils.qs('#chapter-progress-label') && (Utils.qs('#chapter-progress-label').textContent = `Question ${index + 1} of ${questions.length}`);
      renderQuestion(questions[index], container, () => { index++; renderNext(); });
    }
    renderNext();
  }

  // ---------------------------------------------------------------------
  // Stage: Mini Games (Ordering/Sequencing — Game Design Bible §4.1 #10)
  // ---------------------------------------------------------------------
  function renderMiniGameStage(container) {
    if (!content.sequencingActivity) { completeStageAndAdvance('games'); return; }
    const intro = Utils.createEl('p', { class: 'text-body-sm', text: content.sequencingActivity.prompt });
    container.appendChild(intro);
    renderQuestion(content.sequencingActivity, container, () => completeStageAndAdvance('games'));
  }

  // ---------------------------------------------------------------------
  // Stage: Boss Battle (gated, single-attempt spirit, Master-tier only)
  // ---------------------------------------------------------------------
  function renderBossBattleStage(container) {
    const accuracy = practiceAttempts.length ? practiceAttempts.filter((a) => a.correct).length / practiceAttempts.length : 0;
    if (accuracy < PRACTICE_MASTERY_THRESHOLD) {
      container.appendChild(Utils.createEl('div', { class: 'empty-state' }, [
        Utils.createEl('p', { class: 'empty-state__title', text: 'Boss Battle Locked' }),
        Utils.createEl('p', { text: `Score ${Utils.formatPercent(PRACTICE_MASTERY_THRESHOLD)}+ in Practice to unlock this challenge.` }),
        Utils.createEl('button', { class: 'btn btn--primary empty-state__action', text: 'Back to Practice' })
      ]));
      container.querySelector('button').addEventListener('click', () => goToStage(STAGES.indexOf('practice')));
      return;
    }

    let index = 0;
    const questions = content.bossBattleQuestions;
    function renderNext() {
      container.innerHTML = '';
      if (index >= questions.length) {
        Animations.celebrate(container);
        const summary = Utils.createEl('div', { class: 'card', style: 'text-align:center;' }, [
          Utils.createEl('h2', { text: 'Boss Battle Cleared!' }),
          Utils.createEl('button', { class: 'btn btn--primary btn--lg', style: 'margin-top:var(--space-4);', text: 'Continue' })
        ]);
        summary.querySelector('button').addEventListener('click', () => completeStageAndAdvance('boss-battle'));
        container.appendChild(summary);
        return;
      }
      renderQuestion(questions[index], container, () => { index++; renderNext(); });
    }
    renderNext();
  }

  // ---------------------------------------------------------------------
  // Stage: Chapter Checkpoint — re-tests anything missed during Practice
  // (Complete Game Design Bible §4.2 #51). Auto-passes if nothing was
  // missed, since there is nothing left to verify.
  // ---------------------------------------------------------------------
  function renderCheckpointStage(container) {
    const missed = content.practiceQuestions.filter((q) => wrongQuestionIds.indexOf(q.id) !== -1);
    if (missed.length === 0) {
      container.appendChild(Utils.createEl('div', { class: 'empty-state' }, [
        Utils.createEl('p', { class: 'empty-state__title', text: 'Nothing to check' }),
        Utils.createEl('p', { text: 'You answered every practice question correctly the first time.' })
      ]));
      setTimeout(() => completeStageAndAdvance('chapter-checkpoint'), 1200);
      return;
    }

    let index = 0;
    function renderNext() {
      container.innerHTML = '';
      if (index >= missed.length) {
        completeStageAndAdvance('chapter-checkpoint');
        return;
      }
      container.appendChild(Utils.createEl('p', { class: 'text-body-sm', text: `Checkpoint: revisiting ${index + 1} of ${missed.length} missed question(s).` }));
      renderQuestion(missed[index], container, () => { index++; renderNext(); });
    }
    renderNext();
  }

  // ---------------------------------------------------------------------
  // Stage: Complete
  // ---------------------------------------------------------------------
  async function renderCompleteStage(container) {
    if (sessionId) {
      try { await Api.progress.sessionEnd(sessionId); } catch (e) { /* non-fatal */ }
    }
    const card = Utils.createEl('div', { class: 'card', style: 'text-align:center; padding: var(--space-8);' });
    Animations.celebrate(card);
    card.appendChild(Utils.createEl('h1', { text: 'Chapter Complete' }));
    card.appendChild(Utils.createEl('p', { class: 'text-body-lg', text: content.title }));
    card.appendChild(Utils.createEl('div', { class: 'cluster', style: 'justify-content:center; margin-top:var(--space-5);' }, [
      Utils.createEl('span', { class: 'badge badge--success', text: `+${xpEarnedThisSession} XP` }),
      Utils.createEl('span', { class: 'badge badge--info', text: `+${coinsEarnedThisSession} Coins` })
    ]));
    card.appendChild(Utils.createEl('a', { class: 'btn btn--primary btn--lg', style: 'margin-top:var(--space-6);', href: '../../../../../dashboard.html', text: 'Back to Dashboard' }));
    container.appendChild(card);
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  ChapterEngine.init().catch((err) => {
    console.error(err);
    Notifications.error('This chapter could not load. Check your connection and try again.');
  });
});
