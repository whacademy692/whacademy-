/**
 * anim-controls.js — W.H. Academy · Animation Lab (player chrome)
 * ----------------------------------------------------------------------------
 * Adds the surrounding controls the sealed player does NOT own, so anim-ui.js
 * stays focused on the engine:
 *   · theme menu (all 11 app themes, like the dashboard) — top-right of the page
 *   · a settings sheet (line/grid thickness, text size, fill shapes, motion)
 *   · a draggable split handle between the drawing (left) and the solution (right)
 *   · an Auto / Manual playback toggle (+ a one-time "how manual works" note)
 *   · a first-run intro that explains every control (with Skip)
 *   · a "Questions" sheet to jump to any theory topic / exercise question
 *
 * Everything is optional and fail-safe: if an element or global is missing the
 * feature simply does not appear. Called by anim-player.js after mountPlayer().
 * ----------------------------------------------------------------------------
 */
(function (root) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';

  var THEMES = [
    ['light', 'Light', '#f0f4ff'], ['dark', 'Dark', '#0e0d1f'], ['ocean', 'Ocean', '#eef6ff'],
    ['forest', 'Forest', '#eefaf1'], ['sunset', 'Sunset', '#fff3ec'], ['grape', 'Grape', '#f6f0ff'],
    ['rose', 'Rose', '#fff0f3'], ['candy', 'Candy', '#fdf1f8'], ['aurora', 'Aurora', '#ecfdf7'],
    ['gold', 'Gold', '#fff8ec'], ['midnight', 'Midnight', '#0b1220']
  ];
  var ICONS = {
    palette: 'M12 3a9 9 0 1 0 0 18c1.4 0 2-1 1.5-2-.6-1.2.1-2.5 1.6-2.5H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z',
    gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1l-.4-2.5h-4l-.4 2.5a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L4.1 11a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7 7 0 0 0 1.7-1l2.4 1 2-3.4L18.9 13a7 7 0 0 0 .1-1z',
    list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    close: 'M6 6l12 12M18 6L6 18',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    help: 'M9 9a3 3 0 1 1 4 2.8c-.9.5-1.5 1.1-1.5 2.2M12 17h.01',
    play: 'M8 5.5v13l11-6.5z', hand: 'M7 11V6a1.5 1.5 0 0 1 3 0v4m0 0V4.5a1.5 1.5 0 0 1 3 0V10m0 0V6a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6h-1a5 5 0 0 1-3.6-1.5L4 14'
  };
  function svgIcon(d, cls) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', cls || 'anim-ico'); s.setAttribute('aria-hidden', 'true');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    var p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); s.appendChild(p);
    return s;
  }
  function el(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function btn(cls, parent, label, onClick) {
    var b = el('button', cls, parent); b.type = 'button';
    if (label) b.setAttribute('aria-label', label), (b.title = label);
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  function lsGet(k, d) { try { var v = root.localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { root.localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  function currentTheme() {
    try { if (root.Storage && Storage.getSettings) return Storage.getSettings().theme || 'light'; } catch (e) { /* */ }
    return document.documentElement.getAttribute('data-theme') || 'light';
  }
  function setTheme(name) {
    try {
      if (root.Storage && Storage.setSettings) Storage.setSettings({ theme: name });
    } catch (e) { /* ignore */ }
    document.documentElement.setAttribute('data-theme', name);
  }

  // ---------------------------------------------------------------- popovers
  var openPop = null, scrim = null;
  function ensureScrim() {
    if (scrim) return scrim;
    scrim = el('div', 'anim-scrim', document.body); scrim.hidden = true;
    scrim.addEventListener('click', closePop);
    return scrim;
  }
  function closePop() {
    if (openPop) { openPop.hidden = true; openPop = null; }
    if (scrim) scrim.hidden = true;
  }
  function placePop(pop, anchor) {
    var r = anchor.getBoundingClientRect(), vw = root.innerWidth, vh = root.innerHeight;
    pop.hidden = false;                       // measure
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    if (vw < 760) return;                      // CSS pins it to the bottom on phones
    var left = Math.min(r.right - pw, vw - pw - 10); left = Math.max(10, left);
    var top = r.bottom + 8; if (top + ph > vh - 10) top = Math.max(10, r.top - ph - 8);
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
  }
  function togglePop(pop, anchor) {
    ensureScrim();
    if (openPop === pop) { closePop(); return; }
    closePop();
    scrim.hidden = false;
    placePop(pop, anchor);
    openPop = pop;
  }

  // ---------------------------------------------------- shrink maths to fit
  // No formula may ever force a horizontal scroll. A wide \[...\] block is
  // scaled down (font-size is em-relative in KaTeX, so it reflows cleanly)
  // until it fits its column. Re-run whenever the column width can change.
  var fitRAF = 0;
  function fitMathNow(scope) {
    var boxes = (scope || document).querySelectorAll('.anim-player .anim-fcard__g, .anim-player .anim-fcard__f, .anim-player .anim-math--block');
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      if (!box.clientWidth) continue;                 // hidden tab — skip
      box.style.fontSize = '';                        // reset, then measure
      for (var pass = 0; pass < 3 && (box.scrollWidth - box.clientWidth) > 1; pass++) {
        var cur = parseFloat(getComputedStyle(box).fontSize) || 16;
        var next = Math.max(10, cur * (box.clientWidth / box.scrollWidth) * 0.98);
        box.style.fontSize = next.toFixed(1) + 'px';
      }
    }
  }
  function fitMath(scope) {
    if (fitRAF) return;
    fitRAF = root.requestAnimationFrame(function () { fitRAF = 0; fitMathNow(scope); });
  }

  // ================================================================= enhance
  function enhance(cfg) {
    cfg = cfg || {};
    var eng = cfg.engine, found = cfg.found, store = cfg.store;
    var page = document.querySelector('.anim-page');
    var topbar = document.querySelector('.anim-page__top');
    var playerEl = document.querySelector('.anim-player');
    if (!topbar) return;

    // ---- tool cluster in the top bar (theme · settings · questions) ----------
    var tools = el('div', 'anim-page__tools', topbar);

    // THEME --------------------------------------------------------------------
    var themeBtn = btn('anim-tbtn', tools, 'Change theme');
    themeBtn.appendChild(svgIcon(ICONS.palette));
    var themePop = el('div', 'anim-pop', document.body); themePop.hidden = true;
    el('p', 'anim-pop__t', themePop, 'Theme');
    var grid = el('div', 'anim-themes', themePop);
    var themeCells = {};
    THEMES.forEach(function (t) {
      var c = btn('anim-theme', grid, 'Use the ' + t[1] + ' theme', function () {
        setTheme(t[0]); syncTheme(); closePop();
      });
      var sw = el('span', 'anim-theme__sw', c); sw.style.background = t[2];
      el('span', null, c, t[1]);
      themeCells[t[0]] = c;
    });
    function syncTheme() {
      var cur = currentTheme();
      Object.keys(themeCells).forEach(function (k) { themeCells[k].classList.toggle('is-on', k === cur); });
    }
    syncTheme();
    themeBtn.addEventListener('click', function () { syncTheme(); togglePop(themePop, themeBtn); });

    // 3D view controller (built first so the settings sheet can offer its toggle)
    var td = (eng && playerEl) ? build3D(playerEl) : null;

    // SETTINGS -----------------------------------------------------------------
    if (eng) buildSettings(tools, eng, playerEl, td, found);

    // QUESTIONS LIST -----------------------------------------------------------
    if (found && found.chapter && (found.chapter.animations || []).length) buildList(tools, found, store);

    // HELP / intro re-open -----------------------------------------------------
    var helpBtn = btn('anim-tbtn', tools, 'How this works');
    helpBtn.appendChild(svgIcon(ICONS.help));
    helpBtn.addEventListener('click', function () { showIntro(true); });

    // ---- resizable split + auto/manual live INSIDE the player ----------------
    if (eng && playerEl) {
      buildSplit(playerEl);
      buildAutoManual(eng, playerEl);
    }

    // ---- keep every formula inside its column (no sideways scroll) -----------
    fitMath(playerEl);
    setTimeout(function () { fitMath(playerEl); }, 250);   // after KaTeX settles
    if (eng) { ['step', 'values', 'roles', 'ui'].forEach(function (ev) { eng.on(ev, function () { fitMath(playerEl); }); }); }
    if (playerEl) {
      // a tab switch reveals a panel that was 0-wide (unmeasurable) until now
      playerEl.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('.anim-tab')) setTimeout(function () { fitMath(playerEl); }, 0);
      });
      if (root.ResizeObserver) {
        var ro = new root.ResizeObserver(function () { fitMath(playerEl); });
        var rcol = playerEl.querySelector('.anim-right'); if (rcol) ro.observe(rcol);
        ro.observe(playerEl);
      }
    }
    root.addEventListener('resize', function () { fitMath(playerEl); });

    // ---- first-run intro -----------------------------------------------------
    if (lsGet('wha:anim:introSeen') !== '1') { showIntro(false); }

    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closePop(); closeOverlays(); } });
  }

  // --------------------------------------------------------------- settings
  function buildSettings(tools, eng, playerEl, td, found) {
    var setBtn = btn('anim-tbtn', tools, 'Drawing settings');
    setBtn.appendChild(svgIcon(ICONS.gear));
    var pop = el('div', 'anim-pop', document.body); pop.hidden = true;
    el('p', 'anim-pop__t', pop, 'Drawing settings');

    function rangeRow(key, label, min, max, step, fmt) {
      var row = el('div', 'anim-set__row', pop);
      var lab = el('div', 'anim-set__lab', row); el('span', null, lab, label);
      var val = el('span', 'anim-set__val', lab);
      var rg = el('input', 'anim-range', row); rg.type = 'range'; rg.min = min; rg.max = max; rg.step = step;
      rg.value = eng.ui[key] != null ? eng.ui[key] : min;
      function paint() {
        var v = parseFloat(rg.value); val.textContent = fmt ? fmt(v) : String(v);
        rg.style.setProperty('--fill', ((v - min) / (max - min) * 100).toFixed(1) + '%');
      }
      rg.addEventListener('input', function () { eng.setUi(key, parseFloat(rg.value)); paint(); });
      paint();
      return { rg: rg, paint: paint };
    }
    function toggleRow(key, label, hint) {
      var row = el('div', 'anim-set__row', pop);
      var lab = el('div', 'anim-set__lab', row); el('span', null, lab, label);
      var sw = el('button', 'anim-switch', lab); sw.type = 'button'; sw.setAttribute('role', 'switch');
      el('span', 'anim-switch__k', sw);
      function paint() { var on = eng.ui[key] !== false; sw.classList.toggle('is-on', on); sw.setAttribute('aria-checked', on ? 'true' : 'false'); }
      sw.addEventListener('click', function () { eng.setUi(key, eng.ui[key] === false ? true : false); paint(); });
      paint();
      if (hint) el('p', 'anim-set__hint', row, hint);
    }

    el('p', 'anim-pop__sub', pop, 'Lines & text');
    rangeRow('thick', 'Line thickness', 0.6, 2.4, 0.1, function (v) { return v.toFixed(1) + '×'; });
    rangeRow('labelSize', 'Text size', 0.8, 1.8, 0.1, function (v) { return v.toFixed(1) + '×'; });
    var specStr = '';
    try { specStr = JSON.stringify(eng.spec || {}); } catch (e) { specStr = ''; }
    if (specStr.indexOf('"uiToggle":"grid"') >= 0) toggleRow('grid', 'Grid');
    if (specStr.indexOf('"uiToggle":"angles"') >= 0) toggleRow('angles', 'Right-angle marks');

    el('p', 'anim-pop__sub', pop, 'Colour the shapes');
    var fillRow = rangeRow('fill', 'Fill shapes', 0, 0.55, 0.05, function (v) { return v <= 0.001 ? 'Off' : Math.round(v / 0.55 * 100) + '%'; });
    el('p', 'anim-set__hint', fillRow.rg.parentNode, 'Shade the triangles. Pick each colour under the Colours tab.');

    // ---- 3D view (drag to rotate) ----
    if (td) {
      el('p', 'anim-pop__sub', pop, 'View');
      var row3 = el('div', 'anim-set__row', pop);
      var lab3 = el('div', 'anim-set__lab', row3); el('span', null, lab3, '3D view');
      var sw3 = el('button', 'anim-switch', lab3); sw3.type = 'button'; sw3.setAttribute('role', 'switch');
      el('span', 'anim-switch__k', sw3);
      function paint3() { var on = td.isOn(); sw3.classList.toggle('is-on', on); sw3.setAttribute('aria-checked', on ? 'true' : 'false'); }
      sw3.addEventListener('click', function () { td.set(!td.isOn()); paint3(); });
      paint3();
      el('p', 'anim-set__hint', row3, 'Tilt the drawing into 3D — then drag it to look around (double-tap to reset).');
      // real-world / application figures: nudge the student to try it
      var sec = (found && found.anim && (found.anim.section || '')) + ' ' + ((found && found.anim && found.anim.group) || '') + ' ' + ((found && found.anim && found.anim.label) || '');
      if (/7\.2|real|applic|ladder|world/i.test(sec)) el('p', 'anim-set__hint', row3, '👍 This is a real-world problem — 3D view helps you picture it.');
    }

    var act = el('div', 'anim-actions', pop);
    btn('btn btn--tertiary btn--sm', act, 'Reset drawing', function () {
      ['thick', 'labelSize', 'fill', 'grid', 'angles'].forEach(function (k) {
        if (eng.uiDefaults && k in eng.uiDefaults) eng.setUi(k, eng.uiDefaults[k]);
      });
      if (td && td.isOn()) td.set(false);
      pop.querySelectorAll('.anim-range').forEach(function (r) { r.dispatchEvent(new Event('input')); });
      pop.querySelectorAll('.anim-switch').forEach(function (s) { /* repaint handled by their own state next open */ });
    }).textContent = 'Reset drawing';

    setBtn.addEventListener('click', function () { togglePop(pop, setBtn); });
  }

  // ------------------------------------------------------------- questions list
  var listOverlay = null;
  function buildList(tools, found, store) {
    var b = btn('anim-tbtn anim-tbtn--list', tools, 'All questions');
    b.appendChild(svgIcon(ICONS.list));
    el('span', 'anim-tbtn__l', b, 'List');
    b.addEventListener('click', function () { openList(found, store); });
  }
  function closeOverlays() { if (listOverlay) { listOverlay.hidden = true; } }
  function openList(found, store) {
    if (!listOverlay) {
      listOverlay = el('div', 'anim-sheet', document.body);
      el('div', 'anim-sheet__bg', listOverlay).addEventListener('click', function () { listOverlay.hidden = true; });
      var panel = el('div', 'anim-sheet__panel', listOverlay);
      var head = el('div', 'anim-sheet__head', panel);
      el('h2', null, head, 'All questions');
      var x = btn('anim-tbtn', head, 'Close', function () { listOverlay.hidden = true; });
      x.appendChild(svgIcon(ICONS.close));
      listOverlay._body = el('div', 'anim-sheet__body', panel);
    }
    var body = listOverlay._body; body.textContent = '';
    var ch = found.chapter, curId = found.anim && found.anim.id;
    var sections = ch.sections || [{ key: '', label: '', title: '' }];
    var anims = ch.animations || [];
    sections.forEach(function (sec) {
      var rows = anims.filter(function (a) { return (a.section || '') === (sec.key || ''); });
      if (!rows.length) return;
      el('p', 'anim-sheet__grp', body, (sec.label || '') + (sec.title ? ' · ' + sec.title : '') || 'Questions');
      rows.forEach(function (a) {
        var row = el('a', 'anim-sheet__row', body);
        row.href = 'anim-player.html?a=' + encodeURIComponent(a.id);
        if (a.id === curId) row.classList.add('is-cur');
        el('span', 'anim-sheet__chip', row, a.label || a.group || '•');
        el('span', 'anim-sheet__ttl', row, a.question ? a.question : (a.title || a.label || a.id));
        var done = false;
        try { var s = store && store.get ? store.get('anim:' + a.id) : null; done = !!(s && s.completed); } catch (e) { done = false; }
        if (done) row.appendChild(svgIcon(ICONS.check, 'anim-ico anim-sheet__tick'));
        else el('span', 'anim-sheet__tick', row);   // keep the column aligned
      });
    });
    listOverlay.hidden = false;
    var cur = body.querySelector('.is-cur'); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'center' });
  }

  // ------------------------------------------------------------------ 3D view
  // A lightweight, uniform "look around in 3D" for any figure — especially the
  // real-world ones (ladders, rectangles, buildings). The whole stage is tilted
  // with CSS perspective; a transparent grab layer catches the drag so it never
  // fights the engine's own point-dragging. Pure visual, mobile-friendly.
  function build3D(playerEl) {
    var box = playerEl.querySelector('.anim-stagebox');
    var stage = playerEl.querySelector('.anim-stage');
    if (!box || !stage) return null;
    var rx = 16, ry = -22, on = false, grab = null, toastShown = false;
    function apply() { stage.style.setProperty('--rx', rx.toFixed(1) + 'deg'); stage.style.setProperty('--ry', ry.toFixed(1) + 'deg'); }
    function wire(g) {
      var dragging = false, px = 0, py = 0;
      g.addEventListener('pointerdown', function (e) { dragging = true; px = e.clientX; py = e.clientY; try { g.setPointerCapture(e.pointerId); } catch (x) { /* */ } e.preventDefault(); });
      g.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        ry = Math.max(-60, Math.min(60, ry + (e.clientX - px) * 0.45));
        rx = Math.max(-20, Math.min(62, rx - (e.clientY - py) * 0.45));
        px = e.clientX; py = e.clientY; apply();
      });
      function end() { dragging = false; }
      g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end); g.addEventListener('lostpointercapture', end);
      g.addEventListener('dblclick', function () { rx = 16; ry = -22; apply(); });
    }
    function set(v) {
      on = !!v; box.classList.toggle('is-3d', on);
      if (on) {
        if (!grab) { grab = el('div', 'anim-3d-grab', box); grab.setAttribute('aria-label', 'Drag to rotate the drawing'); wire(grab); }
        grab.hidden = false; apply();
        if (!toastShown) { toastShown = true; showHint3D(box); }
      } else if (grab) { grab.hidden = true; }
    }
    return { set: set, isOn: function () { return on; } };
  }
  function showHint3D(box) {
    var t = el('div', 'anim-3d-hint', box, 'Drag to rotate · double-tap to reset');
    setTimeout(function () { if (t && t.parentNode) { t.style.opacity = '0'; setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 400); } }, 2600);
  }

  // --------------------------------------------------------------- split handle
  function buildSplit(playerEl) {
    var main = playerEl.querySelector('.anim-main');
    var left = playerEl.querySelector('.anim-left'), rightEl = playerEl.querySelector('.anim-right');
    if (!main || !left || !rightEl || left.nextSibling !== rightEl) {
      // right may not immediately follow left; insert before right regardless
    }
    if (!main || !rightEl) return;
    var handle = el('div', 'anim-split-handle', null);
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-label', 'Drag to resize the drawing and the solution');
    handle.setAttribute('tabindex', '0');
    main.insertBefore(handle, rightEl);
    main.classList.add('anim-main--split');

    var saved = parseFloat(lsGet('wha:anim:split', ''));
    applyFrac(isFinite(saved) ? saved : 0.62);
    function applyFrac(frac) {
      frac = Math.max(0.34, Math.min(0.72, frac));
      main.style.setProperty('--anim-split', (frac * 100).toFixed(2) + 'fr');
      main.style.setProperty('--anim-split-r', ((1 - frac) * 100).toFixed(2) + 'fr');
      main._frac = frac;
    }
    var dragging = false;
    function fracFromX(clientX) {
      var r = main.getBoundingClientRect();
      return (clientX - r.left) / Math.max(1, r.width);
    }
    handle.addEventListener('pointerdown', function (e) {
      if (root.innerWidth < 760) return;
      dragging = true; handle.classList.add('is-drag');
      try { handle.setPointerCapture(e.pointerId); } catch (x) { /* */ }
      e.preventDefault();
    });
    handle.addEventListener('pointermove', function (e) { if (dragging) applyFrac(fracFromX(e.clientX)); });
    function end() { if (dragging) { dragging = false; handle.classList.remove('is-drag'); lsSet('wha:anim:split', String(main._frac)); } }
    handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end); handle.addEventListener('lostpointercapture', end);
    handle.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 0.04 : e.key === 'ArrowLeft' ? -0.04 : 0;
      if (!d) return; e.preventDefault(); applyFrac((main._frac || 0.62) + d); lsSet('wha:anim:split', String(main._frac));
    });
  }

  // ------------------------------------------------------------- auto / manual
  function buildAutoManual(eng, playerEl) {
    if (!eng.steps || !eng.steps.length) return;                 // only lessons with steps
    var bar = playerEl.querySelector('.anim-bar .anim-bar__grp--end');
    if (!bar) return;
    var wrap = el('div', 'anim-mode', null);
    bar.insertBefore(wrap, bar.firstChild);
    var manual = lsGet('wha:anim:mode', 'auto') === 'manual';
    var autoB = btn('anim-mode__b', wrap, 'Auto play', function () { setManual(false, true); });
    autoB.textContent = 'Auto';
    var manB = btn('anim-mode__b', wrap, 'Manual (step by step)', function () { setManual(true, true); });
    manB.textContent = 'Manual';

    function paint() {
      autoB.classList.toggle('is-on', !manual);
      manB.classList.toggle('is-on', manual);
    }
    // in manual mode, pressing play advances exactly one step then stops
    eng.on('stepdone', function () { if (manual && eng.playing) eng.pause(); });
    function setManual(on, byUser) {
      manual = on; lsSet('wha:anim:mode', on ? 'manual' : 'auto'); paint();
      if (on && eng.playing) eng.pause();
      if (on && byUser && lsGet('wha:anim:manualSeen') !== '1') { showManualNote(); lsSet('wha:anim:manualSeen', '1'); }
    }
    paint();
  }

  // ------------------------------------------------------------------ modals
  function modal() {
    var m = el('div', 'anim-modal', document.body);
    el('div', 'anim-modal__bg', m).addEventListener('click', function () { m.remove(); });
    var card = el('div', 'anim-modal__card', m);
    return { m: m, card: card };
  }
  function showManualNote() {
    var d = modal();
    el('h2', 'anim-modal__t', d.card, 'Manual mode is on');
    el('p', 'anim-modal__s', d.card, 'The lesson will not move on its own now. Press the ▶ Next-step button (or the → arrow key) each time you are ready for the next step. Switch back to Auto any time.');
    var act = el('div', 'anim-modal__act', d.card);
    btn('btn btn--primary btn--sm', act, 'Got it', function () { d.m.remove(); }).textContent = 'Got it';
  }
  function showIntro(force) {
    var d = modal();
    el('h2', 'anim-modal__t', d.card, 'Welcome to the Animation Lab 🎬');
    el('p', 'anim-modal__s', d.card, 'Here is what every control does — you can reopen this any time from the “?” button.');
    var g = el('div', 'anim-guide', d.card);
    [
      [ICONS.play, 'Play & step', 'Press ▶ to watch the solution build up. Use ◀ ▶ (or the arrow keys) to go one step at a time, and the dots to jump to a step.'],
      [ICONS.hand, 'Auto or Manual', 'Auto plays the whole lesson. Manual waits for you — press Next when you are ready for the next step.'],
      [ICONS.palette, 'Theme', 'Tap the palette to change the colours of the whole page — pick a calmer theme if the screen feels too bright.'],
      [ICONS.gear, 'Drawing settings', 'Make the lines or text thicker, shade the triangles, or turn the grid on and off.'],
      [ICONS.list, 'All questions', 'Open the list to jump straight to any theory topic or exercise question — no need to go back.'],
      [ICONS.gear, '3D view', 'In Drawing settings, turn on 3D view and drag the picture to look at real-world problems (like a ladder on a wall) from any angle.'],
      ['M4 12h16M12 4v16', 'Resize', 'On a computer, drag the bar between the drawing and the solution to make either side bigger.']
    ].forEach(function (r) {
      var row = el('div', 'anim-guide__row', g);
      var ic = el('div', 'anim-guide__ic', row); ic.appendChild(svgIcon(r[0]));
      var tx = el('div', null, row);
      el('h3', 'anim-guide__h', tx, r[1]); el('p', 'anim-guide__p', tx, r[2]);
    });
    var act = el('div', 'anim-modal__act', d.card);
    if (!force) btn('btn btn--tertiary btn--sm', act, 'Skip intro', function () { lsSet('wha:anim:introSeen', '1'); d.m.remove(); }).textContent = 'Skip intro';
    btn('btn btn--primary btn--sm', act, 'Start learning', function () { lsSet('wha:anim:introSeen', '1'); d.m.remove(); }).textContent = force ? 'Close' : 'Start learning';
  }

  root.WHA_AnimControls = { enhance: enhance };
})(typeof window !== 'undefined' ? window : this);
