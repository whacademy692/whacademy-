/**
 * anim-engine.js — W.H. Academy · Animation Lab (core)
 * ----------------------------------------------------------------------------
 * A spec-driven interactive animation engine. An animation is a JSON file
 * (see games/anim-data/…) describing:
 *
 *   params     values the student can change (sliders, toggles, choices)
 *   derived    computed values and named points  ("c": "sqrt(a^2+b^2)", "A": [a, 0])
 *   roles      semantic colours ("perp", "base", "hyp") — shared by lines, labels,
 *              formulas and the legend, and re-colourable by the student
 *   shapes     the drawing (segments, polygons, squares, arcs, angles, plots, …)
 *   handles    draggable points that write back into params
 *   steps      the guided lesson: narration + what appears / tweens / pulses
 *   formulas   live formulas that substitute the current numbers
 *   challenges "tap the hypotenuse", "find h" — checked against the live maths
 *
 * This file is the model + renderer loop. Shape types live in anim-shapes.js
 * and the player UI (sliders, tabs, colour picker, controls) in anim-ui.js.
 *
 * Safety: specs are DATA. Maths goes through anim-expr.js (no eval), text is
 * only ever inserted with textContent / KaTeX, and the engine never creates a
 * link or loads an external resource — an animation is a sealed box.
 * ----------------------------------------------------------------------------
 */
(function (root) {
  'use strict';

  var X = root.WHA_AnimExpr;
  if (!X) throw new Error('anim-engine.js needs anim-expr.js loaded first');

  var SVGNS = 'http://www.w3.org/2000/svg';
  var NEUTRAL = ['ink', 'muted', 'grid', 'accent', 'surface'];
  var BUILTIN_LOCALS = ['i', 'n', 'ang', 'len', 'px', 'py', 'x', 'y', 't', 'area'];

  var PALETTES = {
    cb: ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#F0E442', '#4b5563'],
    contrast: ['#d00000', '#0033cc', '#007a33', '#8a2be2', '#b36b00', '#006d77', '#c2185b', '#222222'],
    soft: ['#fb7185', '#60a5fa', '#4ade80', '#fbbf24', '#a78bfa', '#22d3ee', '#f472b6', '#94a3b8']
  };
  var SWATCHES = ['#e11d48', '#f97316', '#f59e0b', '#16a34a', '#0d9488', '#0891b2', '#2563eb', '#4f46e5', '#7c3aed', '#c026d3', '#475569', '#111827'];

  // ---------------------------------------------------------------- helpers
  function svg(tag, attrs, parent) {
    var el = document.createElementNS(SVGNS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  function html(tag, cls, parent) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (parent) parent.appendChild(el);
    return el;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function num(x, d) { return typeof x === 'number' && isFinite(x) ? x : d; }
  function f2(n) { return Math.round(n * 100) / 100; }
  function snapTo(v, step, min) {
    if (!step || step <= 0) return v;
    return +(Math.round((v - min) / step) * step + min).toFixed(8);
  }
  function reducedMotion() {
    try { if (typeof Animations !== 'undefined' && Animations.reducedMotionPreferred) return !!Animations.reducedMotionPreferred(); } catch (e) { /* fall through */ }
    return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function hexOk(s) { return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s); }

  // 2-D affine matrices as [a,b,c,d,e,f]:  x' = a*x + c*y + e ;  y' = b*x + d*y + f
  var M_ID = [1, 0, 0, 1, 0, 0];
  function mmul(A, B) { // apply B first, then A
    return [
      A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
      A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
      A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]
    ];
  }
  function mTranslate(dx, dy) { return [1, 0, 0, 1, dx, dy]; }
  function mRotate(deg) { var r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [c, s, -s, c, 0, 0]; }
  function mScale(k) { return [k, 0, 0, k, 0, 0]; }
  function mScaleOf(M) { return Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2])) || 1; }

  // ------------------------------------------------------------ shape registry
  var SHAPES = Object.create(null);

  // ============================================================== LABEL (HTML)
  function Label(eng, node, ld) {
    if (typeof ld === 'string') ld = { text: ld };
    this.eng = eng; this.node = node; this.ld = ld || {};
    this.tpl = this.ld.text !== undefined ? String(this.ld.text) : '';
    this.el = html('div', 'anim-label' + (this.ld.bg === false ? '' : ' anim-label--halo') + (this.ld.keep ? ' is-keep' : ''), eng.labelsEl);
    var role = this.ld.role || node.role || 'ink';
    this.el.style.color = eng.roleCss(role, 'label');
    var size = this.ld.size;
    var em = size === 's' ? 0.82 : size === 'l' ? 1.25 : size === 'xl' ? 1.55 : (typeof size === 'number' ? size : 1);
    this.el.style.fontSize = 'calc(var(--anim-fs, 1) * ' + em + 'em)';
    if (this.ld.bold !== false) this.el.style.fontWeight = '700';
    // optional: label.visible = expression (e.g. "zs < 0.5") — lets a shape swap its caption
    this.visFn = this.ld.visible !== undefined ? eng.cx(this.ld.visible, node.where + '.label.visible') : null;
    this._shown = true;
  }
  Label.prototype.setShown = function (on) {
    if (on === this._shown) return;
    this._shown = on;
    this.el.style.display = on ? '' : 'none';
  };
  Label.prototype.put = function (x, y, env, alpha) {
    var v = this.eng.view;
    if (!(x === x) || !(y === y)) { this.setShown(false); return; }
    if (this.visFn && !(this.visFn(env) > 0.5)) { this.setShown(false); return; }
    this.setShown(true);
    // keep the whole label on the stage: clamp by half its measured size (falls back to the old 16 / 12 px margin)
    var hw = Math.max(16, (this._w || 0) / 2 + 4), hh = Math.max(12, (this._h || 0) / 2 + 3);
    x = clamp(x + num(this.ld.dx, 0), hw, Math.max(hw, v.W - hw));
    y = clamp(y + num(this.ld.dy, 0), hh, Math.max(hh, v.H - hh));
    this.el.style.transform = 'translate(' + f2(x) + 'px,' + f2(y) + 'px) translate(-50%,-50%)';
    this.el.style.opacity = alpha < 0.999 ? alpha.toFixed(3) : '';
    this.eng.renderRich(this.el, this.tpl, env);
    // remember the rendered size (re-measured only when the text changed) so callers can keep clear of lines
    if (this.el.__rk !== this._mk) {
      var ow = this._w, oh = this._h;
      this._mk = this.el.__rk; this._w = this.el.offsetWidth; this._h = this.el.offsetHeight;
      if (ow !== this._w || oh !== this._h) this.eng.invalidate();   // callers placed this frame with the old size: draw once more
    }
  };
  /** Half the label's size measured along the direction (nx, ny): how far its centre must sit from a line to clear it. */
  Label.prototype.ext = function (nx, ny) {
    return Math.abs(nx) * (this._w || 44) / 2 + Math.abs(ny) * (this._h || 22) / 2;
  };
  Label.prototype.destroy = function () { if (this.el.parentNode) this.el.parentNode.removeChild(this.el); };

  // ================================================================== NODE
  var autoId = 0;
  function Node(eng, def, parentG, where, topLevel) {
    this.eng = eng; this.def = def; this.type = def.type;
    this.id = def.id || (topLevel ? '_n' + (++autoId) : null);
    this.role = def.role || null; this.tag = def.tag || null;
    this.where = where;
    this.g = svg('g', { 'class': 'anim-shape anim-' + def.type });
    if (def.id) this.g.setAttribute('data-id', def.id);
    if (this.role) this.g.setAttribute('data-role', this.role);
    if (def.pick) this.g.setAttribute('data-pick', '1');
    if (def.hint) { var t = svg('title'); t.textContent = String(def.hint); this.g.appendChild(t); }
    this.visFn = def.visible !== undefined ? eng.cx(def.visible, where + '.visible') : null;
    this.opFn = def.opacity !== undefined ? eng.cx(def.opacity, where + '.opacity') : null;
    this.vis = { o: 1, d: 1, s: 1 };
    this.labels = [];
    this.dimmed = false;
    this.appearIdx = null; this.disappearIdx = null;
    this._on = true;
    (parentG || eng.layers[def.layer] || eng.layers.mid).appendChild(this.g);
    var factory = SHAPES[def.type];
    if (!factory) {
      eng.issue('error', where, 'Unknown shape type "' + def.type + '"');
      this.inst = { update: function () { return false; } };
    } else {
      this.inst = factory(def, eng, this, where) || { update: function () { return false; } };
    }
  }
  Node.prototype.addLabel = function (ld) {
    var l = new Label(this.eng, this, ld);
    this.labels.push(l);
    return l;
  };
  Node.prototype._setOn = function (on) {
    if (on === this._on) return;
    this._on = on;
    this.g.style.display = on ? '' : 'none';
    if (!on) for (var i = 0; i < this.labels.length; i++) this.labels[i].setShown(false);
  };
  Node.prototype.update = function (c) {
    var eng = this.eng, env = c.env, v = this.vis;
    var shown = this.visFn ? this.visFn(env) : 1;
    var ut = this.def.uiToggle;
    if (ut && eng.ui[ut] === false) shown = 0;
    // spotlight dimming eases in/out instead of snapping
    var dt = this.dimmed ? 0.16 : 1;
    if (this._dk === undefined) this._dk = dt;
    if (this._dk !== dt) {
      this._dk += (dt - this._dk) * 0.3;
      if (Math.abs(this._dk - dt) < 0.01) this._dk = dt; else eng._moving = true;
    }
    var o = v.o * (this.opFn ? this.opFn(env) : 1) * this._dk;
    var on = shown > 0.5 && o > 0.003;
    this._setOn(on);
    if (!on) return;
    this.g.style.opacity = o < 0.999 ? o.toFixed(3) : '';
    this.g.style.transform = v.s < 0.999 ? 'scale(' + v.s.toFixed(3) + ')' : '';
    var prevAlpha = c.alpha, prevD = c.d;
    c.alpha = prevAlpha * o; c.d = v.d;
    var ok = this.inst.update(c);
    c.alpha = prevAlpha; c.d = prevD;
    if (ok === false) this._setOn(false);
  };
  Node.prototype.destroy = function () {
    for (var i = 0; i < this.labels.length; i++) this.labels[i].destroy();
    if (this.inst && this.inst.destroy) this.inst.destroy();
    if (this.g.parentNode) this.g.parentNode.removeChild(this.g);
  };

  // ================================================================ ENGINE
  function Engine(spec, opts) {
    this.spec = spec || {};
    this.opts = opts || {};
    this.issues = [];
    this._listeners = {};
    this.paramDefs = {}; this.paramList = []; this.values = {}; this.defaults = {};
    this.derivedList = []; this.pointNames = Object.create(null);
    this.knownNames = Object.create(null); this.locals = Object.create(null);
    this._depChecks = [];
    BUILTIN_LOCALS.forEach(function (n) { this.locals[n] = 1; }, this);
    this.roles = {}; this.roleOrder = []; this.customColors = {}; this.colorSig = '';
    this.ui = { labels: true, grid: true, angles: true, thick: 1, labelSize: 1, fill: 0, speed: 1 };
    this.uiDefaults = null;
    this.nodes = []; this.nodeById = Object.create(null); this.handles = [];
    this.steps = []; this.stepIndex = -1; this.mode = 'explore'; this.playing = false;
    this.stepRunning = false; this.stepDone = true; this.stepT = 0; this.dwellT = 0; this.dwellMs = 0; this.blocked = false;
    this.focusRole = null;
    this.challenges = {}; this.challengeList = []; this.challengeDone = {}; this.pickChallenge = null;
    this._tweens = []; this._timers = [];
    this.clocks = Object.create(null); this._clockIds = [];
    this.untilDone = {}; this.strict = false;
    this.world = null; this.view = { W: 360, H: 300, k: 30, ox: 0, oy: 300 };
    this._dirty = true; this._raf = 0; this._last = 0; this._moving = false; this._valSig = '';
    this._completed = false; this._destroyed = false;
    this._frame = this._frame.bind(this);
    this._build();
  }

  // ------------------------------------------------------------- events
  Engine.prototype.on = function (evt, fn) { (this._listeners[evt] = this._listeners[evt] || []).push(fn); return this; };
  Engine.prototype.off = function (evt, fn) { var l = this._listeners[evt]; if (l) this._listeners[evt] = l.filter(function (f) { return f !== fn; }); };
  Engine.prototype._emit = function (evt, data) {
    var l = this._listeners[evt]; if (!l) return;
    for (var i = 0; i < l.length; i++) { try { l[i](data); } catch (e) { if (root.console) console.error('[anim] listener error', evt, e); } }
  };
  Engine.prototype.issue = function (level, where, msg) { this.issues.push({ level: level, where: where, msg: msg }); };

  // --------------------------------------------------- expression compilers
  Engine.prototype.cx = function (v, where, dflt) {
    if (v === undefined || v === null) return function () { return dflt === undefined ? NaN : dflt; };
    if (typeof v === 'number') return function () { return v; };
    if (typeof v === 'boolean') { var b = v ? 1 : 0; return function () { return b; }; }
    var c = X.compile(v);
    if (c.error) this.issue('error', where, 'Expression "' + v + '": ' + c.error);
    else this._depChecks.push({ deps: c.deps, where: where, src: String(v) });
    return c.fn;
  };
  Engine.prototype.P = function (v, where) {
    if (typeof v === 'string' && /^[A-Za-z_]\w*$/.test(v)) {
      if (!this.pointNames[v]) this.issue('error', where, 'Unknown point "' + v + '"');
      var kx = v + '.x', ky = v + '.y';
      return function (env) { return [env[kx], env[ky]]; };
    }
    if (Array.isArray(v) && v.length === 2) {
      var fx = this.cx(v[0], where + '[0]'), fy = this.cx(v[1], where + '[1]');
      return function (env) { return [fx(env), fy(env)]; };
    }
    this.issue('error', where, 'A point must be a point name or [x, y]');
    return function () { return [NaN, NaN]; };
  };
  /** Registers the expressions found inside a text template so unknown names are linted. */
  Engine.prototype.lintTemplate = function (str, where) {
    if (typeof str !== 'string' || !X.hasTemplate(str)) return;
    var self = this;
    X.templateExprs(str).forEach(function (e) {
      if (e.error) self.issue('error', where, 'Template {{' + e.src + '}}: ' + e.error);
      else self._depChecks.push({ deps: e.deps, where: where, src: e.src });
    });
  };

  // ------------------------------------------------------------- roles/colours
  Engine.prototype.roleCss = function (role, where) {
    if (!role) role = 'ink';
    if (this.roles[role] || NEUTRAL.indexOf(role) !== -1) return 'var(--anim-c-' + role + ')';
    this.issue('warn', where || 'role', 'Unknown role "' + role + '" (using ink)');
    return 'var(--anim-c-ink)';
  };
  Engine.prototype.roleHex = function (key) {
    var r = this.roles[key]; if (!r) return null;
    return this.customColors[key] || r.color;
  };
  Engine.prototype._applyColors = function () {
    var rootEl = this.opts.root, sig = [];
    for (var i = 0; i < this.roleOrder.length; i++) {
      var k = this.roleOrder[i], hex = this.roleHex(k);
      if (rootEl) rootEl.style.setProperty('--anim-c-' + k, hex);
      sig.push(hex);
    }
    this.colorSig = sig.join(',');
  };
  Engine.prototype.setRoleColor = function (key, hex) {
    if (!this.roles[key] || !hexOk(hex)) return false;
    this.customColors[key] = hex.toLowerCase();
    this._applyColors(); this._emit('roles'); this._saveSoon(); this.invalidate();
    return true;
  };
  Engine.prototype.resetColors = function () {
    this.customColors = {}; this._applyColors(); this._emit('roles'); this._saveSoon(); this.invalidate();
  };
  Engine.prototype.applyPalette = function (name) {
    if (name === 'default') return this.resetColors();
    var pal = PALETTES[name]; if (!pal) return;
    var self = this;
    this.roleOrder.forEach(function (k, i) { self.customColors[k] = pal[i % pal.length].toLowerCase(); });
    this._applyColors(); this._emit('roles'); this._saveSoon(); this.invalidate();
  };
  Engine.prototype.setFocus = function (role) {
    role = role || null;
    if (role === this.focusRole) return;
    this.focusRole = role;
    this.nodes.forEach(function (n) { n.dimmed = !!role && n.role !== role; });
    this._emit('focus', role); this.invalidate();
  };
  Engine.prototype.setUi = function (key, val) {
    if (!(key in this.ui)) return;
    this.ui[key] = val; this._applyUi(); this._emit('ui', key); this._saveSoon(); this.invalidate();
  };
  Engine.prototype._applyUi = function () {
    var r = this.opts.root; if (!r) return;
    r.style.setProperty('--anim-sw', String(this.ui.thick));
    r.style.setProperty('--anim-fs', String(this.ui.labelSize));
    r.style.setProperty('--anim-fill', String(this.ui.fill || 0));
    r.classList.toggle('anim--nolabels', this.ui.labels === false);
    r.classList.toggle('anim--fill', (this.ui.fill || 0) > 0.001);
  };

  // ------------------------------------------------------------------- build
  Engine.prototype._build = function () {
    var spec = this.spec, self = this;
    if (!spec || typeof spec !== 'object') { this.issue('error', 'spec', 'Spec is not an object'); return; }

    // 0. display defaults a spec may change (e.g. angle marks start switched off)
    if (spec.uiDefaults && typeof spec.uiDefaults === 'object') {
      Object.keys(spec.uiDefaults).forEach(function (k) { if (k in self.ui) self.ui[k] = spec.uiDefaults[k]; });
    }
    this.uiDefaults = {}; for (var uk in this.ui) this.uiDefaults[uk] = this.ui[uk];

    // 1. params
    (spec.params || []).forEach(function (p, i) {
      var where = 'params[' + i + ']';
      if (!p || !p.id || !/^[A-Za-z_]\w*$/.test(p.id)) { self.issue('error', where, 'Param needs an id like "a" or "baseLen"'); return; }
      if (self.paramDefs[p.id]) { self.issue('error', where, 'Duplicate param id "' + p.id + '"'); return; }
      var type = p.type || 'number';
      var d = {
        id: p.id, label: p.label || p.id, type: type, unit: p.unit || '', hint: p.hint || '', group: p.group || '',
        hidden: !!p.hidden, role: p.role || null, options: p.options || null,
        min: num(p.min, type === 'toggle' ? 0 : 0), max: num(p.max, type === 'toggle' ? 1 : 10), step: num(p.step, 1),
        enabledWhen: p.enabledWhen ? self.cx(p.enabledWhen, where + '.enabledWhen') : null
      };
      if (type === 'toggle') { d.min = 0; d.max = 1; d.step = 1; }
      if (type === 'clock') {
        // a clock is a number that can run by itself: speed = units per second, loop = repeat | bounce | once
        d.step = num(p.step, 0.01); d.speed = num(p.speed, 1); d.auto = p.auto === true;
        d.loop = (p.loop === 'bounce' || p.loop === 'once') ? p.loop : 'repeat';
        if (!(d.max > d.min)) self.issue('error', where, 'a clock needs max greater than min');
        if (!(d.speed > 0)) { self.issue('error', where, 'a clock needs speed > 0'); d.speed = 1; }
      }
      if (type === 'choice') {
        if (!d.options || !d.options.length) self.issue('error', where, 'A choice param needs options [{value,label}]');
        else { d.min = d.options[0].value; d.max = d.options[d.options.length - 1].value; }
      }
      var def = p.default !== undefined ? p.default : (type === 'choice' && d.options ? d.options[0].value : d.min);
      if (type !== 'choice' && !d.hidden && (def < d.min || def > d.max)) self.issue('warn', where, 'default ' + def + ' is outside min..max');
      d.def = Number(def);
      if (type !== 'number' && type !== 'toggle' && type !== 'choice' && type !== 'clock') self.issue('error', where, 'Unknown param type "' + type + '" (number | toggle | choice | clock)');
      self.paramDefs[p.id] = d; self.paramList.push(d);
      self.values[p.id] = d.def; self.defaults[p.id] = d.def;
      self.knownNames[p.id] = 1;
    });

    this._clockIds = this.paramList.filter(function (d) { return d.type === 'clock'; }).map(function (d) { return d.id; });
    this.strict = spec.strict === true;

    // 2. derived values + named points (ordered; array value = point)
    var dv = spec.derived || {};
    Object.keys(dv).forEach(function (k) {
      if (Array.isArray(dv[k])) { self.pointNames[k] = 1; self.knownNames[k + '.x'] = 1; self.knownNames[k + '.y'] = 1; }
      else self.knownNames[k] = 1;
    });
    Object.keys(dv).forEach(function (k) {
      var where = 'derived.' + k;
      if (self.paramDefs[k]) self.issue('error', where, '"' + k + '" is already a param');
      if (Array.isArray(dv[k])) {
        var pf = self.P(dv[k], where);
        self.derivedList.push({ id: k, point: true, fn: pf });
      } else {
        self.derivedList.push({ id: k, point: false, fn: self.cx(dv[k], where) });
      }
    });

    // 3. roles
    var R = spec.roles || {};
    Object.keys(R).forEach(function (k) {
      if (!/^[A-Za-z0-9_-]+$/.test(k)) { self.issue('error', 'roles.' + k, 'Role keys may only use letters, digits, _ and -'); return; }
      if (NEUTRAL.indexOf(k) !== -1) { self.issue('error', 'roles.' + k, '"' + k + '" is a built-in neutral role'); return; }
      var r = R[k] || {};
      if (!hexOk(r.color)) self.issue('error', 'roles.' + k, 'color must be like #e11d48');
      self.roles[k] = { key: k, label: r.label || k, color: hexOk(r.color) ? r.color.toLowerCase() : '#4f46e5', text: r.text || '', legend: r.legend !== false };
      self.roleOrder.push(k);
    });

    // 4. DOM
    var stage = this.opts.stage;
    if (!stage) { this.issue('error', 'engine', 'opts.stage is required'); return; }
    stage.textContent = '';
    this.stage = stage;
    this.svgEl = svg('svg', { 'class': 'anim-svg', 'role': 'img', 'focusable': 'false' }, stage);
    this.layers = {
      back: svg('g', { 'class': 'anim-layer anim-layer--back' }, this.svgEl),
      mid: svg('g', { 'class': 'anim-layer anim-layer--mid' }, this.svgEl),
      front: svg('g', { 'class': 'anim-layer anim-layer--front' }, this.svgEl),
      handles: svg('g', { 'class': 'anim-layer anim-layer--handles' }, this.svgEl)
    };
    this.labelsEl = html('div', 'anim-labels', stage);
    this.labelsEl.setAttribute('aria-hidden', 'true');
    this._applyColors(); this._applyUi();

    // 5. world
    var w = spec.world || {};
    this.worldFns = {
      x0: this.cx(w.x ? w.x[0] : -1, 'world.x[0]'), x1: this.cx(w.x ? w.x[1] : 10, 'world.x[1]'),
      y0: this.cx(w.y ? w.y[0] : -1, 'world.y[0]'), y1: this.cx(w.y ? w.y[1] : 8, 'world.y[1]')
    };
    this.worldSmooth = w.smooth === true;
    this.worldPad = num(w.pad, 12);
    this.stageRatio = num(w.ratio, 0);

    // 6. shapes
    (spec.shapes || []).forEach(function (def, i) {
      var where = 'shapes[' + i + (def && def.id ? ':' + def.id : '') + ']';
      if (!def || !def.type) { self.issue('error', where, 'Shape needs a type'); return; }
      if (def.id && self.nodeById[def.id]) { self.issue('error', where, 'Duplicate shape id "' + def.id + '"'); return; }
      var node = new Node(self, def, null, where, true);
      self.nodes.push(node);
      self.nodeById[node.id] = node;
    });

    // 7. handles, steps, challenges
    this._buildHandles();
    this._buildSteps();
    this._buildChallenges();

    // lint pass: every identifier used by an expression must be known
    this._depChecks.forEach(function (chk) {
      chk.deps.forEach(function (name) {
        if (!self.knownNames[name] && !self.locals[name]) self.issue('error', chk.where, 'Unknown name "' + name + '" in "' + chk.src + '"');
      });
    });

    // 8. persistence, sizing, first render
    this._load();
    this._applyColors(); this._applyUi();
    this._clockIds.forEach(function (id) { if (self.paramDefs[id].auto) self.startClock(id); });
    this._measure(true);
    var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(function () { self._measure(); self.invalidate(); }) : null;
    if (ro) { ro.observe(stage); this._ro = ro; }
    this._onWin = function () { self._measure(); self.invalidate(); };
    root.addEventListener('resize', this._onWin);
    this._bindPick();

    this._render(16);
    if (this.steps.length) { this.mode = 'guided'; this.goto(0, true); }
    else { this.mode = 'explore'; this._emit('mode', this.mode); }
    this.invalidate();
  };

  // ------------------------------------------------------------ measurement
  Engine.prototype._measure = function (first) {
    var stage = this.stage; if (!stage) return;
    var W = stage.clientWidth || (stage.parentNode && stage.parentNode.clientWidth) || 360;
    if (this.stageRatio <= 0) {
      var env = this.buildEnv(this.values);
      var x0 = this.worldFns.x0(env), x1 = this.worldFns.x1(env), y0 = this.worldFns.y0(env), y1 = this.worldFns.y1(env);
      var xs = x1 - x0, ys = y1 - y0;
      this.stageRatio = (xs > 0 && ys > 0) ? clamp(ys / xs, 0.45, 1.25) : 0.75;
    }
    var maxH = this.opts.maxHeight ? this.opts.maxHeight() : Math.min(root.innerHeight * 0.66, 640);
    var H = clamp(Math.round(W * this.stageRatio), 200, Math.max(220, maxH));
    if (W !== this.view.W || H !== this.view.H || first) {
      this.view.W = W; this.view.H = H;
      stage.style.height = H + 'px';
      this.svgEl.setAttribute('width', W); this.svgEl.setAttribute('height', H);
      this.svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    }
  };

  // -------------------------------------------------------------- env/params
  Engine.prototype.buildEnv = function (vals) {
    var env = {}, k;
    for (k in vals) env[k] = vals[k];
    var dl = this.derivedList;
    for (var i = 0; i < dl.length; i++) {
      var d = dl[i];
      if (d.point) { var p = d.fn(env); env[d.id + '.x'] = p[0]; env[d.id + '.y'] = p[1]; }
      else env[d.id] = d.fn(env);
    }
    return env;
  };
  Engine.prototype._setRaw = function (id, v) {
    if (!this.paramDefs[id]) return;
    this.values[id] = v; this._dirty = true;
  };
  Engine.prototype.paramEnabled = function (id) {
    var d = this.paramDefs[id];
    if (!d || !d.enabledWhen) return true;
    return d.enabledWhen(this.env || this.buildEnv(this.values)) > 0.5;
  };
  /** src: 'user' | 'drag' | 'restore' | 'preset'. User/drag changes are snapped and checked against constraints. */
  Engine.prototype.setParam = function (id, raw, src) {
    var d = this.paramDefs[id]; if (!d) return false;
    var v = Number(raw);
    if (!isFinite(v)) return false;
    if (d.type === 'toggle') v = v ? 1 : 0;
    else if (d.type === 'choice') {
      var okOpt = (d.options || []).some(function (o) { return Number(o.value) === v; });
      if (!okOpt) return false;
    } else {
      v = clamp(v, d.min, d.max);
      v = snapTo(v, d.step, d.min);
      v = clamp(v, d.min, d.max);
    }
    if ((src === 'user' || src === 'drag') && d.type === 'clock') this.stopClock(id);
    if (v === this.values[id]) return true;
    if (src === 'user' || src === 'drag') {
      var cand = {}; for (var k in this.values) cand[k] = this.values[k];
      cand[id] = v;
      var env = this.buildEnv(cand), cons = this.spec.constraints || [];
      for (var i = 0; i < cons.length; i++) {
        var c = cons[i];
        if (!this._constraintFns) this._constraintFns = [];
        if (!this._constraintFns[i]) this._constraintFns[i] = this.cx(c.when, 'constraints[' + i + '].when');
        if (!(this._constraintFns[i](env) > 0.5)) {
          this._emit('invalid', { id: id, value: v, message: c.message || 'That combination is not allowed.' });
          return false;
        }
      }
    }
    this.values[id] = v; this._dirty = true;
    this._emit('param', { id: id, value: v, src: src });
    this._saveSoon(); this.invalidate();
    return true;
  };
  Engine.prototype.resetValues = function () {
    this._clockIds.forEach(function (id) { this.stopClock(id); }, this);
    this._tweenParams(this._visibleDefaults(), 450, true);
    this._emit('reset');
  };
  /** Defaults of the params a student can see — hidden ones belong to the lesson script and are never reset by the UI. */
  Engine.prototype._visibleDefaults = function () {
    var out = {}, self = this;
    this.paramList.forEach(function (p) { if (!p.hidden) out[p.id] = self.defaults[p.id]; });
    return out;
  };
  Engine.prototype.randomize = function () {
    var out = {}, self = this;
    this.paramList.forEach(function (p) {
      if (p.hidden || p.type === 'toggle' || p.type === 'choice' || p.type === 'clock' || p.fixed) return;
      var steps = Math.max(1, Math.round((p.max - p.min) / p.step));
      var v = p.min + Math.floor(Math.random() * (steps + 1)) * p.step;
      out[p.id] = clamp(+v.toFixed(8), p.min, p.max);
    });
    var cons = this.spec.constraints || [];
    for (var tries = 0; tries < 30; tries++) {
      var cand = {}; for (var k in this.values) cand[k] = this.values[k];
      for (k in out) cand[k] = out[k];
      var env = this.buildEnv(cand), ok = true;
      for (var i = 0; i < cons.length; i++) { if (!(self.cx(cons[i].when, 'constraints')(env) > 0.5)) { ok = false; break; } }
      if (ok) break;
      this.paramList.forEach(function (p) {
        if (out[p.id] === undefined) return;
        var st = Math.max(1, Math.round((p.max - p.min) / p.step));
        out[p.id] = clamp(+(p.min + Math.floor(Math.random() * (st + 1)) * p.step).toFixed(8), p.min, p.max);
      });
    }
    this._tweenParams(out, 550, true);
  };
  Engine.prototype.applyPreset = function (i) {
    var p = (this.spec.presets || [])[i]; if (!p) return;
    this._tweenParams(p.values || {}, 600, true);
  };

  /** Ad-hoc tween of params (used by presets, challenges, reset). */
  Engine.prototype._tweenParams = function (map, ms, snapEnd) {
    var self = this;
    if (reducedMotion() || ms <= 0) {
      Object.keys(map).forEach(function (id) { if (self.paramDefs[id]) self.setParam(id, map[id], 'preset'); });
      return;
    }
    Object.keys(map).forEach(function (id) {
      var d = self.paramDefs[id]; if (!d) return;
      self._tweens = self._tweens.filter(function (t) { return t.id !== id; });
      self._tweens.push({ id: id, from: self.values[id], to: Number(map[id]), t: 0, dur: ms, snap: !!snapEnd });
    });
    this.invalidate();
  };
  Engine.prototype._advanceTweens = function (dt) {
    var self = this, keep = [];
    this._tweens.forEach(function (t) {
      t.t += dt;
      var p = clamp(t.t / t.dur, 0, 1), e = X.EASE.inOut(p), d = self.paramDefs[t.id];
      var v = t.from + (t.to - t.from) * e;
      if (p >= 1) { self.setParam(t.id, t.to, 'preset'); return; }
      if (d.type === 'toggle' || d.type === 'choice') return;
      self.values[t.id] = clamp(v, d.min, d.max); self._dirty = true;
      keep.push(t);
    });
    this._tweens = keep;
  };

  // ----------------------------------------------------------------- clocks
  Engine.prototype.clockRunning = function (id) { return !!(this.clocks[id] && this.clocks[id].on); };
  /** byUser=true lets a student start a clock even with reduced motion on; lessons/auto never do. */
  Engine.prototype.startClock = function (id, byUser) {
    var d = this.paramDefs[id]; if (!d || d.type !== 'clock') return false;
    if (reducedMotion() && !byUser) return false;
    var c = this.clocks[id] || (this.clocks[id] = { on: false, dir: 1 });
    if (c.on) return true;
    if (d.loop !== 'bounce' && this.values[id] >= d.max - 1e-9) this.values[id] = d.min;   // finished clocks restart
    c.on = true; c.dir = this.values[id] >= d.max - 1e-9 ? -1 : (c.dir || 1);
    this._dirty = true; this._emit('clock', { id: id, on: true }); this.invalidate();
    return true;
  };
  Engine.prototype.stopClock = function (id) {
    var c = this.clocks[id]; if (!c || !c.on) return false;
    c.on = false; this._emit('clock', { id: id, on: false }); this._saveSoon(); this.invalidate();
    return true;
  };
  Engine.prototype.toggleClock = function (id) { return this.clockRunning(id) ? this.stopClock(id) : this.startClock(id, true); };
  Engine.prototype._tickClocks = function (dt) {
    var any = false, sp = this.ui.speed || 1;
    for (var i = 0; i < this._clockIds.length; i++) {
      var id = this._clockIds[i], c = this.clocks[id]; if (!c || !c.on) continue;
      var d = this.paramDefs[id], span = d.max - d.min, v = this.values[id] + c.dir * d.speed * sp * dt / 1000;
      if (v > d.max) {
        if (d.loop === 'bounce') { v = d.max - (v - d.max); c.dir = -1; }
        else if (d.loop === 'once') { v = d.max; c.on = false; this._emit('clock', { id: id, on: false }); }
        else v = d.min + ((v - d.min) % span);
      } else if (v < d.min) { v = d.min + (d.min - v); c.dir = 1; }
      this.values[id] = clamp(v, d.min, d.max); this._dirty = true;
      if (c.on) any = true;
    }
    return any;
  };

  // ----------------------------------------------------------------- world
  Engine.prototype._worldRect = function (env, dt) {
    var f = this.worldFns;
    var t = { x0: f.x0(env), x1: f.x1(env), y0: f.y0(env), y1: f.y1(env) };
    if (!(t.x1 - t.x0 > 1e-6) || !(t.y1 - t.y0 > 1e-6) || !isFinite(t.x0 + t.x1 + t.y0 + t.y1)) t = { x0: -1, x1: 1, y0: -1, y1: 1 };
    // while a handle is being dragged the view stays put (otherwise the picture
    // would rescale under the student's finger and the drag would feel slippery)
    if (this._worldHold) t = this._worldHold;
    var cur = this.world;
    if (!cur || !this.worldSmooth || reducedMotion()) { this.world = t; this._moving = false; return this.world; }
    var a = 1 - Math.exp(-dt / 110), moving = false;
    ['x0', 'x1', 'y0', 'y1'].forEach(function (k) {
      var diff = t[k] - cur[k];
      if (Math.abs(diff) > 0.002 * (t.x1 - t.x0)) { cur[k] += diff * a; moving = true; } else cur[k] = t[k];
    });
    this._moving = moving;
    return cur;
  };

  // ----------------------------------------------------------------- render
  Engine.prototype.invalidate = function () {
    this._dirty = true;
    if (this._raf || this._destroyed) return;
    this._raf = root.requestAnimationFrame(this._frame);
  };
  Engine.prototype._frame = function (ts) {
    this._raf = 0;
    if (this._destroyed) return;
    var dt = this._last ? Math.min(64, ts - this._last) : 16;
    this._last = ts;
    var active = false;
    if (this.stepRunning || (this.playing && this.stepDone && this.mode === 'guided')) { this._advance(dt); active = true; }
    if (this._tweens.length) { this._advanceTweens(dt); active = true; }
    if (this._clockIds.length && this._tickClocks(dt)) active = true;
    if (this._dirty || active || this._moving) { this._dirty = false; this._render(dt); }
    if (active || this._moving || this._dirty || this._tweens.length) this.invalidate();
    else this._last = 0;
  };
  Engine.prototype._render = function (dt) {
    if (!this.svgEl) return;
    var env = this.env = this.buildEnv(this.values);
    if (this.blocked && this.mode === 'guided' && this.stepDone && !this.stepRunning) this._checkUntil(env);
    var wr = this._worldRect(env, dt || 16), v = this.view;
    var pad = this.worldPad;
    var xs = wr.x1 - wr.x0, ys = wr.y1 - wr.y0;
    var k = Math.min((v.W - 2 * pad) / xs, (v.H - 2 * pad) / ys);
    var mx = (v.W - xs * k) / 2, my = (v.H - ys * k) / 2;
    v.k = k; v.ox = mx - wr.x0 * k; v.oy = my + wr.y1 * k;
    var view = v;
    var c = {
      env: env, M: M_ID, sc: 1, view: view, world: wr, alpha: 1, d: 1, eng: this,
      map: null
    };
    c.map = function (x, y) {
      var M = c.M;
      var wx = M[0] * x + M[2] * y + M[4], wy = M[1] * x + M[3] * y + M[5];
      return [view.ox + wx * view.k, view.oy - wy * view.k];
    };
    for (var i = 0; i < this.nodes.length; i++) this.nodes[i].update(c);
    this._updateHandles(c);

    var sig = '';
    for (var id in this.values) sig += id + '=' + this.values[id] + ';';
    if (sig !== this._valSig) {
      this._valSig = sig;
      this._updateAlt(env);
      this._emit('values', env);
    }
    this._emit('render', env);
  };
  Engine.prototype._updateAlt = function (env) {
    if (this.spec.alt && this.svgEl) this.svgEl.setAttribute('aria-label', X.runTemplate(this.spec.alt, env));
    else if (this.svgEl && this.spec.title) this.svgEl.setAttribute('aria-label', this.spec.title + ' — interactive diagram');
  };

  // ------------------------------------------------------------- rich text
  Engine.prototype.expandRoles = function (tex) {
    var out = '', i = 0;
    while (i < tex.length) {
      var j = tex.indexOf('\\role{', i);
      if (j < 0) { out += tex.slice(i); break; }
      out += tex.slice(i, j);
      var k1 = j + 6, e1 = tex.indexOf('}', k1);
      if (e1 < 0) { out += tex.slice(j); break; }
      var key = tex.slice(k1, e1), p = e1 + 1;
      while (tex.charAt(p) === ' ') p++;
      if (tex.charAt(p) !== '{') { out += tex.slice(j, e1 + 1); i = e1 + 1; continue; }
      var depth = 0, q = p;
      for (; q < tex.length; q++) {
        var ch = tex.charAt(q);
        if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) break; }
      }
      var inner = this.expandRoles(tex.slice(p + 1, q)), hex = this.roleHex(key);
      out += hex ? '\\textcolor{' + hex + '}{' + inner + '}' : inner;
      i = q + 1;
    }
    return out;
  };
  Engine.prototype.mathNode = function (tex, display) {
    var span = html('span', 'anim-math' + (display ? ' anim-math--block' : ''));
    tex = this.expandRoles(tex);
    if (root.katex) {
      try { root.katex.render(tex, span, { throwOnError: false, displayMode: !!display, trust: false, output: 'html' }); }
      catch (e) { span.textContent = tex; }
    } else span.textContent = tex.replace(/\\[a-zA-Z]+/g, '').replace(/[{}]/g, '');
    return span;
  };
  /** Safe rich text: {{expr}} values, \( tex \), **bold**, [[role|coloured word]]. Never uses innerHTML. */
  Engine.prototype.renderRich = function (el, tpl, env) {
    var s = X.hasTemplate(tpl) ? X.runTemplate(tpl, env) : String(tpl);
    var coloured = s.indexOf('\\role{') >= 0 || s.indexOf('[[') >= 0;
    var key = coloured ? s + '|' + this.colorSig : s;
    if (el.__rk === key) return;
    el.__rk = key;
    if (!/\\\(|\\\[|\[\[|\*\*/.test(s)) { el.textContent = s; return; }
    var frag = document.createDocumentFragment();
    var re = /\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]|\[\[([A-Za-z0-9_-]+)\|([^\]]+?)\]\]|\*\*([^*]+?)\*\*/g;
    var last = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
      if (m[1] !== undefined) frag.appendChild(this.mathNode(m[1], false));
      else if (m[2] !== undefined) frag.appendChild(this.mathNode(m[2], true));
      else if (m[3] !== undefined) {
        var sp = html('span', 'anim-role'); sp.setAttribute('data-role', m[3]);
        sp.style.color = this.roles[m[3]] ? 'var(--anim-c-' + m[3] + ')' : '';
        sp.textContent = m[4]; frag.appendChild(sp);
      } else { var st = html('strong'); st.textContent = m[5]; frag.appendChild(st); }
      last = re.lastIndex;
    }
    if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
    el.textContent = ''; el.appendChild(frag);
  };
  Engine.prototype.text = function (tpl) { return X.hasTemplate(tpl) ? X.runTemplate(tpl, this.env || this.buildEnv(this.values)) : String(tpl); };

  // ---------------------------------------------------------------- handles
  Engine.prototype._buildHandles = function () {
    var self = this;
    (this.spec.handles || []).forEach(function (h, i) {
      var where = 'handles[' + i + ']';
      if (!h || !h.drag || typeof h.drag !== 'object') { self.issue('error', where, 'A handle needs drag: {param: "expr using px, py"}'); return; }
      var at = self.P(h.at, where + '.at');
      var visFn = h.visible !== undefined ? self.cx(h.visible, where + '.visible') : null;
      var role = h.role || 'accent';
      var g = svg('g', { 'class': 'anim-handle', 'tabindex': '0', 'role': 'slider' }, self.layers.handles);
      var hit = svg('circle', { 'class': 'anim-handle__hit', r: 24 }, g);
      var ring = svg('circle', { 'class': 'anim-handle__ring', r: 13 }, g);
      var dot = svg('circle', { 'class': 'anim-handle__dot', r: 6 }, g);
      ring.style.stroke = self.roleCss(role, where); dot.style.fill = self.roleCss(role, where);
      var pids = Object.keys(h.drag), fns = {};
      pids.forEach(function (pid) {
        if (!self.paramDefs[pid]) self.issue('error', where, 'drag param "' + pid + '" does not exist');
        self.locals.px = 1; self.locals.py = 1;
        fns[pid] = self.cx(h.drag[pid], where + '.drag.' + pid);
      });
      var first = pids[0], pd = self.paramDefs[first];
      g.setAttribute('aria-label', h.label || ('Drag to change ' + (pd ? pd.label : first)));
      if (pd) { g.setAttribute('aria-valuemin', pd.min); g.setAttribute('aria-valuemax', pd.max); }
      var rec = { def: h, g: g, at: at, visFn: visFn, pids: pids, first: first, hit: hit };
      self.handles.push(rec);

      var dragging = false, off = [0, 0];
      function toWorld(e) {
        var r = self.svgEl.getBoundingClientRect(), v = self.view;
        return [(e.clientX - r.left - v.ox) / v.k, (v.oy - (e.clientY - r.top)) / v.k];
      }
      g.addEventListener('pointerdown', function (e) {
        dragging = true; g.classList.add('is-drag');
        try { g.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
        if (self.world) self._worldHold = { x0: self.world.x0, x1: self.world.x1, y0: self.world.y0, y1: self.world.y1 };
        var w = toWorld(e), p = at(self.env);
        off = [p[0] - w[0], p[1] - w[1]];
        self._emit('drag-start', h); e.preventDefault();
      });
      g.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var w = toWorld(e), env2 = Object.create(self.env);
        env2.px = w[0] + off[0]; env2.py = w[1] + off[1];
        pids.forEach(function (pid) { var val = fns[pid](env2); if (isFinite(val)) self.setParam(pid, val, 'drag'); });
      });
      function end() { if (dragging) { dragging = false; g.classList.remove('is-drag'); self._worldHold = null; self.invalidate(); } }
      g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end); g.addEventListener('lostpointercapture', end);
      g.addEventListener('keydown', function (e) {
        var dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : (e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0);
        if (!dir || !pd) return;
        e.preventDefault();
        self.setParam(first, self.values[first] + dir * pd.step * (e.shiftKey ? 5 : 1), 'user');
      });
    });
  };
  Engine.prototype._updateHandles = function (c) {
    for (var i = 0; i < this.handles.length; i++) {
      var h = this.handles[i], on = h.visFn ? h.visFn(c.env) > 0.5 : true;
      h.g.style.display = on ? '' : 'none';
      if (!on) continue;
      var p = h.at(c.env), s = c.map(p[0], p[1]);
      if (!isFinite(s[0]) || !isFinite(s[1])) { h.g.style.display = 'none'; continue; }
      h.g.setAttribute('transform', 'translate(' + f2(s[0]) + ',' + f2(s[1]) + ')');
      var pd = this.paramDefs[h.first];
      if (pd) h.g.setAttribute('aria-valuenow', this.values[h.first]);
    }
  };

  // ------------------------------------------------------------------ steps
  Engine.prototype.resolve = function (list, where) {
    var out = [], self = this;
    [].concat(list).forEach(function (t) {
      t = String(t);
      var hits = 0;
      if (t.indexOf('role:') === 0) { self.nodes.forEach(function (n) { if (n.role === t.slice(5)) { out.push(n); hits++; } }); if (!hits) self.issue('warn', where, 'No shape has ' + t); }
      else if (t.indexOf('tag:') === 0) { self.nodes.forEach(function (n) { if (n.tag === t.slice(4)) { out.push(n); hits++; } }); if (!hits) self.issue('warn', where, 'No shape has ' + t); }
      else if (self.nodeById[t]) out.push(self.nodeById[t]);
      else self.issue('error', where, 'Unknown shape id "' + t + '"');
    });
    return out;
  };

  Engine.prototype._buildSteps = function () {
    var self = this, raw = this.spec.steps || [], idIndex = {};
    this._stepClockIds = {};
    raw.forEach(function (s, i) {
      var where = 'steps[' + i + ']';
      var st = {
        idx: i, id: s.id || ('s' + (i + 1)), title: s.title || '', text: s.narration || s.text || '',
        dwell: s.dwell, focus: s.focus || null, challenge: s.challenge || null, ops: [], explicit: [], total: 0,
        // until: a condition the student must make true (by dragging / typing) before Next unlocks
        until: s.until !== undefined && s.until !== null ? self.cx(s.until, where + '.until') : null,
        untilHint: s.untilHint || 'Your turn — change a value or drag a dot to continue.'
      };
      if (idIndex[st.id] !== undefined) self.issue('error', where, 'Duplicate step id "' + st.id + '"');
      idIndex[st.id] = i;
      self.lintTemplate(st.text, where + '.narration');
      self.lintTemplate(st.title, where + '.title');
      self.lintTemplate(st.untilHint, where + '.untilHint');
      (s.actions || []).forEach(function (a, j) {
        var w = where + '.actions[' + j + ']';
        var at = num(a.at, 0), dur = a.dur !== undefined ? num(a.dur, 700) : 700, ease = a.ease || 'inOut', effect = a.effect || 'fade';
        if (a.show) { var o1 = { kind: 'show', nodes: self.resolve(a.show, w), effect: effect, at: at, dur: dur, ease: ease }; st.ops.push(o1); st.explicit.push(o1); }
        if (a.hide) { var o2 = { kind: 'hide', nodes: self.resolve(a.hide, w), effect: effect, at: at, dur: dur, ease: ease }; st.ops.push(o2); st.explicit.push(o2); }
        ['tween', 'set'].forEach(function (key) {
          if (!a[key]) return;
          var map = {};
          Object.keys(a[key]).forEach(function (pid) {
            if (!self.paramDefs[pid]) { self.issue('error', w, key + ' param "' + pid + '" does not exist'); return; }
            map[pid] = self.cx(a[key][pid], w + '.' + key + '.' + pid);
          });
          var o3 = { kind: 'tween', map: map, at: at, dur: key === 'set' ? 0 : dur, ease: ease, from: {} };
          st.ops.push(o3); st.explicit.push(o3);
        });
        ['startClock', 'stopClock'].forEach(function (key) {
          if (a[key] === undefined) return;
          var ids = [].concat(a[key]).map(String).filter(function (cid) {
            var okc = self.paramDefs[cid] && self.paramDefs[cid].type === 'clock';
            if (!okc) self.issue('error', w, key + ' "' + cid + '" is not a clock param');
            return okc;
          });
          ids.forEach(function (cid) { self._stepClockIds[cid] = 1; });
          var o4 = { kind: 'clock', ids: ids, run: key === 'startClock', at: at, dur: 0 };
          st.ops.push(o4); st.explicit.push(o4);
        });
        if (a.pulse) st.ops.push({ kind: 'pulse', nodes: self.resolve(a.pulse, w), at: at, dur: 0 });
        if (a.focus !== undefined) st.ops.push({ kind: 'focus', role: a.focus || null, at: at, dur: 0 });
      });
      self.steps.push(st);
    });
    // implicit "appear / disappear" declared on shapes
    this.nodes.forEach(function (n) {
      ['appear', 'disappear'].forEach(function (key) {
        var sid = n.def[key]; if (sid === undefined || sid === null) return;
        var idx = idIndex[sid];
        if (idx === undefined) { self.issue('error', n.where + '.' + key, 'Unknown step id "' + sid + '"'); return; }
        if (key === 'appear') n.appearIdx = idx; else n.disappearIdx = idx;
        self.steps[idx].ops.push({
          kind: key === 'appear' ? 'show' : 'hide', nodes: [n], effect: n.def.effect || 'fade',
          at: num(n.def.delay, 0), dur: num(n.def.appearDur, 700), ease: 'inOut'
        });
      });
    });
    this.steps.forEach(function (st) {
      st.total = st.ops.reduce(function (m, o) { return Math.max(m, o.at + o.dur); }, 0);
      if (st.challenge && !self.spec.challenges) self.issue('error', 'steps.' + st.id, 'step.challenge set but spec has no challenges');
    });
  };

  Engine.prototype._computeTarget = function (k) {
    var vis = {}, params = {}, clocks = {}, env = this.buildEnv(this.values);
    this.nodes.forEach(function (n) {
      vis[n.id] = ((n.appearIdx === null || n.appearIdx <= k) && (n.disappearIdx === null || n.disappearIdx > k)) ? 1 : 0;
    });
    for (var i = 0; i <= k && i < this.steps.length; i++) {
      var ex = this.steps[i].explicit;
      for (var j = 0; j < ex.length; j++) {
        var op = ex[j];
        if (op.kind === 'show' || op.kind === 'hide') op.nodes.forEach(function (n) { vis[n.id] = op.kind === 'show' ? 1 : 0; });
        else if (op.kind === 'tween') Object.keys(op.map).forEach(function (pid) { params[pid] = op.map[pid](env); });
        else if (op.kind === 'clock') op.ids.forEach(function (cid) { clocks[cid] = op.run; });
      }
    }
    return { vis: vis, params: params, clocks: clocks };
  };
  Engine.prototype._applyTarget = function (t) {
    var self = this;
    this.nodes.forEach(function (n) { n.vis = t.vis[n.id] ? { o: 1, d: 1, s: 1 } : { o: 0, d: 0, s: 1 }; });
    Object.keys(t.params).forEach(function (pid) { if (isFinite(t.params[pid])) self._setRaw(pid, t.params[pid]); });
    // clocks the lesson controls follow the script; the others are left alone
    Object.keys(this._stepClockIds || {}).forEach(function (cid) { if (t.clocks && t.clocks[cid]) self.startClock(cid); else self.stopClock(cid); });
  };

  Engine.prototype._startOp = function (op) {
    op.started = true;
    var self = this;
    if (op.kind === 'tween') { var env = this.buildEnv(this.values); Object.keys(op.map).forEach(function (pid) { op.from[pid] = self.values[pid]; op.to = op.to || {}; op.to[pid] = op.map[pid](env); }); }
    else if (op.kind === 'pulse') this._pulse(op.nodes);
    else if (op.kind === 'focus') this.setFocus(op.role);
    else if (op.kind === 'clock') op.ids.forEach(function (cid) { if (op.run) self.startClock(cid); else self.stopClock(cid); });
  };
  Engine.prototype._applyOp = function (op, p) {
    var e = (X.EASE[op.ease] || X.EASE.inOut)(p), self = this;
    if (op.kind === 'show' || op.kind === 'hide') {
      var showing = op.kind === 'show', eff = op.effect;
      op.nodes.forEach(function (n) {
        var v = n.vis, q = showing ? e : 1 - e;
        if (eff === 'draw') { v.o = (showing ? p > 0 : p < 1) ? 1 : 0; v.d = q; v.s = 1; }
        else if (eff === 'pop') { v.o = q; v.d = 1; v.s = 0.7 + 0.3 * q; }
        else { v.o = q; v.d = 1; v.s = 1; }
      });
    } else if (op.kind === 'tween') {
      Object.keys(op.map).forEach(function (pid) {
        var a = op.from[pid], b = op.to[pid];
        if (isFinite(a) && isFinite(b)) self._setRaw(pid, a + (b - a) * e);
      });
    }
    this._dirty = true;
  };
  Engine.prototype._advance = function (dt) {
    var sp = this.ui.speed || 1;
    if (this.stepRunning) {
      var st = this.steps[this.stepIndex]; this.stepT += dt * sp;
      for (var i = 0; i < st.ops.length; i++) {
        var op = st.ops[i];
        var p = op.dur <= 0 ? (this.stepT >= op.at ? 1 : 0) : clamp((this.stepT - op.at) / op.dur, 0, 1);
        if (p > 0 && !op.started) this._startOp(op);
        if (op.started && p !== op.last) { op.last = p; this._applyOp(op, p); }
      }
      if (this.stepT >= st.total) this._finishStep();
    } else if (this.playing && this.stepDone && this.mode === 'guided' && !this.blocked) {
      this.dwellT += dt * sp;
      if (this.dwellT >= this.dwellMs) this._autoNext();
    }
  };
  Engine.prototype._finishStep = function () {
    var st = this.steps[this.stepIndex];
    st.ops.forEach(function (o) { o.started = false; o.last = -1; });
    this._applyTarget(this._computeTarget(this.stepIndex));
    this.stepRunning = false; this.stepDone = true; this.dwellT = 0;
    var chars = (st.text || '').length;
    this.dwellMs = st.dwell !== undefined ? st.dwell : Math.min(2600, 650 + chars * 11);
    this.blocked = this._isBlocked();
    if (this.blocked) { this.playing = false; this._emit('blocked', st); this._emit('play', false); }
    this._emit('stepdone', st);
    if (this.stepIndex === this.steps.length - 1 && !this.blocked) this._complete();
    this._dirty = true;
  };
  /** Why step i is locked: 'challenge' | 'until' | false. Only the step on screen can satisfy its own `until`. */
  Engine.prototype._lockedAt = function (i, env) {
    var st = this.steps[i]; if (!st) return false;
    if (st.challenge) { var c = this.challenges[st.challenge]; if (c && c.required && !this.challengeDone[c.id]) return 'challenge'; }
    if (st.until && !this.untilDone[st.id]) {
      if (i === this.stepIndex && st.until(env || this.buildEnv(this.values)) > 0.5) { this.untilDone[st.id] = true; return false; }
      return 'until';
    }
    return false;
  };
  Engine.prototype._isBlocked = function () { return !!this._lockedAt(this.stepIndex); };
  /** First locked step in [from, to), or -1. */
  Engine.prototype.firstLock = function (from, to) {
    for (var i = Math.max(0, from); i < to && i < this.steps.length; i++) if (this._lockedAt(i)) return i;
    return -1;
  };
  /** In `strict` lessons a student can't skip ahead or jump to Free play until the lesson was finished once. */
  Engine.prototype.unlocked = function () { return !this.strict || this._completed || this._wasCompleted; };
  Engine.prototype._afterUnlock = function (kind) {
    if (!this.blocked || this._isBlocked()) return;
    this.blocked = false; this._emit('unblocked', { kind: kind });
    if (this.stepIndex === this.steps.length - 1 && !this._completed) this._complete();
  };
  Engine.prototype._checkUntil = function (env) {
    var st = this.steps[this.stepIndex];
    if (!st || !st.until || this.untilDone[st.id]) return;
    if (st.until(env) > 0.5) { this.untilDone[st.id] = true; this._afterUnlock('until'); this._saveSoon(); }
  };
  Engine.prototype._autoNext = function () {
    if (this.stepIndex < this.steps.length - 1) this.goto(this.stepIndex + 1, true);
    else { this.playing = false; this._emit('play', false); this._complete(); }   // stop on the last step (no auto "free play")
  };
  Engine.prototype._pulse = function (nodes) {
    if (reducedMotion()) return;
    var self = this;
    nodes.forEach(function (n) {
      n.g.classList.remove('is-pulse'); void n.g.getBoundingClientRect(); n.g.classList.add('is-pulse');
      var t = setTimeout(function () { n.g.classList.remove('is-pulse'); }, 1500);
      self._timers.push(t);
    });
  };
  /** True when a step does something the student can SEE (reveal, move, pulse, spotlight). */
  Engine.prototype._stepHasVisual = function (st) {
    return !!st && st.ops.some(function (o) { return o.kind !== 'clock'; });
  };
  /** Safety net so no guided step feels frozen: when a step only changes the words,
   *  give the drawing a gentle beat on the shapes that carry meaning (skip grid/axes). */
  Engine.prototype._pulseFigure = function () {
    if (reducedMotion()) return;
    var pick = [];
    for (var i = 0; i < this.nodes.length; i++) {
      var n = this.nodes[i];
      if (!n._on) continue;
      if (n.type === 'grid' || n.type === 'axes' || n.type === 'numberline') continue;
      if (!n.role || NEUTRAL.indexOf(n.role) !== -1) continue;
      pick.push(n);
    }
    if (pick.length) this._pulse(pick);
  };

  /** Jump to step k. animate=true plays its reveal; false snaps to its finished state. */
  Engine.prototype.goto = function (k, animate) {
    if (!this.steps.length) return;
    k = clamp(Math.round(k), 0, this.steps.length - 1);
    if (this.strict && !this.unlocked() && this.mode === 'guided' && k > this.stepIndex + 1) {
      var lk = this.firstLock(this.stepIndex, k);
      if (lk >= 0) { this._emit('blocked-try', this.steps[lk]); return; }
    }
    this.mode = 'guided'; this._tweens = [];
    this.closePick();
    this.setFocus(null);
    this._applyTarget(this._computeTarget(k - 1));
    this.stepIndex = k;
    var st = this.steps[k];
    st.ops.forEach(function (o) { o.started = false; o.last = -1; });
    if (st.focus) this.setFocus(st.focus);
    this.dwellT = 0; this.stepT = 0;
    if (animate && !reducedMotion() && st.total > 0) {
      this.stepRunning = true; this.stepDone = false; this.blocked = false;
      if (!this._stepHasVisual(st)) this._pulseFigure();    // words-only step: still give the drawing a beat
    } else {
      this.stepRunning = false; this.stepDone = true;
      this._applyTarget(this._computeTarget(k));
      if (animate && !this._stepHasVisual(st)) this._pulseFigure();
      var last = st.ops.filter(function (o) { return o.kind === 'focus'; }).pop();
      if (last) this.setFocus(last.role);
      var chars = (st.text || '').length;
      this.dwellMs = st.dwell !== undefined ? st.dwell : Math.min(2600, 650 + chars * 11);
      this.blocked = this._isBlocked();
      if (this.blocked) { this.playing = false; this._emit('blocked', st); }
      if (k === this.steps.length - 1 && !this.blocked) this._complete();
    }
    this._emit('mode', this.mode);
    this._emit('step', { index: k, step: st });
    if (st.challenge) this._emit('challenge-hint', st.challenge);
    this.invalidate();
  };
  Engine.prototype.play = function () {
    if (!this.steps.length) return;
    if (this.mode === 'explore' || (this.stepIndex === this.steps.length - 1 && this.stepDone)) this.goto(0, true);
    if (this.blocked) { this._emit('blocked-try', this.steps[this.stepIndex]); return; }
    this.playing = true; this._emit('play', true); this.invalidate();
  };
  Engine.prototype.pause = function () { this.playing = false; this._emit('play', false); };
  Engine.prototype.toggle = function () { if (this.playing) this.pause(); else this.play(); };
  Engine.prototype.next = function () {
    if (!this.steps.length) return;
    if (this.mode === 'explore') return;
    if (this.stepRunning) { this._finishStep(); this.invalidate(); return; }
    if (this.blocked) { this._emit('blocked-try', this.steps[this.stepIndex]); return; }
    if (this.stepIndex < this.steps.length - 1) this.goto(this.stepIndex + 1, true);
    else this._complete();          // last step: finish, stay put (no auto "free play")
  };
  Engine.prototype.prev = function () {
    if (!this.steps.length) return;
    if (this.mode === 'explore') { this.goto(this.steps.length - 1, false); return; }
    this.goto(Math.max(0, this.stepIndex - 1), false);
  };
  Engine.prototype.replay = function () { this.playing = false; this._completed = false; this.goto(0, true); this._emit('play', false); };
  Engine.prototype.explore = function () {
    if (!this.steps.length) return;
    if (this.mode === 'guided' && !this.unlocked() && !(this.stepIndex === this.steps.length - 1 && !this._isBlocked())) {
      this._emit('blocked-try', this.steps[this.stepIndex]); return;
    }
    this.stepRunning = false; this.stepDone = true; this.playing = false;
    this.closePick();
    this._applyTarget(this._computeTarget(this.steps.length - 1));
    this.setFocus(null);
    this.mode = 'explore'; this.blocked = false;
    this._emit('play', false); this._emit('mode', this.mode); this._complete(); this.invalidate();
  };
  Engine.prototype._complete = function () {
    if (this._completed) return;
    this._completed = true;
    this._emit('complete', { id: this.spec.id });
    this._saveSoon(true);
  };

  // ------------------------------------------------------------- challenges
  Engine.prototype._buildChallenges = function () {
    var self = this;
    (this.spec.challenges || []).forEach(function (c, i) {
      var where = 'challenges[' + i + ']';
      if (!c || !c.id) { self.issue('error', where, 'Challenge needs an id'); return; }
      var type = c.type || 'number';
      var ch = {
        id: c.id, type: type, prompt: c.prompt || '', title: c.title || 'Try it', hint: c.hint || '', explain: c.explain || '',
        unit: c.unit || '', required: !!c.required, set: c.set || null, options: c.options || null, reveal: c.reveal || null,
        tolerance: c.tolerance, attempts: 0, answerSrc: c.answer, hold: c.hold || null
      };
      if (type === 'number') ch.answerFn = self.cx(c.answer, where + '.answer');
      else if (type === 'choice') { if (!ch.options || !ch.options.length) self.issue('error', where, 'choice needs options'); }
      else if (type === 'pick') { if (c.answer === undefined) self.issue('error', where, 'pick needs answer (role or shape id)'); }
      else self.issue('error', where, 'Unknown challenge type "' + type + '"');
      if (ch.set) Object.keys(ch.set).forEach(function (pid) { if (!self.paramDefs[pid]) self.issue('error', where, 'set param "' + pid + '" does not exist'); });
      if (ch.hold) Object.keys(ch.hold).forEach(function (pid) { if (!self.paramDefs[pid]) self.issue('error', where, 'hold param "' + pid + '" does not exist'); });
      if (ch.reveal) ch.revealNodes = self.resolve(ch.reveal, where + '.reveal');
      self.lintTemplate(ch.prompt, where + '.prompt'); self.lintTemplate(ch.explain, where + '.explain'); self.lintTemplate(ch.hint, where + '.hint');
      self.challenges[ch.id] = ch; self.challengeList.push(ch);
    });
    this.steps.forEach(function (st) {
      if (st.challenge && !self.challenges[st.challenge]) self.issue('error', 'steps.' + st.id, 'Unknown challenge "' + st.challenge + '"');
    });
  };
  Engine.prototype.openChallenge = function (id) {
    var ch = this.challenges[id]; if (!ch) return null;
    var self = this;
    this.releaseChallenge();
    if (ch.set) this._tweenParams(ch.set, 500, true);
    // `hold` pins hidden params while the challenge is open (e.g. hide the answer's label)
    if (ch.hold) {
      ch._saved = {};
      Object.keys(ch.hold).forEach(function (pid) {
        if (!self.paramDefs[pid]) return;
        ch._saved[pid] = self.values[pid]; self._setRaw(pid, Number(ch.hold[pid]));
      });
      this._held = ch; this.invalidate();
    }
    this.pickChallenge = ch.type === 'pick' ? id : null;
    this.opts.root && this.opts.root.classList.toggle('anim--picking', !!this.pickChallenge);
    this._emit('challenge', ch);
    return ch;
  };
  Engine.prototype.releaseChallenge = function () {
    var ch = this._held; if (!ch) return;
    var self = this;
    Object.keys(ch._saved || {}).forEach(function (pid) { self._setRaw(pid, ch._saved[pid]); });
    this._held = null; this.invalidate();
  };
  /** Ends the open challenge: stops "tap the shape" mode and gives back any held params. */
  Engine.prototype.closePick = function () {
    this.pickChallenge = null;
    this.opts.root && this.opts.root.classList.remove('anim--picking');
    this.releaseChallenge();
  };
  /** Returns { correct, attempts, hint, explain, show }.  value: number | option id | role/shape id */
  Engine.prototype.answerChallenge = function (id, value) {
    var ch = this.challenges[id]; if (!ch) return null;
    var ok = false, env = this.buildEnv(this.values);
    if (ch.type === 'number') {
      var ans = ch.answerFn(env), v = Number(value);
      var tol = ch.tolerance !== undefined ? ch.tolerance : Math.max(0.01, Math.abs(ans) * 0.005);
      ok = isFinite(v) && isFinite(ans) && Math.abs(v - ans) <= tol;
    } else if (ch.type === 'choice') ok = String(value) === String(ch.answerSrc);
    else if (ch.type === 'pick') ok = String(value) === String(ch.answerSrc);
    ch.attempts++;
    var res = { correct: ok, attempts: ch.attempts, id: id, hint: ch.attempts >= 1 && !ok ? ch.hint : '', explain: ok ? ch.explain : '' };
    if (ok) {
      this.challengeDone[id] = true;
      if (ch.revealNodes) ch.revealNodes.forEach(function (n) { n.vis = { o: 1, d: 1, s: 1 }; });
      this.closePick();
      this._afterUnlock('challenge');
      this._saveSoon();
    }
    if (ch.type === 'number') res.answer = ch.answerFn(env);
    this._emit('challenge-result', res); this.invalidate();
    return res;
  };
  Engine.prototype.showAnswer = function (id) {
    var ch = this.challenges[id]; if (!ch) return null;
    var env = this.buildEnv(this.values);
    return ch.type === 'number' ? X.formatNumber(ch.answerFn(env), '') : String(ch.answerSrc);
  };
  Engine.prototype._bindPick = function () {
    var self = this;
    this.svgEl.addEventListener('click', function (e) {
      if (!self.pickChallenge) return;
      var t = e.target;
      while (t && t !== self.svgEl) {
        if (t.getAttribute && t.getAttribute('data-pick') === '1') {
          var ch = self.challenges[self.pickChallenge], key = ch.answerSrc;
          var role = t.getAttribute('data-role'), nid = t.getAttribute('data-id');
          var val = (String(key) === String(role)) ? role : (String(key) === String(nid) ? nid : (role || nid));
          self.answerChallenge(self.pickChallenge, val);
          return;
        }
        t = t.parentNode;
      }
    });
  };

  // ------------------------------------------------------------ persistence
  Engine.prototype._storeKey = function () { return 'anim:' + (this.spec.id || 'unknown'); };
  Engine.prototype._load = function () {
    var st = this.opts.store; if (!st) return;
    var o = null; try { o = st.get(this._storeKey()); } catch (e) { o = null; }
    if (!o || typeof o !== 'object') return;
    var self = this;
    if (o.colors) Object.keys(o.colors).forEach(function (k) { if (self.roles[k] && hexOk(o.colors[k])) self.customColors[k] = o.colors[k]; });
    if (o.values) Object.keys(o.values).forEach(function (k) { var d = self.paramDefs[k]; if (d && !d.hidden && d.type !== 'clock') { var v = Number(o.values[k]); if (isFinite(v)) self.values[k] = clamp(v, d.min, d.max); } });
    if (o.ui) Object.keys(o.ui).forEach(function (k) { if (k in self.ui) self.ui[k] = o.ui[k]; });
    this._wasCompleted = !!o.completed;
    if (o.done) Object.keys(o.done).forEach(function (k) { if (self.challenges[k]) self.challengeDone[k] = true; });
  };
  Engine.prototype._saveSoon = function (now) {
    var st = this.opts.store; if (!st || this._destroyed) return;
    var self = this;
    var doSave = function () {
      var vals = {}; self.paramList.forEach(function (p) { if (!p.hidden) vals[p.id] = self.values[p.id]; });
      try { st.set(self._storeKey(), { v: 1, colors: self.customColors, values: vals, ui: self.ui, done: self.challengeDone, completed: !!self._completed }); } catch (e) { /* ignore */ }
    };
    if (now) { doSave(); return; }
    clearTimeout(this._saveT); this._saveT = setTimeout(doSave, 400);
  };
  Engine.prototype.resetAll = function () {
    this._clockIds.forEach(function (id) { this.stopClock(id); }, this);
    this.customColors = {}; this.ui = {}; for (var uk in this.uiDefaults) this.ui[uk] = this.uiDefaults[uk];
    this._applyColors(); this._applyUi(); this._tweenParams(this._visibleDefaults(), 400, true);
    this._emit('roles'); this._emit('ui'); this._saveSoon();
  };

  // ----------------------------------------------------------------- teardown
  Engine.prototype.destroy = function () {
    this._destroyed = true;
    if (this._raf) root.cancelAnimationFrame(this._raf);
    if (this._ro) this._ro.disconnect();
    if (this._onWin) root.removeEventListener('resize', this._onWin);
    clearTimeout(this._saveT);
    this._timers.forEach(clearTimeout);
    this.nodes.forEach(function (n) { n.destroy(); });
    this._listeners = {};
  };

  root.WHA_Anim = {
    version: '1.0', Engine: Engine, SHAPES: SHAPES, Node: Node, Label: Label,
    PALETTES: PALETTES, SWATCHES: SWATCHES, NEUTRAL: NEUTRAL,
    helpers: { svg: svg, html: html, clamp: clamp, num: num, f2: f2, mmul: mmul, mTranslate: mTranslate, mRotate: mRotate, mScale: mScale, mScaleOf: mScaleOf, M_ID: M_ID, reducedMotion: reducedMotion, hexOk: hexOk }
  };
})(typeof window !== 'undefined' ? window : this);
