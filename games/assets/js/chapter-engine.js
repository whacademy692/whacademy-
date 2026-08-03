/**
 * chapter-engine.js — W.H. Academy
 * ============================================================================
 * ONE engine for every chapter on the platform.
 *
 * WHAT CHANGED FROM game.js (v16)
 * --------------------------------
 * v16 kept the engine INSIDE each chapter folder, so every new chapter was a
 * copy of the whole engine. With 168 chapters in content-registry.js that
 * would have meant 168 copies of the same bug. This file lives once, in
 * assets/js/, and every chapter is now just a content.json.
 *
 * Four concrete v16 problems this file fixes:
 *
 *   1. Only 4 mechanics rendered. An unknown mechanicId fell through to
 *      renderMcq, which then read payload.options — absent on any non-MCQ
 *      payload — and threw, taking the whole page down. Now every mechanic
 *      validates its own payload first and an unsupported or malformed one
 *      produces a readable card the student can skip past.
 *
 *   2. The hotspot lesson stage was effectively mandatory: its Continue
 *      button stayed disabled until every hotspot was visited, so a chapter
 *      without an interactiveLesson trapped the student. Stages are now built
 *      from what the content.json actually contains.
 *
 *   3. bossBattleQuestions had no null guard (sequencingActivity did), so a
 *      chapter without a boss battle crashed on .length.
 *
 *   4. Subject accent keys did not match the CSS tokens — games.js asked for
 *      --subject-math-primary while variables.css defines
 *      --subject-mathematics-primary. SUBJECT_TOKEN below is now the single
 *      map both this file and games.js read.
 *
 * MECHANIC IDS ARE NOT FREE-FORM. The backend (Games.gs) validates every
 * submitted mechanicId against a fixed list of 52. An id outside that list is
 * rejected and the attempt is never recorded — the student would play and
 * earn nothing. Every id below is on that list. Do not invent new ones.
 *
 * Depends on: utils.js, storage.js, api.js, notifications.js, animations.js.
 * ============================================================================
 */

(function () {
  'use strict';

  // =========================================================================
  // Subject accent — registry key  ->  the token name variables.css defines.
  // These two vocabularies were never the same, which is why every subject
  // except Science silently lost its accent colour.
  // =========================================================================
  var SUBJECT_TOKEN = {
    math: 'mathematics',
    maths: 'mathematics',
    science: 'science',
    geography: 'geography',
    history: 'history',
    bio: 'biology',
    biology: 'biology',
    chem: 'chemistry',
    chemistry: 'chemistry',
    phys: 'physics',
    physics: 'physics',
    cs: 'computerscience',
    computerscience: 'computerscience',
    english: 'english',
    urdu: 'urdu',
    islamiat: 'islamiat',
    pakstudies: 'pakistanstudies'
  };

  var PRACTICE_MASTERY_THRESHOLD = 0.8;
  var PRACTICE_PER_TYPE = 10;   // questions drawn from each bank per session

  // =========================================================================
  // PRACTICE PROGRESS STORE  (browser only — no backend)
  // -------------------------------------------------------------------------
  // Remembers, per chapter and per game type, which question ids the student
  // has already answered and which they got wrong. This is what makes a
  // re-practice show NEW questions instead of the same ones — while still
  // bringing back the ones they previously missed.
  //
  // Stored in localStorage under one key per chapter. Everything is best
  // effort: if storage is unavailable (private mode), practice still works,
  // it just can't remember across sessions.
  // =========================================================================
  var PracticeStore = (function () {
    function key(chapterRef) { return 'wha:practice:' + chapterRef; }

    function read(chapterRef) {
      try {
        var raw = localStorage.getItem(key(chapterRef));
        return raw ? JSON.parse(raw) : {};
      } catch (e) { return {}; }
    }
    function write(chapterRef, data) {
      try { localStorage.setItem(key(chapterRef), JSON.stringify(data)); } catch (e) { /* ignore */ }
    }

    // Per game type we keep:
    //   seen:    [ids] the student has answered at least once
    //   wrong:   [ids] currently unsolved (still need review)
    //   q: {                       per-question detail
    //     <id>: {
    //       attempts:  total attempts at this question
    //       wrong:     wrong attempts so far (drives -2 and burnout)
    //       solved:    true once answered correctly (stops further XP)
    //       burntAt:   ISO date-string when it hit 5 wrongs (retired)
    //       redCard:   true once it burnt out (card shows red on re-surface)
    //     }
    //   }
    function forType(chapterRef, mechanicId) {
      var all = read(chapterRef);
      var t = all[mechanicId] || {};
      return { seen: t.seen || [], wrong: t.wrong || [], q: t.q || {} };
    }

    function qState(chapterRef, mechanicId, questionId) {
      var t = forType(chapterRef, mechanicId);
      return t.q[questionId] || { attempts: 0, wrong: 0, solved: false, burntAt: null, redCard: false };
    }

    // Records one attempt. Returns the per-question state AFTER this attempt,
    // plus attemptNumber and priorWrongCount (what the backend needs to score).
    function record(chapterRef, mechanicId, questionId, isCorrect) {
      var all = read(chapterRef);
      var t = all[mechanicId] || { seen: [], wrong: [], q: {} };
      if (!t.q) t.q = {};
      if (t.seen.indexOf(questionId) === -1) t.seen.push(questionId);

      var q = t.q[questionId] || { attempts: 0, wrong: 0, solved: false, burntAt: null, redCard: false };
      var priorWrongCount = q.wrong;      // before this attempt
      var attemptNumber = q.attempts + 1; // 1-based, this attempt

      q.attempts = attemptNumber;
      if (isCorrect) {
        q.solved = true;
        var at = t.wrong.indexOf(questionId);
        if (at !== -1) t.wrong.splice(at, 1);
      } else {
        // Only count the wrong (and penalise) while not yet burnt out.
        if (q.wrong < BURNOUT_WRONG_LIMIT) q.wrong += 1;
        if (t.wrong.indexOf(questionId) === -1) t.wrong.push(questionId);
        if (q.wrong >= BURNOUT_WRONG_LIMIT && !q.burntAt) {
          q.burntAt = new Date().toISOString();
          q.redCard = true;
        }
      }
      t.q[questionId] = q;
      all[mechanicId] = t;
      write(chapterRef, all);

      return { state: q, attemptNumber: attemptNumber, priorWrongCount: priorWrongCount };
    }

    // How many questions in this type are red-carded (burnt out).
    function redCardCount(chapterRef, mechanicId) {
      var t = forType(chapterRef, mechanicId);
      var n = 0;
      Object.keys(t.q).forEach(function (id) { if (t.q[id].redCard) n++; });
      return n;
    }

    return { forType: forType, qState: qState, record: record, redCardCount: redCardCount };
  })();

  // A burnt-out question (5 wrongs) is retired for the day. It may re-surface
  // only after this cooldown, per "wrong 5 times -> comes back another day".
  var BURNOUT_WRONG_LIMIT = 5;
  var BURNOUT_COOLDOWN_MS = 20 * 60 * 60 * 1000;  // ~20h ("next day")

  function isBurntOutNow(qs) {
    if (!qs || !qs.burntAt) return false;
    var since = Date.now() - new Date(qs.burntAt).getTime();
    return since < BURNOUT_COOLDOWN_MS;   // still cooling down -> keep it out
  }

  // Same +5/+3/-2/0 rule the backend uses (Constants.GAME.PRACTICE_XP),
  // mirrored here so the XP box can update the INSTANT a question is answered
  // instead of waiting on the slow Sheets round-trip. The backend still records
  // every attempt and stays the source of truth for the starting total each
  // session, so the two never drift.
  var PRACTICE_XP_FIRST_CORRECT = 5;
  var PRACTICE_XP_LATER_CORRECT = 3;
  var PRACTICE_XP_WRONG = -2;

  function computeLocalXpDelta(correct, attemptNumber, priorWrongCount) {
    if (Number(priorWrongCount) >= BURNOUT_WRONG_LIMIT) return 0;   // burnt out
    if (correct) return Number(attemptNumber) <= 1 ? PRACTICE_XP_FIRST_CORRECT : PRACTICE_XP_LATER_CORRECT;
    return PRACTICE_XP_WRONG;
  }

  // 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th", 5 -> "5th" ...
  function ordinalWord(n) {
    n = Number(n) || 0;
    var rem100 = n % 100;
    if (rem100 >= 11 && rem100 <= 13) return n + 'th';
    switch (n % 10) {
      case 1: return n + 'st';
      case 2: return n + 'nd';
      case 3: return n + 'rd';
      default: return n + 'th';
    }
  }

  /**
   * Chooses which questions to serve for one game type this session:
   *   1. First, any previously WRONG questions (revision — highest priority).
   *   2. Then NEW questions the student has not seen.
   *   3. Only if both run out, older seen-but-correct ones (so a keen student
   *      can keep going rather than hitting a wall).
   * Solved questions are never re-served (their XP is already banked), and
   * burnt-out questions are held back until their cooldown passes.
   * Returns up to PRACTICE_PER_TYPE questions, shuffled within each tier.
   */
  function pickPracticeQuestions(bank, chapterRef, mechanicId, howMany) {
    var progress = PracticeStore.forType(chapterRef, mechanicId);
    var wrongSet = {}; progress.wrong.forEach(function (id) { wrongSet[id] = true; });
    var seenSet = {}; progress.seen.forEach(function (id) { seenSet[id] = true; });

    function available(q) {
      var qs = progress.q[q.id];
      if (qs && qs.solved) return false;        // already earned — don't repeat
      if (isBurntOutNow(qs)) return false;      // retired for the day
      return true;
    }

    // How far the student has progressed in THIS game type. The more questions
    // they have already solved, the deeper into the harder end we start drawing —
    // so difficulty ramps up the more they play and they stay mentally challenged.
    var solvedCount = 0;
    Object.keys(progress.q).forEach(function (id) {
      if (progress.q[id] && progress.q[id].solved) solvedCount++;
    });
    var progressFrac = bank.length ? Math.min(1, solvedCount / bank.length) : 0;

    var wrongOnes = bank.filter(function (q) { return wrongSet[q.id] && available(q); });
    var fresh = bank.filter(function (q) { return !seenSet[q.id] && available(q); });
    var seenCorrect = bank.filter(function (q) { return seenSet[q.id] && !wrongSet[q.id] && available(q); });

    // Sort the fresh pool Easy -> Medium -> Hard (shuffled within each tier so
    // sessions still vary), then take a window whose start slides toward the
    // hard end in proportion to how much of this type the student has solved.
    var freshSorted = shuffleWithinDifficultyTiers(fresh);
    var startIdx = Math.round(progressFrac * Math.max(0, freshSorted.length - howMany));
    var adaptiveFresh = freshSorted.slice(startIdx).concat(freshSorted.slice(0, startIdx));

    var chosen = Utils.shuffle(wrongOnes).slice(0, howMany);
    if (chosen.length < howMany) {
      chosen = chosen.concat(adaptiveFresh.slice(0, howMany - chosen.length));
    }
    if (chosen.length < howMany) {
      chosen = chosen.concat(Utils.shuffle(seenCorrect).slice(0, howMany - chosen.length));
    }

    // Within the session, present easiest first so each round itself ramps up.
    chosen.sort(function (a, b) { return difficultyRank(a) - difficultyRank(b); });
    return chosen;
  }

  // Easy -> 0, Medium -> 1, Hard -> 2 (anything unlabelled is treated as Medium).
  var DIFFICULTY_RANK = { easy: 0, medium: 1, hard: 2 };
  function difficultyRank(q) {
    var d = (q && q.difficulty ? String(q.difficulty) : 'Medium').toLowerCase();
    return DIFFICULTY_RANK[d] != null ? DIFFICULTY_RANK[d] : 1;
  }

  // Groups a list into Easy/Medium/Hard, shuffles inside each group, then
  // concatenates so the result is difficulty-ordered but never identical twice.
  function shuffleWithinDifficultyTiers(list) {
    var tiers = [[], [], []];
    list.forEach(function (q) { tiers[difficultyRank(q)].push(q); });
    return Utils.shuffle(tiers[0]).concat(Utils.shuffle(tiers[1]), Utils.shuffle(tiers[2]));
  }

  // =========================================================================
  // Math rendering (KaTeX). Content authors write inline math as \( ... \)
  // and display/block math as \[ ... \] (or $$ ... $$) directly inside any
  // content.json string — prompts, options, theory text, explanations, etc.
  // KaTeX + its auto-render extension are loaded via CDN in chapter.html;
  // this helper just asks KaTeX to scan a freshly-rendered DOM subtree and
  // typeset any delimiters it finds. If the CDN script hasn't loaded for any
  // reason (offline, blocked), this silently no-ops — the raw \(...\) text
  // stays visible and readable, so a chapter never breaks because of it.
  // =========================================================================
  var KATEX_DELIMITERS = [
    { left: '$$', right: '$$', display: true },
    { left: '\\[', right: '\\]', display: true },
    { left: '\\(', right: '\\)', display: false }
  ];

  function renderMathIn(rootEl) {
    if (!rootEl || typeof window.renderMathInElement !== 'function') return;
    try {
      window.renderMathInElement(rootEl, {
        delimiters: KATEX_DELIMITERS,
        throwOnError: false
      });
    } catch (e) {
      console.warn('[chapter-engine] KaTeX render failed:', e);
    }
  }

  // =========================================================================
  // Small shared helpers
  // =========================================================================

  function el(tag, attrs, children) {
    return Utils.createEl(tag, attrs || {}, children || []);
  }

  function isNonEmptyArray(value) {
    return Array.isArray(value) && value.length > 0;
  }

  function normalizeText(value) {
    return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  }

  /** Same set of members, order ignored. */
  function sameSet(a, b) {
    if (a.length !== b.length) return false;
    var sortedA = a.slice().sort();
    var sortedB = b.slice().sort();
    return sortedA.every(function (v, i) { return v === sortedB[i]; });
  }

  /** Shuffles, but never returns the original order when a reorder is possible. */
  function shuffleForcefully(items) {
    if (items.length < 2) return items.slice();
    var shuffled = Utils.shuffle(items);
    var attempts = 0;
    while (attempts < 8 && shuffled.every(function (v, i) { return v === items[i]; })) {
      shuffled = Utils.shuffle(items);
      attempts++;
    }
    if (shuffled.every(function (v, i) { return v === items[i]; })) {
      shuffled.push(shuffled.shift());
    }
    return shuffled;
  }

  function stripHostFromPath(value) {
    return String(value || '').replace(/^\/+/, '');
  }

  // =========================================================================
  // MECHANICS
  // -------------------------------------------------------------------------
  // Each entry is:
  //   validate(payload) -> null when usable, else a plain-language reason
  //   render(ctx)       -> builds the UI; calls ctx.answer(isCorrect, meta) once
  //
  // ctx = { question, body, card, answer, hintUsed }
  //   question  the whole question object from content.json
  //   body      the element to build inside
  //   card      the surrounding card (used for feedback styling)
  //   answer    call exactly once, with a boolean and { hintsUsed, retries }
  // =========================================================================

  var Mechanics = {};

  // ---- Multiple choice -----------------------------------------------------

  function validateMcq(payload) {
    if (!payload || !isNonEmptyArray(payload.options)) return 'needs payload.options';
    if (typeof payload.correctIndex !== 'number') return 'needs payload.correctIndex';
    if (payload.correctIndex < 0 || payload.correctIndex >= payload.options.length) {
      return 'payload.correctIndex is outside payload.options';
    }
    return null;
  }

  function renderMcqInto(ctx, timeLimitSec) {
    var payload = ctx.question.payload;
    var answered = false;
    var timerEl = null;
    var countdown = null;

    var group = el('div', { class: 'stack-sm', role: 'radiogroup', 'aria-label': 'Answer options' });

    function finish(isCorrect) {
      if (answered) return;
      answered = true;
      if (countdown) clearInterval(countdown);
      Utils.qsa('button', group).forEach(function (b) { b.disabled = true; });
      ctx.answer(isCorrect, {});
    }

    var indexed = payload.options.map(function (text, i) { return { text: text, i: i }; });
    var ordered = payload.shuffle === false ? indexed : Utils.shuffle(indexed);

    ordered.forEach(function (opt) {
      var btn = el('button', {
        class: 'btn btn--secondary btn--full option-btn',
        type: 'button',
        role: 'radio',
        'aria-checked': 'false',
        text: opt.text
      });
      btn.addEventListener('click', function () {
        btn.setAttribute('aria-checked', 'true');
        finish(opt.i === payload.correctIndex);
      });
      group.appendChild(btn);
    });

    if (timeLimitSec) {
      var remaining = timeLimitSec;
      timerEl = el('p', { class: 'countdown', text: remaining + 's' });
      ctx.body.appendChild(timerEl);
      countdown = setInterval(function () {
        remaining--;
        timerEl.textContent = remaining + 's';
        timerEl.classList.toggle('countdown--urgent', remaining <= 5);
        if (remaining <= 0) {
          timerEl.textContent = 'Time up';
          finish(false);
        }
      }, 1000);
    }

    ctx.body.appendChild(group);
  }

  Mechanics['mcq-arena'] = {
    validate: validateMcq,
    render: function (ctx) { renderMcqInto(ctx, ctx.question.payload.timeLimitSec || 0); }
  };

  // Scenario-led MCQ. Same shape, plus payload.scenario shown above the options.
  Mechanics['case-diagnosis'] = {
    validate: validateMcq,
    render: function (ctx) {
      if (ctx.question.payload.scenario) {
        ctx.body.appendChild(el('div', { class: 'scenario-box' }, [
          el('p', { class: 'text-body-sm', text: ctx.question.payload.scenario })
        ]));
      }
      renderMcqInto(ctx, ctx.question.payload.timeLimitSec || 0);
    }
  };

  // "What comes next" — a visible sequence, then MCQ options.
  Mechanics['pattern-recognition'] = {
    validate: function (payload) {
      var base = validateMcq(payload);
      if (base) return base;
      if (!isNonEmptyArray(payload.sequence)) return 'needs payload.sequence';
      return null;
    },
    render: function (ctx) {
      var strip = el('div', { class: 'sequence-strip' });
      ctx.question.payload.sequence.forEach(function (term) {
        strip.appendChild(el('span', { class: 'sequence-strip__item', text: String(term) }));
      });
      strip.appendChild(el('span', { class: 'sequence-strip__item sequence-strip__item--blank', text: '?' }));
      ctx.body.appendChild(strip);
      renderMcqInto(ctx, 0);
    }
  };

  // Timed MCQ. Two ids because the backend knows both; they differ only in
  // how long the student gets.
  Mechanics['speed-challenge'] = {
    validate: validateMcq,
    render: function (ctx) { renderMcqInto(ctx, ctx.question.payload.timeLimitSec || 20); }
  };
  Mechanics['rapid-fire'] = {
    validate: validateMcq,
    render: function (ctx) { renderMcqInto(ctx, ctx.question.payload.timeLimitSec || 10); }
  };

  // ---- True / false --------------------------------------------------------

  Mechanics['true-false-sprint'] = {
    validate: function (payload) {
      if (!payload || typeof payload.correctBoolean !== 'boolean') return 'needs payload.correctBoolean';
      return null;
    },
    render: function (ctx) {
      var answered = false;
      var row = el('div', { class: 'cluster' });
      [['True', true], ['False', false]].forEach(function (pair) {
        var btn = el('button', { class: 'btn btn--secondary', type: 'button', style: 'flex:1;', text: pair[0] });
        btn.addEventListener('click', function () {
          if (answered) return;
          answered = true;
          Utils.qsa('button', row).forEach(function (b) { b.disabled = true; });
          ctx.answer(pair[1] === ctx.question.payload.correctBoolean, {});
        });
        row.appendChild(btn);
      });
      ctx.body.appendChild(row);
    }
  };

  // ---- Typed answers -------------------------------------------------------

  function validateTyped(payload) {
    if (!payload || !isNonEmptyArray(payload.acceptedAnswers)) return 'needs payload.acceptedAnswers';
    return null;
  }

  /**
   * Grades a typed answer. Numeric comparison is used when the mechanic asks
   * for it or when every accepted answer parses as a number — so "0.50" is
   * accepted for "0.5", which a plain string compare would have marked wrong.
   */
  function gradeTyped(payload, raw) {
    var typed = normalizeText(raw);
    if (!typed) return false;

    var accepted = payload.acceptedAnswers.map(function (a) { return normalizeText(a); });
    var wantsNumeric = payload.numeric === true ||
      accepted.every(function (a) { return a !== '' && !isNaN(Number(a)); });

    if (wantsNumeric) {
      var typedNumber = Number(typed.replace(/,/g, ''));
      if (!isNaN(typedNumber)) {
        var tolerance = typeof payload.tolerance === 'number' ? Math.abs(payload.tolerance) : 0;
        return accepted.some(function (a) {
          var target = Number(a);
          if (isNaN(target)) return false;
          return Math.abs(typedNumber - target) <= tolerance;
        });
      }
    }

    if (payload.caseSensitive === true) {
      return accepted.indexOf(typed) !== -1;
    }
    var lowered = typed.toLowerCase();
    return accepted.some(function (a) { return a.toLowerCase() === lowered; });
  }

  function renderTypedInput(ctx, opts) {
    var options = opts || {};
    var form = el('form', { class: 'stack-sm' });
    var input = el('input', {
      class: 'input' + (options.mono ? ' input--mono' : ''),
      type: 'text',
      'aria-label': 'Your answer',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: false,
      placeholder: options.placeholder || ''
    });
    form.appendChild(input);

    if (ctx.question.payload.unit) {
      form.appendChild(el('p', { class: 'text-caption', text: 'Answer in ' + ctx.question.payload.unit }));
    }

    var submit = el('button', { class: 'btn btn--primary', type: 'submit', text: 'Check answer' });
    form.appendChild(submit);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (input.disabled) return;
      if (!normalizeText(input.value)) {
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      input.disabled = true;
      submit.disabled = true;
      ctx.answer(gradeTyped(ctx.question.payload, input.value), {});
    });

    ctx.body.appendChild(form);
    input.focus();
  }

  Mechanics['fill-in-the-blank'] = {
    validate: validateTyped,
    render: function (ctx) { renderTypedInput(ctx, {}); }
  };

  // Numeric answers. Tolerance defaults to exact; set payload.tolerance for
  // rounding-sensitive Physics and Chemistry work.
  Mechanics['math-builder'] = {
    validate: validateTyped,
    render: function (ctx) {
      if (isNonEmptyArray(ctx.question.payload.given)) {
        var givens = el('ul', { class: 'given-list' });
        ctx.question.payload.given.forEach(function (line) {
          givens.appendChild(el('li', { text: String(line) }));
        });
        ctx.body.appendChild(givens);
      }
      renderTypedInput(ctx, { mono: true, placeholder: 'Enter your answer' });
    }
  };

  Mechanics['coding-challenge'] = {
    validate: function (payload) {
      var base = validateTyped(payload);
      if (base) return base;
      if (!payload.code) return 'needs payload.code';
      return null;
    },
    render: function (ctx) {
      var pre = el('pre', { class: 'code-block' }, [
        el('code', { text: String(ctx.question.payload.code) })
      ]);
      if (ctx.question.payload.language) {
        pre.setAttribute('data-language', ctx.question.payload.language);
      }
      ctx.body.appendChild(pre);
      renderTypedInput(ctx, { mono: true, placeholder: 'Your answer' });
    }
  };

  // ---- Drag and drop (touch + mouse) --------------------------------------
  //
  // HTML5 native drag-and-drop does not work on touch screens, so we implement
  // dragging with Pointer Events, which unify mouse, touch and pen. The helper
  // clones the dragged element under the finger/cursor and reports which drop
  // zone it is released over. Every mechanic that needs dragging uses this, so
  // the behaviour is identical everywhere and only has to be correct once.
  //
  //   makeDraggable(el, { getData })   — marks el as a drag source
  //   registerDropZone(el, { onDrop }) — marks el as a drop target
  //   Both are managed by a DragController created per question.

  function createDragController(root) {
    var zones = [];        // { el, onDrop }
    var active = null;     // { source, ghost, data, offsetX, offsetY }

    function pointFromEvent(e) {
      return { x: e.clientX, y: e.clientY };
    }

    function zoneAtPoint(pt) {
      for (var i = 0; i < zones.length; i++) {
        var r = zones[i].el.getBoundingClientRect();
        if (pt.x >= r.left && pt.x <= r.right && pt.y >= r.top && pt.y <= r.bottom) return zones[i];
      }
      return null;
    }

    function clearZoneHighlights() {
      zones.forEach(function (z) { z.el.classList.remove('drop-zone--over'); });
    }

    function onMove(e) {
      if (!active) return;
      e.preventDefault();
      var pt = pointFromEvent(e);
      active.ghost.style.left = (pt.x - active.offsetX) + 'px';
      active.ghost.style.top = (pt.y - active.offsetY) + 'px';
      clearZoneHighlights();
      var z = zoneAtPoint(pt);
      if (z) z.el.classList.add('drop-zone--over');
    }

    function onUp(e) {
      if (!active) return;
      var pt = pointFromEvent(e);
      var z = zoneAtPoint(pt);
      clearZoneHighlights();
      if (active.ghost.parentNode) active.ghost.parentNode.removeChild(active.ghost);
      active.source.classList.remove('drag-source--dragging');
      var data = active.data;
      var source = active.source;
      active = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      if (z && z.onDrop) z.onDrop(data, source);
    }

    function makeDraggable(elem, opts) {
      opts = opts || {};
      elem.classList.add('drag-source');
      elem.style.touchAction = 'none';   // stop the page scrolling while dragging
      elem.addEventListener('pointerdown', function (e) {
        if (elem.getAttribute('data-locked') === 'true') return;
        e.preventDefault();
        var rect = elem.getBoundingClientRect();
        var ghost = elem.cloneNode(true);
        ghost.classList.add('drag-ghost');
        ghost.style.position = 'fixed';
        ghost.style.left = rect.left + 'px';
        ghost.style.top = rect.top + 'px';
        ghost.style.width = rect.width + 'px';
        ghost.style.height = rect.height + 'px';
        ghost.style.pointerEvents = 'none';
        ghost.style.zIndex = '99999';
        document.body.appendChild(ghost);
        elem.classList.add('drag-source--dragging');
        active = {
          source: elem,
          ghost: ghost,
          data: opts.getData ? opts.getData() : null,
          offsetX: e.clientX - rect.left,
          offsetY: e.clientY - rect.top
        };
        document.addEventListener('pointermove', onMove, { passive: false });
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onUp);
      });
    }

    function registerDropZone(elem, opts) {
      elem.classList.add('drop-zone');
      zones.push({ el: elem, onDrop: opts && opts.onDrop });
    }

    return { makeDraggable: makeDraggable, registerDropZone: registerDropZone };
  }

  // ---- Ordering family -----------------------------------------------------

  /**
   * Shared reorderable list. Keyboard-operable via up/down buttons rather
   * than drag-only, so it works without a pointer device.
   */
  function renderReorderable(ctx, displayItems, correctOrder, buttonLabel, revealFn) {
    var list = el('ol', { class: 'reorder-list' });
    var drag = createDragController(ctx.body);

    ctx.body.appendChild(el('p', { class: 'text-caption', text: 'Drag the rows into the correct order — or use the arrows.' }));

    // Reorder by dropping a dragged row onto another row: the dragged row is
    // inserted before the row it was dropped on.
    function attachRowDrag(row) {
      var handle = row.querySelector('.reorder-item__grip');
      drag.makeDraggable(handle, { getData: function () { return row; } });
      drag.registerDropZone(row, {
        onDrop: function (draggedRow) {
          if (list.dataset.locked === 'true') return;
          if (draggedRow && draggedRow !== row) {
            var rect = row.getBoundingClientRect();
            list.insertBefore(draggedRow, row);
          }
        }
      });
    }

    shuffleForcefully(displayItems.slice()).forEach(function (item) {
      var row = el('li', { class: 'reorder-item', 'data-value': item });
      row.appendChild(el('span', { class: 'reorder-item__grip', 'aria-hidden': 'true', text: '\u2261' }));
      row.appendChild(el('span', { class: 'reorder-item__label', text: item }));
      row.appendChild(el('span', { class: 'reorder-item__controls' }, [
        el('button', { type: 'button', class: 'btn btn--icon btn--sm', 'aria-label': 'Move ' + item + ' up', 'data-move': 'up', text: '↑' }),
        el('button', { type: 'button', class: 'btn btn--icon btn--sm', 'aria-label': 'Move ' + item + ' down', 'data-move': 'down', text: '↓' })
      ]));
      list.appendChild(row);
      attachRowDrag(row);
    });

    list.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-move]');
      if (!btn || list.dataset.locked === 'true') return;
      var row = btn.closest('li');
      if (btn.dataset.move === 'up' && row.previousElementSibling) {
        list.insertBefore(row, row.previousElementSibling);
      }
      if (btn.dataset.move === 'down' && row.nextElementSibling) {
        list.insertBefore(row.nextElementSibling, row);
      }
      row.querySelector('[data-move="' + btn.dataset.move + '"]').focus();
    });

    ctx.body.appendChild(list);

    var submit = el('button', { class: 'btn btn--primary btn--full', type: 'button', text: buttonLabel || 'Check order' });
    submit.addEventListener('click', function () {
      if (list.dataset.locked === 'true') return;
      list.dataset.locked = 'true';
      submit.disabled = true;
      var current = Utils.qsa('li', list).map(function (li) { return li.dataset.value; });
      var isCorrect = current.every(function (v, i) { return v === correctOrder[i]; });

      // Green where the item is in its correct position, red where it isn't.
      Utils.qsa('li', list).forEach(function (li, i) {
        li.classList.add(li.dataset.value === correctOrder[i] ? 'reorder-item--right' : 'reorder-item--wrong');
        Utils.qsa('button', li).forEach(function (b) { b.disabled = true; });
        li.querySelector('.reorder-item__grip').style.visibility = 'hidden';
        if (revealFn) {
          var extra = revealFn(li.dataset.value);
          if (extra) li.querySelector('.reorder-item__label').appendChild(el('span', { class: 'reorder-item__meta', text: extra }));
        }
      });

      ctx.answer(isCorrect, {});
    });
    ctx.body.appendChild(submit);
  }

  Mechanics['ordering-sequencing'] = {
    validate: function (payload) {
      if (!payload || !isNonEmptyArray(payload.items)) return 'needs payload.items';
      if (!isNonEmptyArray(payload.correctOrder)) return 'needs payload.correctOrder';
      if (!sameSet(payload.items, payload.correctOrder)) {
        return 'payload.items and payload.correctOrder must contain the same values';
      }
      return null;
    },
    render: function (ctx) {
      renderReorderable(ctx, ctx.question.payload.items, ctx.question.payload.correctOrder, 'Check order');
    }
  };

  // Chronological ordering. Author lists events in the CORRECT order; the
  // engine shuffles them for display and reveals each date when marking.
  Mechanics['timeline-builder'] = {
    validate: function (payload) {
      if (!payload || !isNonEmptyArray(payload.events)) return 'needs payload.events';
      if (!payload.events.every(function (e) { return e && e.label; })) return 'every event needs a label';
      return null;
    },
    render: function (ctx) {
      var events = ctx.question.payload.events;
      var labels = events.map(function (e) { return String(e.label); });
      var whenByLabel = {};
      events.forEach(function (e) { whenByLabel[String(e.label)] = e.when == null ? '' : String(e.when); });
      renderReorderable(ctx, labels, labels, 'Check timeline', function (label) {
        return whenByLabel[label] ? ' · ' + whenByLabel[label] : '';
      });
    }
  };

  // Ordering by a numeric property (size, mass, atomic number, magnitude).
  Mechanics['sorting-challenge'] = {
    validate: function (payload) {
      if (!payload || !isNonEmptyArray(payload.items)) return 'needs payload.items';
      if (!payload.items.every(function (i) { return i && i.label != null && typeof i.value === 'number'; })) {
        return 'every item needs a label and a numeric value';
      }
      return null;
    },
    render: function (ctx) {
      var payload = ctx.question.payload;
      var descending = payload.direction === 'desc';
      var sorted = payload.items.slice().sort(function (a, b) {
        return descending ? b.value - a.value : a.value - b.value;
      });
      var labels = sorted.map(function (i) { return String(i.label); });
      var valueByLabel = {};
      payload.items.forEach(function (i) { valueByLabel[String(i.label)] = i.value; });
      renderReorderable(ctx, labels, labels, 'Check order', function (label) {
        return ' · ' + valueByLabel[label];
      });
    }
  };

  // Arrange words into a sentence. Same mechanic, chip presentation.
  Mechanics['sentence-builder'] = {
    validate: function (payload) {
      if (!payload || !isNonEmptyArray(payload.words)) return 'needs payload.words';
      return null;
    },
    render: function (ctx) {
      var correct = ctx.question.payload.words.map(String);
      var pool = shuffleForcefully(correct.slice());
      var chosen = [];

      var answerStrip = el('div', { class: 'sentence-answer', 'aria-live': 'polite' });
      var poolStrip = el('div', { class: 'sentence-pool' });
      ctx.body.appendChild(answerStrip);
      ctx.body.appendChild(poolStrip);

      var submit = el('button', { class: 'btn btn--primary btn--full', type: 'button', text: 'Check sentence', disabled: true });

      function repaint() {
        answerStrip.innerHTML = '';
        poolStrip.innerHTML = '';
        chosen.forEach(function (word, index) {
          var chip = el('button', { class: 'word-chip word-chip--chosen', type: 'button', text: word, 'aria-label': 'Remove ' + word });
          chip.addEventListener('click', function () {
            chosen.splice(index, 1);
            repaint();
          });
          answerStrip.appendChild(chip);
        });
        if (chosen.length === 0) {
          answerStrip.appendChild(el('span', { class: 'text-caption', text: 'Tap words below to build the sentence' }));
        }
        pool.forEach(function (word, index) {
          if (chosen.indexOf(word) !== -1 && chosen.filter(function (w) { return w === word; }).length >
              pool.slice(0, index).filter(function (w) { return w === word; }).length) { /* allow duplicates */ }
          var chip = el('button', { class: 'word-chip', type: 'button', text: word });
          chip.addEventListener('click', function () {
            chosen.push(word);
            repaint();
          });
          poolStrip.appendChild(chip);
        });
        // A duplicate word can legitimately appear twice, so availability is
        // counted rather than looked up by identity.
        var used = {};
        chosen.forEach(function (w) { used[w] = (used[w] || 0) + 1; });
        Utils.qsa('.word-chip', poolStrip).forEach(function (chip) {
          var word = chip.textContent;
          var available = pool.filter(function (w) { return w === word; }).length - (used[word] || 0);
          if (available <= 0) chip.disabled = true;
        });
        submit.disabled = chosen.length !== correct.length;
      }

      submit.addEventListener('click', function () {
        submit.disabled = true;
        Utils.qsa('button', answerStrip).forEach(function (b) { b.disabled = true; });
        Utils.qsa('button', poolStrip).forEach(function (b) { b.disabled = true; });
        ctx.answer(chosen.every(function (w, i) { return w === correct[i]; }), {});
      });

      ctx.body.appendChild(submit);
      repaint();
    }
  };

  // ---- Classification ------------------------------------------------------

  function validateClassification(payload) {
    if (!payload || !isNonEmptyArray(payload.categories)) return 'needs payload.categories';
    if (!isNonEmptyArray(payload.items)) return 'needs payload.items';
    var ids = payload.categories.map(function (c) { return c && c.id; });
    if (!payload.categories.every(function (c) { return c && c.id && c.label; })) {
      return 'every category needs an id and a label';
    }
    if (!payload.items.every(function (i) { return i && i.label && ids.indexOf(i.categoryId) !== -1; })) {
      return 'every item needs a label and a categoryId matching one of payload.categories';
    }
    return null;
  }

  function renderClassification(ctx) {
    var payload = ctx.question.payload;
    var placed = {};          // item label -> category id
    var drag = createDragController(ctx.body);

    ctx.body.appendChild(el('p', { class: 'text-caption', text: 'Drag each item into the group it belongs to.' }));
    var tray = el('div', { class: 'chip-tray drop-zone-tray' });
    var buckets = el('div', { class: 'bucket-grid' });
    ctx.body.appendChild(tray);
    ctx.body.appendChild(buckets);

    var submit = el('button', { class: 'btn btn--primary btn--full', type: 'button', text: 'Check groups', disabled: true });

    function makeChip(item, inBucket) {
      var chip = el('span', { class: 'word-chip drag-chip' + (inBucket ? ' word-chip--chosen' : ''), text: item.label });
      drag.makeDraggable(chip, { getData: function () { return item.label; } });
      return chip;
    }

    function repaint() {
      tray.innerHTML = '';
      buckets.innerHTML = '';

      payload.items.forEach(function (item) {
        if (placed[item.label]) return;
        tray.appendChild(makeChip(item, false));
      });
      if (tray.children.length === 0) {
        tray.appendChild(el('span', { class: 'text-caption', text: 'All items placed — drag to move, or Check groups.' }));
      }

      payload.categories.forEach(function (category) {
        var box = el('div', { class: 'bucket' });
        box.appendChild(el('p', { class: 'bucket__title', text: category.label }));
        var contents = el('div', { class: 'bucket__items' });
        payload.items.forEach(function (item) {
          if (placed[item.label] !== category.id) return;
          contents.appendChild(makeChip(item, true));
        });
        box.appendChild(contents);
        drag.registerDropZone(box, {
          onDrop: function (label) {
            if (label) { placed[label] = category.id; repaint(); }
          }
        });
        buckets.appendChild(box);
      });

      // The tray is also a drop zone, so an item can be pulled back out.
      drag.registerDropZone(tray, {
        onDrop: function (label) { if (label && placed[label]) { delete placed[label]; repaint(); } }
      });

      submit.disabled = Object.keys(placed).length !== payload.items.length;
    }

    submit.addEventListener('click', function () {
      submit.disabled = true;
      var isCorrect = payload.items.every(function (item) { return placed[item.label] === item.categoryId; });
      Utils.qsa('.bucket', buckets).forEach(function (box, boxIndex) {
        var categoryId = payload.categories[boxIndex].id;
        Utils.qsa('.drag-chip', box).forEach(function (chip) {
          var item = payload.items.filter(function (i) { return i.label === chip.textContent; })[0];
          chip.setAttribute('data-locked', 'true');
          if (item) chip.classList.add(item.categoryId === categoryId ? 'word-chip--right' : 'word-chip--wrong');
        });
      });
      ctx.answer(isCorrect, {});
    });

    ctx.body.appendChild(submit);
    repaint();
  }

  Mechanics['drag-drop-classification'] = { validate: validateClassification, render: renderClassification };
  Mechanics['classification-game'] = { validate: validateClassification, render: renderClassification };

  // ---- Matching ------------------------------------------------------------

  function validateMatching(payload) {
    if (!payload || !isNonEmptyArray(payload.pairs)) return 'needs payload.pairs';
    if (!payload.pairs.every(function (p) { return p && p.left != null && p.right != null; })) {
      return 'every pair needs a left and a right';
    }
    return null;
  }

  function renderMatching(ctx) {
    var payload = ctx.question.payload;
    var matches = {};      // left label -> right label

    ctx.body.appendChild(el('p', { class: 'text-caption', text: 'Drag the arrow from each item on the left to its match on the right.' }));

    // The board holds two coloured columns with a gap between them, and an SVG
    // overlay on top that draws the connecting arrows.
    var board = el('div', { class: 'match-board' });
    var leftCol = el('div', { class: 'match-col match-col--left' });
    var rightCol = el('div', { class: 'match-col match-col--right' });
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'match-svg');
    // arrowhead marker
    var defs = document.createElementNS(svgNS, 'defs');
    var marker = document.createElementNS(svgNS, 'marker');
    marker.setAttribute('id', 'wha-arrow');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '8'); marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '7'); marker.setAttribute('markerHeight', '7');
    marker.setAttribute('orient', 'auto-start-reverse');
    var mp = document.createElementNS(svgNS, 'path');
    mp.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    mp.setAttribute('fill', 'var(--subject-accent, #3730a3)');
    marker.appendChild(mp); defs.appendChild(marker); svg.appendChild(defs);

    board.appendChild(leftCol);
    board.appendChild(rightCol);
    board.appendChild(svg);
    ctx.body.appendChild(board);

    var submit = el('button', { class: 'btn btn--primary btn--full', type: 'button', text: 'Check matches', disabled: true });

    var lefts = Utils.shuffle(payload.pairs.map(function (p) { return String(p.left); }));
    var rights = Utils.shuffle(payload.pairs.map(function (p) { return String(p.right); }));

    var leftNodes = {};   // label -> element
    var rightNodes = {};  // label -> element
    var locked = false;

    lefts.forEach(function (left) {
      var node = el('div', { class: 'match-node match-node--left', 'data-label': left }, [
        el('span', { class: 'match-node__text', text: left }),
        el('span', { class: 'match-node__handle', 'aria-hidden': 'true' })
      ]);
      leftNodes[left] = node;
      leftCol.appendChild(node);
    });
    rights.forEach(function (right) {
      var node = el('div', { class: 'match-node match-node--right', 'data-label': right }, [
        el('span', { class: 'match-node__dot', 'aria-hidden': 'true' }),
        el('span', { class: 'match-node__text', text: right })
      ]);
      rightNodes[right] = node;
      rightCol.appendChild(node);
    });

    function centerOf(node, side) {
      var br = board.getBoundingClientRect();
      var r = node.getBoundingClientRect();
      return {
        x: (side === 'left' ? r.right : r.left) - br.left,
        y: r.top + r.height / 2 - br.top
      };
    }

    function drawLine(x1, y1, x2, y2, cls) {
      var line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', x1); line.setAttribute('y1', y1);
      line.setAttribute('x2', x2); line.setAttribute('y2', y2);
      line.setAttribute('class', cls || 'match-line');
      line.setAttribute('marker-end', 'url(#wha-arrow)');
      svg.appendChild(line);
    }

    function redraw(temp) {
      // clear existing lines (keep defs)
      Utils.qsa('line', svg).forEach(function (l) { l.remove(); });
      Object.keys(matches).forEach(function (left) {
        var right = matches[left];
        if (!leftNodes[left] || !rightNodes[right]) return;
        var a = centerOf(leftNodes[left], 'left');
        var b = centerOf(rightNodes[right], 'right');
        var cls = 'match-line';
        if (locked) {
          var correct = payload.pairs.some(function (p) { return String(p.left) === left && String(p.right) === right; });
          cls = correct ? 'match-line match-line--right' : 'match-line match-line--wrong';
        }
        drawLine(a.x, a.y, b.x, b.y, cls);
      });
      if (temp) drawLine(temp.x1, temp.y1, temp.x2, temp.y2, 'match-line match-line--temp');
      submit.disabled = Object.keys(matches).length !== payload.pairs.length || locked;
    }

    // Dragging from a left node's handle draws a live arrow; releasing over a
    // right node makes the match.
    function startDrag(leftLabel, e) {
      if (locked) return;
      e.preventDefault();
      var br = board.getBoundingClientRect();
      var start = centerOf(leftNodes[leftLabel], 'left');

      function move(ev) {
        redraw({ x1: start.x, y1: start.y, x2: ev.clientX - br.left, y2: ev.clientY - br.top });
        Object.keys(rightNodes).forEach(function (r) { rightNodes[r].classList.remove('match-node--target'); });
        var over = rightUnder(ev);
        if (over) rightNodes[over].classList.add('match-node--target');
      }
      function up(ev) {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        Object.keys(rightNodes).forEach(function (r) { rightNodes[r].classList.remove('match-node--target'); });
        var over = rightUnder(ev);
        if (over) {
          // remove any existing match to this right, and any existing from this left
          Object.keys(matches).forEach(function (l) { if (matches[l] === over) delete matches[l]; });
          matches[leftLabel] = over;
        }
        redraw();
      }
      document.addEventListener('pointermove', move, { passive: false });
      document.addEventListener('pointerup', up);
    }

    function rightUnder(ev) {
      var found = null;
      Object.keys(rightNodes).forEach(function (r) {
        var rect = rightNodes[r].getBoundingClientRect();
        if (ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom) found = r;
      });
      return found;
    }

    lefts.forEach(function (left) {
      var handle = leftNodes[left].querySelector('.match-node__handle');
      handle.style.touchAction = 'none';
      handle.addEventListener('pointerdown', function (e) { startDrag(left, e); });
      // Tapping a left node that is already matched clears it.
      leftNodes[left].addEventListener('click', function (e) {
        if (locked || e.target.closest('.match-node__handle')) return;
        if (matches[left]) { delete matches[left]; redraw(); }
      });
    });

    submit.addEventListener('click', function () {
      locked = true;
      submit.disabled = true;
      var correctFor = {};
      payload.pairs.forEach(function (p) { correctFor[String(p.left)] = String(p.right); });
      var isCorrect = Object.keys(correctFor).every(function (left) { return matches[left] === correctFor[left]; });
      // colour the nodes too
      Object.keys(matches).forEach(function (left) {
        var ok = matches[left] === correctFor[left];
        leftNodes[left].classList.add(ok ? 'match-node--right' : 'match-node--wrong');
        if (rightNodes[matches[left]]) rightNodes[matches[left]].classList.add(ok ? 'match-node--right' : 'match-node--wrong');
      });
      redraw();
      ctx.answer(isCorrect, {});
    });

    ctx.body.appendChild(submit);

    // Redraw on resize so lines stay attached.
    var ro = function () { redraw(); };
    window.addEventListener('resize', ro);
    setTimeout(redraw, 30);
  }

  Mechanics['matching-grid'] = { validate: validateMatching, render: renderMatching };
  Mechanics['connect-the-nodes'] = { validate: validateMatching, render: renderMatching };
  Mechanics['vocabulary-builder'] = {
    validate: validateMatching,
    render: function (ctx) {
      ctx.question.payload.leftLabel = ctx.question.payload.leftLabel || 'Word';
      ctx.question.payload.rightLabel = ctx.question.payload.rightLabel || 'Meaning';
      renderMatching(ctx);
    }
  };

  // ---- Memory match --------------------------------------------------------

  function validateMemory(payload) {
    if (!payload || !isNonEmptyArray(payload.pairs)) return 'needs payload.pairs';
    if (!payload.pairs.every(function (p) { return p && p.a != null && p.b != null; })) {
      return 'every pair needs an a and a b';
    }
    return null;
  }

  function renderMemory(ctx) {
    var payload = ctx.question.payload;
    var allowedMistakes = typeof payload.allowedMistakes === 'number'
      ? payload.allowedMistakes
      : payload.pairs.length;

    var cards = [];
    payload.pairs.forEach(function (pair, index) {
      cards.push({ pairId: index, text: String(pair.a) });
      cards.push({ pairId: index, text: String(pair.b) });
    });
    cards = Utils.shuffle(cards);

    var mistakes = 0;
    var foundPairs = 0;
    var faceUp = [];
    var busy = false;

    var status = el('p', { class: 'text-caption', 'aria-live': 'polite', text: 'Find all ' + payload.pairs.length + ' pairs' });
    var board = el('div', { class: 'memory-board' });
    ctx.body.appendChild(status);
    ctx.body.appendChild(board);

    cards.forEach(function (card, index) {
      var btn = el('button', {
        class: 'memory-card',
        type: 'button',
        'data-index': String(index),
        'aria-label': 'Hidden card'
      }, [el('span', { class: 'memory-card__face', text: card.text })]);

      btn.addEventListener('click', function () {
        if (busy || btn.classList.contains('memory-card--up') || btn.classList.contains('memory-card--done')) return;
        btn.classList.add('memory-card--up');
        btn.setAttribute('aria-label', card.text);
        faceUp.push({ card: card, btn: btn });

        if (faceUp.length < 2) return;

        var first = faceUp[0];
        var second = faceUp[1];
        busy = true;

        if (first.card.pairId === second.card.pairId) {
          first.btn.classList.add('memory-card--done');
          second.btn.classList.add('memory-card--done');
          foundPairs++;
          faceUp = [];
          busy = false;
          status.textContent = foundPairs + ' of ' + payload.pairs.length + ' pairs found';
          if (foundPairs === payload.pairs.length) {
            ctx.answer(mistakes <= allowedMistakes, {
              retries: Math.min(mistakes, 20)
            });
          }
        } else {
          mistakes++;
          status.textContent = foundPairs + ' of ' + payload.pairs.length + ' pairs found · ' +
            mistakes + ' wrong ' + Utils.pluralize(mistakes, 'try', 'tries');
          setTimeout(function () {
            first.btn.classList.remove('memory-card--up');
            second.btn.classList.remove('memory-card--up');
            first.btn.setAttribute('aria-label', 'Hidden card');
            second.btn.setAttribute('aria-label', 'Hidden card');
            faceUp = [];
            busy = false;
          }, 900);
        }
      });

      board.appendChild(btn);
    });
  }

  Mechanics['memory-match'] = { validate: validateMemory, render: renderMemory };
  Mechanics['card-flip-challenge'] = { validate: validateMemory, render: renderMemory };

  // ---- Diagram mechanics ---------------------------------------------------

  function diagramCanvas(payload) {
    var wrap = el('div', { class: 'diagram-canvas' });
    if (payload.image) {
      wrap.appendChild(el('img', { src: payload.image, alt: payload.imageAlt || '', class: 'diagram-canvas__image' }));
    }
    return wrap;
  }

  Mechanics['image-labeling'] = {
    validate: function (payload) {
      if (!payload || !isNonEmptyArray(payload.points)) return 'needs payload.points';
      if (!payload.points.every(function (p) {
        return p && p.id && p.label && typeof p.x === 'number' && typeof p.y === 'number';
      })) return 'every point needs an id, label, x and y (x/y are percentages, 0-100)';
      return null;
    },
    render: function (ctx) {
      var payload = ctx.question.payload;
      var assigned = {};        // point id -> label
      var activeLabel = null;

      var canvas = diagramCanvas(payload);
      var labelTray = el('div', { class: 'chip-tray' });

      ctx.body.appendChild(el('p', { class: 'text-caption', text: 'Tap a label, then tap the point it belongs to' }));
      ctx.body.appendChild(labelTray);
      ctx.body.appendChild(canvas);

      var submit = el('button', { class: 'btn btn--primary btn--full', type: 'button', text: 'Check labels', disabled: true });

      function repaint() {
        labelTray.innerHTML = '';
        Utils.qsa('.diagram-point', canvas).forEach(function (p) { p.remove(); });

        var usedLabels = Object.keys(assigned).map(function (id) { return assigned[id]; });
        Utils.shuffle(payload.points.map(function (p) { return p.label; })).forEach(function (label) {
          if (usedLabels.indexOf(label) !== -1) return;
          var chip = el('button', {
            class: 'word-chip' + (activeLabel === label ? ' word-chip--selected' : ''),
            type: 'button', text: label
          });
          chip.addEventListener('click', function () {
            activeLabel = activeLabel === label ? null : label;
            repaint();
          });
          labelTray.appendChild(chip);
        });
        if (labelTray.children.length === 0) {
          labelTray.appendChild(el('span', { class: 'text-caption', text: 'All labels placed' }));
        }

        payload.points.forEach(function (point) {
          var placedLabel = assigned[point.id];
          var marker = el('button', {
            class: 'diagram-point' + (placedLabel ? ' diagram-point--filled' : ''),
            type: 'button',
            style: 'left:' + point.x + '%; top:' + point.y + '%;',
            'aria-label': placedLabel ? ('Point labelled ' + placedLabel) : 'Unlabelled point'
          }, [el('span', { text: placedLabel || '?' })]);
          marker.addEventListener('click', function () {
            if (placedLabel) { delete assigned[point.id]; }
            else if (activeLabel) { assigned[point.id] = activeLabel; activeLabel = null; }
            repaint();
          });
          canvas.appendChild(marker);
        });

        submit.disabled = Object.keys(assigned).length !== payload.points.length;
      }

      submit.addEventListener('click', function () {
        submit.disabled = true;
        var isCorrect = payload.points.every(function (p) { return assigned[p.id] === p.label; });
        Utils.qsa('.diagram-point', canvas).forEach(function (marker, index) {
          var point = payload.points[index];
          marker.disabled = true;
          marker.classList.add(assigned[point.id] === point.label ? 'diagram-point--right' : 'diagram-point--wrong');
        });
        ctx.answer(isCorrect, {});
      });

      ctx.body.appendChild(submit);
      repaint();
    }
  };

  Mechanics['hotspot-selection'] = {
    validate: function (payload) {
      if (!payload || !isNonEmptyArray(payload.regions)) return 'needs payload.regions';
      if (!payload.regions.every(function (r) {
        return r && r.id && typeof r.x === 'number' && typeof r.y === 'number';
      })) return 'every region needs an id, x and y (x/y are percentages, 0-100)';
      if (!payload.correctId) return 'needs payload.correctId';
      if (!payload.regions.some(function (r) { return r.id === payload.correctId; })) {
        return 'payload.correctId does not match any region';
      }
      return null;
    },
    render: function (ctx) {
      var payload = ctx.question.payload;
      var canvas = diagramCanvas(payload);
      var answered = false;

      payload.regions.forEach(function (region, index) {
        var marker = el('button', {
          class: 'diagram-point',
          type: 'button',
          style: 'left:' + region.x + '%; top:' + region.y + '%;',
          'aria-label': region.label || ('Region ' + (index + 1))
        }, [el('span', { text: String(index + 1) })]);
        marker.addEventListener('click', function () {
          if (answered) return;
          answered = true;
          Utils.qsa('.diagram-point', canvas).forEach(function (m) { m.disabled = true; });
          marker.classList.add(region.id === payload.correctId ? 'diagram-point--right' : 'diagram-point--wrong');
          if (region.id !== payload.correctId) {
            var correctIndex = payload.regions.map(function (r) { return r.id; }).indexOf(payload.correctId);
            Utils.qsa('.diagram-point', canvas)[correctIndex].classList.add('diagram-point--right');
          }
          ctx.answer(region.id === payload.correctId, {});
        });
        canvas.appendChild(marker);
      });

      ctx.body.appendChild(canvas);
    }
  };

  // ---- Find the mistakes ---------------------------------------------------

  function validateFindMistakes(payload) {
    if (!payload || !isNonEmptyArray(payload.items)) return 'needs payload.items';
    if (!Array.isArray(payload.wrongIndices)) return 'needs payload.wrongIndices (may be empty)';
    var outOfRange = payload.wrongIndices.some(function (i) {
      return typeof i !== 'number' || i < 0 || i >= payload.items.length;
    });
    if (outOfRange) return 'payload.wrongIndices contains an index outside payload.items';
    return null;
  }

  function renderFindMistakes(ctx) {
    var payload = ctx.question.payload;
    var picked = [];

    var list = el('div', { class: 'stack-sm' });
    ctx.body.appendChild(el('p', { class: 'text-caption', text: 'Select every line that is wrong' }));
    ctx.body.appendChild(list);

    var submit = el('button', { class: 'btn btn--primary btn--full', type: 'button', text: 'Check selection' });

    payload.items.forEach(function (text, index) {
      var btn = el('button', {
        class: 'select-row', type: 'button', 'aria-pressed': 'false', text: String(text)
      });
      btn.addEventListener('click', function () {
        var at = picked.indexOf(index);
        if (at === -1) picked.push(index); else picked.splice(at, 1);
        btn.classList.toggle('select-row--picked', at === -1);
        btn.setAttribute('aria-pressed', at === -1 ? 'true' : 'false');
      });
      list.appendChild(btn);
    });

    submit.addEventListener('click', function () {
      submit.disabled = true;
      var isCorrect = sameSet(picked.map(Number), payload.wrongIndices.map(Number));
      Utils.qsa('.select-row', list).forEach(function (btn, index) {
        btn.disabled = true;
        var shouldBePicked = payload.wrongIndices.indexOf(index) !== -1;
        if (shouldBePicked) btn.classList.add('select-row--right');
        else if (picked.indexOf(index) !== -1) btn.classList.add('select-row--wrong');
      });
      ctx.answer(isCorrect, {});
    });

    ctx.body.appendChild(submit);
  }

  Mechanics['find-mistakes'] = { validate: validateFindMistakes, render: renderFindMistakes };
  Mechanics['grammar-fix'] = { validate: validateFindMistakes, render: renderFindMistakes };

  // ---- Flashcards ----------------------------------------------------------

  Mechanics['flashcards'] = {
    validate: function (payload) {
      if (!payload || !isNonEmptyArray(payload.cards)) return 'needs payload.cards';
      if (!payload.cards.every(function (c) { return c && c.front != null && c.back != null; })) {
        return 'every card needs a front and a back';
      }
      return null;
    },
    render: function (ctx) {
      var cards = ctx.question.payload.cards;
      var passMark = typeof ctx.question.payload.passMark === 'number' ? ctx.question.payload.passMark : 0.7;
      var index = 0;
      var knew = 0;

      var stage = el('div', { class: 'stack' });
      ctx.body.appendChild(stage);

      function showCard() {
        stage.innerHTML = '';
        if (index >= cards.length) {
          ctx.answer((knew / cards.length) >= passMark, {});
          return;
        }
        var card = cards[index];
        stage.appendChild(el('p', { class: 'text-caption', text: 'Card ' + (index + 1) + ' of ' + cards.length }));

        var face = el('div', { class: 'flashcard' }, [
          el('p', { class: 'flashcard__front', text: String(card.front) })
        ]);
        stage.appendChild(face);

        var reveal = el('button', { class: 'btn btn--secondary btn--full', type: 'button', text: 'Show answer' });
        stage.appendChild(reveal);

        reveal.addEventListener('click', function () {
          reveal.remove();
          face.appendChild(el('p', { class: 'flashcard__back', text: String(card.back) }));

          var row = el('div', { class: 'cluster' });
          var gotIt = el('button', { class: 'btn btn--primary', type: 'button', style: 'flex:1;', text: 'I knew it' });
          var missed = el('button', { class: 'btn btn--secondary', type: 'button', style: 'flex:1;', text: 'Not yet' });
          gotIt.addEventListener('click', function () { knew++; index++; showCard(); });
          missed.addEventListener('click', function () { index++; showCard(); });
          row.appendChild(missed);
          row.appendChild(gotIt);
          stage.appendChild(row);
        });
      }

      showCard();
    }
  };

  // =========================================================================
  // ENGINE
  // =========================================================================

  var content = null;
  var chapterPath = null;
  var sessionId = null;
  var stages = [];
  var stageIndex = 0;
  var maxStageReached = 0;   // furthest stage unlocked — earlier tabs are clickable
  var practiceAttempts = [];
  var wrongQuestionIds = [];
  var xpEarned = 0;
  var coinsEarned = 0;

  var STAGE_LABELS = {
    theory: 'Theory',
    lesson: 'Explore',
    practice: 'Games',
    games: 'Games',
    'boss-battle': 'Boss Battle',
    'chapter-checkpoint': 'Checkpoint',
    complete: 'Complete'
  };

  // ---- Stage progress persistence -----------------------------------------
  // Remembers, per chapter, the furthest stage the student reached and the
  // stage they were last on. Without this, leaving the chapter (e.g. to the
  // dashboard) reset maxStageReached to 0, so on return only Theory was
  // clickable and every already-opened tab locked again. Saved per device.
  var STAGE_PROG_PREFIX = 'wha:stageprog:';

  function saveStageProgress() {
    try {
      localStorage.setItem(STAGE_PROG_PREFIX + content.chapterRef,
        JSON.stringify({ max: maxStageReached, last: stageIndex }));
    } catch (e) { /* private mode — no persistence, not fatal */ }
  }

  function loadStageProgress() {
    try {
      var raw = localStorage.getItem(STAGE_PROG_PREFIX + content.chapterRef);
      if (!raw) return null;
      var d = JSON.parse(raw);
      return (d && typeof d.max === 'number') ? d : null;
    } catch (e) { return null; }
  }

  function main() { return Utils.qs('#chapter-stage-content'); }

  function fullQuestionId(localId) {
    return content.chapterRef + '/' + localId;
  }

  /** Legacy content.json used a single sequencingActivity; newer ones use miniGames. */
  function miniGames() {
    if (isNonEmptyArray(content.miniGames)) return content.miniGames;
    if (content.sequencingActivity) return [content.sequencingActivity];
    return [];
  }

  function practiceQuestions() {
    return isNonEmptyArray(content.practiceQuestions) ? content.practiceQuestions : [];
  }

  /**
   * The new practice model: content.practiceBanks is an array of
   *   { mechanicId, name, description, questions: [ ...up to 500... ] }
   * Each entry becomes one card in the Practice tab. If a chapter still uses
   * the old flat practiceQuestions list, it is wrapped into a single bank so
   * nothing breaks during the migration.
   */
  function practiceBanks() {
    if (isNonEmptyArray(content.practiceBanks)) {
      // Questions now live in their own per-game file, so a bank counts as
      // real if it has a positive `count` (split model) OR inline `questions`
      // (legacy content.json where everything was in one file).
      return content.practiceBanks.filter(function (b) {
        return b && b.mechanicId && ((typeof b.count === 'number' && b.count > 0) || isNonEmptyArray(b.questions));
      });
    }
    if (practiceQuestions().length) {
      return [{
        mechanicId: 'mixed',
        name: 'Practice Questions',
        description: 'A mix of question types from this chapter.',
        questions: practiceQuestions()
      }];
    }
    return [];
  }

  function hasPractice() {
    return practiceBanks().length > 0;
  }

  /**
   * How many questions a bank holds, WITHOUT needing the questions loaded.
   * In the split model content.json carries only `count`; the questions sit
   * in their own file and load on demand. Legacy inline banks fall back to
   * the array length. This count feeds the backend max-XP (count * 5) and the
   * "solved / total" line, so it must match the real question file exactly.
   */
  function bankCount(bank) {
    if (typeof bank.count === 'number') return bank.count;
    return isNonEmptyArray(bank.questions) ? bank.questions.length : 0;
  }

  /**
   * Load a bank's questions from its own file the first time its game is
   * played, then cache them on the bank object so re-opens are instant. This
   * is what keeps content.json small even when each game has 500 questions:
   * only the ONE game the student opened is ever downloaded, never all 4000.
   * A legacy bank that already carries inline questions resolves immediately.
   */
  var _bankQuestionCache = {};
  function loadBankQuestions(bank) {
    if (isNonEmptyArray(bank.questions)) return Promise.resolve(bank.questions);
    var cached = _bankQuestionCache[bank.mechanicId];
    if (cached) { bank.questions = cached; return Promise.resolve(cached); }
    var url = 'classes/' + chapterPath + '/banks/' + bank.mechanicId + '.json';
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('bank file missing: ' + bank.mechanicId);
      return r.json();
    }).then(function (data) {
      var qs = (data && isNonEmptyArray(data.questions)) ? data.questions : [];
      _bankQuestionCache[bank.mechanicId] = qs;
      bank.questions = qs;
      return qs;
    });
  }

  function bossQuestions() {
    return isNonEmptyArray(content.bossBattleQuestions) ? content.bossBattleQuestions : [];
  }

  /**
   * Stages exist only when the chapter has something to put in them. This is
   * what makes a Maths chapter with no diagram — and therefore no hotspot
   * lesson — a legitimate chapter rather than a dead end.
   */
  function buildStages() {
    var list = [];
    if (content.theory && isNonEmptyArray(content.theory.sections)) list.push('theory');
    // Explore (interactive-lesson hotspot) stage removed by request. The
    // separate miniGames stage is also gone: the former "Practice" hub IS the
    // Games tab now (XP-earning, backend-synced), so a chapter goes
    // Theory -> Games -> Boss Battle -> Checkpoint -> Complete.
    if (hasPractice()) list.push('practice');
    if (bossQuestions().length) list.push('boss-battle');
    if (hasPractice()) list.push('chapter-checkpoint');
    list.push('complete');
    return list;
  }

  function practiceAccuracy() {
    if (!practiceAttempts.length) return 0;
    var correct = practiceAttempts.filter(function (a) { return a.correct; }).length;
    return correct / practiceAttempts.length;
  }

  // ---- Stepper -------------------------------------------------------------

  function renderStepper() {
    var nav = Utils.qs('#stage-stepper');
    nav.innerHTML = '';
    stages.forEach(function (stage, index) {
      // A tab is reachable if the student has already been at or past it.
      // Reachable tabs are clickable so they can jump back (or to the furthest
      // point they've unlocked); future tabs are not.
      var reachable = index <= maxStageReached;
      var step = el('li', {
        class: 'stage-step' +
          (index < stageIndex ? ' stage-step--done' : '') +
          (index === stageIndex ? ' stage-step--active' : '') +
          (reachable ? ' stage-step--clickable' : ''),
        'data-stage': stage,
        role: reachable ? 'button' : null,
        tabindex: reachable ? '0' : null,
        'aria-current': index === stageIndex ? 'step' : null,
        text: STAGE_LABELS[stage] || stage
      });
      if (reachable && index !== stageIndex) {
        step.addEventListener('click', function () { goToStage(index); });
        step.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToStage(index); }
        });
      }
      nav.appendChild(step);
    });
  }

  function goToStage(index) {
    stageIndex = index;
    if (index > maxStageReached) maxStageReached = index;
    saveStageProgress();
    renderStepper();
    var stage = stages[stageIndex];
    var container = main();
    container.innerHTML = '';
    container.focus();

    var renderers = {
      theory: renderTheory,
      lesson: renderLesson,
      practice: renderPractice,
      games: renderMiniGames,
      'boss-battle': renderBossBattle,
      'chapter-checkpoint': renderCheckpoint,
      complete: renderComplete
    };
    (renderers[stage] || renderComplete)(container);
    renderMathIn(container);
    Notifications.announce((STAGE_LABELS[stage] || stage) + ' stage');
    window.scrollTo({ top: 0, behavior: Animations.reducedMotionPreferred() ? 'auto' : 'smooth' });
  }

  function advance(stageName) {
    Api.progress.markStageComplete(content.chapterRef, stageName)
      .catch(function () {
        // Non-fatal; don't interrupt the student with a popup on every stage.
        console.warn('[chapter-engine] could not mark stage complete:', stageName);
      });
    if (stageIndex < stages.length - 1) goToStage(stageIndex + 1);
  }

  /**
   * The top-bar back arrow steps BACK one stage rather than leaving the chapter.
   * Only on the very first stage does it exit to the Classes list — so a student
   * mid-chapter returns to the previous tab, not all the way out to the
   * dashboard. Wired once, here.
   */
  function stageBack() {
    if (stageIndex > 0) {
      goToStage(stageIndex - 1);
    } else {
      window.location.href = 'games.html';
    }
  }

  function wireBackButton() {
    var btn = Utils.qs('#chapter-back');
    if (btn) btn.addEventListener('click', stageBack);
  }

  // ---- Question plumbing ---------------------------------------------------

  function difficultyBadgeClass(difficulty) {
    return { Easy: 'success', Medium: 'info', Hard: 'warning', Expert: 'warning', Master: 'error' }[difficulty] || 'neutral';
  }

  function submitAttempt(question, isCorrect, meta, options) {
    var opts = options || {};
    practiceAttempts.push({ questionId: question.id, correct: isCorrect });
    if (!isCorrect && wrongQuestionIds.indexOf(question.id) === -1) wrongQuestionIds.push(question.id);

    // GAMES (practice) MODE: XP-earning, backend-synced. We record the attempt
    // locally first (attempt count, wrong count, burnout/red-card), then send
    // it to the backend with the fields the +5/+3/-2 scheme needs:
    // gameMode='practice', attemptNumber (1-based), priorWrongCount.
    if (opts.practice) {
      var mechanicId = opts.bankMechanicId || question.mechanicId;
      var rec = PracticeStore.record(content.chapterRef, mechanicId, question.id, isCorrect);

      // INSTANT feedback: compute the XP change locally with the same rule the
      // backend uses, and update the box right away — so it never lags a
      // question or two behind while the slow Sheets write is still in flight.
      var localDelta = computeLocalXpDelta(isCorrect, rec.attemptNumber, rec.priorWrongCount);
      if (localDelta !== 0) xpEarned += localDelta;
      if (opts.onXpDelta) opts.onXpDelta(localDelta, isCorrect, rec.attemptNumber);

      var pPayload = {
        questionId: fullQuestionId(question.id),
        mechanicId: mechanicId,
        chapterRef: content.chapterRef,
        topicTag: question.topicTag || 'general',
        difficulty: question.difficulty,
        correct: isCorrect,
        hintsUsed: Math.min(Number(meta.hintsUsed) || 0, 10),
        retries: Math.min(Number(meta.retries) || 0, 20),
        gameMode: 'practice',
        attemptNumber: rec.attemptNumber,
        priorWrongCount: rec.priorWrongCount
      };

      // Persist in the background — the box already shows the change, so we do
      // NOT drive it from this response (that is what caused the lag). The
      // backend stays the source of truth for the starting total next session.
      Api.progress.recordAttempt(sessionId, pPayload)
        .then(function (result) {
          if (result && result.coinsAwarded) coinsEarned += result.coinsAwarded;
        })
        .catch(function () {
          Storage.queuePendingWrite('progress/recordAttempt', { sessionId: sessionId, attemptData: pPayload });
        });
      // Hand the wrong-attempt history back so the feedback layer can tell a
      // first wrong (random wrong sound) from a repeat wrong (depression sound).
      return { attemptNumber: rec.attemptNumber, priorWrongCount: rec.priorWrongCount };
    }

    var payload = {
      questionId: fullQuestionId(question.id),
      mechanicId: question.mechanicId,
      topicTag: question.topicTag || 'general',
      difficulty: question.difficulty,
      correct: isCorrect,
      hintsUsed: Math.min(Number(meta.hintsUsed) || 0, 10),
      retries: Math.min(Number(meta.retries) || 0, 20),
      isFirstAttempt: true
    };

    Api.progress.recordAttempt(sessionId, payload)
      .then(function (result) {
        if (result && result.xpAwarded) {
          xpEarned += result.xpAwarded;
          coinsEarned += result.coinsAwarded || 0;
          Notifications.success('+' + result.xpAwarded + ' XP', 1800);
        }
      })
      .catch(function () {
        Storage.queuePendingWrite('progress/recordAttempt', { sessionId: sessionId, attemptData: payload });
      });
  }

  /**
   * FeedbackFx — the little celebration / commiseration after each answer:
   * an emoji, a gif, and a sound. Media lives (relative to this page) in:
   *     assets/sounds/{correct,wrong,repeat-wrong}/*.mp3
   *     assets/gifs/{correct,wrong}/*.webp
   * Rehan drops the files into those folders on GitHub; to add or remove one,
   * just edit the filename lists below. Everything degrades gracefully — a
   * missing sound simply means no sound, a missing gif means no gif, and the
   * student is NEVER trapped (the Next button always unlocks, even if a sound
   * fails to load or the browser blocks autoplay).
   *
   * kinds:
   *   'correct'       answer was right          -> correct sound + correct gif
   *   'wrong'         first wrong on this Q     -> random wrong sound + wrong gif
   *   'repeat-wrong'  same Q wrong 2nd+ time    -> repeat-wrong sound + wrong gif
   */
  var FeedbackFx = (function () {
    // Filenames only (no folder, no extension). Edit to add / remove media.
    var GIFS = {
      correct: ['correct-01', 'correct-03', 'correct-04', 'correct-05', 'correct-06',
                'correct-07', 'correct-08', 'correct-09', 'correct-10', 'correct-11'],
      wrong:   ['wrong-01', 'wrong-02', 'wrong-03', 'wrong-04', 'wrong-05', 'wrong-06']
    };
    var SOUNDS = {
      correct:        ['correct-01'],
      wrong:          ['wrong-01', 'wrong-02', 'wrong-03', 'wrong-04'],
      'repeat-wrong': ['repeat-01']
    };
    var EMOJI = {
      correct:        ['🎉', '✅', '🌟', '👏', '🔥', '💯'],
      wrong:          ['❌', '😬', '🙈', '😅'],
      'repeat-wrong': ['😵', '🥲', '💀', '😩']
    };
    var GIF_EXT = '.webp';
    var SAFETY_MS = 3500; // sounds are trimmed to <=3s, so never wait longer

    var current = null; // the audio currently playing (a new answer stops it)

    function pick(a) { return a && a.length ? a[Math.floor(Math.random() * a.length)] : null; }
    function gifKindFor(kind) { return kind === 'correct' ? 'correct' : 'wrong'; }

    function show(kind) {
      if (!SOUNDS[kind] && !EMOJI[kind]) kind = (kind === 'correct' ? 'correct' : 'wrong');

      var wrap = el('div', { class: 'feedback-fx feedback-fx--' + kind });

      var emoji = pick(EMOJI[kind] || EMOJI.wrong);
      if (emoji) wrap.appendChild(el('div', { class: 'feedback-fx__emoji', text: emoji }));

      var gifName = pick(GIFS[gifKindFor(kind)]);
      if (gifName) {
        var img = el('img', {
          class: 'feedback-fx__gif',
          src: 'assets/gifs/' + gifKindFor(kind) + '/' + gifName + GIF_EXT,
          alt: '', loading: 'eager'
        });
        img.addEventListener('error', function () { img.remove(); }); // missing file -> hide
        wrap.appendChild(img);
      }

      var done = false, cbs = [], timer = null;
      function finish() {
        if (done) return;
        done = true;
        if (timer) { clearTimeout(timer); timer = null; }
        cbs.forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } });
        cbs = [];
      }

      var soundName = pick(SOUNDS[kind]);
      if (soundName) {
        try {
          if (current) { try { current.pause(); } catch (e) { /* ignore */ } }
          var audio = new Audio('assets/sounds/' + kind + '/' + soundName + '.mp3');
          current = audio;
          audio.addEventListener('ended', finish);
          audio.addEventListener('error', function () { setTimeout(finish, 250); });
          timer = setTimeout(finish, SAFETY_MS);
          var p = audio.play();
          if (p && typeof p.catch === 'function') {
            p.catch(function () { setTimeout(finish, 250); }); // autoplay blocked -> don't trap
          }
        } catch (e) {
          setTimeout(finish, 250);
        }
      } else {
        timer = setTimeout(finish, 600); // no sound for this kind -> brief beat, then unlock
      }

      return {
        node: wrap,
        whenDone: function (cb) { if (done) cb(); else cbs.push(cb); }
      };
    }

    return { show: show };
  })();

  function renderFeedback(card, isCorrect, explanation, onContinue, kind) {
    kind = kind || (isCorrect ? 'correct' : 'wrong');
    Animations.showAnswerFeedback(card, isCorrect);

    var fx = FeedbackFx.show(kind);
    card.appendChild(fx.node);

    card.appendChild(el('div', { class: 'feedback' }, [
      el('p', { class: 'feedback__verdict', text: isCorrect ? 'Correct' : 'Not quite' }),
      explanation ? el('p', { class: 'text-body-sm', text: explanation }) : null
    ]));
    renderMathIn(card);

    // The Next button appears only once the feedback sound has finished, so the
    // moment is never cut off. If the sound is missing or blocked, whenDone()
    // fires quickly, so the student is never left waiting on a silent card.
    var next = el('button', { class: 'btn btn--primary btn--full', type: 'button', style: 'margin-top:var(--space-4); display:none;', text: 'Next' });
    card.appendChild(next);
    next.addEventListener('click', onContinue, { once: true });

    fx.whenDone(function () {
      next.style.display = '';
      next.focus();
    });
  }

  /**
   * A small, persistent XP panel shown above each practice question. It shows
   * this game type's running XP total and a one-line note about the last
   * change (+5 first correct, +3 later correct, -2 wrong). This replaces the
   * old fading popup so the student can always see where their XP stands and
   * why it moved.
   */
  function makeXpBox(xpState, typeName) {
    var totalEl = el('span', { class: 'xp-box__value', text: xpState.total + ' XP' });
    var changeEl = el('p', { class: 'xp-box__change' });
    var box = el('div', { class: 'xp-box' }, [
      el('p', { class: 'xp-box__label', text: (typeName || 'Game') + ' XP' }),
      totalEl,
      changeEl
    ]);

    function render() {
      totalEl.textContent = xpState.total + ' XP';
      var d = xpState.lastDelta;
      var n = xpState.lastAttempt;
      box.classList.remove('xp-box--up', 'xp-box--down');
      if (d === null || d === undefined) {
        changeEl.textContent = 'Answer questions to earn XP.';
      } else if (d > 0 && Number(n) <= 1) {
        changeEl.textContent = 'First-time correct, so +' + d + ' XP';
        box.classList.add('xp-box--up');
      } else if (d > 0) {
        changeEl.textContent = 'Correct on your ' + ordinalWord(n) + ' attempt, so +' + d + ' XP';
        box.classList.add('xp-box--up');
      } else if (d < 0) {
        changeEl.textContent = 'Wrong answer, so ' + d + ' XP';
        box.classList.add('xp-box--down');
      } else {
        changeEl.textContent = 'This question is resting - no XP change.';
      }
    }

    render();
    return { el: box, update: render };
  }

  /**
   * A question the engine cannot render is shown as a readable card rather
   * than being allowed to throw. The student can always move on; the reason
   * is printed so the content file can be fixed.
   */
  function renderBrokenQuestion(card, body, reason, onContinue) {
    body.appendChild(el('div', { class: 'notice notice--warning' }, [
      el('p', { class: 'notice__title', text: 'This question is not available' }),
      el('p', { class: 'text-body-sm', text: 'Skip ahead — the rest of the chapter works normally.' }),
      el('p', { class: 'notice__detail', text: reason })
    ]));
    var next = el('button', { class: 'btn btn--secondary btn--full', type: 'button', style: 'margin-top:var(--space-4);', text: 'Skip this question' });
    body.appendChild(next);
    next.addEventListener('click', onContinue, { once: true });
    console.warn('[chapter-engine] ' + reason);
  }

  function renderQuestion(question, container, onComplete, submitOptions) {
    var card = el('div', { class: 'card card--question anim-fade-in-up' });
    if (question.difficulty) {
      card.appendChild(el('span', { class: 'badge badge--' + difficultyBadgeClass(question.difficulty), text: question.difficulty }));
    }
    card.appendChild(el('h3', { class: 'question-prompt', text: question.prompt || '' }));

    var body = el('div', { class: 'question-body' });
    card.appendChild(body);
    container.appendChild(card);

    var mechanic = Mechanics[question.mechanicId];
    if (!mechanic) {
      renderBrokenQuestion(card, body,
        'Question "' + question.id + '" uses mechanic "' + question.mechanicId + '", which this engine does not render yet.',
        onComplete);
      renderMathIn(card);
      return;
    }

    var problem = mechanic.validate(question.payload);
    if (problem) {
      renderBrokenQuestion(card, body,
        'Question "' + question.id + '" (' + question.mechanicId + ') ' + problem + '.',
        onComplete);
      renderMathIn(card);
      return;
    }

    var hintsUsed = 0;
    if (question.hint) {
      var hintBtn = el('button', { class: 'btn btn--tertiary btn--sm', type: 'button', text: 'Show a hint' });
      hintBtn.addEventListener('click', function () {
        hintsUsed = 1;
        hintBtn.replaceWith(el('p', { class: 'hint-text', text: question.hint }));
      });
      body.appendChild(hintBtn);
    }

    var answered = false;
    mechanic.render({
      question: question,
      body: body,
      card: card,
      answer: function (isCorrect, meta) {
        if (answered) return;
        answered = true;
        var merged = meta || {};
        merged.hintsUsed = hintsUsed;
        var info = submitAttempt(question, isCorrect, merged, submitOptions);
        // priorWrongCount >= 1 means this question was already wrong before, so
        // getting it wrong again is a REPEAT wrong (2nd time or more).
        var kind = isCorrect ? 'correct'
          : (info && info.priorWrongCount >= 1 ? 'repeat-wrong' : 'wrong');
        renderFeedback(card, isCorrect, question.explanation, onComplete, kind);
      }
    });
    renderMathIn(card);
  }

  /**
   * Runs a list of questions one at a time, then calls onDone.
   *
   * opts (optional):
   *   onExit     — if given, shows a small toolbar above each question with an
   *                "Exit" button (e.g. back to the practice cards).
   *   allowBack  — if true, the toolbar also shows a "Previous" button that
   *                re-shows the prior question (answers there are not re-graded).
   */
  function runQuestionSeries(questions, container, onDone, labelFn, submitOptions, opts) {
    opts = opts || {};
    var index = 0;

    function toolbar() {
      if (!opts.onExit && !opts.allowBack) return null;
      var bar = el('div', { class: 'q-toolbar' });
      if (opts.onExit) {
        var exit = el('button', { class: 'btn', type: 'button', text: '\u2190 ' + (opts.exitLabel || 'Exit') });
        exit.addEventListener('click', function () { opts.onExit(); });
        bar.appendChild(exit);
      }
      if (opts.allowBack) {
        var prev = el('button', { class: 'btn', type: 'button', text: 'Previous', disabled: index === 0 ? 'disabled' : null });
        prev.addEventListener('click', function () { if (index > 0) { index--; step(); } });
        bar.appendChild(prev);
      }
      return bar;
    }

    function step() {
      container.innerHTML = '';
      if (index >= questions.length) { onDone(); return; }
      var bar = toolbar();
      if (bar) container.appendChild(bar);
      if (opts.renderStatus) opts.renderStatus(container);
      if (labelFn) {
        container.appendChild(el('p', { class: 'text-caption', text: labelFn(index, questions.length) }));
      }
      renderQuestion(questions[index], container, function () { index++; step(); }, submitOptions);
    }
    step();
  }

  // ---- Stages --------------------------------------------------------------

  function renderTheory(container) {
    var wrap = el('div', { class: 'reading-column stack-lg anim-fade-in-up' });

    // A guidance line telling the student to clear the notes first. Only shown
    // when the chapter actually supplies a notes link; without one it would be
    // an instruction the student cannot follow.
    if (content.notesUrl) {
      wrap.appendChild(el('div', { class: 'notice notice--info' }, [
        el('p', { class: 'text-body-sm', text: 'Read the full notes once before moving on. You can open them anytime with the "Full Notes" button below.' })
      ]));
    }

    content.theory.sections.forEach(function (section) {
      wrap.appendChild(el('section', {}, [
        el('h2', { text: section.heading || '' }),
        el('p', { class: 'text-body-lg', text: section.body || '' })
      ]));
    });

    if (isNonEmptyArray(content.theory.definitions)) {
      var defs = el('div', { class: 'card notice--info' }, [el('p', { class: 'text-caption', text: 'Key Terms' })]);
      content.theory.definitions.forEach(function (d) {
        defs.appendChild(el('p', { class: 'text-body-sm def-row' }, [
          el('strong', { text: d.term + ': ' }),
          document.createTextNode(d.definition || '')
        ]));
      });
      wrap.appendChild(defs);
    }

    if (isNonEmptyArray(content.theory.examTips)) {
      var tips = el('div', { class: 'card exam-tips' }, [el('p', { class: 'text-caption', text: 'FBISE Exam Tips' })]);
      content.theory.examTips.forEach(function (tip) {
        tips.appendChild(el('p', { class: 'text-body-sm def-row', text: tip }));
      });
      wrap.appendChild(tips);
    }

    // "Full Notes" opens the chapter's own notes page IN THIS TAB and remembers
    // where the student was, so a Back button on the notes page (added by
    // openNotes) returns them to this exact chapter and stage. Reading is
    // encouraged but never forced — Continue works whether or not they open it.
    if (content.notesUrl) {
      var notesBtn = el('button', { class: 'btn btn--secondary btn--lg btn--full', type: 'button' }, [
        el('span', { text: '\uD83D\uDCD6  Read Full Notes' })
      ]);
      notesBtn.addEventListener('click', function () { openNotes(); });
      wrap.appendChild(notesBtn);
    }

    var go = el('button', { class: 'btn btn--primary btn--lg', type: 'button', text: 'Continue' });
    go.addEventListener('click', function () { advance('theory'); });
    wrap.appendChild(go);
    container.appendChild(wrap);
  }

  /**
   * Opens the chapter's notes page in the same tab. Before leaving, it records
   * the current chapter path and stage in sessionStorage AND passes them on the
   * notes URL (?from=...&stage=...), so the notes page can offer a Back link
   * that lands the student back on this chapter — even mid-way through.
   * Reading notes is optional, so nothing about progress is changed here.
   */
  function openNotes() {
    if (!content.notesUrl) return;
    // Send an ABSOLUTE back URL. The notes page lives at the site root, so a
    // relative "chapter.html?..." would resolve to <root>/chapter.html and 404.
    // Building the full origin+path here means the Back button works no matter
    // where the notes page sits. window.location.href is this chapter page, so
    // its directory (…/games/) is exactly the base we want.
    //
    // NOTE: chapterPath keeps its plain slashes here. encodeURIComponent would
    // turn "8/science/x" into "8%2Fscience%2Fx", and GitHub Pages 404s on an
    // encoded slash in the query — which is exactly why the Back button failed
    // while the same link with plain slashes worked.
    var here = window.location.href.split('?')[0];              // …/games/chapter.html
    var backTo = here + '?ch=' + chapterPath;
    try {
      sessionStorage.setItem('wha:notesReturn', backTo);
    } catch (e) { /* private mode — the query param below still works */ }
    var url = content.notesUrl;
    var joiner = url.indexOf('?') === -1 ? '?' : '&';
    window.location.href = url + joiner + 'from=' + encodeURIComponent(backTo);
  }

  function renderLesson(container) {
    var hotspots = content.interactiveLesson.hotspots;
    var visited = {};

    var wrap = el('div', { class: 'stack anim-fade-in-up' });
    wrap.appendChild(el('p', { class: 'text-body-sm', text: content.interactiveLesson.instructions || 'Explore each labelled point.' }));

    var canvas = diagramCanvas(content.interactiveLesson);
    wrap.appendChild(canvas);

    var factPanel = el('div', { class: 'card fact-panel', 'aria-live': 'polite' }, [
      el('p', { class: 'text-body-sm', text: 'Select a labelled point on the diagram to learn about it.' })
    ]);
    var progress = el('p', { class: 'text-caption', text: '0 of ' + hotspots.length + ' explored' });
    var go = el('button', { class: 'btn btn--primary btn--lg', type: 'button', text: 'Continue', disabled: true });

    hotspots.forEach(function (hotspot, index) {
      var marker = el('button', {
        class: 'diagram-point diagram-point--pulse',
        type: 'button',
        style: 'left:' + hotspot.x + '%; top:' + hotspot.y + '%;',
        'aria-label': hotspot.label || ('Point ' + (index + 1))
      }, [el('span', { text: '+' })]);

      marker.addEventListener('click', function () {
        factPanel.innerHTML = '';
        factPanel.appendChild(el('p', { class: 'text-body-sm' }, [
          el('strong', { text: (hotspot.label || '') + ': ' }),
          document.createTextNode(hotspot.fact || '')
        ]));
        marker.classList.add('diagram-point--visited');
        marker.classList.remove('diagram-point--pulse');
        marker.querySelector('span').textContent = '✓';
        visited[hotspot.id || index] = true;

        var count = Object.keys(visited).length;
        progress.textContent = count + ' of ' + hotspots.length + ' explored';
        if (count >= hotspots.length) go.disabled = false;
      });

      canvas.appendChild(marker);
    });

    wrap.appendChild(factPanel);
    wrap.appendChild(progress);

    // An escape hatch. The old engine had none, so a mis-authored hotspot
    // list left the student with a permanently disabled Continue button.
    var skip = el('button', { class: 'btn btn--tertiary btn--sm', type: 'button', text: 'Skip exploring' });
    skip.addEventListener('click', function () { advance('lesson'); });
    wrap.appendChild(skip);

    go.addEventListener('click', function () { advance('lesson'); });
    wrap.appendChild(go);
    container.appendChild(wrap);
  }

  // Which practice types the student has completed at least once THIS visit.
  // The rule: play each type at least once before Practice counts as done.
  var practiceTypesDone = {};

  /**
   * Practice hub. One card per game type. Each card shows a progress bar of how
   * many of that type's questions the student has answered so far (across all
   * sessions, from the browser store), and a Play button that runs a fresh set
   * of PRACTICE_PER_TYPE questions. Practice awards no XP — it is for learning.
   */
  var PRACTICE_UNLOCK_FRACTION = 0.5;  // overall progress needed to open Games

  var BOSS_UNLOCK_PERCENT = 90;   // average XP % across all game types to unlock Boss

  function renderPractice(container) {
    var banks = practiceBanks();
    // Map mechanicId -> question count, sent to the backend so it can compute
    // each type's max XP (count * 5) and the overall average %.
    var questionCounts = {};
    banks.forEach(function (b) { questionCounts[b.mechanicId] = bankCount(b); });

    function typeStats(bank) {
      var prog = PracticeStore.forType(content.chapterRef, bank.mechanicId);
      var total = bankCount(bank);
      var solved = 0;
      Object.keys(prog.q).forEach(function (id) { if (prog.q[id].solved) solved++; });
      return { done: Math.min(prog.seen.length, total), total: total, wrong: prog.wrong.length,
               solved: solved, red: PracticeStore.redCardCount(content.chapterRef, bank.mechanicId) };
    }

    // The latest backend XP breakdown (per-type % and overall average).
    var breakdown = null;

    function renderHub() {
      container.innerHTML = '';
      var wrap = el('div', { class: 'stack anim-fade-in-up' });

      var avg = breakdown ? breakdown.averagePercent : 0;
      var unlocked = avg >= BOSS_UNLOCK_PERCENT;

      wrap.appendChild(el('div', { class: 'practice-intro' }, [
        el('h2', { text: 'Games' }),
        el('p', { class: 'text-body-sm', text: 'Play any game type to earn XP. Scoring: first correct answer +5 XP, correct after a mistake +3 XP, each wrong answer \u22122 XP. Miss the same question 5 times and its XP stops counting \u2014 that question\u2019s card turns red and comes back another day. Reach ' + BOSS_UNLOCK_PERCENT + '% average XP across all game types to unlock the Boss Battle.' })
      ]));

      // Overall average XP toward unlocking the Boss Battle.
      wrap.appendChild(el('div', { class: 'practice-overall' }, [
        el('div', { class: 'progress progress--lg' }, [
          el('div', { class: 'progress__fill' + (unlocked ? ' progress__fill--done' : ''), style: 'width:' + avg + '%;' })
        ]),
        el('p', { class: 'text-caption', text: breakdown
          ? (unlocked
              ? ('Boss Battle unlocked! Average XP ' + avg + '%.')
              : ('Average XP ' + avg + '% \u00b7 reach ' + BOSS_UNLOCK_PERCENT + '% to unlock the Boss Battle'))
          : 'Loading your XP\u2026' })
      ]));

      var perType = {};
      if (breakdown) breakdown.perType.forEach(function (t) { perType[t.mechanicId] = t; });

      var grid = el('div', { class: 'practice-grid' });
      banks.forEach(function (bank, i) {
        var stats = typeStats(bank);
        var t = perType[bank.mechanicId];
        var xpPct = t ? t.percent : 0;
        var xpVal = t ? t.xp : 0;

        var card = el('div', { class: 'practice-card practice-card--c' + ((i % 8) + 1) });
        card.appendChild(el('div', { class: 'practice-card__head' }, [
          el('h3', { class: 'practice-card__title', text: bank.name || bank.mechanicId }),
          el('span', { class: 'badge badge--neutral', text: xpVal + ' XP' })
        ]));
        if (bank.description) {
          card.appendChild(el('p', { class: 'practice-card__desc text-body-sm', text: bank.description }));
        }

        // XP progress bar for this type (earned XP / max XP).
        card.appendChild(el('div', { class: 'progress' }, [
          el('div', { class: 'progress__fill', style: 'width:' + xpPct + '%;' })
        ]));
        var meta = stats.solved + ' / ' + stats.total + ' solved';
        if (stats.red) meta += ' \u00b7 ' + stats.red + ' red';
        card.appendChild(el('p', { class: 'text-caption', text: meta }));

        var play = el('button', { class: 'btn btn--primary btn--full', type: 'button', text: stats.done ? 'Play again' : 'Start' });
        play.addEventListener('click', function () { runPractice(bank); });
        card.appendChild(play);

        grid.appendChild(card);
      });
      wrap.appendChild(grid);

      var go = el('button', {
        class: 'btn btn--lg ' + (unlocked ? 'btn--primary' : 'btn--secondary'),
        type: 'button',
        disabled: unlocked ? null : 'disabled',
        text: unlocked ? 'Continue to Boss Battle' : 'Reach ' + BOSS_UNLOCK_PERCENT + '% average XP to continue (' + avg + '% so far)'
      });
      go.addEventListener('click', function () { if (unlocked) advance('practice'); });
      wrap.appendChild(go);

      container.appendChild(wrap);
    }

    // Persist the last good XP breakdown per chapter so a warm reload shows the
    // real numbers instantly instead of a spinner. If the network call then
    // fails or is slow (Apps Script cold start, flaky mobile data), the student
    // still sees their last-known XP rather than a permanent "Loading your XP…"
    // — which is what the old silent catch left behind on every refresh.
    var XP_CACHE_KEY = 'wha-xpbreakdown:' + content.chapterRef;
    function readCachedBreakdown() {
      try {
        var raw = window.localStorage.getItem(XP_CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    }
    function writeCachedBreakdown(data) {
      try { window.localStorage.setItem(XP_CACHE_KEY, JSON.stringify(data)); } catch (e) {}
    }
    // A hung request must not leave the hub stuck forever, so race it against a timer.
    function withTimeout(p, ms) {
      return new Promise(function (resolve, reject) {
        var done = false;
        var t = setTimeout(function () { if (!done) { done = true; reject(new Error('timeout')); } }, ms);
        p.then(function (v) { if (!done) { done = true; clearTimeout(t); resolve(v); } },
               function (e) { if (!done) { done = true; clearTimeout(t); reject(e); } });
      });
    }

    // Pull the latest XP breakdown from the backend, then (re)render the hub.
    function refreshAndRender() {
      if (breakdown == null) {
        var cached = readCachedBreakdown();
        if (cached) breakdown = cached;   // show last-known XP immediately, no spinner
      }
      renderHub();
      if (!Api.leaderboard || !Api.leaderboard.gameXpBreakdown) return;
      function attempt(retriesLeft) {
        withTimeout(Api.leaderboard.gameXpBreakdown(content.chapterRef, questionCounts), 12000)
          .then(function (data) { breakdown = data; writeCachedBreakdown(data); renderHub(); })
          .catch(function () {
            if (retriesLeft > 0) { setTimeout(function () { attempt(retriesLeft - 1); }, 1500); }
            // else keep the cached/last view — never fall back to a stuck spinner
          });
      }
      attempt(1);
    }

    function runPractice(bank) {
      // The bank's questions live in their own file; fetch them the first time
      // this game is opened, then play. Cached after the first load.
      loadBankQuestions(bank).then(function () {
        runPracticeLoaded(bank);
      }).catch(function () {
        Notifications.info('This game could not load. Check your connection and try again.');
      });
    }

    function runPracticeLoaded(bank) {
      var picked = pickPracticeQuestions(bank.questions, content.chapterRef, bank.mechanicId, PRACTICE_PER_TYPE);
      if (!picked.length) {
        Notifications.info('No questions available for this type yet.');
        return;
      }
      // Live XP box for this game type. Starts from the type's stored total
      // (so the number matches the backend), then moves with each answer.
      var startXp = 0;
      if (breakdown && breakdown.perType) {
        breakdown.perType.forEach(function (t) {
          if (t.mechanicId === bank.mechanicId) startXp = t.xp;
        });
      }
      var xpState = { total: startXp, lastDelta: null };
      var currentXpBox = null;

      var submitOptions = {
        practice: true,
        bankMechanicId: bank.mechanicId,
        onXpDelta: function (delta, isCorrect, attemptNumber) {
          xpState.total += delta;
          xpState.lastDelta = delta;
          xpState.lastCorrect = isCorrect;
          xpState.lastAttempt = attemptNumber;
          if (currentXpBox) currentXpBox.update();
        }
      };

      runQuestionSeries(picked, container, function () {
        practiceTypesDone[bank.mechanicId] = true;
        container.innerHTML = '';
        var justDone = picked.length;
        container.appendChild(el('div', { class: 'card summary-card anim-fade-in-up' }, [
          el('h2', { text: 'Nice work' }),
          el('p', { class: 'text-body-sm', text: 'You played ' + justDone + ' ' + (bank.name || 'questions') + '. Try another type, or play this one again for new questions.' }),
          (function () {
            var back = el('button', { class: 'btn btn--primary btn--lg', type: 'button', style: 'margin-top:var(--space-4);', text: 'Back to Games' });
            back.addEventListener('click', refreshAndRender);
            return back;
          })()
        ]));
      }, function (index, total) {
        return (bank.name || 'Question') + ' — ' + (index + 1) + ' of ' + total;
      }, submitOptions, {
        // In-question toolbar: exit back to the cards, and step to previous.
        onExit: refreshAndRender,
        exitLabel: 'Back to Games',
        allowBack: true,
        renderStatus: function (host) {
          // New question on screen — clear the previous reason line (but keep
          // the running total) so the message always matches the question the
          // student just answered.
          xpState.lastDelta = null;
          xpState.lastAttempt = null;
          currentXpBox = makeXpBox(xpState, bank.name || 'This game');
          host.appendChild(currentXpBox.el);
        }
      });
    }

    refreshAndRender();
  }

  function renderMiniGames(container) {
    var games = miniGames();
    runQuestionSeries(games, container, function () { advance('games'); }, function (index, total) {
      return total > 1 ? 'Mini game ' + (index + 1) + ' of ' + total : null;
    });
  }

  function renderBossBattle(container) {
    // Boss Battle unlocks at BOSS_UNLOCK_PERCENT average XP across all game
    // types — the same figure the Games hub shows. We re-check with the
    // backend here so a student can't skip ahead via the stepper.
    var banks = practiceBanks();
    var questionCounts = {};
    banks.forEach(function (b) { questionCounts[b.mechanicId] = bankCount(b); });

    function lockedView() {
      container.innerHTML = '';
      container.appendChild(el('div', { class: 'empty-state' }, [
        el('p', { class: 'empty-state__title', text: 'Boss Battle locked' }),
        el('p', { text: 'Reach ' + BOSS_UNLOCK_PERCENT + '% average XP in Games to unlock this challenge.' })
      ]));
      var back = el('button', { class: 'btn btn--primary empty-state__action', type: 'button', text: 'Back to Games' });
      back.addEventListener('click', function () { goToStage(stages.indexOf('practice')); });
      container.querySelector('.empty-state').appendChild(back);
    }

    function startBoss() {
      container.innerHTML = '';
      runQuestionSeries(bossQuestions(), container, function () {
        container.innerHTML = '';
        var card = el('div', { class: 'card summary-card' }, [el('h2', { text: 'Boss Battle cleared' })]);
        Animations.celebrate(card);
        var go = el('button', { class: 'btn btn--primary btn--lg', type: 'button', style: 'margin-top:var(--space-4);', text: 'Continue' });
        go.addEventListener('click', function () { advance('boss-battle'); });
        card.appendChild(go);
        container.appendChild(card);
      });
    }

    // Show a brief loading state, then unlock or lock based on backend XP.
    container.innerHTML = '';
    container.appendChild(el('p', { class: 'text-caption', text: 'Checking your XP\u2026' }));
    if (Api.leaderboard && Api.leaderboard.gameXpBreakdown) {
      Api.leaderboard.gameXpBreakdown(content.chapterRef, questionCounts)
        .then(function (data) {
          if (data && data.averagePercent >= BOSS_UNLOCK_PERCENT) startBoss();
          else lockedView();
        })
        .catch(function () { lockedView(); });
    } else {
      lockedView();
    }
  }

  function renderCheckpoint(container) {
    // Practice now records its own missed questions in the browser and brings
    // them back automatically, so a session where the student only used the new
    // Practice hub has nothing extra to check here. This stage stays meaningful
    // for any non-practice attempts made this session; otherwise it passes
    // straight through.
    var missedIds = wrongQuestionIds.slice();
    var pool = [];
    practiceBanks().forEach(function (b) { pool = pool.concat(b.questions); });
    var missed = pool.filter(function (q) { return missedIds.indexOf(q.id) !== -1; });

    if (!missed.length) {
      container.appendChild(el('div', { class: 'empty-state' }, [
        el('p', { class: 'empty-state__title', text: 'All clear' }),
        el('p', { text: 'Nothing to review right now — anything you miss in Practice comes back automatically next time.' })
      ]));
      setTimeout(function () { advance('chapter-checkpoint'); }, 1400);
      return;
    }

    runQuestionSeries(missed, container, function () { advance('chapter-checkpoint'); }, function (index, total) {
      return 'Checkpoint — revisiting ' + (index + 1) + ' of ' + total + ' missed ' + Utils.pluralize(total, 'question');
    }, { practice: true });
  }

  function renderComplete(container) {
    if (sessionId) {
      Api.progress.sessionEnd(sessionId).catch(function () { /* non-fatal */ });
    }
    var card = el('div', { class: 'card summary-card summary-card--final' });
    Animations.celebrate(card);
    card.appendChild(el('h1', { text: 'Chapter complete' }));
    card.appendChild(el('p', { class: 'text-body-lg', text: content.title }));
    card.appendChild(el('div', { class: 'cluster summary-card__rewards' }, [
      el('span', { class: 'badge badge--success', text: '+' + xpEarned + ' XP' }),
      el('span', { class: 'badge badge--info', text: '+' + coinsEarned + ' Coins' })
    ]));
    card.appendChild(el('a', { class: 'btn btn--primary btn--lg', style: 'margin-top:var(--space-6);', href: 'games.html', text: 'Back to Classes' }));
    container.appendChild(card);
  }

  // ---- Bootstrap -----------------------------------------------------------

  /**
   * ?ch=8/science/human_nervous_system  ->  classes/8/science/human_nervous_system
   * Rejected unless it is exactly three plain path segments, so nothing can be
   * talked into walking up the directory tree with "..".
   */
  function chapterPathFromQuery() {
    var raw = new URLSearchParams(window.location.search).get('ch');
    if (!raw) return null;
    var cleaned = stripHostFromPath(raw).replace(/\/+$/, '');
    return /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+){2}$/.test(cleaned) ? cleaned : null;
  }

  /** 8/science/human_nervous_system -> class8/subjects/science/human_nervous_system */
  function deriveChapterRef(path) {
    var parts = path.split('/');
    return 'class' + parts[0] + '/subjects/' + parts[1] + '/' + parts[2];
  }

  function applySubjectAccent(subjectKey) {
    var token = SUBJECT_TOKEN[String(subjectKey || '').toLowerCase()] || 'science';
    document.documentElement.style.setProperty('--subject-accent', 'var(--subject-' + token + '-primary)');
    document.documentElement.style.setProperty('--subject-accent-tint', 'var(--subject-' + token + '-secondary)');
  }

  function usedMechanicIds() {
    var ids = {};
    var all = miniGames().concat(bossQuestions());
    practiceBanks().forEach(function (b) {
      b.questions.forEach(function (q) { all.push(q); });
    });
    all.forEach(function (q) {
      if (q && q.mechanicId) ids[q.mechanicId] = true;
    });
    return Object.keys(ids);
  }

  function showFatal(message, detail) {
    main().innerHTML = '';
    main().appendChild(el('div', { class: 'empty-state' }, [
      el('p', { class: 'empty-state__title', text: message }),
      detail ? el('p', { text: detail }) : null,
      el('a', { class: 'btn btn--primary empty-state__action', href: 'games.html', text: 'Back to Classes' })
    ]));
  }

  async function init() {
    chapterPath = chapterPathFromQuery();
    if (!chapterPath) {
      showFatal('No chapter selected', 'Open a chapter from your Classes list.');
      return;
    }

    var response;
    try {
      // Default caching (not 'no-cache'): the browser may reuse a fresh copy,
      // which makes repeat opens noticeably faster. Chapter content changes
      // rarely, and the service worker already revalidates it, so forcing a
      // network round-trip on every open only added load time.
      response = await fetch('classes/' + chapterPath + '/content.json');
    } catch (networkError) {
      showFatal('This chapter could not load', 'Check your connection and try again.');
      return;
    }
    if (!response.ok) {
      showFatal('This chapter is not ready yet', 'Its content file is missing.');
      return;
    }

    try {
      content = await response.json();
    } catch (parseError) {
      showFatal('This chapter could not load', 'Its content file is not valid JSON.');
      return;
    }

    var parts = chapterPath.split('/');
    content.chapterRef = content.chapterRef || deriveChapterRef(chapterPath);
    content.subjectKey = content.subjectKey || parts[1];
    content.title = content.title || 'Chapter';

    document.title = content.title + ' — W.H. Academy';
    Utils.qs('#chapter-title').textContent = content.title;
    applySubjectAccent(content.subjectKey);

    stages = buildStages();
    if (stages.length <= 1) {
      showFatal('This chapter is still being built', 'There is no content in it yet.');
      return;
    }

    try {
      var result = await Api.progress.sessionStart(content.chapterRef, usedMechanicIds());
      sessionId = result && result.sessionId;
    } catch (sessionError) {
      // Don't alarm the student with a popup. Practice is XP-free so it doesn't
      // matter there at all, and the XP-earning stages already fall back to an
      // offline write queue if the session id is missing. Log for debugging.
      console.warn('[chapter-engine] session start failed:', sessionError);
    }

    wireBackButton();

    // Restore where the student was. If they've opened this chapter before,
    // land them on their last stage and keep every tab they'd already reached
    // clickable — so coming back from the dashboard no longer forces a restart
    // from the Theory tab.
    var saved = loadStageProgress();
    if (saved) {
      maxStageReached = Math.min(Math.max(0, saved.max || 0), stages.length - 1);
      var startAt = Math.min(Math.max(0, saved.last || 0), stages.length - 1);
      goToStage(startAt);
    } else {
      goToStage(0);
    }
  }

  // Exposed for the test suite and for games.js, which needs the same
  // subject-token map so the two screens can never disagree about accents.
  window.WHA_ChapterEngine = {
    SUBJECT_TOKEN: SUBJECT_TOKEN,
    Mechanics: Mechanics,
    supportedMechanicIds: function () { return Object.keys(Mechanics).sort(); },
    _gradeTyped: gradeTyped,
    _buildStages: function (c) { content = c; return buildStages(); }
  };

  document.addEventListener('DOMContentLoaded', function () {
    init().catch(function (error) {
      console.error(error);
      showFatal('This chapter could not load', 'Something went wrong while starting it.');
    });
  });
})();
