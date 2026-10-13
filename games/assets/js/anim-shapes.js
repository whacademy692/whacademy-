/**
 * anim-shapes.js — W.H. Academy · Animation Lab (shape library)
 * ----------------------------------------------------------------------------
 * Every drawable thing in a spec is a "shape" with a `type`. Each factory below
 * receives (def, engine, node, where) and returns { update(c), destroy? }.
 * update(c) runs every frame; c.map(x, y) turns WORLD coordinates (maths units,
 * y up) into screen pixels, honouring any enclosing `group` transform.
 * Returning false from update() hides the shape for that frame (bad numbers).
 *
 * Shared fields (all types):
 *   id, role, tag, layer ("back"|"mid"|"front"), visible (expr), opacity (expr),
 *   appear / disappear (step id), effect ("fade"|"draw"|"pop"), delay, appearDur,
 *   pick (true → tappable in a "pick" challenge), hint (tooltip / a11y text),
 *   uiToggle ("grid"|"angles"|"labels" → follows the student's display switch)
 *   strokeWidth, dash, fill (false | true | role), fillOpacity
 *   label: "text"  |  { text, t, off, dx, dy, at, away, role, size, bold, keep, visible }
 *
 * Types: point segment (vector) polygon polyline rect square regular circle
 *        arc sector angle text dimension grid axes numberline plot (y=f(x) or parametric) path group repeat
 * ----------------------------------------------------------------------------
 */
(function (root) {
  'use strict';

  var A = root.WHA_Anim;
  var X = root.WHA_AnimExpr;
  if (!A || !X) throw new Error('anim-shapes.js needs anim-expr.js and anim-engine.js first');

  var SHAPES = A.SHAPES, H = A.helpers;
  var svg = H.svg, f2 = H.f2, clamp = H.clamp, num = H.num;
  var mmul = H.mmul, mTranslate = H.mTranslate, mRotate = H.mRotate, mScale = H.mScale, mScaleOf = H.mScaleOf, M_ID = H.M_ID;

  // ------------------------------------------------------------------ styling
  function strokeStyle(el, def, eng, where, w) {
    var width = def.strokeWidth !== undefined ? def.strokeWidth : (w || 3);
    el.style.stroke = eng.roleCss(def.strokeRole || def.role, where);
    el.style.strokeWidth = 'calc(var(--anim-sw, 1) * ' + width + 'px)';
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('stroke-linejoin', 'round');
    el.style.fill = 'none';
  }
  /** Returns the base fill opacity (0 when unfilled). */
  function fillStyle(el, def, eng, where, dflt) {
    var f = def.fill === undefined ? dflt : def.fill;
    if (f === false || f === null) { el.style.fill = 'none'; return 0; }
    el.style.fill = eng.roleCss(typeof f === 'string' ? f : def.role, where);
    return def.fillOpacity !== undefined ? def.fillOpacity : 0.18;
  }
  function dashOf(def) {
    if (def.dash === true) return '8 7';
    if (Array.isArray(def.dash)) return def.dash.join(' ');
    return def.dash || '';
  }
  /** Draw-on effect: d in 0..1. When fully drawn the shape's own dash pattern is restored. */
  function applyDraw(el, d, dash) {
    if (d >= 0.999) {
      if (el.hasAttribute('pathLength')) el.removeAttribute('pathLength');
      el.style.strokeDasharray = dash; el.style.strokeDashoffset = '';
    } else {
      el.setAttribute('pathLength', '1');
      el.style.strokeDasharray = '1 1'; el.style.strokeDashoffset = String(1 - d);
    }
  }
  function fillFade(d) { return d >= 0.999 ? 1 : clamp((d - 0.55) / 0.45, 0, 1); }
  function labelDef(lab, dflt) {
    if (lab === true) return dflt ? { text: dflt } : null;
    return lab || null;
  }
  function polyPath(pts) { var s = ''; for (var i = 0; i < pts.length; i++) s += (i ? 'L' : 'M') + f2(pts[i][0]) + ' ' + f2(pts[i][1]); return s; }
  function ok2(a) { return isFinite(a[0]) && isFinite(a[1]); }

  // -------------------------------------------------------------------- point
  SHAPES.point = function (def, eng, node, where) {
    var at = eng.P(def.at, where + '.at'), r = eng.cx(def.r, where + '.r', 5);
    var c = svg('circle', { 'class': 'anim-dot' }, node.g);
    c.style.fill = eng.roleCss(def.role, where);
    var ld = labelDef(def.label), lab = ld ? node.addLabel(ld) : null;
    if (lab) eng.lintTemplate(lab.tpl, where + '.label');
    return {
      update: function (cx) {
        var p = at(cx.env), s = cx.map(p[0], p[1]);
        if (!ok2(s)) return false;
        c.setAttribute('cx', f2(s[0])); c.setAttribute('cy', f2(s[1])); c.setAttribute('r', f2(r(cx.env) * (cx.d >= 0.999 ? 1 : cx.d)));
        if (lab) lab.put(s[0], s[1] + num(lab.ld.off, -15), cx.env, cx.alpha);
      }
    };
  };

  // ------------------------------------------------------------------ segment
  function segmentFactory(def, eng, node, where) {
    var from = eng.P(def.from, where + '.from'), to = eng.P(def.to, where + '.to');
    var hit = def.pick ? svg('line', { 'class': 'anim-hit' }, node.g) : null;
    var line = svg('line', {}, node.g); strokeStyle(line, def, eng, where);
    var arrow = def.arrow === true ? 'end' : (def.arrow || (def.type === 'vector' ? 'end' : null));
    var heads = {};
    if (arrow) {
      line.setAttribute('stroke-linecap', 'butt');
      ['start', 'end'].forEach(function (w) {
        if (arrow === w || arrow === 'both') {
          var p = svg('polygon', {}, node.g); p.style.fill = eng.roleCss(def.role, where); p.style.stroke = 'none'; heads[w] = p;
        }
      });
    }
    var ticksEl = def.ticks ? svg('path', {}, node.g) : null;
    if (ticksEl) strokeStyle(ticksEl, def, eng, where, 2);
    var ld = labelDef(def.label), lab = ld ? node.addLabel(ld) : null;
    if (lab) eng.lintTemplate(lab.tpl, where + '.label');
    var away = lab && lab.ld.away ? eng.P(lab.ld.away, where + '.label.away') : null;
    var dash = dashOf(def), ticks = def.ticks | 0;

    function head(el, tip, ux, uy, size) {
      var nx = -uy, ny = ux;
      el.setAttribute('points', f2(tip[0]) + ',' + f2(tip[1]) + ' ' +
        f2(tip[0] - ux * size + nx * size * 0.42) + ',' + f2(tip[1] - uy * size + ny * size * 0.42) + ' ' +
        f2(tip[0] - ux * size - nx * size * 0.42) + ',' + f2(tip[1] - uy * size - ny * size * 0.42));
    }
    return {
      update: function (c) {
        var p = from(c.env), q = to(c.env), a = c.map(p[0], p[1]), b = c.map(q[0], q[1]);
        if (!ok2(a) || !ok2(b)) return false;
        var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / L, uy = dy / L;
        var hs = 11 * Math.max(0.8, Math.min(1.4, parseFloat(getComputedStyle(line).strokeWidth) / 3 || 1));
        var a2 = a, b2 = b;
        if (heads.start) { a2 = [a[0] + ux * hs * 0.8, a[1] + uy * hs * 0.8]; head(heads.start, a, -ux, -uy, hs); }
        if (heads.end) { b2 = [b[0] - ux * hs * 0.8, b[1] - uy * hs * 0.8]; head(heads.end, b, ux, uy, hs); }
        var set = function (el) { el.setAttribute('x1', f2(a2[0])); el.setAttribute('y1', f2(a2[1])); el.setAttribute('x2', f2(b2[0])); el.setAttribute('y2', f2(b2[1])); };
        set(line); if (hit) set(hit);
        applyDraw(line, c.d, dash);
        if (heads.start) heads.start.style.opacity = c.d >= 0.999 ? '' : String(fillFade(c.d));
        if (heads.end) heads.end.style.opacity = c.d >= 0.999 ? '' : String(fillFade(c.d));
        var nx = uy, ny = -ux;   // left-hand normal in screen space
        if (ticksEl) {
          var mx0 = (a[0] + b[0]) / 2, my0 = (a[1] + b[1]) / 2, dd = '';
          for (var i = 0; i < ticks; i++) {
            var off = (i - (ticks - 1) / 2) * 6;
            var cx0 = mx0 + ux * off, cy0 = my0 + uy * off;
            dd += 'M' + f2(cx0 + nx * 6) + ' ' + f2(cy0 + ny * 6) + 'L' + f2(cx0 - nx * 6) + ' ' + f2(cy0 - ny * 6);
          }
          ticksEl.setAttribute('d', dd); ticksEl.style.opacity = c.d >= 0.999 ? '' : '0';
        }
        if (lab) {
          // label.off = the GAP between the line and the label's edge (px); the label's own size is added on top
          var t = num(lab.ld.t, 0.5), gap = Math.abs(num(lab.ld.off, 6)), sgn = 1;
          var mx = a[0] + dx * t, my = a[1] + dy * t;
          if (away) {
            var g = away(c.env), gs = c.map(g[0], g[1]);
            if (ok2(gs) && ((mx - gs[0]) * nx + (my - gs[1]) * ny) < 0) sgn = -1;
          }
          var dist = (gap + lab.ext(nx, ny)) * sgn;
          lab.put(mx + nx * dist, my + ny * dist, c.env, c.alpha);
        }
      }
    };
  }
  SHAPES.segment = segmentFactory;
  SHAPES.vector = segmentFactory;

  // ------------------------------------------------------- polygon-like shapes
  function polyFactory(getPts, closedDefault, fillDefault) {
    return function (def, eng, node, where) {
      var ptsFn = getPts(def, eng, where);
      var closed = def.closed === undefined ? closedDefault : def.closed !== false;
      var el = svg(closed ? 'polygon' : 'polyline', {}, node.g);
      strokeStyle(el, def, eng, where);
      var fo = closed ? fillStyle(el, def, eng, where, fillDefault) : 0;
      if (def.stroke === false) el.style.stroke = 'none';
      var ld = labelDef(def.label), lab = ld ? node.addLabel(ld) : null;
      if (lab) eng.lintTemplate(lab.tpl, where + '.label');
      var labAt = lab && lab.ld.at ? eng.P(lab.ld.at, where + '.label.at') : null;
      var dash = dashOf(def);
      return {
        update: function (c) {
          var wp = ptsFn(c.env), pts = [], i, cx0 = 0, cy0 = 0;
          for (i = 0; i < wp.length; i++) {
            var s = c.map(wp[i][0], wp[i][1]);
            if (!ok2(s)) return false;
            pts.push(s); cx0 += s[0]; cy0 += s[1];
          }
          var pstr = '';
          for (i = 0; i < pts.length; i++) pstr += (i ? ' ' : '') + f2(pts[i][0]) + ',' + f2(pts[i][1]);
          el.setAttribute('points', pstr);
          applyDraw(el, c.d, dash);
          if (fo) el.style.fillOpacity = String(fo * fillFade(c.d));
          if (lab) {
            if (labAt) { var q = labAt(c.env), qs = c.map(q[0], q[1]); lab.put(qs[0], qs[1], c.env, c.alpha); }
            else lab.put(cx0 / pts.length, cy0 / pts.length, c.env, c.alpha);
          }
        }
      };
    };
  }
  function ptList(def, eng, where) {
    if (!Array.isArray(def.pts) || def.pts.length < 2) { eng.issue('error', where, 'pts must list at least 2 points'); return function () { return []; }; }
    var fns = def.pts.map(function (p, i) { return eng.P(p, where + '.pts[' + i + ']'); });
    return function (env) { return fns.map(function (f) { return f(env); }); };
  }
  SHAPES.polygon = polyFactory(ptList, true, true);
  SHAPES.polyline = polyFactory(ptList, false, false);
  SHAPES.rect = polyFactory(function (def, eng, where) {
    var x = eng.cx(def.x, where + '.x', 0), y = eng.cx(def.y, where + '.y', 0), w = eng.cx(def.w, where + '.w', 1), h = eng.cx(def.h, where + '.h', 1);
    return function (env) { var X0 = x(env), Y0 = y(env), W = w(env), HH = h(env); return [[X0, Y0], [X0 + W, Y0], [X0 + W, Y0 + HH], [X0, Y0 + HH]]; };
  }, true, true);
  SHAPES.square = polyFactory(function (def, eng, where) {
    var from = eng.P(def.from, where + '.from'), to = eng.P(def.to, where + '.to'), side = eng.cx(def.side, where + '.side', 1);
    return function (env) {
      var F = from(env), T = to(env), s = side(env) >= 0 ? 1 : -1;
      var dx = T[0] - F[0], dy = T[1] - F[1], nx = -dy * s, ny = dx * s;
      return [F, T, [T[0] + nx, T[1] + ny], [F[0] + nx, F[1] + ny]];
    };
  }, true, true);
  SHAPES.regular = polyFactory(function (def, eng, where) {
    var c = eng.P(def.c, where + '.c'), r = eng.cx(def.r, where + '.r', 1), n = eng.cx(def.n, where + '.n', 5), rot = eng.cx(def.rot, where + '.rot', 90);
    return function (env) {
      var C = c(env), R = r(env), N = Math.max(3, Math.min(60, Math.round(n(env)))), a0 = rot(env), out = [];
      for (var i = 0; i < N; i++) { var a = (a0 + 360 * i / N) * Math.PI / 180; out.push([C[0] + R * Math.cos(a), C[1] + R * Math.sin(a)]); }
      return out;
    };
  }, true, true);

  // ------------------------------------------------------------------- circle
  SHAPES.circle = function (def, eng, node, where) {
    var cF = eng.P(def.c, where + '.c'), rF = eng.cx(def.r, where + '.r', 1);
    var el = svg('circle', {}, node.g); strokeStyle(el, def, eng, where);
    var fo = fillStyle(el, def, eng, where, false);
    var ld = labelDef(def.label), lab = ld ? node.addLabel(ld) : null;
    if (lab) eng.lintTemplate(lab.tpl, where + '.label');
    var dash = dashOf(def);
    return {
      update: function (c) {
        var C = cF(c.env), s = c.map(C[0], C[1]), R = rF(c.env) * c.view.k * c.sc;
        if (!ok2(s) || !(R >= 0)) return false;
        el.setAttribute('cx', f2(s[0])); el.setAttribute('cy', f2(s[1])); el.setAttribute('r', f2(R));
        applyDraw(el, c.d, dash);
        if (fo) el.style.fillOpacity = String(fo * fillFade(c.d));
        if (lab) lab.put(s[0], s[1], c.env, c.alpha);
      }
    };
  };

  // --------------------------------------------------------------- arc / sector
  function arcFactory(sector) {
    return function (def, eng, node, where) {
      var cF = eng.P(def.c, where + '.c'), rF = eng.cx(def.r, where + '.r', 1);
      var a0 = eng.cx(def.from, where + '.from', 0), a1 = eng.cx(def.to, where + '.to', 90);
      var el = svg('path', {}, node.g); strokeStyle(el, def, eng, where);
      var fo = fillStyle(el, def, eng, where, sector);
      var ld = labelDef(def.label), lab = ld ? node.addLabel(ld) : null;
      if (lab) eng.lintTemplate(lab.tpl, where + '.label');
      var dash = dashOf(def);
      return {
        update: function (c) {
          var C = cF(c.env), r = rF(c.env), t0 = a0(c.env), t1 = a1(c.env);
          var sweepDeg = t1 - t0, R = r * c.view.k * c.sc;
          if (!isFinite(r + t0 + t1) || !(R >= 0)) return false;
          var rad = Math.PI / 180;
          var s = c.map(C[0], C[1]);
          var p0 = c.map(C[0] + r * Math.cos(t0 * rad), C[1] + r * Math.sin(t0 * rad));
          var p1 = c.map(C[0] + r * Math.cos(t1 * rad), C[1] + r * Math.sin(t1 * rad));
          var d;
          if (Math.abs(sweepDeg) >= 359.99) {
            var pm = c.map(C[0] - r * Math.cos(t0 * rad), C[1] - r * Math.sin(t0 * rad));
            d = 'M' + f2(p0[0]) + ' ' + f2(p0[1]) + 'A' + f2(R) + ' ' + f2(R) + ' 0 1 0 ' + f2(pm[0]) + ' ' + f2(pm[1]) + 'A' + f2(R) + ' ' + f2(R) + ' 0 1 0 ' + f2(p0[0]) + ' ' + f2(p0[1]);
          } else {
            var large = Math.abs(sweepDeg) > 180 ? 1 : 0, sweep = sweepDeg >= 0 ? 0 : 1;
            d = 'M' + (sector ? f2(s[0]) + ' ' + f2(s[1]) + 'L' : '') + f2(p0[0]) + ' ' + f2(p0[1]) +
              'A' + f2(R) + ' ' + f2(R) + ' 0 ' + large + ' ' + sweep + ' ' + f2(p1[0]) + ' ' + f2(p1[1]) + (sector ? 'Z' : '');
          }
          el.setAttribute('d', d); applyDraw(el, c.d, dash);
          if (fo) el.style.fillOpacity = String(fo * fillFade(c.d));
          if (lab) {
            var tm = (t0 + t1) / 2, e2 = Object.create(c.env); e2.ang = Math.abs(sweepDeg);
            var pl = c.map(C[0] + r * (sector ? 0.62 : 1.18) * Math.cos(tm * rad), C[1] + r * (sector ? 0.62 : 1.18) * Math.sin(tm * rad));
            lab.put(pl[0], pl[1], e2, c.alpha);
          }
        }
      };
    };
  }
  SHAPES.arc = arcFactory(false);
  SHAPES.sector = arcFactory(true);

  // -------------------------------------------------------------------- angle
  SHAPES.angle = function (def, eng, node, where) {
    var V = eng.P(def.at || def.vertex, where + '.at'), P1 = eng.P(def.from, where + '.from'), P2 = eng.P(def.to, where + '.to');
    var rF = eng.cx(def.r, where + '.r', 24);
    var style = def.style || 'auto';
    var el = svg('path', {}, node.g); strokeStyle(el, def, eng, where, 2.5);
    var fo = fillStyle(el, def, eng, where, true);
    var ld = labelDef(def.label, '{{ang|0}}°'), lab = ld ? node.addLabel(ld) : null;
    if (lab) eng.lintTemplate(lab.tpl, where + '.label');
    var dash = dashOf(def);
    return {
      update: function (c) {
        var v = V(c.env), p1 = P1(c.env), p2 = P2(c.env);
        var sv = c.map(v[0], v[1]), s1 = c.map(p1[0], p1[1]), s2 = c.map(p2[0], p2[1]);
        if (!ok2(sv) || !ok2(s1) || !ok2(s2)) return false;
        var u1x = s1[0] - sv[0], u1y = s1[1] - sv[1], u2x = s2[0] - sv[0], u2y = s2[1] - sv[1];
        var l1 = Math.sqrt(u1x * u1x + u1y * u1y), l2 = Math.sqrt(u2x * u2x + u2y * u2y);
        if (l1 < 1e-6 || l2 < 1e-6) return false;
        u1x /= l1; u1y /= l1; u2x /= l2; u2y /= l2;
        var dot = clamp(u1x * u2x + u1y * u2y, -1, 1), ang = Math.acos(dot) * 180 / Math.PI;
        var r = Math.min(rF(c.env), l1 * 0.7, l2 * 0.7), d;
        var square = style === 'square' || (style === 'auto' && Math.abs(ang - 90) < 0.6);
        if (square) {
          var sz = Math.min(r * 0.75, 18);
          var a = [sv[0] + u1x * sz, sv[1] + u1y * sz], b = [sv[0] + (u1x + u2x) * sz, sv[1] + (u1y + u2y) * sz], e = [sv[0] + u2x * sz, sv[1] + u2y * sz];
          d = 'M' + f2(sv[0]) + ' ' + f2(sv[1]) + 'L' + f2(a[0]) + ' ' + f2(a[1]) + 'L' + f2(b[0]) + ' ' + f2(b[1]) + 'L' + f2(e[0]) + ' ' + f2(e[1]) + 'Z';
        } else {
          var cross = u1x * u2y - u1y * u2x, sweep = cross > 0 ? 1 : 0;
          var q1 = [sv[0] + u1x * r, sv[1] + u1y * r], q2 = [sv[0] + u2x * r, sv[1] + u2y * r];
          d = 'M' + f2(sv[0]) + ' ' + f2(sv[1]) + 'L' + f2(q1[0]) + ' ' + f2(q1[1]) + 'A' + f2(r) + ' ' + f2(r) + ' 0 0 ' + sweep + ' ' + f2(q2[0]) + ' ' + f2(q2[1]) + 'Z';
        }
        el.setAttribute('d', d); applyDraw(el, c.d, dash);
        if (fo) el.style.fillOpacity = String(fo * fillFade(c.d));
        if (lab) {
          var bx = u1x + u2x, by = u1y + u2y, bl = Math.sqrt(bx * bx + by * by);
          if (bl < 1e-4) { bx = -u1y; by = u1x; bl = 1; }
          var dist = lab.ld.off !== undefined ? num(lab.ld.off, 30) : (square ? 26 : r + 17), e2 = Object.create(c.env); e2.ang = ang;
          lab.put(sv[0] + bx / bl * dist, sv[1] + by / bl * dist, e2, c.alpha);
        }
      }
    };
  };

  // --------------------------------------------------------------------- text
  SHAPES.text = function (def, eng, node, where) {
    var at = eng.P(def.at, where + '.at');
    var lab = node.addLabel({ text: def.text, role: def.role, size: def.size, bold: def.bold, dx: def.dx, dy: def.dy, bg: def.bg, keep: def.keep !== false });
    eng.lintTemplate(lab.tpl, where + '.text');
    return {
      update: function (c) {
        var p = at(c.env), s = c.map(p[0], p[1]);
        if (!ok2(s)) return false;
        lab.put(s[0], s[1], c.env, c.alpha * (c.d >= 0.999 ? 1 : c.d));
      }
    };
  };

  // ---------------------------------------------------------------- dimension
  SHAPES.dimension = function (def, eng, node, where) {
    var from = eng.P(def.from, where + '.from'), to = eng.P(def.to, where + '.to'), off = eng.cx(def.off, where + '.off', 22);
    var el = svg('path', {}, node.g); strokeStyle(el, def, eng, where, 2);
    var ld = labelDef(def.label, '{{len|2}}'), lab = ld ? node.addLabel(ld) : null;
    if (lab) eng.lintTemplate(lab.tpl, where + '.label');
    return {
      update: function (c) {
        var p = from(c.env), q = to(c.env), a = c.map(p[0], p[1]), b = c.map(q[0], q[1]);
        if (!ok2(a) || !ok2(b)) return false;
        var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / L, uy = dy / L;
        var nx = uy, ny = -ux, o = off(c.env);
        var a2 = [a[0] + nx * o, a[1] + ny * o], b2 = [b[0] + nx * o, b[1] + ny * o];
        var d = 'M' + f2(a[0]) + ' ' + f2(a[1]) + 'L' + f2(a2[0] + nx * 5) + ' ' + f2(a2[1] + ny * 5) +
          'M' + f2(b[0]) + ' ' + f2(b[1]) + 'L' + f2(b2[0] + nx * 5) + ' ' + f2(b2[1] + ny * 5) +
          'M' + f2(a2[0]) + ' ' + f2(a2[1]) + 'L' + f2(b2[0]) + ' ' + f2(b2[1]);
        el.setAttribute('d', d); applyDraw(el, c.d, '');
        if (lab) {
          var e2 = Object.create(c.env); e2.len = Math.sqrt(Math.pow(q[0] - p[0], 2) + Math.pow(q[1] - p[1], 2)) * c.sc;
          lab.put((a2[0] + b2[0]) / 2 + nx * 13, (a2[1] + b2[1]) / 2 + ny * 13, e2, c.alpha);
        }
      }
    };
  };

  // --------------------------------------------------------------- grid / axes
  SHAPES.grid = function (def, eng, node, where) {
    var step = eng.cx(def.step, where + '.step', 1), major = def.major | 0;
    var minor = svg('path', {}, node.g), maj = major ? svg('path', {}, node.g) : null;
    var role = def.role || 'grid';
    [minor, maj].forEach(function (p, i) {
      if (!p) return;
      p.style.stroke = eng.roleCss(role, where); p.style.fill = 'none';
      p.style.strokeWidth = i ? 'calc(var(--anim-sw, 1) * 1.6px)' : 'calc(var(--anim-sw, 1) * 1px)';
      p.style.opacity = i ? '0.9' : '0.55';
    });
    return {
      update: function (c) {
        var s = step(c.env), w = c.world, v = c.view;
        if (!(s > 0)) return false;
        var ix0 = Math.ceil(w.x0 / s - 1e-9), ix1 = Math.floor(w.x1 / s + 1e-9), iy0 = Math.ceil(w.y0 / s - 1e-9), iy1 = Math.floor(w.y1 / s + 1e-9);
        if (ix1 - ix0 > 160 || iy1 - iy0 > 160) return false;
        var dMin = '', dMaj = '', i, x, y;
        for (i = ix0; i <= ix1; i++) { x = f2(v.ox + i * s * v.k); var seg = 'M' + x + ' 0L' + x + ' ' + v.H; if (major && i % major === 0) dMaj += seg; else dMin += seg; }
        for (i = iy0; i <= iy1; i++) { y = f2(v.oy - i * s * v.k); var sg = 'M0 ' + y + 'L' + v.W + ' ' + y; if (major && i % major === 0) dMaj += sg; else dMin += sg; }
        minor.setAttribute('d', dMin); if (maj) maj.setAttribute('d', dMaj);
      }
    };
  };

  SHAPES.axes = function (def, eng, node, where) {
    var step = eng.cx(def.step, where + '.step', 1), showNums = def.numbers !== false;
    var path = svg('path', {}, node.g); path.style.stroke = eng.roleCss(def.role || 'ink', where); path.style.fill = 'none';
    path.style.strokeWidth = 'calc(var(--anim-sw, 1) * 2px)'; path.setAttribute('stroke-linecap', 'round');
    var texts = [], xl = def.xLabel ? node.addLabel({ text: def.xLabel, role: def.role || 'ink', keep: true }) : null, yl = def.yLabel ? node.addLabel({ text: def.yLabel, role: def.role || 'ink', keep: true }) : null;
    function getText(i) {
      if (!texts[i]) { var t = svg('text', { 'class': 'anim-axis-num' }, node.g); t.style.fill = eng.roleCss('muted', where); texts[i] = t; }
      return texts[i];
    }
    return {
      update: function (c) {
        var s = step(c.env), w = c.world, v = c.view;
        if (!(s > 0)) return false;
        var x0 = f2(v.ox + w.x0 * v.k), x1 = f2(v.ox + w.x1 * v.k), y0 = f2(v.oy - w.y0 * v.k), y1 = f2(v.oy - w.y1 * v.k);
        var ax = clamp(v.oy, 6, v.H - 6), ay = clamp(v.ox, 6, v.W - 6);
        var d = 'M' + x0 + ' ' + ax + 'L' + (x1 - 4) + ' ' + ax + 'M' + ay + ' ' + y0 + 'L' + ay + ' ' + (y1 + 4);
        d += 'M' + (x1 - 10) + ' ' + (ax - 5) + 'L' + x1 + ' ' + ax + 'L' + (x1 - 10) + ' ' + (ax + 5);
        d += 'M' + (ay - 5) + ' ' + (y1 + 10) + 'L' + ay + ' ' + y1 + 'L' + (ay + 5) + ' ' + (y1 + 10);
        var ti = 0, i;
        var ix0 = Math.ceil(w.x0 / s - 1e-9), ix1 = Math.floor(w.x1 / s + 1e-9), iy0 = Math.ceil(w.y0 / s - 1e-9), iy1 = Math.floor(w.y1 / s + 1e-9);
        if (ix1 - ix0 > 60 || iy1 - iy0 > 60) { path.setAttribute('d', d); return; }
        var every = Math.max(1, Math.ceil(((ix1 - ix0) + 1) / 14));
        for (i = ix0; i <= ix1; i++) {
          if (i === 0) continue;
          var px = f2(v.ox + i * s * v.k);
          d += 'M' + px + ' ' + (ax - 4) + 'L' + px + ' ' + (ax + 4);
          if (showNums && i % every === 0) { var t = getText(ti++); t.setAttribute('x', px); t.setAttribute('y', f2(ax + 17)); t.setAttribute('text-anchor', 'middle'); t.textContent = X.formatNumber(i * s, ''); t.style.display = ''; }
        }
        var everyY = Math.max(1, Math.ceil(((iy1 - iy0) + 1) / 12));
        for (i = iy0; i <= iy1; i++) {
          if (i === 0) continue;
          var py = f2(v.oy - i * s * v.k);
          d += 'M' + (ay - 4) + ' ' + py + 'L' + (ay + 4) + ' ' + py;
          if (showNums && i % everyY === 0) { var t2 = getText(ti++); t2.setAttribute('x', f2(ay - 9)); t2.setAttribute('y', f2(py + 4)); t2.setAttribute('text-anchor', 'end'); t2.textContent = X.formatNumber(i * s, ''); t2.style.display = ''; }
        }
        for (; ti < texts.length; ti++) texts[ti].style.display = 'none';
        path.setAttribute('d', d);
        if (xl) xl.put(x1 - 8, ax - 14, c.env, c.alpha);
        if (yl) yl.put(ay + 14, y1 + 8, c.env, c.alpha);
      }
    };
  };

  // --------------------------------------------------------------------- plot
  // y = f(x):            { type:"plot", fn:"x^2", domain:[-3,3] }
  // parametric (x(t),y(t)): { type:"plot", x:"cos(t)", y:"sin(t)", var:"t", domain:[0,6.28] }
  // upTo: draw only the part of the domain up to this value (e.g. "t" while a clock runs → the curve traces itself)
  SHAPES.plot = function (def, eng, node, where) {
    var param = def.x !== undefined && def.y !== undefined;
    if (!param && def.fn === undefined) eng.issue('error', where, 'plot needs fn (y = f(x)) or both x and y (parametric)');
    var vr = def.var || (param ? 't' : 'x'); eng.locals[vr] = 1;
    var fn = param ? null : eng.cx(def.fn, where + '.fn');
    var fx = param ? eng.cx(def.x, where + '.x') : null, fy = param ? eng.cx(def.y, where + '.y') : null;
    var lo = eng.cx(def.domain ? def.domain[0] : -10, where + '.domain[0]'), hi = eng.cx(def.domain ? def.domain[1] : 10, where + '.domain[1]');
    var upTo = def.upTo !== undefined ? eng.cx(def.upTo, where + '.upTo') : null;
    var n = Math.min(600, Math.max(8, def.samples | 0 || 160));
    var area = !param && def.fillTo !== undefined ? svg('path', {}, node.g) : null;
    var fillTo = area ? eng.cx(def.fillTo, where + '.fillTo') : null;
    if (area) { area.style.fill = eng.roleCss(def.role, where); area.style.fillOpacity = String(def.fillOpacity !== undefined ? def.fillOpacity : 0.16); area.style.stroke = 'none'; }
    var el = svg('path', {}, node.g); strokeStyle(el, def, eng, where);
    var dash = dashOf(def);
    return {
      update: function (c) {
        var a = lo(c.env), b = hi(c.env);
        if (!isFinite(a + b) || b <= a) return false;
        if (upTo) { var u = upTo(c.env); if (!isFinite(u) || u <= a) return false; b = Math.min(b, u); }
        var env2 = Object.create(c.env), d = '', pen = false, first = null, last = null;
        for (var i = 0; i <= n; i++) {
          var tv = a + (b - a) * i / n; env2[vr] = tv;
          var x = param ? fx(env2) : tv, y = param ? fy(env2) : fn(env2);
          if (!isFinite(x) || !isFinite(y) || Math.abs(y) > 1e4 || Math.abs(x) > 1e4) { pen = false; continue; }
          var s = c.map(x, y);
          d += (pen ? 'L' : 'M') + f2(s[0]) + ' ' + f2(s[1]); pen = true;
          if (!first) first = s; last = s;
        }
        if (!first) return false;
        el.setAttribute('d', d); applyDraw(el, c.d, dash);
        if (area && fillTo) {
          var yb = c.map(0, fillTo(c.env));
          area.setAttribute('d', d + 'L' + f2(last[0]) + ' ' + f2(yb[1]) + 'L' + f2(first[0]) + ' ' + f2(yb[1]) + 'Z');
          area.style.opacity = String(fillFade(c.d));
        }
      }
    };
  };

  // --------------------------------------------------------------- number line
  // { type:"numberline", from:-6, to:6, y:0, step:1, labelEvery:1, numbers:true,
  //   marks:[{ at:"a", label:"a", role:"base", open:false }],                       dots on the line
  //   spans:[{ from:"-2", to:"3", role:"perp", openFrom:false, openTo:true }],       thick interval (from/to null = goes on forever)
  //   jumps:[{ from:"a", to:"a+b", role:"hyp", label:"+{{b}}" }] }                  hop arrows above the line (use h:-1 to hop below)
  SHAPES.numberline = function (def, eng, node, where) {
    var x0f = def.from !== undefined ? eng.cx(def.from, where + '.from') : null, x1f = def.to !== undefined ? eng.cx(def.to, where + '.to') : null;
    var yf = eng.cx(def.y, where + '.y', 0), stepF = eng.cx(def.step, where + '.step', 1);
    var every = Math.max(1, def.labelEvery | 0 || 1), showNums = def.numbers !== false;
    var base = svg('path', {}, node.g); base.style.stroke = eng.roleCss(def.role || 'ink', where); base.style.fill = 'none';
    base.style.strokeWidth = 'calc(var(--anim-sw, 1) * 2.4px)'; base.setAttribute('stroke-linecap', 'round'); base.setAttribute('stroke-linejoin', 'round');
    var texts = [];
    function getText(i) {
      if (!texts[i]) { var t = svg('text', { 'class': 'anim-axis-num' }, node.g); t.style.fill = eng.roleCss('muted', where); texts[i] = t; }
      return texts[i];
    }
    function ptOpt(v, w) { return v === undefined || v === null ? null : eng.cx(v, w); }
    var marks = (def.marks || []).map(function (m, i) {
      var w = where + '.marks[' + i + ']';
      var o = { at: eng.cx(m.at, w + '.at'), r: eng.cx(m.r, w + '.r', 7), open: m.open !== undefined ? eng.cx(m.open, w + '.open') : null };
      o.el = svg('circle', {}, node.g); o.el.style.strokeWidth = '3px';
      o.role = m.role || def.role || 'ink'; o.el.style.stroke = eng.roleCss(o.role, w);
      var ld = labelDef(m.label); o.lab = ld ? node.addLabel(typeof ld === 'string' ? { text: ld, role: o.role } : Object.assign({ role: o.role }, ld)) : null;
      if (o.lab) eng.lintTemplate(o.lab.tpl, w + '.label');
      o.dy = m.below ? 1 : -1;
      return o;
    });
    var spans = (def.spans || []).map(function (sp, i) {
      var w = where + '.spans[' + i + ']';
      var o = { a: ptOpt(sp.from, w + '.from'), b: ptOpt(sp.to, w + '.to'), oa: sp.openFrom ? eng.cx(sp.openFrom, w + '.openFrom') : null, ob: sp.openTo ? eng.cx(sp.openTo, w + '.openTo') : null };
      o.role = sp.role || def.role || 'ink';
      o.line = svg('line', {}, node.g); o.line.style.stroke = eng.roleCss(o.role, w); o.line.style.strokeWidth = 'calc(var(--anim-sw, 1) * 7px)'; o.line.setAttribute('stroke-linecap', 'butt'); o.line.style.opacity = '0.85';
      o.ea = svg('circle', {}, node.g); o.eb = svg('circle', {}, node.g); o.head = svg('polygon', {}, node.g);
      [o.ea, o.eb].forEach(function (e) { e.style.stroke = eng.roleCss(o.role, w); e.style.strokeWidth = '3px'; });
      o.head.style.fill = eng.roleCss(o.role, w);
      return o;
    });
    var jumps = (def.jumps || []).map(function (jp, i) {
      var w = where + '.jumps[' + i + ']';
      var o = { a: eng.cx(jp.from, w + '.from'), b: eng.cx(jp.to, w + '.to'), h: eng.cx(jp.h, w + '.h', 1) };
      o.role = jp.role || def.role || 'ink';
      o.path = svg('path', {}, node.g); o.path.style.stroke = eng.roleCss(o.role, w); o.path.style.fill = 'none';
      o.path.style.strokeWidth = 'calc(var(--anim-sw, 1) * 3px)'; o.path.setAttribute('stroke-linecap', 'round');
      o.head = svg('polygon', {}, node.g); o.head.style.fill = eng.roleCss(o.role, w);
      var ld = labelDef(jp.label); o.lab = ld ? node.addLabel(typeof ld === 'string' ? { text: ld, role: o.role } : Object.assign({ role: o.role }, ld)) : null;
      if (o.lab) eng.lintTemplate(o.lab.tpl, w + '.label');
      return o;
    });
    function setCircle(el, x, y, r, open) { el.setAttribute('cx', f2(x)); el.setAttribute('cy', f2(y)); el.setAttribute('r', f2(r)); el.style.fill = open ? 'var(--anim-paper)' : el.style.stroke; }
    function tri(el, tip, ux, uy, size) {
      var nx = -uy, ny = ux;
      el.setAttribute('points', f2(tip[0]) + ',' + f2(tip[1]) + ' ' + f2(tip[0] - ux * size + nx * size * 0.5) + ',' + f2(tip[1] - uy * size + ny * size * 0.5) + ' ' + f2(tip[0] - ux * size - nx * size * 0.5) + ',' + f2(tip[1] - uy * size - ny * size * 0.5));
    }
    return {
      update: function (c) {
        var env = c.env, w = c.world, yy = yf(env);
        var xa = x0f ? x0f(env) : w.x0 + 0.2, xb = x1f ? x1f(env) : w.x1 - 0.2, st = stepF(env);
        if (!isFinite(xa + xb + yy) || !(xb > xa) || !(st > 0)) return false;
        var A = c.map(xa, yy), B = c.map(xb, yy);
        if (!ok2(A) || !ok2(B)) return false;
        var dx = B[0] - A[0], dy = B[1] - A[1], L = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
        // baseline with an arrow head at both ends
        var d = 'M' + f2(A[0]) + ' ' + f2(A[1]) + 'L' + f2(B[0]) + ' ' + f2(B[1]);
        d += 'M' + f2(B[0] - ux * 11 + nx * 6) + ' ' + f2(B[1] - uy * 11 + ny * 6) + 'L' + f2(B[0]) + ' ' + f2(B[1]) + 'L' + f2(B[0] - ux * 11 - nx * 6) + ' ' + f2(B[1] - uy * 11 - ny * 6);
        d += 'M' + f2(A[0] + ux * 11 + nx * 6) + ' ' + f2(A[1] + uy * 11 + ny * 6) + 'L' + f2(A[0]) + ' ' + f2(A[1]) + 'L' + f2(A[0] + ux * 11 - nx * 6) + ' ' + f2(A[1] + uy * 11 - ny * 6);
        // ticks + numbers
        var i0 = Math.ceil(xa / st - 1e-9), i1 = Math.floor(xb / st + 1e-9), count = i1 - i0 + 1, ti = 0;
        if (count <= 160) {
          var ev = Math.max(every, Math.ceil(count / 18));
          for (var i = i0; i <= i1; i++) {
            var P = c.map(i * st, yy), big = i % ev === 0;
            if (!ok2(P)) continue;
            var th = big ? 7 : 4.5;
            d += 'M' + f2(P[0] + nx * th) + ' ' + f2(P[1] + ny * th) + 'L' + f2(P[0] - nx * th) + ' ' + f2(P[1] - ny * th);
            if (showNums && big) {
              var tx = getText(ti++); tx.setAttribute('x', f2(P[0] + nx * 22)); tx.setAttribute('y', f2(P[1] + ny * 22 + 4)); tx.setAttribute('text-anchor', 'middle');
              tx.textContent = X.formatNumber(i * st, ''); tx.style.display = '';
            }
          }
        }
        for (; ti < texts.length; ti++) texts[ti].style.display = 'none';
        base.setAttribute('d', d); applyDraw(base, c.d, '');
        // spans (inequalities / intervals)
        spans.forEach(function (o) {
          var sa = o.a ? o.a(env) : xa, sb = o.b ? o.b(env) : xb;
          var show = isFinite(sa) && isFinite(sb) && sb >= sa;
          [o.line, o.ea, o.eb, o.head].forEach(function (e) { e.style.display = show ? '' : 'none'; });
          if (!show) return;
          var pa = c.map(Math.max(sa, xa), yy), pb = c.map(Math.min(sb, xb), yy);
          var endsA = o.a ? 1 : 0, endsB = o.b ? 1 : 0;
          o.line.setAttribute('x1', f2(pa[0])); o.line.setAttribute('y1', f2(pa[1])); o.line.setAttribute('x2', f2(pb[0])); o.line.setAttribute('y2', f2(pb[1]));
          o.ea.style.display = endsA ? '' : 'none'; o.eb.style.display = endsB ? '' : 'none';
          if (endsA) setCircle(o.ea, pa[0], pa[1], 7, o.oa ? o.oa(env) > 0.5 : false);
          if (endsB) setCircle(o.eb, pb[0], pb[1], 7, o.ob ? o.ob(env) > 0.5 : false);
          // open-ended side → arrow head pointing away
          o.head.style.display = (!endsA || !endsB) ? '' : 'none';
          // the arrow head sits on the end of the number line; the thick bar stops where the head begins
          if (!endsA) { tri(o.head, pa, -ux, -uy, 14); o.line.setAttribute('x1', f2(pa[0] + ux * 12)); o.line.setAttribute('y1', f2(pa[1] + uy * 12)); }
          else if (!endsB) { tri(o.head, pb, ux, uy, 14); o.line.setAttribute('x2', f2(pb[0] - ux * 12)); o.line.setAttribute('y2', f2(pb[1] - uy * 12)); }
        });
        // jumps
        jumps.forEach(function (o) {
          var ja = o.a(env), jb = o.b(env), hh = o.h(env);
          var show = isFinite(ja + jb + hh) && ja !== jb;
          o.path.style.display = o.head.style.display = show ? '' : 'none';
          if (!show) { if (o.lab) o.lab.setShown(false); return; }
          var pa = c.map(ja, yy), pb = c.map(jb, yy), len = Math.sqrt(Math.pow(pb[0] - pa[0], 2) + Math.pow(pb[1] - pa[1], 2));
          var lift = Math.min(70, 14 + len * 0.28) * (hh >= 0 ? 1 : -1);
          var cx1 = pa[0] - nx * lift * 1.25, cy1 = pa[1] - ny * lift * 1.25, cx2 = pb[0] - nx * lift * 1.25, cy2 = pb[1] - ny * lift * 1.25;
          o.path.setAttribute('d', 'M' + f2(pa[0]) + ' ' + f2(pa[1]) + 'C' + f2(cx1) + ' ' + f2(cy1) + ' ' + f2(cx2) + ' ' + f2(cy2) + ' ' + f2(pb[0]) + ' ' + f2(pb[1]));
          var tdx = pb[0] - cx2, tdy = pb[1] - cy2, tl = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
          tri(o.head, pb, tdx / tl, tdy / tl, 12);
          if (o.lab) o.lab.put((pa[0] + pb[0]) / 2 - nx * (lift * 0.95 + (hh >= 0 ? 16 : -16)), (pa[1] + pb[1]) / 2 - ny * (lift * 0.95 + (hh >= 0 ? 16 : -16)), env, c.alpha);
        });
        // marks (on top)
        marks.forEach(function (o) {
          var mv = o.at(env), P = c.map(mv, yy);
          var show = isFinite(mv) && ok2(P) && mv >= xa - 1e-9 && mv <= xb + 1e-9;
          o.el.style.display = show ? '' : 'none';
          if (!show) { if (o.lab) o.lab.setShown(false); return; }
          setCircle(o.el, P[0], P[1], o.r(env), o.open ? o.open(env) > 0.5 : false);
          if (o.lab) { var ld2 = o.dy > 0 ? 44 : -26; o.lab.put(P[0] + nx * ld2, P[1] + ny * ld2, env, c.alpha); }
        });
      }
    };
  };

  // --------------------------------------------------------------------- path
  var PATH_ARGS = { M: 2, L: 2, H: 1, V: 1, C: 6, Q: 4, Z: 0 };
  SHAPES.path = function (def, eng, node, where) {
    if (typeof def.d !== 'string') { eng.issue('error', where, 'path needs d (absolute commands M L H V C Q Z, in world units)'); return { update: function () { return false; } }; }
    if (/[a-df-yA-Z]/.test(def.d.replace(/[MLHVCQZ]/g, '').replace(/\{\{[\s\S]*?\}\}/g, ''))) eng.issue('error', where, 'path d only supports absolute M L H V C Q Z');
    eng.lintTemplate(def.d, where + '.d');
    var el = svg('path', {}, node.g); strokeStyle(el, def, eng, where);
    var fo = fillStyle(el, def, eng, where, false);
    if (def.stroke === false) el.style.stroke = 'none';
    var dash = dashOf(def), cache = { s: null, toks: null };
    return {
      update: function (c) {
        var s = X.hasTemplate(def.d) ? X.runTemplate(def.d, c.env) : def.d;
        if (s !== cache.s) { cache.s = s; cache.toks = s.match(/[MLHVCQZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []; }
        var t = cache.toks, out = '', i = 0, cmd = '', cx0 = 0, cy0 = 0;
        while (i < t.length) {
          if (/^[A-Za-z]$/.test(t[i])) { cmd = t[i].toUpperCase(); i++; if (cmd === 'Z') { out += 'Z'; continue; } }
          var need = PATH_ARGS[cmd];
          if (need === undefined || i + need > t.length) return false;
          var a = [], k;
          for (k = 0; k < need; k++) a.push(parseFloat(t[i + k]));
          i += need;
          if (cmd === 'H') { cx0 = a[0]; a = [cx0, cy0]; cmd = 'L'; var sh = c.map(a[0], a[1]); out += 'L' + f2(sh[0]) + ' ' + f2(sh[1]); cmd = 'H'; continue; }
          if (cmd === 'V') { cy0 = a[0]; var sv = c.map(cx0, cy0); out += 'L' + f2(sv[0]) + ' ' + f2(sv[1]); continue; }
          out += cmd;
          for (k = 0; k < need; k += 2) { var sp = c.map(a[k], a[k + 1]); if (!ok2(sp)) return false; out += f2(sp[0]) + ' ' + f2(sp[1]) + (k + 2 < need ? ' ' : ''); }
          cx0 = a[need - 2]; cy0 = a[need - 1];
        }
        el.setAttribute('d', out); applyDraw(el, c.d, dash);
        if (fo) el.style.fillOpacity = String(fo * fillFade(c.d));
      }
    };
  };

  // -------------------------------------------------------------------- group
  SHAPES.group = function (def, eng, node, where) {
    var tr = def.translate || [0, 0];
    var tx = eng.cx(tr[0], where + '.translate[0]', 0), ty = eng.cx(tr[1], where + '.translate[1]', 0);
    var rot = eng.cx(def.rotate, where + '.rotate', 0), sc = eng.cx(def.scale, where + '.scale', 1);
    var about = def.about ? eng.P(def.about, where + '.about') : null;
    var kids = (def.children || []).map(function (cd, i) { return new A.Node(eng, cd, node.g, where + '.children[' + i + ']', false); });
    return {
      update: function (c) {
        var ab = about ? about(c.env) : [0, 0];
        var T = mmul(mTranslate(tx(c.env), ty(c.env)), mmul(mTranslate(ab[0], ab[1]), mmul(mRotate(rot(c.env)), mmul(mScale(sc(c.env)), mTranslate(-ab[0], -ab[1])))));
        var saveM = c.M, saveSc = c.sc;
        c.M = mmul(saveM, T); c.sc = mScaleOf(c.M);
        for (var i = 0; i < kids.length; i++) kids[i].update(c);
        c.M = saveM; c.sc = saveSc;
      },
      destroy: function () { kids.forEach(function (k) { k.destroy(); }); }
    };
  };

  // ------------------------------------------------------------------- repeat
  SHAPES.repeat = function (def, eng, node, where) {
    var count = eng.cx(def.count, where + '.count'), as = def.as || 'i';
    eng.locals[as] = 1; eng.locals.n = 1;
    if (!def.template) eng.issue('error', where, 'repeat needs a template shape');
    var inst = [];
    return {
      update: function (c) {
        var n = Math.min(400, Math.max(0, Math.floor(count(c.env) + 1e-9)));
        if (!isFinite(n)) n = 0;
        while (def.template && inst.length < n) inst.push(new A.Node(eng, def.template, node.g, where + '.template', false));
        var saveEnv = c.env;
        for (var i = 0; i < inst.length; i++) {
          if (i >= n) { inst[i]._setOn(false); continue; }
          var e2 = Object.create(saveEnv); e2[as] = i; e2.n = n;
          c.env = e2; inst[i].update(c); c.env = saveEnv;
        }
      },
      destroy: function () { inst.forEach(function (k) { k.destroy(); }); }
    };
  };
})(typeof window !== 'undefined' ? window : this);
