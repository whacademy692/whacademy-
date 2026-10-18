/**
 * anim-ui.js — W.H. Academy · Animation Lab (player UI)
 * ----------------------------------------------------------------------------
 * WHA_Anim.mountPlayer(host, spec, opts) builds the whole student-facing player
 * around an engine instance:
 *
 *   ┌ stage (SVG + labels) ──────────────┐   legend chips (tap = spotlight a role)
 *   │  play bar:  ◀  ▶/⏸  ▶   ↻  · dots  │   live read-outs
 *   └────────────────────────────────────┘
 *   narration card (step title + text)        tabs:  Values · Colours · Formula
 *                                                    Try it · Notes
 *
 * Everything is created with createElement/textContent — spec text is never
 * parsed as HTML — and the player contains NO links: the only way out of the
 * page is the Back button the host page provides. It is a sealed box.
 *
 * opts: { store, debug, onComplete(info), onStep(info) }
 * returns { engine, destroy() }
 * ----------------------------------------------------------------------------
 */
(function (root) {
  'use strict';

  var A = root.WHA_Anim, X = root.WHA_AnimExpr;
  if (!A || !X) throw new Error('anim-ui.js needs anim-expr.js and anim-engine.js first');
  var NS = 'http://www.w3.org/2000/svg';

  // ----------------------------------------------------------------- helpers
  function h(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function attr(e, k, v) { e.setAttribute(k, v); return e; }

  var ICONS = {
    play: [['path', { d: 'M8 5.5v13l11-6.5z', fill: 'currentColor', stroke: 'none' }]],
    pause: [['path', { d: 'M7 5h4v14H7zM13 5h4v14h-4z', fill: 'currentColor', stroke: 'none' }]],
    next: [['path', { d: 'M6 5.5l9 6.5-9 6.5z', fill: 'currentColor', stroke: 'none' }], ['path', { d: 'M18 5v14' }]],
    prev: [['path', { d: 'M18 5.5l-9 6.5 9 6.5z', fill: 'currentColor', stroke: 'none' }], ['path', { d: 'M6 5v14' }]],
    replay: [['path', { d: 'M4 5v5h5' }], ['path', { d: 'M5.2 14.5a7.5 7.5 0 1 0 1.3-7.2L4 10' }]],
    sliders: [['path', { d: 'M4 7h9M19 7h1M4 17h1M11 17h9' }], ['circle', { cx: 16, cy: 7, r: 2.2 }], ['circle', { cx: 8, cy: 17, r: 2.2 }]],
    palette: [['path', { d: 'M12 3a9 9 0 1 0 0 18c1.4 0 2-1 1.5-2-.6-1.2.1-2.5 1.6-2.5H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z' }], ['circle', { cx: 7.5, cy: 11, r: 1, fill: 'currentColor' }], ['circle', { cx: 10.5, cy: 7.5, r: 1, fill: 'currentColor' }], ['circle', { cx: 15, cy: 7.5, r: 1, fill: 'currentColor' }]],
    formula: [['path', { d: 'M18 6H7l6 6-6 6h11' }]],
    target: [['circle', { cx: 12, cy: 12, r: 8 }], ['circle', { cx: 12, cy: 12, r: 4 }], ['circle', { cx: 12, cy: 12, r: 0.8, fill: 'currentColor' }]],
    book: [['path', { d: 'M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z' }], ['path', { d: 'M5 17a3 3 0 0 1 3-3h10' }]],
    dice: [['rect', { x: 4, y: 4, width: 16, height: 16, rx: 3 }], ['circle', { cx: 9, cy: 9, r: 1, fill: 'currentColor' }], ['circle', { cx: 15, cy: 15, r: 1, fill: 'currentColor' }], ['circle', { cx: 15, cy: 9, r: 1, fill: 'currentColor' }], ['circle', { cx: 9, cy: 15, r: 1, fill: 'currentColor' }]],
    reset: [['path', { d: 'M4 12a8 8 0 1 0 2.6-5.9' }], ['path', { d: 'M4 4v4.5h4.5' }]],
    check: [['path', { d: 'M5 12.5l4.5 4.5L19 7.5' }]],
    lock: [['rect', { x: 5, y: 11, width: 14, height: 9, rx: 2 }], ['path', { d: 'M8 11V8a4 4 0 0 1 8 0v3' }]],
    bulb: [['path', { d: 'M9 18h6M10 21h4' }], ['path', { d: 'M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z' }]],
    minus: [['path', { d: 'M6 12h12' }]],
    plus: [['path', { d: 'M12 6v12M6 12h12' }]],
    spark: [['path', { d: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z' }]],
    eye: [['path', { d: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z' }], ['circle', { cx: 12, cy: 12, r: 3 }]]
  };
  function icon(name) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'anim-ico'); s.setAttribute('aria-hidden', 'true');
    (ICONS[name] || []).forEach(function (d) {
      var e = document.createElementNS(NS, d[0]);
      for (var k in d[1]) e.setAttribute(k, d[1][k]);
      s.appendChild(e);
    });
    return s;
  }
  function iconBtn(cls, parent, name, label, onClick) {
    var b = h('button', cls, parent); b.type = 'button';
    b.appendChild(icon(name)); attr(b, 'aria-label', label); b.title = label;
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  function textBtn(cls, parent, label, onClick, iconName) {
    var b = h('button', cls, parent); b.type = 'button';
    if (iconName) b.appendChild(icon(iconName));
    b.appendChild(document.createTextNode(label));
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  function uid() { uid.n = (uid.n || 0) + 1; return 'anim-u' + uid.n; }

  // ============================================================== mountPlayer
  function mountPlayer(host, spec, opts) {
    opts = opts || {};
    host.textContent = '';
    var R = h('div', 'anim-player', host);
    if (spec && spec.id) R.setAttribute('data-anim-id', spec.id);

    var main = h('div', 'anim-main', R);
    var left = h('div', 'anim-left', main), right = h('div', 'anim-right', main);

    // ---- stage + play bar --------------------------------------------------
    var stageBox = h('div', 'anim-stagebox', left);
    var stage = h('div', 'anim-stage', stageBox);
    var toastEl = h('div', 'anim-toast', stageBox); attr(toastEl, 'role', 'status'); attr(toastEl, 'aria-live', 'polite');
    var bar = h('div', 'anim-bar', stageBox);

    function stageMax() {
      var vh = root.innerHeight || 700, vw = root.innerWidth || 400;
      if (vw < 760) return Math.max(210, Math.min(vh * 0.4, 380));
      return Math.max(260, Math.min(vh * 0.72, 680));
    }

    var eng = new A.Engine(spec, { stage: stage, root: R, store: opts.store || null, maxHeight: stageMax });
    var player = { engine: eng, destroy: destroy };

    if (!eng.svgEl) {
      host.textContent = '';
      var bad = h('div', 'anim-fatal', host);
      h('p', 'anim-fatal__t', bad, 'This animation could not be loaded.');
      h('p', 'anim-fatal__s', bad, 'Please go back and try again.');
      if (root.console) console.error('[anim] build failed', eng.issues);
      return player;
    }

    // ---- legend + readouts -------------------------------------------------
    var legendWrap = h('div', 'anim-legendwrap', left);
    var legend = h('div', 'anim-legend', legendWrap); attr(legend, 'role', 'group'); attr(legend, 'aria-label', 'Colour key — tap one to spotlight it');
    var legendNote = h('p', 'anim-legendnote', legendWrap); attr(legendNote, 'aria-live', 'polite');
    var readoutEl = h('div', 'anim-readouts', left);

    // ---- narration ---------------------------------------------------------
    var narr = h('section', 'anim-narr', right); attr(narr, 'aria-live', 'polite');
    var narrHead = h('div', 'anim-narr__head', narr);
    var badge = h('span', 'anim-narr__badge', narrHead);
    var narrTitle = h('h2', 'anim-narr__title', narrHead);
    var narrText = h('div', 'anim-narr__text', narr);
    var narrAct = h('div', 'anim-narr__act', narr);

    // ---- tabs --------------------------------------------------------------
    var tablist = h('div', 'anim-tabs', right); attr(tablist, 'role', 'tablist');
    var panels = h('div', 'anim-panels', right);
    var tabDefs = [], tabBtns = {}, panelEls = {}, activeTab = null;

    function addTab(id, label, iconName, build) {
      var b = h('button', 'anim-tab', tablist); b.type = 'button';
      attr(b, 'role', 'tab'); attr(b, 'id', 'anim-tab-' + id); attr(b, 'aria-controls', 'anim-panel-' + id);
      b.appendChild(icon(iconName));
      var lab = h('span', 'anim-tab__l', b, label);
      var count = h('span', 'anim-tab__n', b);
      var p = h('div', 'anim-panel', panels); attr(p, 'role', 'tabpanel'); attr(p, 'id', 'anim-panel-' + id); attr(p, 'aria-labelledby', 'anim-tab-' + id);
      p.hidden = true;
      b.addEventListener('click', function () { selectTab(id); });
      b.addEventListener('keydown', function (e) {
        var i = tabDefs.indexOf(id), j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -1;
        if (j < 0 || j >= tabDefs.length) return;
        e.preventDefault(); selectTab(tabDefs[j]); tabBtns[tabDefs[j]].focus();
      });
      tabDefs.push(id); tabBtns[id] = b; panelEls[id] = p; b._count = count; b._label = lab;
      build(p);
    }
    function selectTab(id) {
      if (!panelEls[id]) return;
      activeTab = id;
      tabDefs.forEach(function (t) {
        var on = t === id;
        panelEls[t].hidden = !on;
        tabBtns[t].classList.toggle('is-on', on);
        attr(tabBtns[t], 'aria-selected', on ? 'true' : 'false');
        tabBtns[t].tabIndex = on ? 0 : -1;
      });
    }

    var richJobs = [];                 // [{el, tpl}] re-rendered when numbers/colours change
    function rich(el, tpl) { richJobs.push({ el: el, tpl: tpl }); eng.renderRich(el, tpl, eng.env || eng.buildEnv(eng.values)); return el; }
    function refreshRich() { var env = eng.env; if (!env) return; richJobs.forEach(function (j) { eng.renderRich(j.el, j.tpl, env); }); }

    // ============================================================ toast
    var toastT = 0;
    function say(msg, kind, sticky) {
      toastEl.textContent = msg;
      toastEl.className = 'anim-toast is-on' + (kind ? ' anim-toast--' + kind : '');
      clearTimeout(toastT);
      if (!sticky) toastT = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2800);
    }
    function hush() { clearTimeout(toastT); toastEl.classList.remove('is-on'); }

    // ============================================================ play bar
    var hasSteps = eng.steps.length > 0;
    var bPrev, bPlay, bNext, bExplore, speedSel, dotsEl, dots = [];
    if (hasSteps) {
      var grp = h('div', 'anim-bar__grp', bar);
      bPrev = iconBtn('anim-ib', grp, 'prev', 'Previous step', function () { eng.pause(); eng.prev(); });
      bPlay = iconBtn('anim-ib anim-ib--main', grp, 'play', 'Play lesson', function () { eng.toggle(); });
      bNext = iconBtn('anim-ib', grp, 'next', 'Next step', function () { eng.pause(); eng.next(); });
      var right2 = h('div', 'anim-bar__grp anim-bar__grp--end', bar);
      bExplore = textBtn('anim-pill', right2, 'Free play', function () { eng.pause(); eng.explore(); }, 'spark');
      var sw = h('label', 'anim-speed', right2);
      h('span', 'sr-only', sw, 'Speed');
      speedSel = h('select', 'anim-select', sw);
      [[0.5, '0.5×'], [1, '1×'], [1.5, '1.5×'], [2, '2×']].forEach(function (o) {
        var op = h('option', null, speedSel, o[1]); op.value = String(o[0]);
      });
      speedSel.value = String(eng.ui.speed || 1);
      if (speedSel.value !== String(eng.ui.speed || 1)) speedSel.value = '1';
      speedSel.addEventListener('change', function () { eng.setUi('speed', parseFloat(speedSel.value) || 1); });
      dotsEl = h('div', 'anim-dots', narr); attr(dotsEl, 'role', 'group'); attr(dotsEl, 'aria-label', 'Lesson steps');
      eng.steps.forEach(function (st, i) {
        var d = h('button', 'anim-sdot', dotsEl); d.type = 'button';
        attr(d, 'aria-label', 'Step ' + (i + 1) + (st.title ? ': ' + eng.text(st.title).replace(/\\\(|\\\)|\*\*/g, '') : ''));
        d.addEventListener('click', function () { eng.pause(); eng.goto(i, true); });
        dots.push(d);
      });
    } else {
      bar.hidden = true;
    }

    // ============================================================ legend
    var legendBtns = {};
    eng.roleOrder.forEach(function (k) {
      var r = eng.roles[k]; if (!r.legend) return;
      var b = h('button', 'anim-lchip', legend); b.type = 'button';
      attr(b, 'aria-pressed', 'false'); b.setAttribute('data-role', k);
      var sw2 = h('span', 'anim-lchip__sw', b); sw2.style.background = 'var(--anim-c-' + k + ')';
      h('span', 'anim-lchip__t', b, r.label);
      b.addEventListener('click', function () { eng.setFocus(eng.focusRole === k ? null : k); });
      legendBtns[k] = b;
    });
    if (!Object.keys(legendBtns).length) legendWrap.hidden = true;
    function syncLegend() {
      var f = eng.focusRole;
      Object.keys(legendBtns).forEach(function (k) {
        var on = f === k; legendBtns[k].classList.toggle('is-on', on); attr(legendBtns[k], 'aria-pressed', on ? 'true' : 'false');
      });
      var r = f && eng.roles[f];
      legendNote.textContent = r && r.text ? eng.text(r.text).replace(/\*\*/g, '') : (Object.keys(legendBtns).length ? 'Tap a colour to spotlight it on the drawing.' : '');
      legendNote.classList.toggle('is-hint', !r);
    }

    // ============================================================ readouts
    var readouts = [];
    (spec.readouts || []).forEach(function (rd) {
      var chip = h('div', 'anim-ro', readoutEl);
      if (rd.role) chip.style.setProperty('--ro', 'var(--anim-c-' + rd.role + ')');
      h('span', 'anim-ro__k', chip, rd.label || '');
      var v = h('span', 'anim-ro__v', chip);
      var when = rd.when ? X.compile(rd.when) : null;
      readouts.push({ chip: chip, v: v, tpl: String(rd.value !== undefined ? rd.value : ''), when: when && !when.error ? when.fn : null });
    });
    if (!readouts.length) readoutEl.hidden = true;
    function syncReadouts() {
      var env = eng.env; if (!env) return;
      readouts.forEach(function (r) {
        var on = r.when ? r.when(env) > 0.5 : true;
        r.chip.hidden = !on;
        if (on) eng.renderRich(r.v, r.tpl, env);
      });
    }

    // ============================================================ narration
    var ctaBtn = null, lockNote = null;
    function renderNarr() {
      var env = eng.env || eng.buildEnv(eng.values);
      narr.classList.toggle('is-explore', eng.mode !== 'guided');
      narrAct.textContent = ''; ctaBtn = null; lockNote = null;
      if (eng.mode === 'guided' && eng.steps[eng.stepIndex]) {
        var st = eng.steps[eng.stepIndex];
        badge.textContent = (eng.stepIndex + 1) + ' / ' + eng.steps.length;
        badge.hidden = false;
        narrTitle.hidden = !st.title;
        eng.renderRich(narrTitle, st.title, env);
        eng.renderRich(narrText, st.text, env);
        if (st.challenge && eng.challenges[st.challenge]) {
          var ch = eng.challenges[st.challenge];
          if (eng.challengeDone[ch.id]) {
            h('span', 'anim-done', narrAct).appendChild(icon('check')); narrAct.lastChild.appendChild(document.createTextNode(' Challenge solved'));
          } else {
            ctaBtn = textBtn('btn btn--primary btn--sm', narrAct, ch.title || 'Try the challenge', function () { goChallenge(ch.id); }, 'target');
            if (eng.blocked) {
              lockNote = h('span', 'anim-lock', narrAct); lockNote.appendChild(icon('lock'));
              lockNote.appendChild(document.createTextNode(' Solve this to unlock the next step'));
            }
          }
        }
        if (st.until) {
          // "your turn" step: Next stays locked until the student makes the condition true
          if (eng.untilDone[st.id]) {
            var dn = h('span', 'anim-done', narrAct); dn.appendChild(icon('check'));
            dn.appendChild(document.createTextNode(' Nice! Press Next to continue'));
          } else {
            var tk = h('span', 'anim-task', narrAct); tk.appendChild(icon('target'));
            var tkt = h('span', 'anim-task__t', tk); eng.renderRich(tkt, st.untilHint, env);
          }
        }
      } else {
        var ex = spec.explore || {};
        badge.textContent = hasSteps ? '✨' : '';
        badge.hidden = !hasSteps;
        eng.renderRich(narrTitle, ex.title || (hasSteps ? 'Free play' : (spec.title || '')), env);
        narrTitle.hidden = false;
        eng.renderRich(narrText, ex.text || (hasSteps
          ? 'Now it is your turn. Change the values, drag the dots, recolour the lines — then try the challenges.'
          : (spec.summary || 'Change the values and watch what happens.')), env);
        if (hasSteps) textBtn('btn btn--secondary btn--sm', narrAct, 'Watch the lesson again', function () { eng.replay(); }, 'replay');
      }
      syncBar();
    }
    function syncBar() {
      if (!hasSteps) return;
      var guided = eng.mode === 'guided', last = eng.steps.length - 1;
      bPrev.disabled = guided && eng.stepIndex <= 0 && eng.stepDone;
      bNext.disabled = !guided;
      var playing = eng.playing;
      bPlay.replaceChild(icon(playing ? 'pause' : 'play'), bPlay.firstChild);
      attr(bPlay, 'aria-label', playing ? 'Pause' : (guided ? 'Play lesson' : 'Watch the lesson'));
      bPlay.title = bPlay.getAttribute('aria-label');
      bPlay.classList.toggle('is-on', playing);
      bExplore.classList.toggle('is-on', !guided);
      var fpLocked = guided && !eng.unlocked();
      bExplore.disabled = fpLocked; bExplore.title = fpLocked ? 'Finish the lesson to unlock Free play' : '';
      dots.forEach(function (d, i) {
        d.classList.toggle('is-cur', guided && i === eng.stepIndex);
        d.classList.toggle('is-past', !guided || i < eng.stepIndex);
      });
      void last;
    }

    // ============================================================ VALUES tab
    var rows = {};
    function buildValues(p) {
      var vis = eng.paramList.filter(function (d) { return !d.hidden; });
      var presets = spec.presets || [];
      if (presets.length) {
        var pr = h('div', 'anim-presets', p);
        h('span', 'anim-sub', pr, 'Quick examples');
        var chips = h('div', 'anim-chips', pr);
        presets.forEach(function (ps, i) {
          var c = h('button', 'anim-chip', chips, ps.name || ('Example ' + (i + 1))); c.type = 'button';
          c.addEventListener('click', function () { eng.pause(); if (eng.mode === 'guided' && eng.stepIndex < eng.steps.length - 1) eng.explore(); eng.applyPreset(i); });
        });
      }
      if (!vis.length) h('p', 'anim-empty', p, 'This animation has nothing to change — just watch and learn.');
      var lastGroup = null;
      vis.forEach(function (d) {
        if (d.group && d.group !== lastGroup) { h('h3', 'anim-group', p, d.group); lastGroup = d.group; }
        buildParamRow(p, d);
      });
      if (vis.length) {
        var act = h('div', 'anim-actions', p);
        textBtn('btn btn--secondary btn--sm', act, 'Surprise me', function () { eng.pause(); if (eng.mode === 'guided' && eng.stepIndex < eng.steps.length - 1) eng.explore(); eng.randomize(); }, 'dice');
        textBtn('btn btn--tertiary btn--sm', act, 'Reset values', function () { eng.resetValues(); }, 'reset');
      }
    }

    function buildParamRow(p, d) {
      var row = h('div', 'anim-prm', p), id = uid();
      row.setAttribute('data-param', d.id);
      var top = h('div', 'anim-prm__top', row);
      var lab = h('label', 'anim-prm__label', top);
      attr(lab, 'for', id);
      if (d.role && eng.roles[d.role]) { var dot = h('span', 'anim-dotrole', lab); dot.style.background = 'var(--anim-c-' + d.role + ')'; }
      h('span', null, lab, d.label);
      var rec = { d: d, row: row };
      rows[d.id] = rec;

      if (d.type === 'toggle') {
        var sw = h('button', 'anim-switch', top); sw.type = 'button'; sw.id = id;
        attr(sw, 'role', 'switch'); h('span', 'anim-switch__k', sw);
        sw.addEventListener('click', function () { eng.pause(); eng.setParam(d.id, eng.values[d.id] ? 0 : 1, 'user'); });
        rec.sw = sw;
      } else if (d.type === 'choice') {
        var seg = h('div', 'anim-seg', row); attr(seg, 'role', 'radiogroup'); attr(seg, 'aria-labelledby', id);
        lab.removeAttribute('for'); lab.id = id; rec.opts = [];
        (d.options || []).forEach(function (o) {
          var b = h('button', 'anim-seg__b', seg, o.label !== undefined ? o.label : String(o.value)); b.type = 'button';
          attr(b, 'role', 'radio');
          b.addEventListener('click', function () { eng.pause(); eng.setParam(d.id, o.value, 'user'); });
          rec.opts.push({ v: Number(o.value), b: b });
        });
      } else {
        var vbox = h('span', 'anim-prm__val', top);
        var num = h('input', 'anim-num', vbox); num.type = 'number'; num.inputMode = 'decimal';
        num.min = d.min; num.max = d.max; num.step = d.step; attr(num, 'aria-label', d.label + ' value');
        if (d.unit) h('span', 'anim-prm__unit', vbox, d.unit);
        var line = h('div', 'anim-prm__line', row);
        if (d.type === 'clock') rec.cb = iconBtn('anim-step anim-step--play', line, 'play', 'Play ' + d.label, function () { eng.toggleClock(d.id); });
        var minus = iconBtn('anim-step', line, 'minus', 'Decrease ' + d.label, function () { eng.pause(); eng.setParam(d.id, eng.values[d.id] - d.step, 'user'); });
        var rg = h('input', 'anim-range', line); rg.type = 'range'; rg.id = id;
        rg.min = d.min; rg.max = d.max; rg.step = d.step;
        var plus = iconBtn('anim-step', line, 'plus', 'Increase ' + d.label, function () { eng.pause(); eng.setParam(d.id, eng.values[d.id] + d.step, 'user'); });
        if (d.role && eng.roles[d.role]) rg.style.setProperty('--rg', 'var(--anim-c-' + d.role + ')');
        rg.addEventListener('input', function () {
          eng.pause();
          if (!eng.setParam(d.id, rg.value, 'user')) rg.value = eng.values[d.id];
        });
        num.addEventListener('change', function () {
          eng.pause();
          var ok = num.value !== '' && eng.setParam(d.id, num.value, 'user');
          if (!ok) num.value = fmt(eng.values[d.id], d);
        });
        num.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); num.blur(); } });
        rec.rg = rg; rec.num = num; rec.minus = minus; rec.plus = plus;
      }
      if (d.hint) h('p', 'anim-prm__hint', row, d.hint);
    }
    function fmt(v, d) {
      var dec = (String(d.step).split('.')[1] || '').length;
      return v.toFixed(Math.min(4, dec));
    }
    function syncValues() {
      Object.keys(rows).forEach(function (id) {
        var r = rows[id], d = r.d, v = eng.values[id], en = eng.paramEnabled(id);
        r.row.classList.toggle('is-off', !en);
        if (r.cb) {
          var run = eng.clockRunning(id);
          if (r.cb._run !== run) { r.cb._run = run; r.cb.replaceChild(icon(run ? 'pause' : 'play'), r.cb.firstChild); attr(r.cb, 'aria-label', (run ? 'Pause ' : 'Play ') + d.label); r.cb.title = r.cb.getAttribute('aria-label'); r.cb.classList.toggle('is-on', run); }
        }
        if (r.sw) { attr(r.sw, 'aria-checked', v ? 'true' : 'false'); r.sw.classList.toggle('is-on', !!v); r.sw.disabled = !en; }
        if (r.opts) r.opts.forEach(function (o) { var on = o.v === Number(v); o.b.classList.toggle('is-on', on); attr(o.b, 'aria-checked', on ? 'true' : 'false'); o.b.disabled = !en; });
        if (r.rg) {
          if (document.activeElement !== r.rg) r.rg.value = v;
          var pct = d.max > d.min ? (v - d.min) / (d.max - d.min) * 100 : 0;
          r.rg.style.setProperty('--fill', Math.max(0, Math.min(100, pct)).toFixed(1) + '%');
          if (document.activeElement !== r.num) r.num.value = fmt(v, d);
          r.rg.disabled = r.num.disabled = r.minus.disabled = r.plus.disabled = !en;
          r.minus.disabled = r.minus.disabled || v <= d.min; r.plus.disabled = r.plus.disabled || v >= d.max;
          attr(r.rg, 'aria-valuetext', fmt(v, d) + (d.unit ? ' ' + d.unit : ''));
        }
      });
    }

    // ============================================================ COLOURS tab
    var roleRows = {}, ui = {};
    function buildColours(p) {
      if (eng.roleOrder.length) {
        h('h3', 'anim-group', p, 'Colour sets');
        var pal = h('div', 'anim-chips', p);
        [['default', 'Original'], ['cb', 'Colour-blind friendly'], ['contrast', 'High contrast'], ['soft', 'Soft']].forEach(function (o) {
          var c = h('button', 'anim-chip', pal, o[1]); c.type = 'button';
          c.addEventListener('click', function () { eng.applyPalette(o[0]); say('Colours changed'); });
        });
        h('h3', 'anim-group', p, 'Colour each part your way');
        eng.roleOrder.forEach(function (k) {
          var r = eng.roles[k], row = h('div', 'anim-cr', p), id = uid();
          var head = h('div', 'anim-cr__head', row);
          var well = h('input', 'anim-well', head); well.type = 'color'; well.id = id; well.value = eng.roleHex(k);
          attr(well, 'aria-label', 'Colour for ' + r.label);
          var lab = h('label', 'anim-cr__l', head); attr(lab, 'for', id); lab.textContent = r.label;
          if (r.text) h('span', 'anim-cr__t', head, eng.text(r.text).replace(/\*\*/g, ''));
          well.addEventListener('input', function () { eng.setRoleColor(k, well.value); });
          var sws = h('div', 'anim-sws', row);
          A.SWATCHES.forEach(function (hex) {
            var s = h('button', 'anim-sw', sws); s.type = 'button'; s.style.background = hex; attr(s, 'aria-label', r.label + ' ' + hex);
            s.addEventListener('click', function () { eng.setRoleColor(k, hex); });
          });
          roleRows[k] = well;
        });
      }
      h('h3', 'anim-group', p, 'Show on the drawing');
      var spj = JSON.stringify(spec);
      function toggleRow(key, label) {
        var r = h('div', 'anim-tg', p), b = h('button', 'anim-switch', r); b.type = 'button'; attr(b, 'role', 'switch');
        h('span', 'anim-switch__k', b); var l = h('span', 'anim-tg__l', r, label);
        var go = function () { eng.setUi(key, !eng.ui[key]); };
        b.addEventListener('click', go); l.addEventListener('click', go);
        ui[key] = b;
      }
      toggleRow('labels', 'Labels & numbers');
      if (spj.indexOf('"uiToggle":"grid"') >= 0) toggleRow('grid', 'Grid');
      if (spj.indexOf('"uiToggle":"angles"') >= 0) toggleRow('angles', 'Angle marks');
      function rangeRow(key, label, min, max, step) {
        var r = h('div', 'anim-prm', p), id = uid();
        var t = h('div', 'anim-prm__top', r); var lb = h('label', 'anim-prm__label', t, label); attr(lb, 'for', id);
        var line = h('div', 'anim-prm__line', r);
        var rg = h('input', 'anim-range', line); rg.type = 'range'; rg.id = id; rg.min = min; rg.max = max; rg.step = step;
        rg.addEventListener('input', function () { eng.setUi(key, parseFloat(rg.value)); });
        ui[key] = rg;
      }
      rangeRow('thick', 'Line thickness', 0.6, 2, 0.1);
      rangeRow('labelSize', 'Text size', 0.8, 1.6, 0.1);
      var act = h('div', 'anim-actions', p);
      textBtn('btn btn--tertiary btn--sm', act, 'Reset colours & display', function () { eng.resetColors(); Object.keys(eng.uiDefaults).forEach(function (k) { if (k !== 'speed') eng.setUi(k, eng.uiDefaults[k]); }); }, 'reset');
    }
    function syncColours() {
      Object.keys(roleRows).forEach(function (k) { if (document.activeElement !== roleRows[k]) roleRows[k].value = eng.roleHex(k); });
    }
    function syncUi() {
      ['labels', 'grid', 'angles'].forEach(function (k) {
        if (ui[k]) { attr(ui[k], 'aria-checked', eng.ui[k] === false ? 'false' : 'true'); ui[k].classList.toggle('is-on', eng.ui[k] !== false); }
      });
      ['thick', 'labelSize'].forEach(function (k) {
        if (!ui[k]) return;
        if (document.activeElement !== ui[k]) ui[k].value = eng.ui[k];
        var mn = parseFloat(ui[k].min), mx = parseFloat(ui[k].max);
        ui[k].style.setProperty('--fill', ((eng.ui[k] - mn) / (mx - mn) * 100).toFixed(1) + '%');
      });
      if (speedSel) speedSel.value = String(eng.ui.speed || 1);
    }

    // ============================================================ FORMULA tab
    function buildFormulas(p) {
      (spec.formulas || []).forEach(function (f) {
        var card = h('article', 'anim-fcard', p);
        if (f.title) h('h3', 'anim-fcard__t', card, f.title);
        if (f.tex) rich(h('div', 'anim-fcard__g', card), '\\[' + f.tex + '\\]');
        if (f.filled) {
          h('p', 'anim-sub', card, 'With your numbers');
          rich(h('div', 'anim-fcard__f', card), '\\[' + f.filled + '\\]');
        }
        if (f.text) rich(h('p', 'anim-fcard__n', card), f.text);
      });
    }

    // ============================================================ TRY IT tab
    var cards = {};
    function buildChallenges(p) {
      h('p', 'anim-lead', p, spec.challengeIntro || 'Test yourself. Each challenge sets up the drawing for you — get it right to earn the tick.');
      eng.challengeList.forEach(function (ch) {
        var card = h('article', 'anim-ch', p); card.setAttribute('data-ch', ch.id);
        var head = h('div', 'anim-ch__head', card);
        var tick = h('span', 'anim-ch__tick', head); tick.appendChild(icon('check'));
        h('h3', 'anim-ch__t', head, ch.title);
        if (ch.required) h('span', 'anim-ch__req', head, 'needed to continue');
        var prompt = rich(h('div', 'anim-ch__p', card), ch.prompt);
        var body = h('div', 'anim-ch__body', card);
        var fb = h('div', 'anim-ch__fb', card); attr(fb, 'role', 'status');
        var rec = { ch: ch, card: card, body: body, fb: fb, tick: tick, started: false, prompt: prompt };
        cards[ch.id] = rec;
        drawChallengeBody(rec);
      });
    }
    function drawChallengeBody(rec) {
      var ch = rec.ch, body = rec.body;
      body.textContent = '';
      rec.card.classList.toggle('is-done', !!eng.challengeDone[ch.id]);
      if (eng.challengeDone[ch.id]) {
        textBtn('btn btn--tertiary btn--sm', body, 'Try again', function () { delete eng.challengeDone[ch.id]; ch.attempts = 0; rec.fb.textContent = ''; rec.started = false; drawChallengeBody(rec); syncTabCounts(); }, 'reset');
        return;
      }
      if (!rec.started) {
        textBtn('btn btn--primary btn--sm', body, 'Start', function () { startChallenge(ch.id); }, 'target');
        return;
      }
      if (ch.type === 'number') {
        var row = h('div', 'anim-ch__row', body);
        var inp = h('input', 'anim-ans', row); inp.type = 'number'; inp.step = 'any'; inp.inputMode = 'decimal'; inp.placeholder = 'Your answer';
        attr(inp, 'aria-label', 'Your answer');
        if (ch.unit) h('span', 'anim-prm__unit', row, ch.unit);
        var go = textBtn('btn btn--primary btn--sm', row, 'Check', function () { submit(); }, 'check');
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
        rec.inp = inp;
      } else if (ch.type === 'choice') {
        var list = h('div', 'anim-opts', body); attr(list, 'role', 'group');
        ch.options.forEach(function (o) {
          var id = o.id !== undefined ? o.id : o.value;
          var b = h('button', 'anim-opt', list); b.type = 'button';
          rich(h('span', null, b), o.label !== undefined ? String(o.label) : String(id));
          b.addEventListener('click', function () { eng.answerChallenge(ch.id, id); });
        });
      } else if (ch.type === 'pick') {
        h('p', 'anim-ch__pickhint', body, 'Tap the right part on the drawing above.');
        textBtn('btn btn--tertiary btn--sm', body, 'Stop', function () { eng.closePick(); rec.started = false; drawChallengeBody(rec); hush(); });
      }
      if (ch.type !== 'pick' && ch.hold) {
        textBtn('btn btn--tertiary btn--sm', body, 'Stop', function () { eng.closePick(); rec.started = false; drawChallengeBody(rec); });
      }
      function submit() {
        if (!rec.inp || rec.inp.value === '') { say('Type a number first', 'warn'); return; }
        eng.answerChallenge(ch.id, rec.inp.value);
      }
      void go;
    }
    function startChallenge(id) {
      var rec = cards[id]; if (!rec) return;
      Object.keys(cards).forEach(function (k) { if (k !== id && cards[k].started && eng.pickChallenge === k) { eng.closePick(); cards[k].started = false; drawChallengeBody(cards[k]); } });
      if (eng.mode === 'guided') eng.pause();
      rec.started = true; rec.fb.textContent = ''; rec.fb.className = 'anim-ch__fb';
      eng.openChallenge(id);
      drawChallengeBody(rec);
      if (rec.inp) setTimeout(function () { try { rec.inp.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 50);
      if (eng.pickChallenge === id) say('Tap the right part on the drawing 👆', 'info', true);
    }
    function goChallenge(id) {
      selectTab('try');
      startChallenge(id);
      var rec = cards[id];
      if (rec && rec.card.scrollIntoView) rec.card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    function onChallengeResult(res) {
      var rec = cards[res.id]; if (!rec) return;
      var fb = rec.fb, ch = rec.ch;
      fb.textContent = '';
      if (res.correct) {
        fb.className = 'anim-ch__fb is-ok';
        h('strong', null, fb, 'Correct! ');
        if (res.explain) rich(h('span', null, fb), res.explain);
        rec.started = false; drawChallengeBody(rec); syncTabCounts();
        say('Correct! 🎉', 'ok');
        if (typeof Animations !== 'undefined' && Animations.celebrate) { try { Animations.celebrate(rec.card); } catch (e) { /* ignore */ } }
        renderNarr();
      } else {
        fb.className = 'anim-ch__fb is-bad';
        h('strong', null, fb, 'Not quite. ');
        if (res.hint) rich(h('span', null, fb), res.hint);
        else h('span', null, fb, 'Have another look and try again.');
        if (res.attempts >= 3) {
          var sa = textBtn('btn btn--tertiary btn--sm', fb, 'Show the answer', function () {
            var a = eng.showAnswer(ch.id);
            sa.replaceWith(h('span', 'anim-ch__ans', null, 'Answer: ' + (ch.type === 'choice' || ch.type === 'pick' ? labelOf(ch, a) : a + (ch.unit ? ' ' + ch.unit : ''))));
          }, 'eye');
        }
        if (rec.inp) { rec.inp.select(); }
        say(ch.type === 'pick' ? 'Not that one — try another part' : 'Not quite', 'bad');
      }
    }
    function labelOf(ch, a) {
      if (ch.type === 'choice') { var o = ch.options.filter(function (x) { return String(x.id !== undefined ? x.id : x.value) === String(a); })[0]; return o ? String(o.label) : String(a); }
      return eng.roles[a] ? eng.roles[a].label : String(a);
    }
    function syncTabCounts() {
      if (tabBtns.try) {
        var done = eng.challengeList.filter(function (c) { return eng.challengeDone[c.id]; }).length;
        tabBtns.try._count.textContent = done + '/' + eng.challengeList.length;
        tabBtns.try._count.classList.toggle('is-all', done === eng.challengeList.length);
      }
    }

    // ============================================================ NOTES tab
    function buildNotes(p) {
      if (spec.intro) rich(h('p', 'anim-lead', p), spec.intro);
      var kp = spec.takeaways || [];
      if (kp.length) {
        var box = h('div', 'anim-key', p);
        h('h3', 'anim-key__t', box, 'Remember');
        var ul = h('ul', 'anim-key__l', box);
        kp.forEach(function (t) { rich(h('li', null, ul), t); });
      }
      (spec.notes || []).forEach(function (n) {
        var c = h('article', 'anim-note', p);
        if (n.title) h('h3', 'anim-note__t', c, n.title);
        rich(h('div', 'anim-note__b', c), n.text || '');
      });
    }

    // ============================================================ assemble tabs
    if (eng.paramList.some(function (d) { return !d.hidden; }) || (spec.presets || []).length) addTab('values', 'Values', 'sliders', buildValues);
    addTab('colours', 'Colours', 'palette', buildColours);
    if ((spec.formulas || []).length) addTab('formula', 'Formula', 'formula', buildFormulas);
    if (eng.challengeList.length) addTab('try', 'Try it', 'target', buildChallenges);
    if (spec.intro || (spec.takeaways || []).length || (spec.notes || []).length) addTab('notes', 'Notes', 'book', buildNotes);
    selectTab(spec.defaultTab && panelEls[spec.defaultTab] ? spec.defaultTab : tabDefs[0]);   // spec.defaultTab: 'formula' | 'try' | 'notes' | 'colours'
    syncTabCounts();

    // ============================================================ events
    eng.on('values', function () { syncValues(); syncReadouts(); refreshRich(); if (eng.mode === 'guided') renderNarrText(); });
    eng.on('param', function (e) { if (eng.playing && (e.src === 'user' || e.src === 'drag')) { eng.pause(); } });
    eng.on('drag-start', function () { eng.pause(); });
    eng.on('roles', function () { syncColours(); refreshRich(); renderNarrText(); syncLegend(); });
    eng.on('ui', syncUi);
    eng.on('focus', syncLegend);
    eng.on('step', function (e) { renderNarr(); if (opts.onStep) opts.onStep(e); });
    eng.on('mode', function () { renderNarr(); });
    eng.on('play', syncBar);
    eng.on('stepdone', function () { syncBar(); });
    eng.on('blocked', function () { renderNarr(); });          // arrived at a locked step: the narration card says what to do
    eng.on('blocked-try', function (st) {                     // the student pressed Next / jumped ahead too early
      renderNarr();
      var cur = eng.steps[eng.stepIndex], msg;
      if (st && cur && st.id !== cur.id) msg = 'Finish step ' + (st.idx + 1) + ' first 🔒';
      else if (st && st.until && !eng.untilDone[st.id]) msg = eng.text(st.untilHint).replace(/\\\(|\\\)|\*\*/g, '') + ' 🔒';
      else msg = 'Solve the challenge to continue 🔒';
      say(msg, 'warn');
    });
    eng.on('unblocked', function (e) { renderNarr(); if (e && e.kind === 'until') say('Nice! Press Next ▶ to continue', 'ok'); });
    eng.on('clock', function () { syncValues(); });
    eng.on('complete', function () { syncBar(); });
    eng.on('invalid', function (e) { say(e.message, 'warn'); syncValues(); });
    eng.on('challenge', function (ch) { var r = cards[ch.id]; if (r && ch.type === 'pick') say('Tap the right part on the drawing 👆', 'info', true); });
    eng.on('challenge-result', onChallengeResult);
    eng.on('complete', function (info) { if (opts.onComplete) { try { opts.onComplete(info); } catch (e) { /* ignore */ } } });
    eng.on('reset', function () { say('Back to the starting values'); });

    function renderNarrText() {
      if (eng.mode !== 'guided' || !eng.steps[eng.stepIndex]) return;
      var st = eng.steps[eng.stepIndex], env = eng.env;
      eng.renderRich(narrTitle, st.title, env); eng.renderRich(narrText, st.text, env);
    }

    // keyboard: ← → move through the lesson when focus is not in a form field
    function onKey(e) {
      var t = e.target, tag = t && t.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || (t && t.classList && t.classList.contains('anim-handle'))) return;
      if (!hasSteps || eng.mode !== 'guided') return;
      if (e.key === 'ArrowRight') { eng.pause(); eng.next(); }
      else if (e.key === 'ArrowLeft') { eng.pause(); eng.prev(); }
    }
    R.addEventListener('keydown', onKey);

    // initial sync (the engine fired its first events before we subscribed)
    syncValues(); syncReadouts(); syncLegend(); syncUi(); syncColours(); renderNarr(); refreshRich();

    // ---- build report ------------------------------------------------------
    var errs = eng.issues.filter(function (i) { return i.level === 'error'; });
    if (errs.length && root.console) { console.warn('[anim] ' + (spec.id || 'spec') + ' has ' + errs.length + ' problem(s):'); errs.forEach(function (i) { console.warn('  ' + i.where + ' — ' + i.msg); }); }
    if (opts.debug) {
      var dbg = h('details', 'anim-issues', R); dbg.open = true;
      h('summary', null, dbg, 'Spec check — ' + eng.issues.length + ' note(s)');
      var ul2 = h('ul', null, dbg);
      eng.issues.forEach(function (i) { h('li', i.level === 'error' ? 'is-err' : 'is-warn', ul2, i.level.toUpperCase() + ' · ' + i.where + ' · ' + i.msg); });
      if (!eng.issues.length) h('li', null, ul2, 'No problems found.');
    }

    function destroy() {
      R.removeEventListener('keydown', onKey);
      clearTimeout(toastT);
      eng.destroy();
      host.textContent = '';
    }
    return player;
  }

  A.mountPlayer = mountPlayer;
})(typeof window !== 'undefined' ? window : this);
