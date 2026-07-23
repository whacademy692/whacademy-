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

  // ---- Ordering family -----------------------------------------------------

  /**
   * Shared reorderable list. Keyboard-operable via up/down buttons rather
   * than drag-only, so it works without a pointer device.
   */
  function renderReorderable(ctx, displayItems, correctOrder, buttonLabel, revealFn) {
    var list = el('ol', { class: 'reorder-list' });

    shuffleForcefully(displayItems.slice()).forEach(function (item) {
      var row = el('li', { class: 'reorder-item', 'data-value': item });
      row.appendChild(el('span', { class: 'reorder-item__label', text: item }));
      row.appendChild(el('span', { class: 'reorder-item__controls' }, [
        el('button', { type: 'button', class: 'btn btn--icon btn--sm', 'aria-label': 'Move ' + item + ' up', 'data-move': 'up', text: '↑' }),
        el('button', { type: 'button', class: 'btn btn--icon btn--sm', 'aria-label': 'Move ' + item + ' down', 'data-move': 'down', text: '↓' })
      ]));
      list.appendChild(row);
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

      Utils.qsa('li', list).forEach(function (li, i) {
        li.classList.add(li.dataset.value === correctOrder[i] ? 'reorder-item--right' : 'reorder-item--wrong');
        Utils.qsa('button', li).forEach(function (b) { b.disabled = true; });
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
    var selected = null;      // item label awaiting a bucket

    var tray = el('div', { class: 'chip-tray' });
    var buckets = el('div', { class: 'bucket-grid' });
    ctx.body.appendChild(el('p', { class: 'text-caption', text: 'Tap an item, then tap the group it belongs to' }));
    ctx.body.appendChild(tray);
    ctx.body.appendChild(buckets);

    var submit = el('button', { class: 'btn btn--primary btn--full', type: 'button', text: 'Check groups', disabled: true });

    function repaint() {
      tray.innerHTML = '';
      buckets.innerHTML = '';

      payload.items.forEach(function (item) {
        if (placed[item.label]) return;
        var chip = el('button', {
          class: 'word-chip' + (selected === item.label ? ' word-chip--selected' : ''),
          type: 'button',
          text: item.label,
          'aria-pressed': selected === item.label ? 'true' : 'false'
        });
        chip.addEventListener('click', function () {
          selected = selected === item.label ? null : item.label;
          repaint();
        });
        tray.appendChild(chip);
      });

      if (tray.children.length === 0) {
        tray.appendChild(el('span', { class: 'text-caption', text: 'All items placed' }));
      }

      payload.categories.forEach(function (category) {
        var box = el('div', { class: 'bucket' + (selected ? ' bucket--armed' : '') });
        box.appendChild(el('p', { class: 'bucket__title', text: category.label }));
        var contents = el('div', { class: 'bucket__items' });

        payload.items.forEach(function (item) {
          if (placed[item.label] !== category.id) return;
          var chip = el('button', { class: 'word-chip word-chip--chosen', type: 'button', text: item.label, 'aria-label': 'Remove ' + item.label });
          chip.addEventListener('click', function () {
            delete placed[item.label];
            repaint();
          });
          contents.appendChild(chip);
        });
        box.appendChild(contents);

        box.addEventListener('click', function (event) {
          if (event.target.closest('.word-chip')) return;
          if (!selected) return;
          placed[selected] = category.id;
          selected = null;
          repaint();
        });
        buckets.appendChild(box);
      });

      submit.disabled = Object.keys(placed).length !== payload.items.length;
    }

    submit.addEventListener('click', function () {
      submit.disabled = true;
      var isCorrect = payload.items.every(function (item) { return placed[item.label] === item.categoryId; });

      // Show which items landed in the wrong group, not just a pass/fail.
      Utils.qsa('.bucket', buckets).forEach(function (box, boxIndex) {
        var categoryId = payload.categories[boxIndex].id;
        Utils.qsa('.word-chip', box).forEach(function (chip) {
          var item = payload.items.filter(function (i) { return i.label === chip.textContent; })[0];
          chip.disabled = true;
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
    var matches = {};      // left -> right
    var activeLeft = null;

    var grid = el('div', { class: 'match-grid' });
    var leftCol = el('div', { class: 'match-col' });
    var rightCol = el('div', { class: 'match-col' });
    leftCol.appendChild(el('p', { class: 'match-col__title', text: payload.leftLabel || 'Term' }));
    rightCol.appendChild(el('p', { class: 'match-col__title', text: payload.rightLabel || 'Match' }));
    grid.appendChild(leftCol);
    grid.appendChild(rightCol);

    ctx.body.appendChild(el('p', { class: 'text-caption', text: 'Tap one from each column to pair them' }));
    ctx.body.appendChild(grid);

    var submit = el('button', { class: 'btn btn--primary btn--full', type: 'button', text: 'Check matches', disabled: true });

    var lefts = Utils.shuffle(payload.pairs.map(function (p) { return String(p.left); }));
    var rights = Utils.shuffle(payload.pairs.map(function (p) { return String(p.right); }));

    function repaint() {
      Utils.qsa('.match-btn', grid).forEach(function (b) { b.remove(); });

      lefts.forEach(function (left) {
        var pairedWith = matches[left];
        var btn = el('button', {
          class: 'match-btn' + (activeLeft === left ? ' match-btn--active' : '') + (pairedWith ? ' match-btn--paired' : ''),
          type: 'button'
        }, [
          el('span', { text: left }),
          pairedWith ? el('span', { class: 'match-btn__partner', text: '→ ' + pairedWith }) : null
        ]);
        btn.addEventListener('click', function () {
          if (pairedWith) { delete matches[left]; activeLeft = null; }
          else { activeLeft = activeLeft === left ? null : left; }
          repaint();
        });
        leftCol.appendChild(btn);
      });

      rights.forEach(function (right) {
        var takenBy = Object.keys(matches).filter(function (l) { return matches[l] === right; })[0];
        var btn = el('button', {
          class: 'match-btn' + (takenBy ? ' match-btn--paired' : ''),
          type: 'button',
          text: right,
          disabled: !!takenBy
        });
        btn.addEventListener('click', function () {
          if (!activeLeft) return;
          matches[activeLeft] = right;
          activeLeft = null;
          repaint();
        });
        rightCol.appendChild(btn);
      });

      submit.disabled = Object.keys(matches).length !== payload.pairs.length;
    }

    submit.addEventListener('click', function () {
      submit.disabled = true;
      var correctFor = {};
      payload.pairs.forEach(function (p) { correctFor[String(p.left)] = String(p.right); });
      var isCorrect = Object.keys(correctFor).every(function (left) { return matches[left] === correctFor[left]; });

      Utils.qsa('.match-btn', leftCol).forEach(function (btn) {
        var left = btn.querySelector('span').textContent;
        btn.disabled = true;
        if (matches[left]) btn.classList.add(matches[left] === correctFor[left] ? 'match-btn--right' : 'match-btn--wrong');
      });
      Utils.qsa('.match-btn', rightCol).forEach(function (b) { b.disabled = true; });
      ctx.answer(isCorrect, {});
    });

    ctx.body.appendChild(submit);
    repaint();
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
  var practiceAttempts = [];
  var wrongQuestionIds = [];
  var xpEarned = 0;
  var coinsEarned = 0;

  var STAGE_LABELS = {
    theory: 'Theory',
    lesson: 'Explore',
    practice: 'Practice',
    games: 'Mini Game',
    'boss-battle': 'Boss Battle',
    'chapter-checkpoint': 'Checkpoint',
    complete: 'Complete'
  };

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
    if (content.interactiveLesson && isNonEmptyArray(content.interactiveLesson.hotspots)) list.push('lesson');
    if (practiceQuestions().length) list.push('practice');
    if (miniGames().length) list.push('games');
    if (bossQuestions().length) list.push('boss-battle');
    if (practiceQuestions().length) list.push('chapter-checkpoint');
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
      nav.appendChild(el('li', {
        class: 'stage-step' +
          (index < stageIndex ? ' stage-step--done' : '') +
          (index === stageIndex ? ' stage-step--active' : ''),
        'data-stage': stage,
        'aria-current': index === stageIndex ? 'step' : null,
        text: STAGE_LABELS[stage] || stage
      }));
    });
  }

  function goToStage(index) {
    stageIndex = index;
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
    Notifications.announce((STAGE_LABELS[stage] || stage) + ' stage');
    window.scrollTo({ top: 0, behavior: Animations.reducedMotionPreferred() ? 'auto' : 'smooth' });
  }

  function advance(stageName) {
    Api.progress.markStageComplete(content.chapterRef, stageName)
      .catch(function () {
        Notifications.error('Could not save your progress for this stage — continuing anyway.');
      });
    if (stageIndex < stages.length - 1) goToStage(stageIndex + 1);
  }

  // ---- Question plumbing ---------------------------------------------------

  function difficultyBadgeClass(difficulty) {
    return { Easy: 'success', Medium: 'info', Hard: 'warning', Expert: 'warning', Master: 'error' }[difficulty] || 'neutral';
  }

  function submitAttempt(question, isCorrect, meta) {
    practiceAttempts.push({ questionId: question.id, correct: isCorrect });
    if (!isCorrect && wrongQuestionIds.indexOf(question.id) === -1) wrongQuestionIds.push(question.id);

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

  function renderFeedback(card, isCorrect, explanation, onContinue) {
    Animations.showAnswerFeedback(card, isCorrect);
    card.appendChild(el('div', { class: 'feedback' }, [
      el('p', { class: 'feedback__verdict', text: isCorrect ? 'Correct' : 'Not quite' }),
      explanation ? el('p', { class: 'text-body-sm', text: explanation }) : null
    ]));
    var next = el('button', { class: 'btn btn--primary btn--full', type: 'button', style: 'margin-top:var(--space-4);', text: 'Next' });
    card.appendChild(next);
    next.addEventListener('click', onContinue, { once: true });
    next.focus();
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

  function renderQuestion(question, container, onComplete) {
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
      return;
    }

    var problem = mechanic.validate(question.payload);
    if (problem) {
      renderBrokenQuestion(card, body,
        'Question "' + question.id + '" (' + question.mechanicId + ') ' + problem + '.',
        onComplete);
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
        submitAttempt(question, isCorrect, merged);
        renderFeedback(card, isCorrect, question.explanation, onComplete);
      }
    });
  }

  /** Runs a list of questions one at a time, then calls onDone. */
  function runQuestionSeries(questions, container, onDone, labelFn) {
    var index = 0;
    function step() {
      container.innerHTML = '';
      if (index >= questions.length) { onDone(); return; }
      if (labelFn) {
        container.appendChild(el('p', { class: 'text-caption', text: labelFn(index, questions.length) }));
      }
      renderQuestion(questions[index], container, function () { index++; step(); });
    }
    step();
  }

  // ---- Stages --------------------------------------------------------------

  function renderTheory(container) {
    var wrap = el('div', { class: 'reading-column stack-lg anim-fade-in-up' });

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

    var go = el('button', { class: 'btn btn--primary btn--lg', type: 'button', text: 'Continue' });
    go.addEventListener('click', function () { advance('theory'); });
    wrap.appendChild(go);
    container.appendChild(wrap);
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

  function renderPractice(container) {
    runQuestionSeries(practiceQuestions(), container, function () {
      container.innerHTML = '';
      var accuracy = practiceAccuracy();
      var unlocked = accuracy >= PRACTICE_MASTERY_THRESHOLD;
      var hasBoss = bossQuestions().length > 0;

      var card = el('div', { class: 'card summary-card' }, [
        el('h2', { text: 'Practice complete' }),
        el('p', { class: 'text-body-lg', text: 'Accuracy: ' + Utils.formatPercent(accuracy) }),
        el('p', {
          class: 'text-body-sm',
          text: !hasBoss
            ? 'Keep going to finish the chapter.'
            : (unlocked
              ? 'Boss Battle unlocked.'
              : 'Score ' + Utils.formatPercent(PRACTICE_MASTERY_THRESHOLD) + ' or higher to unlock the Boss Battle. You can retry Practice from the stepper above.')
        })
      ]);
      var go = el('button', { class: 'btn btn--primary btn--lg', type: 'button', style: 'margin-top:var(--space-4);', text: 'Continue' });
      go.addEventListener('click', function () { advance('practice'); });
      card.appendChild(go);
      container.appendChild(card);
    }, function (index, total) {
      return 'Question ' + (index + 1) + ' of ' + total;
    });
  }

  function renderMiniGames(container) {
    var games = miniGames();
    runQuestionSeries(games, container, function () { advance('games'); }, function (index, total) {
      return total > 1 ? 'Mini game ' + (index + 1) + ' of ' + total : null;
    });
  }

  function renderBossBattle(container) {
    if (practiceAccuracy() < PRACTICE_MASTERY_THRESHOLD && practiceAttempts.length) {
      container.appendChild(el('div', { class: 'empty-state' }, [
        el('p', { class: 'empty-state__title', text: 'Boss Battle locked' }),
        el('p', { text: 'Score ' + Utils.formatPercent(PRACTICE_MASTERY_THRESHOLD) + ' or higher in Practice to unlock this challenge.' })
      ]));
      var back = el('button', { class: 'btn btn--primary empty-state__action', type: 'button', text: 'Back to Practice' });
      back.addEventListener('click', function () { goToStage(stages.indexOf('practice')); });
      container.querySelector('.empty-state').appendChild(back);
      return;
    }

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

  function renderCheckpoint(container) {
    var missed = practiceQuestions().filter(function (q) { return wrongQuestionIds.indexOf(q.id) !== -1; });

    if (!missed.length) {
      container.appendChild(el('div', { class: 'empty-state' }, [
        el('p', { class: 'empty-state__title', text: 'Nothing to check' }),
        el('p', { text: 'You answered every practice question correctly the first time.' })
      ]));
      setTimeout(function () { advance('chapter-checkpoint'); }, 1400);
      return;
    }

    runQuestionSeries(missed, container, function () { advance('chapter-checkpoint'); }, function (index, total) {
      return 'Checkpoint — revisiting ' + (index + 1) + ' of ' + total + ' missed ' + Utils.pluralize(total, 'question');
    });
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
    practiceQuestions().concat(miniGames(), bossQuestions()).forEach(function (q) {
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
      response = await fetch('classes/' + chapterPath + '/content.json', { cache: 'no-cache' });
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
      Notifications.error('Could not start your session — progress may not be saved.');
    }

    goToStage(0);
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
