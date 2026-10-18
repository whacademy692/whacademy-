/**
 * anim-scenes.js — W.H. Academy · Animation Lab (real-world 3D scenes)
 * ----------------------------------------------------------------------------
 * A spec may ask for a real-world 3D model with   "scene3d": { "type": "ladder", ... }
 * (or just the string "ladder"). The scene is built from plain CSS-3D (no WebGL), lives
 * inside .anim-stage so the stage-view controller (anim-controls.js) can orbit it, and
 * brings its own small control panel — a slider to change the picture, a play-it
 * button, Front / Side / Top camera buttons, Spin and Day/Night — so the student can
 * PLAY with the situation, not just look at it.
 *
 *   ladder  → a ladder against a house wall (climbing kid · foot slider · safe-angle meter)
 *   pole    → a pole held by a taut cable      (anchor slider · flying bird)
 *   tent    → a triangular tent                (height slider · campfire · night glow)
 *   map     → ships on a chart                 (sail the routes · shortest-distance lines)
 *
 * Model units are metres (or km on the map): x → right, y → up, z → toward the viewer.
 * All labels are "billboards" that always face the camera, so they stay readable from any angle.
 *
 *   WHA_AnimScenes.create(cfg, ctx) → { rebuild(), onView(rx, ry), initialView, destroy() } | null
 *     ctx = { eng, stage, box, view }   view = { get(), set(rx, ry), animateTo(rx, ry, ms), onUser(cb) }
 * ----------------------------------------------------------------------------
 */
(function (root) {
  'use strict';

  var DEG = Math.PI / 180;
  function el(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function r2(n) { return Math.round(n * 100) / 100; }
  function fmt(n, dp) { return String(+Number(n).toFixed(dp == null ? 2 : dp)); }
  function ext(base, over) { var o = {}, k; for (k in base) o[k] = base[k]; if (over) for (k in over) o[k] = over[k]; return o; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function tween(ms, step, done) {
    var t0 = null, id = 0, dead = false;
    function f(ts) {
      if (dead) return;
      if (t0 === null) t0 = ts;
      var k = Math.min(1, (ts - t0) / ms);
      step(k);
      if (k < 1) id = root.requestAnimationFrame(f); else if (done) done();
    }
    id = root.requestAnimationFrame(f);
    return function () { dead = true; root.cancelAnimationFrame(id); };
  }

  // ======================================================================== 3D kit
  // Everything is placed with matrix3d so any plane/bar can be put anywhere in model space.
  function Kit(S, C) { this.S = S; this.C = C || null; }
  Kit.prototype.css = function (p) { return [p[0] * this.S, -p[1] * this.S, p[2] * this.S]; };
  Kit.prototype.dir = function (v) { return [v[0], -v[1], v[2]]; };
  function matrix(A, B, C, p) {
    return 'matrix3d(' + [A[0], A[1], A[2], 0, B[0], B[1], B[2], 0, C[0], C[1], C[2], 0, p[0], p[1], p[2], 1].map(function (n) { return r2(n); }).join(',') + ')';
  }
  /** a flat rectangle wm × hm (model units). p = its top-left corner, a = direction of its width, b = direction of its height (downwards). */
  Kit.prototype.setQuad = function (d, p, a, b) {
    var A = this.dir(norm(a)), B = this.dir(norm(b)), C = cross(A, B);
    d.style.transform = matrix(A, B, C, this.css(p));
  };
  Kit.prototype.quad = function (parent, cls, p, a, b, wm, hm) {
    var d = el('div', 'sc-q ' + (cls || ''), parent);
    d.style.width = (wm * this.S).toFixed(1) + 'px'; d.style.height = (hm * this.S).toFixed(1) + 'px';
    this.setQuad(d, p, a, b);
    return d;
  };
  /** a thin 3-D bar between two points (two crossed strips so it is visible from every side) */
  Kit.prototype.bar = function (parent, cls, p1, p2, thPx) {
    var c1 = this.css(p1), c2 = this.css(p2), d = sub(c2, c1), len = Math.hypot(d[0], d[1], d[2]) || 0.001, u = mul(d, 1 / len);
    var up = Math.abs(u[1]) > 0.98 ? [0, 0, 1] : [0, -1, 0];
    var k = dot(up, u), v = norm(sub(up, mul(u, k))), w = cross(u, v);
    var g = el('div', 'sc-bar', parent);
    for (var i = 0; i < 2; i++) {
      var s = el('div', 'sc-bar__s ' + (cls || ''), g);
      s.style.width = len.toFixed(1) + 'px'; s.style.height = thPx + 'px'; s.style.top = (-thPx / 2) + 'px';
      s.style.transform = i === 0 ? matrix(u, v, w, c1) : matrix(u, w, mul(v, -1), c1);
    }
    return g;
  };
  /** a flat ribbon lying on the ground (y = 0) from p1 to p2, wm wide */
  Kit.prototype.ribbon = function (parent, cls, p1, p2, wm, y) {
    var d = sub(p2, p1), len = Math.hypot(d[0], 0, d[2]) || 0.001, a = [d[0] / len, 0, d[2] / len], n = [-a[2], 0, a[0]];
    var o = add(p1, mul(n, -wm / 2)); o[1] = y == null ? 0.01 : y;
    return this.quad(parent, cls, o, a, n, len, wm);
  };
  /** a label / drawing that always faces the camera. content: string or element. anchor 'c' (centre) | 'b' (bottom-centre). */
  Kit.prototype.bill = function (parent, p, cls, content, anchor) {
    var c = this.css(p);
    var w = el('div', 'sc-bb', parent);
    w.style.transform = 'translate3d(' + r2(c[0]) + 'px,' + r2(c[1]) + 'px,' + r2(c[2]) + 'px)';
    var i = el('div', 'sc-bbi' + (anchor ? ' sc-bbi--' + anchor : '') + ' ' + (cls || ''), w);
    if (typeof content === 'string') i.textContent = content; else if (content) i.appendChild(content);
    if (/sc-(tree|bush|bird|flag|fire|boat|port)/.test(cls || '')) i.style.fontSize = this.S + 'px';   // art: 1em = 1 metre (labels keep a readable px size)
    return i;
  };
  /** A label that is drawn on a flat layer ABOVE the 3-D scene (so a bush, a tree or the ladder can never hide it) but is pinned to a real 3-D point:
   *  the point is a tiny invisible anchor inside the scene; the browser projects it, and C.place() reads where it landed on screen. */
  Kit.prototype.tag = function (parent, p, cls, content, anchor) {
    var c = this.css(p), a = el('div', 'sc-bb', parent);
    a.style.transform = 'translate3d(' + r2(c[0]) + 'px,' + r2(c[1]) + 'px,' + r2(c[2]) + 'px)';
    var e = el('div', 'sc-tag' + (anchor ? ' sc-tag--' + anchor : '') + ' ' + (cls || ''), this.C.ovl);
    if (typeof content === 'string') e.textContent = content; else if (content) e.appendChild(content);
    var t = { a: a, e: e }; this.C.tags.push(t);
    return t;
  };
  /** a coloured name tag:  "AC = 2.4 m"  with a small plain-words caption under it ("height of the top"). */
  Kit.prototype.pill = function (parent, p, cls, text, cap, anchor) {
    var t = this.tag(parent, p, 'sc-pill ' + cls + (cap ? ' sc-pill--cap' : ''), text, anchor);
    if (cap) el('small', 'sc-pill__cap', t.e, cap);
    return t;
  };
  Kit.prototype.moveBill = function (inner, p) {
    var c = this.css(p), w = inner.parentNode;
    w.style.transform = 'translate3d(' + r2(c[0]) + 'px,' + r2(c[1]) + 'px,' + r2(c[2]) + 'px)';
  };

  // ====================================================================== chrome
  // Sky, the 3D root, and the shared control panel (views · spin · day/night).
  function chrome(ctx, cfg) {
    var box = ctx.box, stage = ctx.stage, eng = ctx.eng;
    var C = { box: box, stage: stage, eng: eng, spin: false, night: false, killers: [], tags: [] };
    C.root3d = el('div', 'anim-scene3d', stage); C.root3d.hidden = true;
    C.base = el('div', 'anim-sc-base', C.root3d);
    C.sky = el('div', 'anim-sc-sky', null); box.insertBefore(C.sky, box.firstChild); C.sky.hidden = true;
    el('i', 'anim-sc-sun', C.sky);
    for (var i = 0; i < 4; i++) { var cl = el('i', 'anim-sc-cloud anim-sc-cloud--' + (i + 1), C.sky); cl.setAttribute('aria-hidden', 'true'); }
    el('i', 'anim-sc-stars', C.sky);
    C.ovl = el('div', 'anim-sc-ovl', box); C.ovl.hidden = true;            // flat layer for the name tags
    C.top = el('div', 'anim-sc-top', box); C.top.hidden = true;           // badges (top-left)
    C.hud = el('div', 'anim-sc-hud', null); C.hud.hidden = true;           // controls: a deck between the drawing and the play bar
    var barEl = box.querySelector('.anim-bar'); box.insertBefore(C.hud, barEl || null);
    C.row1 = el('div', 'anim-sc-hud__r1', C.hud);                        // read-outs
    C.row2 = el('div', 'anim-sc-hud__r2', C.hud);                        // slider
    C.row3 = el('div', 'anim-sc-hud__r3', C.hud);                        // buttons

    function fitSky() {
      C.sky.style.height = stage.offsetHeight + 'px'; C.ovl.style.height = stage.offsetHeight + 'px';
      if (C.root3d && !C.root3d.hidden) C.place();
    }
    C.clearTags = function () { C.tags.forEach(function (t) { if (t.e.parentNode) t.e.parentNode.removeChild(t.e); }); C.tags.length = 0; };
    /** pin every tag to the screen position of its 3-D anchor */
    C.place = function () {
      if (!C.tags.length || C.root3d.hidden) return;
      var br = box.getBoundingClientRect(), i, t, r, rs = [];
      for (i = 0; i < C.tags.length; i++) rs.push(C.tags[i].a.getBoundingClientRect());      // read first …
      for (i = 0; i < C.tags.length; i++) {                                                    // … then write
        t = C.tags[i]; r = rs[i];
        t.e.style.setProperty('--X', (r.left - br.left).toFixed(1) + 'px'); t.e.style.setProperty('--Y', (r.top - br.top).toFixed(1) + 'px');
      }
    };
    C.fitSky = fitSky;
    if (root.ResizeObserver) { var ro = new root.ResizeObserver(fitSky); ro.observe(stage); C.ro = ro; }

    C.btn = function (parent, label, onClick, cls) {
      var b = el('button', 'anim-sc-b ' + (cls || ''), parent, label); b.type = 'button';
      b.addEventListener('click', onClick);
      return b;
    };
    C.slider = function (parent, label, min, max, step, val, show, onInput) {
      var w = el('label', 'anim-sc-sl', parent);
      var t = el('span', 'anim-sc-sl__t', w);
      var rg = el('input', 'anim-range', w); rg.type = 'range'; rg.min = min; rg.max = max; rg.step = step; rg.value = val;
      function paint() {
        t.textContent = label + ' ' + show(parseFloat(rg.value));
        rg.style.setProperty('--fill', ((parseFloat(rg.value) - min) / ((max - min) || 1) * 100).toFixed(1) + '%');
      }
      rg.addEventListener('input', function () { paint(); onInput(parseFloat(rg.value)); });
      paint();
      return { wrap: w, input: rg, set: function (v, lbl) { rg.min = min; rg.value = v; if (lbl) label = lbl; paint(); }, range: function (a, b) { min = a; max = b; rg.min = a; rg.max = b; paint(); } };
    };

    // camera presets + spin + day/night (shared by every scene)
    var views = el('div', 'anim-sc-views', C.row3);
    var vb = [];
    [['Front', cfg.viewFront || [-12, -18]], ['Side', cfg.viewSide || [0, 90]], ['Top', cfg.viewTop || [-88, 0]]].forEach(function (v) {
      vb.push(C.btn(views, v[0], function () { stopSpin(); ctx.view.animateTo(v[1][0], v[1][1], 650); }, 'anim-sc-b--view'));
    });
    var spinB = C.btn(views, 'Spin', function () { C.spin ? stopSpin() : startSpin(); }, 'anim-sc-b--toggle');
    var nightB = C.btn(views, 'Night', function () {
      C.night = !C.night; box.classList.toggle('is-night', C.night); nightB.classList.toggle('is-on', C.night);
      nightB.textContent = C.night ? 'Day' : 'Night';
      if (C.onNight) C.onNight(C.night);
    }, 'anim-sc-b--toggle');
    C.viewsEl = views;

    var spinId = 0;
    function startSpin() {
      C.spin = true; spinB.classList.add('is-on');
      (function f() { if (!C.spin) return; var v = ctx.view.get(); ctx.view.set(v.rx, v.ry + 0.45); spinId = root.requestAnimationFrame(f); })();
    }
    function stopSpin() { C.spin = false; spinB.classList.remove('is-on'); root.cancelAnimationFrame(spinId); }
    C.stopSpin = stopSpin;
    ctx.view.onUser(stopSpin);

    C.show = function (on) {
      C.root3d.hidden = !on; C.sky.hidden = !on; C.top.hidden = !on; C.hud.hidden = !on; C.ovl.hidden = !on;
      box.classList.toggle('has-scene3d', on);
      if (on) fitSky(); else { stopSpin(); if (C.onHide) C.onHide(); }
    };
    C.onView = function (rx, ry) {
      C.root3d.style.setProperty('--sc-rx', String(r2(rx))); C.root3d.style.setProperty('--sc-ry', String(r2(ry)));
      C.ovl.classList.toggle('is-plan', Math.abs(rx) > 80);      // bird's-eye view: heights collapse, so only flat-on-the-ground labels stay
      C.place(); C.settle();
    };
    // the stage eases to a new angle for a moment (CSS transition) — keep re-pinning the tags until it has landed
    var settleUntil = 0, settleId = 0;
    C.settle = function () {
      settleUntil = (root.performance ? root.performance.now() : Date.now()) + 220;
      if (settleId) return;
      (function f() {
        settleId = 0; C.place();
        if ((root.performance ? root.performance.now() : Date.now()) < settleUntil) settleId = root.requestAnimationFrame(f);
      })();
    };
    C.destroy = function () {
      stopSpin(); settleUntil = 0; if (settleId) root.cancelAnimationFrame(settleId); if (C.ro) C.ro.disconnect();
      [C.root3d, C.sky, C.top, C.hud, C.ovl].forEach(function (e) { if (e && e.parentNode) e.parentNode.removeChild(e); });
      box.classList.remove('has-scene3d', 'is-night');
    };
    C.onView(-14, -24);
    return C;
  }

  // ========================================================================= ladder
  function ladderScene(cfg, ctx) {
    var eng = ctx.eng, C = chrome(ctx, cfg), base = C.base, kit;
    var unit = cfg.unit || 'm';
    var nm = ext({ wall: 'AC', ground: 'CB', ladder: 'AB' }, cfg.names);
    var lt = cfg.letters === null ? null : ext({ top: 'A', foot: 'B', corner: 'C' }, cfg.letters);
    var st = { h: 2.4, d: 0.5, L: 2.45, f: 0, mode: 'idle', tri: true };
    var dyn, kid, trip, eqSym, eqNum, gauge, gaugeTxt, gaugePtr, slider, climbB, killClimb = null, killWave = 0;

    function source() {
      var h = cfg.hParam && eng.values ? eng.values[cfg.hParam] : cfg.h;
      var d = cfg.dParam && eng.values ? eng.values[cfg.dParam] : cfg.d;
      if (!isFinite(Number(h)) && eng.values && isFinite(eng.values.h)) h = eng.values.h;
      if (!isFinite(Number(d)) && eng.values && isFinite(eng.values.d)) d = eng.values.d;
      st.h = Math.max(0.3, num(h, 2.4)); st.d = Math.max(0.15, num(d, 0.5));
      st.L = Math.hypot(st.h, st.d);
    }
    function setD(d) {
      st.d = clamp(d, 0.1, st.L - 0.1); st.h = Math.sqrt(Math.max(0.01, st.L * st.L - st.d * st.d));
    }

    var Hw, Ww, Dg;
    function layout() {
      var W = Math.max(280, eng.view.W), H = Math.max(220, eng.view.H), L = st.L;
      Hw = L + 0.8; Ww = Math.max(4.2, L * 1.8); Dg = L + 0.9;
      var S = Math.min(0.64 * H / Hw, 0.9 * W / Ww);
      kit = new Kit(S, C);
      base.textContent = '';
      base.style.transform = 'translateY(' + (Hw * S * 0.27 + 4).toFixed(0) + 'px)';
      kit.quad(base, 'sc-ground sc-lit', [-Ww / 2, 0, 0], [1, 0, 0], [0, 0, 1], Ww, Dg);
      kit.quad(base, 'sc-path sc-lit', [-0.7, 0.004, 0], [1, 0, 0], [0, 0, 1], 1.4, Dg);
      kit.quad(base, 'sc-wall sc-lit', [-Ww / 2, Hw, 0], [1, 0, 0], [0, -1, 0], Ww, Hw);
      kit.quad(base, 'sc-coping sc-lit', [-Ww / 2, Hw + 0.1, -0.03], [1, 0, 0], [0, -1, 0], Ww, 0.1);
      kit.quad(base, 'sc-plinth sc-lit', [-Ww / 2, 0.22, 0.004], [1, 0, 0], [0, -1, 0], Ww, 0.22);
      var wy = Math.min(Hw - 0.5, 2.05);
      var win = kit.quad(base, 'sc-window', [0.78, wy, 0.006], [1, 0, 0], [0, -1, 0], 0.86, 1.0);
      el('i', 'sc-window__bar', win); el('i', 'sc-window__bar sc-window__bar--v', win);
      kit.quad(base, 'sc-sill sc-lit', [0.72, wy - 1.0, 0.006], [1, 0, 0], [0, -1, 0], 0.98, 0.07);
      // trees + bush (always face the camera)
      kit.bill(base, [-Ww / 2 + 0.55, 0, 0.9], 'sc-tree', tree(), 'b');
      kit.bill(base, [Ww / 2 - 0.5, 0, 0.55], 'sc-bush', bush(), 'b');
      kit.bill(base, [-Ww / 2 + 1.25, 0, 1.9], 'sc-bush sc-bush--s', bush(), 'b');
      dyn = el('div', 'sc-grp', base);
      kid = kit.quad(base, 'sc-kid', [0, 0, 0], [1, 0, 0], [0, -1, 0], 0.5, 0.95);
      kid.style.fontSize = S + 'px';
      kidArt(kid);
      build();
    }
    function tree() {
      var t = el('div', 'sc-treeart');
      el('i', 'sc-treeart__trunk', t); el('i', 'sc-treeart__f sc-treeart__f--1', t); el('i', 'sc-treeart__f sc-treeart__f--2', t); el('i', 'sc-treeart__f sc-treeart__f--3', t);
      return t;
    }
    function bush() {
      var t = el('div', 'sc-bushart');
      el('i', 'sc-bushart__a', t); el('i', 'sc-bushart__b', t); el('i', 'sc-bushart__c', t);
      return t;
    }
    function kidArt(k) {
      ['sc-kid__f sc-kid__back', 'sc-kid__f sc-kid__front'].forEach(function (c) {
        var f = el('div', c, k);
        el('i', 'k-leg k-leg--l', f); el('i', 'k-leg k-leg--r', f); el('i', 'k-boot k-boot--l', f); el('i', 'k-boot k-boot--r', f);
        el('i', 'k-arm k-arm--l', f); el('i', 'k-arm k-arm--r', f); el('i', 'k-body', f); el('i', 'k-head', f); el('i', 'k-hat', f);
        if (/front/.test(c)) { el('i', 'k-eye k-eye--l', f); el('i', 'k-eye k-eye--r', f); el('i', 'k-smile', f); }
      });
    }

    var W8 = ext({ wall: 'height of the top', ground: 'foot to the wall', ladder: 'the ladder' }, cfg.words);
    function pill(p, cls, text, cap, anchor) { return kit.pill(dyn, p, cls, text, cap, anchor); }
    function letter(p, ch, anchor) { return kit.tag(dyn, p, 'sc-pt', ch, anchor); }

    function build() {
      var S = kit.S, h = st.h, d = st.d, L = st.L;
      dyn.textContent = ''; C.clearTags();
      var th = Math.max(5, 0.05 * S), rg = Math.max(4, 0.036 * S);
      if (st.tri) {
        var tq = kit.quad(dyn, 'sc-tri', [0, h, 0], [0, 0, 1], [0, -1, 0], d, h);
        tq.style.clipPath = 'polygon(0 0, 0 100%, 100% 100%)';
      }
      kit.quad(dyn, 'sc-ra', [0, 0.24, 0], [0, 0, 1], [0, -1, 0], 0.24, 0.24);
      // ladder
      var zOff = 0.03;
      kit.bar(dyn, 'sc-rail sc-lit', [-0.2, 0, d + zOff], [-0.2, h, zOff], th);
      kit.bar(dyn, 'sc-rail sc-lit', [0.2, 0, d + zOff], [0.2, h, zOff], th);
      var n = Math.max(4, Math.round(L / 0.3));
      for (var i = 1; i < n; i++) { var t = i / n; kit.bar(dyn, 'sc-rung sc-lit', [-0.2, h * t, (d + zOff) * (1 - t) + zOff * t], [0.2, h * t, (d + zOff) * (1 - t) + zOff * t], rg); }
      kit.bar(dyn, 'sc-pad', [-0.22, 0.012, d + zOff + 0.02], [-0.18, 0.012, d + zOff + 0.02], th * 1.5);
      kit.bar(dyn, 'sc-pad', [0.18, 0.012, d + zOff + 0.02], [0.22, 0.012, d + zOff + 0.02], th * 1.5);
      // dimension lines (offset to the side so nothing hides behind the ladder)
      var xl = -0.78, xr = 0.8;
      kit.bar(dyn, 'sc-dim sc-dim--wall', [xl, 0.01, 0.025], [xl, h, 0.025], 6);
      kit.bar(dyn, 'sc-cap sc-cap--wall', [xl - 0.1, 0.01, 0.025], [xl + 0.1, 0.01, 0.025], 3);
      kit.bar(dyn, 'sc-cap sc-cap--wall', [xl - 0.1, h, 0.025], [xl + 0.1, h, 0.025], 3);
      kit.bar(dyn, 'sc-dim sc-dim--ground', [xr, 0.012, 0.0], [xr, 0.012, d], 6);
      kit.bar(dyn, 'sc-cap sc-cap--ground', [xr - 0.1, 0.012, 0.0], [xr + 0.1, 0.012, 0.0], 3);
      kit.bar(dyn, 'sc-cap sc-cap--ground', [xr - 0.1, 0.012, d], [xr + 0.1, 0.012, d], 3);
      // labels (billboards)
      pill([xl, h / 2, 0.025], 'sc-pill--wall', nm.wall + ' = ' + fmt(h) + ' ' + unit, W8.wall, 'l');
      pill([xr, 0.012, d / 2], 'sc-pill--ground', nm.ground + ' = ' + fmt(d) + ' ' + unit, W8.ground, 'd');
      pill([0.2, h * 0.5, d * 0.5 + 0.03], 'sc-pill--lad', nm.ladder + ' = ' + fmt(L) + ' ' + unit, W8.ladder, 'r');
      if (lt) {
        letter([0, h, 0.03], lt.top, 'u'); letter([0, 0, d + 0.03], lt.foot, 'd'); letter([0, 0, 0], lt.corner, 'l');
      }
      placeKid(); refresh(); C.place();
    }

    function placeKid() {
      var h = st.h, d = st.d, L = st.L, S = kit.S, f = st.f * 0.78 + 0.03;
      var u = [0, h / L, -d / L], nrm = [0, d / L, h / L];
      var foot = [0, 0, d + 0.03], top = [0, h, 0.03];
      var feet = add(lerp3(foot, top, f), mul(nrm, 0.13));
      var tl = add(add(feet, mul(u, 0.95)), [-0.25, 0, 0]);
      kit.setQuad(kid, tl, [1, 0, 0], mul(u, -1));
      kid.style.width = (0.5 * S).toFixed(1) + 'px'; kid.style.height = (0.95 * S).toFixed(1) + 'px';
      if (trip) {
        var s = f * L - 0.03 * L;
        trip.textContent = st.mode === 'idle' && st.f === 0 ? 'Press Climb — watch the kid go up the ladder' : 'Climbed ' + fmt(Math.max(0, s), 2) + ' ' + unit + ' along the ladder · ' + fmt(Math.max(0, s * h / L), 2) + ' ' + unit + ' up the wall';
      }
    }

    function refresh() {
      var h = st.h, d = st.d, L = st.L;
      if (eqSym) {
        eqSym.textContent = '';
        [[nm.wall + '²', 'wall'], [' + ', ''], [nm.ground + '²', 'ground'], [' = ', ''], [nm.ladder + '²', 'lad']].forEach(function (x) { el('b', x[1] ? 'sc-eq__' + x[1] : '', eqSym, x[0]); });
        eqNum.textContent = '';
        [[fmt(h * h), 'wall'], [' + ', ''], [fmt(d * d), 'ground'], [' = ', ''], [fmt(L * L), 'lad']].forEach(function (x) { el('b', x[1] ? 'sc-eq__' + x[1] : '', eqNum, x[0]); });
      }
      var ang = Math.atan2(h, d) / DEG, safe = ang >= 70 && ang <= 80;
      if (gauge) {
        gaugePtr.style.left = (clamp(ang, 0, 90) / 90 * 100).toFixed(1) + '%';
        gauge.classList.toggle('is-safe', safe); gauge.classList.toggle('is-bad', !safe);
        gaugeTxt.textContent = fmt(ang, 0) + '° with the ground — ' + (safe ? 'safe ✔' : ang > 80 ? 'too steep: it could tip over backwards!' : 'too flat: the foot could slip!');
      }
      if (slider) slider.set(st.d, nm.ground + ' =');
    }

    // ---- climbing ----------------------------------------------------------
    function climb() {
      if (killClimb) { killClimb(); killClimb = null; }
      var up = st.mode !== 'top' && st.f < 0.999;
      var from = st.f, to = up ? 1 : 0, ms = Math.max(1200, Math.abs(to - from) * (up ? 5200 : 3200));
      st.mode = up ? 'up' : 'down'; kid.classList.add('is-climb'); kid.classList.remove('is-wave');
      climbB.textContent = '❚❚ Pause'; climbB.classList.add('is-on');
      killClimb = tween(ms, function (k) { var e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; st.f = from + (to - from) * (up ? k : e); placeKid(); }, function () {
        killClimb = null; kid.classList.remove('is-climb');
        if (up) { st.mode = 'top'; kid.classList.add('is-wave'); climbB.textContent = '↓ Climb down'; }
        else { st.mode = 'idle'; climbB.textContent = '▶ Climb'; }
        climbB.classList.remove('is-on'); placeKid();
      });
    }
    function pauseOrClimb() {
      if (killClimb) { killClimb(); killClimb = null; kid.classList.remove('is-climb'); climbB.textContent = st.f > 0.99 ? '↓ Climb down' : '▶ Continue'; climbB.classList.remove('is-on'); st.mode = st.f > 0.99 ? 'top' : 'idle'; return; }
      climb();
    }

    // ---- control panel ------------------------------------------------------
    var eq = el('div', 'anim-sc-eq', C.row1);
    eqSym = el('div', 'anim-sc-eq__s', eq); eqNum = el('div', 'anim-sc-eq__n', eq);
    slider = C.slider(C.row2, nm.ground + ' =', 0.1, 3, 0.05, st.d, function (v) { return fmt(v) + ' ' + unit + '  (slide the foot)'; }, function (v) { setD(v); build(); });
    climbB = C.btn(C.row3, '▶ Climb', pauseOrClimb, 'anim-sc-b--go'); C.row3.insertBefore(climbB, C.viewsEl);
    var triB = C.btn(C.row3, 'Triangle', function () { st.tri = !st.tri; triB.classList.toggle('is-on', st.tri); build(); }, 'anim-sc-b--toggle is-on');
    C.row3.insertBefore(triB, C.viewsEl);
    // safe-angle meter (top-left, under the X/Y read-out)
    gauge = el('div', 'anim-sc-gauge', C.row1);
    el('div', 'anim-sc-gauge__t', gauge, 'Ladder angle');
    var bar = el('div', 'anim-sc-gauge__bar', gauge); el('i', 'anim-sc-gauge__zone', bar); gaugePtr = el('i', 'anim-sc-gauge__ptr', bar);
    gaugeTxt = el('div', 'anim-sc-gauge__m', gauge);
    trip = el('div', 'anim-sc-trip', C.row3);

    function reset() { source(); if (killClimb) { killClimb(); killClimb = null; } st.f = 0; st.mode = 'idle'; if (climbB) { climbB.textContent = '▶ Climb'; climbB.classList.remove('is-on'); } slider.range(0.1, Math.max(0.5, st.L - 0.1)); layout(); }
    source(); slider.range(0.1, Math.max(0.5, st.L - 0.1)); layout();
    C.onHide = function () { if (killClimb) { killClimb(); killClimb = null; kid.classList.remove('is-climb'); } };
    return {
      C: C, el: C.root3d, initialView: [-14, -26],
      rebuild: function () { reset(); },
      onSourceChange: function () { reset(); },
      destroy: C.destroy
    };
  }

  // =========================================================================== pole
  function poleScene(cfg, ctx) {
    var eng = ctx.eng, C = chrome(ctx, cfg), base = C.base, kit;
    var unit = cfg.unit || 'm';
    var nm = ext({ pole: 'AB', ground: 'BG', cable: 'AG' }, cfg.names);
    var lt = ext({ top: 'A', base: 'B', peg: 'G' }, cfg.letters || {});
    var st = { h: num(cfg.h, 24), d: num(cfg.d, 14), tri: true, f: 0, mode: 'idle' };
    var dyn, bird, eqSym, eqNum, slider, flyB, trip, killFly = null;
    var dMax = st.d * 2.2;

    function layout() {
      var W = Math.max(280, eng.view.W), H = Math.max(220, eng.view.H), h = st.h;
      var span = Math.max(h * 1.0, dMax * 0.9);
      var S = Math.min(0.54 * H / h, 0.8 * W / (dMax + 6));
      kit = new Kit(S, C);
      base.textContent = '';
      base.style.transform = 'translate(' + (-(dMax * 0.26) * S).toFixed(0) + 'px,' + (h * S * 0.42 + 4).toFixed(0) + 'px)';
      var gw = dMax + 10, gd = Math.max(14, h * 0.8);
      kit.quad(base, 'sc-ground sc-lit', [-5, 0, -gd / 2], [1, 0, 0], [0, 0, 1], gw, gd);
      kit.quad(base, 'sc-path sc-path--x sc-lit', [-5, 0.004, -0.9], [1, 0, 0], [0, 0, 1], gw, 1.8);
      kit.bill(base, [-3.4, 0, -gd * 0.3], 'sc-tree', tree(), 'b');
      kit.bill(base, [dMax * 0.92, 0, -gd * 0.32], 'sc-tree', tree(), 'b');
      kit.bill(base, [dMax * 0.7, 0, gd * 0.3], 'sc-bush', bush(), 'b');
      dyn = el('div', 'sc-grp', base);
      bird = kit.bill(base, [0, 0, 0], 'sc-bird', birdArt(), 'c'); bird.parentNode.hidden = true;
      build();
    }
    function tree() { var t = el('div', 'sc-treeart'); el('i', 'sc-treeart__trunk', t); el('i', 'sc-treeart__f sc-treeart__f--1', t); el('i', 'sc-treeart__f sc-treeart__f--2', t); el('i', 'sc-treeart__f sc-treeart__f--3', t); t.style.fontSize = '1.8em'; return t; }
    function bush() { var t = el('div', 'sc-bushart'); el('i', 'sc-bushart__a', t); el('i', 'sc-bushart__b', t); el('i', 'sc-bushart__c', t); t.style.fontSize = '2.2em'; return t; }
    function birdArt() { var b = el('div', 'sc-birdart'); el('i', 'sc-birdart__body', b); el('i', 'sc-birdart__wing sc-birdart__wing--l', b); el('i', 'sc-birdart__wing sc-birdart__wing--r', b); el('i', 'sc-birdart__beak', b); el('i', 'sc-birdart__eye', b); b.style.fontSize = '2.4em'; return b; }

    function build() {
      var S = kit.S, h = st.h, d = st.d, L = Math.hypot(h, d);
      dyn.textContent = ''; C.clearTags();
      if (st.tri) { var tq = kit.quad(dyn, 'sc-tri', [0, h, 0], [1, 0, 0], [0, -1, 0], d, h); tq.style.clipPath = 'polygon(0 0, 0 100%, 100% 100%)'; }
      kit.quad(dyn, 'sc-ra', [0, Math.min(2, h * 0.1), 0], [1, 0, 0], [0, -1, 0], Math.min(2, h * 0.1), Math.min(2, h * 0.1));
      kit.bar(dyn, 'sc-pole', [0, 0, 0], [0, h, 0], Math.max(7, S * 0.5));
      kit.bar(dyn, 'sc-cable', [0, h, 0], [d, 0.05, 0], Math.max(3, S * 0.13));
      kit.bar(dyn, 'sc-pad', [d - 0.2, 0.1, 0], [d + 0.2, 0.1, 0], Math.max(8, S * 0.5));
      var zo = 1.6;
      kit.bar(dyn, 'sc-dim sc-dim--wall', [-zo, 0.01, 0], [-zo, h, 0], 6);
      kit.bar(dyn, 'sc-cap sc-cap--wall', [-zo - 0.5, 0.01, 0], [-zo + 0.5, 0.01, 0], 3);
      kit.bar(dyn, 'sc-cap sc-cap--wall', [-zo - 0.5, h, 0], [-zo + 0.5, h, 0], 3);
      kit.bar(dyn, 'sc-dim sc-dim--ground', [0, 0.012, zo], [d, 0.012, zo], 6);
      kit.bar(dyn, 'sc-cap sc-cap--ground', [0, 0.012, zo - 0.5], [0, 0.012, zo + 0.5], 3);
      kit.bar(dyn, 'sc-cap sc-cap--ground', [d, 0.012, zo - 0.5], [d, 0.012, zo + 0.5], 3);
      var W8 = ext({ pole: 'height of the pole', ground: 'pole to the peg', cable: 'the cable' }, cfg.words);
      kit.pill(dyn, [-zo, h / 2, 0], 'sc-pill--wall', nm.pole + ' = ' + fmt(h) + ' ' + unit, W8.pole, 'l');
      kit.pill(dyn, [d / 2, 0.012, zo], 'sc-pill--ground', nm.ground + ' = ' + fmt(d) + ' ' + unit, W8.ground, 'd');
      kit.pill(dyn, [d / 2, h / 2, 0], 'sc-pill--lad', nm.cable + ' = ' + fmt(L) + ' ' + unit, W8.cable, 'r');
      kit.tag(dyn, [0, h + 1.7, 0], 'sc-pt', lt.top); kit.tag(dyn, [-0.9, 1.5, 0.6], 'sc-pt', lt.base); kit.tag(dyn, [d + 0.5, 1.5, 0.6], 'sc-pt', lt.peg);
      var flag = el('div', 'sc-flagart'); el('i', 'sc-flagart__pole', flag); el('i', 'sc-flagart__cloth', flag); flag.style.fontSize = '1.2em';
      kit.bill(dyn, [0.9, h - 0.2, 0], 'sc-flag', flag, 'c');
      place(); refresh(); C.place();
    }
    function place() {
      var h = st.h, d = st.d, L = Math.hypot(h, d);
      var p = lerp3([d, 0.4, 0], [0, h + 0.2, 0], st.f);
      kit.moveBill(bird, p);
      if (trip) trip.textContent = st.f === 0 && st.mode === 'idle' ? 'Press Fly — the bird follows the cable' : 'The bird has flown ' + fmt(st.f * L) + ' ' + unit + ' along the cable';
    }
    function refresh() {
      var h = st.h, d = st.d, L = Math.hypot(h, d);
      eqSym.textContent = '';
      [[nm.pole + '²', 'wall'], [' + ', ''], [nm.ground + '²', 'ground'], [' = ', ''], [nm.cable + '²', 'lad']].forEach(function (x) { el('b', x[1] ? 'sc-eq__' + x[1] : '', eqSym, x[0]); });
      eqNum.textContent = '';
      [[fmt(h * h, 1), 'wall'], [' + ', ''], [fmt(d * d, 1), 'ground'], [' = ', ''], [fmt(L * L, 1), 'lad'], [' → ' + nm.cable + ' = ' + fmt(L, 1) + ' ' + unit, '']].forEach(function (x) { el('b', x[1] ? 'sc-eq__' + x[1] : '', eqNum, x[0]); });
      slider.set(st.d, nm.ground + ' =');
    }
    function fly() {
      if (killFly) { killFly(); killFly = null; bird.parentNode.hidden = false; flyB.textContent = '▶ Fly'; flyB.classList.remove('is-on'); return; }
      bird.parentNode.hidden = false; st.f = 0; st.mode = 'up'; bird.classList.add('is-fly'); flyB.textContent = '❚❚ Stop'; flyB.classList.add('is-on');
      killFly = tween(Math.max(2500, Math.hypot(st.h, st.d) * 150), function (k) { st.f = k; place(); }, function () {
        killFly = null; st.mode = 'idle'; bird.classList.remove('is-fly'); flyB.textContent = '▶ Fly again'; flyB.classList.remove('is-on'); place();
      });
    }

    var eq = el('div', 'anim-sc-eq', C.row1); eqSym = el('div', 'anim-sc-eq__s', eq); eqNum = el('div', 'anim-sc-eq__n', eq);
    trip = el('div', 'anim-sc-trip', C.row1);
    slider = C.slider(C.row2, nm.ground + ' =', 3, dMax, 0.5, st.d, function (v) { return fmt(v, 1) + ' ' + unit + '  (move the anchor)'; }, function (v) { st.d = v; build(); });
    flyB = C.btn(C.row3, '▶ Fly', fly, 'anim-sc-b--go'); C.row3.insertBefore(flyB, C.viewsEl);
    var triB = C.btn(C.row3, 'Triangle', function () { st.tri = !st.tri; triB.classList.toggle('is-on', st.tri); build(); }, 'anim-sc-b--toggle is-on');
    C.row3.insertBefore(triB, C.viewsEl);
    layout();
    C.onHide = function () { if (killFly) { killFly(); killFly = null; bird.classList.remove('is-fly'); flyB.textContent = '▶ Fly'; flyB.classList.remove('is-on'); } };
    return { C: C, el: C.root3d, initialView: [-10, -16], rebuild: function () { layout(); }, destroy: C.destroy };
  }

  // =========================================================================== tent
  function tentScene(cfg, ctx) {
    var eng = ctx.eng, C = chrome(ctx, cfg), base = C.base, kit;
    var unit = cfg.unit || 'm';
    var nm = ext({ half: 'UH', height: 'TH', slant: 'TU' }, cfg.names);
    var lt = ext({ left: 'U', right: 'V', top: 'T', mid: 'H' }, cfg.letters || {});
    var st = { half: num(cfg.half, 2.5), h: num(cfg.h, 6), tri: true };
    var dyn, eqSym, eqNum, slider;
    var len = num(cfg.length, 4.5);

    function layout() {
      var W = Math.max(280, eng.view.W), H = Math.max(220, eng.view.H);
      var S = Math.min(0.62 * H / 9, 0.7 * W / 12);
      kit = new Kit(S, C);
      base.textContent = '';
      base.style.transform = 'translateY(' + (4 * S * 0.5 + 6).toFixed(0) + 'px)';
      kit.quad(base, 'sc-ground sc-lit', [-7.5, 0, -6], [1, 0, 0], [0, 0, 1], 15, 12);
      var fire = el('div', 'sc-fireart'); el('i', 'sc-fireart__log', fire); el('i', 'sc-fireart__f sc-fireart__f--1', fire); el('i', 'sc-fireart__f sc-fireart__f--2', fire); el('i', 'sc-fireart__f sc-fireart__f--3', fire); fire.style.fontSize = '1.4em';
      kit.bill(base, [st.half + 2.8, 0, len / 2 + 1.5], 'sc-fire', fire, 'b');
      kit.bill(base, [-st.half - 3.4, 0, -1.2], 'sc-tree', tree(), 'b');
      kit.bill(base, [st.half + 4, 0, -2.6], 'sc-tree', tree(), 'b');
      dyn = el('div', 'sc-grp', base);
      build();
    }
    function tree() { var t = el('div', 'sc-treeart'); el('i', 'sc-treeart__trunk', t); el('i', 'sc-treeart__f sc-treeart__f--1', t); el('i', 'sc-treeart__f sc-treeart__f--2', t); el('i', 'sc-treeart__f sc-treeart__f--3', t); t.style.fontSize = '2.4em'; return t; }
    function build() {
      var S = kit.S, a = st.half, h = st.h, sl = Math.hypot(a, h), z = len / 2;
      dyn.textContent = ''; C.clearTags();
      // two canvas slopes + back triangle + front triangle
      var ul = norm([a, h, 0]), ur = norm([a, -h, 0]);
      kit.quad(dyn, 'sc-canvas sc-canvas--l sc-lit', [-a, 0, -z], ul, [0, 0, 1], sl, len);
      kit.quad(dyn, 'sc-canvas sc-canvas--r sc-lit', [0, h, -z], ur, [0, 0, 1], sl, len);
      var back = kit.quad(dyn, 'sc-gable sc-lit', [-a, h, -z], [1, 0, 0], [0, -1, 0], 2 * a, h); back.style.clipPath = 'polygon(50% 0, 0 100%, 100% 100%)';
      var front = kit.quad(dyn, 'sc-gable sc-gable--front', [-a, h, z], [1, 0, 0], [0, -1, 0], 2 * a, h); front.style.clipPath = 'polygon(50% 0, 0 100%, 100% 100%)';
      var door = kit.quad(dyn, 'sc-door', [-a, h, z + 0.012], [1, 0, 0], [0, -1, 0], 2 * a, h); door.style.clipPath = 'polygon(50% 26%, 30% 100%, 70% 100%)';
      kit.bar(dyn, 'sc-poleb', [0, 0, z], [0, h, z], Math.max(5, S * 0.12));
      kit.bar(dyn, 'sc-ridge', [0, h, -z], [0, h, z], Math.max(4, S * 0.1));
      [[-a, z], [a, z], [-a, -z], [a, -z]].forEach(function (q) { kit.bar(dyn, 'sc-peg', [q[0], 0.02, q[1]], [q[0] * 1.14, 0.02, q[1] + (q[1] > 0 ? 0.25 : -0.25)], Math.max(4, S * 0.1)); });
      if (st.tri) { var tq = kit.quad(dyn, 'sc-tri sc-tri--tent', [-a, h, z + 0.03], [1, 0, 0], [0, -1, 0], 2 * a, h); tq.style.clipPath = 'polygon(50% 0, 0 100%, 50% 100%)'; }
      var f = z + 0.06;
      kit.bar(dyn, 'sc-dim sc-dim--wall', [0, 0.02, f], [0, h, f], 6);
      kit.bar(dyn, 'sc-dim sc-dim--ground', [0, 0.02, f], [a, 0.02, f], 6);
      kit.bar(dyn, 'sc-dim sc-dim--lad', [a, 0.02, f], [0, h, f], 5);
      var W8 = ext({ height: 'height of the tent', half: 'half the width', slant: 'the slanting side' }, cfg.words);
      kit.pill(dyn, [0, h * 0.5, f], 'sc-pill--wall', nm.height + ' = ' + fmt(h) + ' ' + unit, W8.height, 'l');
      kit.pill(dyn, [a * 0.5, 0.02, f], 'sc-pill--ground', nm.half + ' = ' + fmt(a) + ' ' + unit, W8.half, 'd');
      kit.pill(dyn, [a / 2, h / 2, f], 'sc-pill--lad', nm.slant + ' = ' + fmt(sl) + ' ' + unit, W8.slant, 'r');
      kit.tag(dyn, [0, h + 0.55, f], 'sc-pt', lt.top); kit.tag(dyn, [-a - 0.4, 0.4, f + 0.2], 'sc-pt', lt.left); kit.tag(dyn, [a + 0.4, 0.4, f + 0.2], 'sc-pt', lt.right); kit.tag(dyn, [-0.4, 0.4, f + 0.3], 'sc-pt', lt.mid);
      refresh(); C.place();
    }
    function refresh() {
      var a = st.half, h = st.h, sl = Math.hypot(a, h);
      eqSym.textContent = '';
      [[nm.half + '²', 'ground'], [' + ', ''], [nm.height + '²', 'wall'], [' = ', ''], [nm.slant + '²', 'lad']].forEach(function (x) { el('b', x[1] ? 'sc-eq__' + x[1] : '', eqSym, x[0]); });
      eqNum.textContent = '';
      [[fmt(a * a), 'ground'], [' + ', ''], [fmt(h * h), 'wall'], [' = ', ''], [fmt(sl * sl), 'lad'], [' → ' + nm.slant + ' = ' + fmt(sl) + ' ' + unit, '']].forEach(function (x) { el('b', x[1] ? 'sc-eq__' + x[1] : '', eqNum, x[0]); });
      slider.set(st.h, nm.height + ' =');
    }
    var eq = el('div', 'anim-sc-eq', C.row1); eqSym = el('div', 'anim-sc-eq__s', eq); eqNum = el('div', 'anim-sc-eq__n', eq);
    slider = C.slider(C.row2, nm.height + ' =', 2, 9, 0.5, st.h, function (v) { return fmt(v, 1) + ' ' + unit + '  (raise the pole)'; }, function (v) { st.h = v; build(); });
    var triB = C.btn(C.row3, 'Triangle', function () { st.tri = !st.tri; triB.classList.toggle('is-on', st.tri); build(); }, 'anim-sc-b--toggle is-on');
    C.row3.insertBefore(triB, C.viewsEl);
    C.onNight = function (on) { /* the CSS lights the tent and the fire */ };
    layout();
    return { C: C, el: C.root3d, initialView: [-14, -28], rebuild: function () { layout(); }, destroy: C.destroy };
  }

  // ============================================================================ map
  function mapScene(cfg, ctx) {
    var eng = ctx.eng, C = chrome(ctx, cfg), base = C.base, kit;
    var unit = cfg.unit || 'km';
    var D = (eng.spec && eng.spec.derived) || {}, P = {}, names = [];
    Object.keys(D).forEach(function (k) {
      if (Array.isArray(D[k]) && D[k].length === 2 && isFinite(D[k][0]) && isFinite(D[k][1])) { var nme = k.replace(/^p_/, ''); P[nme] = D[k]; names.push(nme); }
    });
    var routes = cfg.routes || [], ties = cfg.ties || [], hide = cfg.hidePoints || [];
    var st = { ties: false, sailed: 0 };
    var dyn, boats = [], tieEls = [], killSail = null, sailB, tieB, trip;
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    names.forEach(function (n) { minX = Math.min(minX, P[n][0]); maxX = Math.max(maxX, P[n][0]); minY = Math.min(minY, P[n][1]); maxY = Math.max(maxY, P[n][1]); });
    var padK = 0.28, spanX = (maxX - minX) || 1, spanY = (maxY - minY) || 1;
    var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    function M(n) { var p = P[n]; return [p[0] - cx, 0, -(p[1] - cy)]; }          // map (east, north) → model (x, 0, z)

    function niceStep(x) { var p = Math.pow(10, Math.floor(Math.log(x) / Math.LN10)), m = x / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
    function pn(q) { return String(q).replace(/^p_/, ''); }
    function roleOf(rt, ri) { return rt.role || (ri ? 'legB' : 'legA'); }
    function boatCls(role) { return role === 'legB' ? 'sc-pill--boatB' : role === 'hyp' ? 'sc-pill--boatH' : 'sc-pill--boatA'; }

    function layout() {
      var W = Math.max(280, eng.view.W), H = Math.max(220, eng.view.H);
      var wx = spanX * (1 + padK * 2), wz = spanY * (1 + padK * 2);
      var S = Math.min(0.94 * W / wx, 0.86 * H / (wz * 0.85));
      kit = new Kit(S, C); C.clearTags();
      base.textContent = '';
      base.style.transform = 'translateY(6px)';
      var step = niceStep(Math.max(spanX, spanY) / 5);
      var sea = kit.quad(base, 'sc-sea', [-wx / 2, 0, -wz / 2], [1, 0, 0], [0, 0, 1], wx, wz);
      sea.style.setProperty('--grid', (step * S).toFixed(1) + 'px');
      kit.tag(base, [-wx / 2 + step * 0.25, 0.01, wz / 2 - step * 0.25], 'sc-scale', '1 square = ' + fmt(step, 0) + ' ' + unit, 'r');
      // compass rose lying on the water
      var rose = kit.quad(base, 'sc-rose', [wx / 2 - spanX * 0.2, 0.01, -wz / 2 + spanY * 0.06], [1, 0, 0], [0, 0, 1], spanX * 0.16, spanX * 0.16);
      ['N', 'E', 'S', 'W'].forEach(function (c) { el('b', 'sc-rose__' + c, rose, c); });
      dyn = el('div', 'sc-grp', base);
      var rw = Math.max(0.012 * spanX, 6 / S);
      routes.forEach(function (rt, ri) {
        var role = roleOf(rt, ri), ids = (rt.pts || []).map(pn), pts = ids.map(M);
        for (var i = 0; i + 1 < pts.length; i++) {
          kit.ribbon(dyn, 'sc-route sc-route--' + role, pts[i], pts[i + 1], rw);
          var len = Math.hypot(P[ids[i + 1]][0] - P[ids[i]][0], P[ids[i + 1]][1] - P[ids[i]][1]);
          kit.pill(dyn, lerp3(pts[i], pts[i + 1], 0.5), boatCls(role), ids[i] + ids[i + 1] + ' = ' + fmt(len, 0) + ' ' + unit, null, 'u');
        }
      });
      tieEls = [];
      ties.forEach(function (tp, ti) {
        var n0 = pn(tp[0]), n1 = pn(tp[1]), a = M(n0), b = M(n1);
        var q = kit.ribbon(dyn, 'sc-tie', a, b, rw * 1.2); tieEls[ti] = q;
        var dd = Math.hypot(P[n0][0] - P[n1][0], P[n0][1] - P[n1][1]);
        var lb = kit.pill(dyn, lerp3(a, b, 0.5), 'sc-pill--ans', n0 + n1 + ' = ' + fmt(dd, 1) + ' ' + unit, null, 'd');
        lb.e.style.display = st.ties ? '' : 'none'; tieEls[ti]._lab = lb; q.style.display = st.ties ? '' : 'none';
      });
      var dr = 6 / S;                                           // a 6-pixel disc marks every port on the water
      names.forEach(function (n) {
        if (hide.indexOf(n) >= 0) return;
        var m = M(n);
        kit.quad(dyn, 'sc-dot', [m[0] - dr, 0.02, m[2] - dr], [1, 0, 0], [0, 0, 1], dr * 2, dr * 2);
        kit.tag(dyn, m, 'sc-pt sc-pt--port', n, 'u');
      });
      boats = routes.map(function (rt, ri) {
        var role = roleOf(rt, ri);
        var art = el('div', 'sc-boatart sc-boatart--' + role);
        el('i', 'sc-boatart__sail', art); el('i', 'sc-boatart__hull', art); el('i', 'sc-boatart__flag', art);
        var b = kit.bill(dyn, M(pn(rt.pts[0])), 'sc-boat', art, 'b');
        b.style.fontSize = '17px';
        b._tag = kit.tag(dyn, M(pn(rt.pts[0])), 'sc-pill sc-pill--cap ' + boatCls(role), rt.name || ('Boat ' + (ri + 1)), null, 'u');
        b._tag.e.classList.add('sc-tag--boat');
        return b;
      });
      moveBoats(st.sailed);
      if (trip) trip.textContent = st.sailed ? '' : 'Press Sail — the boats set off from the first port';
      C.place();
    }
    function routeLen(rt) { var L = 0, pts = rt.pts.map(function (q) { return String(q).replace(/^p_/, ''); }); for (var i = 0; i + 1 < pts.length; i++) L += Math.hypot(P[pts[i + 1]][0] - P[pts[i]][0], P[pts[i + 1]][1] - P[pts[i]][1]); return L; }
    function moveBoats(k) {
      var maxL = Math.max.apply(null, routes.map(routeLen).concat([1]));
      routes.forEach(function (rt, ri) {
        var pts = rt.pts.map(function (q) { return String(q).replace(/^p_/, ''); }), total = routeLen(rt), dist = Math.min(1, k * maxL / total) * total, acc = 0, p = M(pts[0]);
        for (var i = 0; i + 1 < pts.length; i++) {
          var seg = Math.hypot(P[pts[i + 1]][0] - P[pts[i]][0], P[pts[i + 1]][1] - P[pts[i]][1]);
          if (dist <= acc + seg + 1e-9) { p = lerp3(M(pts[i]), M(pts[i + 1]), seg ? (dist - acc) / seg : 0); break; }
          acc += seg; p = M(pts[i + 1]);
        }
        kit.moveBill(boats[ri], p);
        var c = kit.css(p), t = boats[ri]._tag; t.a.style.transform = 'translate3d(' + r2(c[0]) + 'px,' + r2(c[1]) + 'px,' + r2(c[2]) + 'px)';
      });
      C.place();
    }
    function sail() {
      if (killSail) { killSail(); killSail = null; sailB.textContent = '▶ Sail'; sailB.classList.remove('is-on'); return; }
      st.sailed = 0; sailB.textContent = '❚❚ Stop'; sailB.classList.add('is-on');
      var maxL = Math.max.apply(null, routes.map(routeLen).concat([1]));
      killSail = tween(Math.max(3500, maxL * 70), function (k) { st.sailed = k; moveBoats(k); if (trip) trip.textContent = 'Sailed ' + fmt(k * maxL, 0) + ' ' + unit; }, function () {
        killSail = null; sailB.textContent = '▶ Sail again'; sailB.classList.remove('is-on');
        if (!st.ties) toggleTies(true);
      });
    }
    function toggleTies(on) {
      st.ties = on == null ? !st.ties : on; tieB.classList.toggle('is-on', st.ties);
      tieEls.forEach(function (q) { q.style.display = st.ties ? '' : 'none'; if (q._lab) q._lab.e.style.display = st.ties ? '' : 'none'; });
      C.place();
    }
    trip = el('div', 'anim-sc-trip', C.row1);
    sailB = C.btn(C.row3, '▶ Sail', sail, 'anim-sc-b--go'); C.row3.insertBefore(sailB, C.viewsEl);
    tieB = C.btn(C.row3, 'Shortest distance', function () { toggleTies(); }, 'anim-sc-b--toggle'); C.row3.insertBefore(tieB, C.viewsEl);
    C.row2.hidden = true;
    layout();
    C.onHide = function () { if (killSail) { killSail(); killSail = null; sailB.textContent = '▶ Sail'; sailB.classList.remove('is-on'); } };
    return { C: C, el: C.root3d, initialView: cfg.view || [-58, 0], rebuild: function () { layout(); }, destroy: C.destroy };
  }

  // ======================================================================== public
  var BUILDERS = { ladder: ladderScene, pole: poleScene, tent: tentScene, map: mapScene };
  function create(cfg, ctx) {
    if (typeof cfg === 'string') cfg = { type: cfg };
    if (!cfg || !BUILDERS[cfg.type]) return null;
    try {
      var sc = BUILDERS[cfg.type](cfg, ctx);
      var C = sc.C;
      return {
        el: sc.el, initialView: sc.initialView,
        show: C.show, hide: function () { C.show(false); },
        rebuild: sc.rebuild, onView: C.onView, onSourceChange: sc.onSourceChange || null, destroy: sc.destroy
      };
    } catch (e) { if (root.console) root.console.warn('[anim] scene failed', e); return null; }
  }
  root.WHA_AnimScenes = { create: create, types: Object.keys(BUILDERS) };
})(typeof window !== 'undefined' ? window : this);
