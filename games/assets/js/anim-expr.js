/**
 * anim-expr.js — W.H. Academy · Animation Lab
 * ----------------------------------------------------------------------------
 * A tiny, SAFE expression language for animation specs.
 *
 * Why this exists: every page ships a Content-Security-Policy WITHOUT
 * 'unsafe-eval', so `eval` / `new Function` are blocked. Animation specs are
 * plain JSON, and their maths ("sqrt(p^2 + b^2)") is compiled here into
 * closures by a hand-written parser. Nothing in a spec can ever run arbitrary
 * code — an expression can only do arithmetic on numbers.
 *
 * Language
 *   numbers     3  2.5  .5  1e3
 *   operators   + - * / % ^   (^ is power, right-associative, -a^2 = -(a^2))
 *   compare     < > <= >= == !=      (result is 1 or 0)
 *   logic       && || !              (result is 1 or 0)
 *   ternary     cond ? a : b
 *   names       p, b, A.x, A.y       (params, derived values, named points)
 *   constants   pi tau e true false inf
 *   functions   abs sqrt cbrt sq pow min max floor ceil round trunc fract sign
 *               sin cos tan asin acos atan atan2 (all in DEGREES), rad deg
 *               ln log log2 exp hypot clamp lerp mod gcd lcm ease step if isint
 *
 * Text templates (narration, labels, formulas) embed expressions as
 *   {{ expr }}  or  {{ expr | fmt }}
 * where fmt is  2   (up to 2 decimals, trailing zeros trimmed — the default)
 *               =2  (exactly 2 decimals)      int  (whole number)
 *               +   (always show the sign; combine like  +=1)
 * ----------------------------------------------------------------------------
 * Works in the browser (window.WHA_AnimExpr) and in Node (module.exports) so
 * the authoring checks can reuse the very same parser.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WHA_AnimExpr = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var D2R = Math.PI / 180;
  var R2D = 180 / Math.PI;

  var CONSTS = { pi: Math.PI, tau: Math.PI * 2, e: Math.E, 'true': 1, 'false': 0, inf: Infinity };

  function gcd2(a, b) { a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b)); while (b) { var t = b; b = a % b; a = t; } return a; }
  function smooth(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }

  // name -> [fn, minArgs, maxArgs]
  var FUNCS = {
    abs: [Math.abs, 1, 1], sqrt: [Math.sqrt, 1, 1], cbrt: [Math.cbrt, 1, 1],
    sq: [function (x) { return x * x; }, 1, 1],
    pow: [Math.pow, 2, 2],
    min: [Math.min, 1, 16], max: [Math.max, 1, 16],
    floor: [Math.floor, 1, 1], ceil: [Math.ceil, 1, 1], trunc: [Math.trunc, 1, 1],
    round: [function (x, d) { if (d === undefined) return Math.round(x); var m = Math.pow(10, d); return Math.round(x * m) / m; }, 1, 2],
    fract: [function (x) { return x - Math.floor(x); }, 1, 1],
    sign: [Math.sign, 1, 1],
    sin: [function (x) { return Math.sin(x * D2R); }, 1, 1],
    cos: [function (x) { return Math.cos(x * D2R); }, 1, 1],
    tan: [function (x) { return Math.tan(x * D2R); }, 1, 1],
    asin: [function (x) { return Math.asin(x) * R2D; }, 1, 1],
    acos: [function (x) { return Math.acos(x) * R2D; }, 1, 1],
    atan: [function (x) { return Math.atan(x) * R2D; }, 1, 1],
    atan2: [function (y, x) { return Math.atan2(y, x) * R2D; }, 2, 2],
    rad: [function (x) { return x * D2R; }, 1, 1],
    deg: [function (x) { return x * R2D; }, 1, 1],
    ln: [Math.log, 1, 1], log: [Math.log10, 1, 1], log2: [Math.log2, 1, 1], exp: [Math.exp, 1, 1],
    hypot: [Math.hypot, 1, 8],
    clamp: [function (x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }, 3, 3],
    lerp: [function (a, b, t) { return a + (b - a) * t; }, 3, 3],
    mod: [function (a, b) { return ((a % b) + b) % b; }, 2, 2],
    gcd: [gcd2, 2, 2],
    lcm: [function (a, b) { var g = gcd2(a, b); return g ? Math.abs(Math.round(a) * Math.round(b)) / g : 0; }, 2, 2],
    ease: [smooth, 1, 1],
    step: [function (edge, x) { return x >= edge ? 1 : 0; }, 2, 2],
    'if': [function (c, a, b) { return c ? a : b; }, 3, 3],
    isint: [function (x) { return Math.abs(x - Math.round(x)) < 1e-9 ? 1 : 0; }, 1, 1]
  };

  // ---------------------------------------------------------------- tokenizer
  function tokenize(src) {
    var toks = [], i = 0, n = src.length, c, m, rest;
    while (i < n) {
      c = src.charAt(i);
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      rest = src.slice(i);
      if ((c >= '0' && c <= '9') || (c === '.' && /[0-9]/.test(src.charAt(i + 1)))) {
        m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(rest);
        toks.push({ t: 'num', v: parseFloat(m[0]), p: i });
        i += m[0].length; continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        m = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?/.exec(rest);
        toks.push({ t: 'id', v: m[0], p: i });
        i += m[0].length; continue;
      }
      var two = src.substr(i, 2);
      if (two === '<=' || two === '>=' || two === '==' || two === '!=' || two === '&&' || two === '||') {
        toks.push({ t: 'op', v: two, p: i }); i += 2; continue;
      }
      if ('+-*/%^(),?:<>!'.indexOf(c) !== -1) { toks.push({ t: 'op', v: c, p: i }); i++; continue; }
      throw new Error("Unexpected character '" + c + "' at position " + i);
    }
    return toks;
  }

  // ------------------------------------------------------------------- parser
  function parse(toks) {
    var pos = 0;
    function peek() { return toks[pos]; }
    function isOp(v) { var t = toks[pos]; return t && t.t === 'op' && t.v === v; }
    function eat(v) { if (!isOp(v)) throw new Error("Expected '" + v + "'" + (toks[pos] ? " at position " + toks[pos].p : ' at the end')); pos++; }

    function expr() { return ternary(); }
    function ternary() {
      var c = or();
      if (isOp('?')) { pos++; var a = expr(); eat(':'); var b = expr(); return { k: 'tern', c: c, a: a, b: b }; }
      return c;
    }
    function or() { var l = and(); while (isOp('||')) { pos++; l = { k: 'bin', op: '||', l: l, r: and() }; } return l; }
    function and() { var l = cmp(); while (isOp('&&')) { pos++; l = { k: 'bin', op: '&&', l: l, r: cmp() }; } return l; }
    function cmp() {
      var l = add(), t;
      while ((t = peek()) && t.t === 'op' && (t.v === '<' || t.v === '>' || t.v === '<=' || t.v === '>=' || t.v === '==' || t.v === '!=')) {
        pos++; l = { k: 'bin', op: t.v, l: l, r: add() };
      }
      return l;
    }
    function add() {
      var l = mul(), t;
      while ((t = peek()) && t.t === 'op' && (t.v === '+' || t.v === '-')) { pos++; l = { k: 'bin', op: t.v, l: l, r: mul() }; }
      return l;
    }
    function mul() {
      var l = unary(), t;
      while ((t = peek()) && t.t === 'op' && (t.v === '*' || t.v === '/' || t.v === '%')) { pos++; l = { k: 'bin', op: t.v, l: l, r: unary() }; }
      return l;
    }
    function unary() {
      if (isOp('-')) { pos++; return { k: 'un', op: '-', a: unary() }; }
      if (isOp('+')) { pos++; return unary(); }
      if (isOp('!')) { pos++; return { k: 'un', op: '!', a: unary() }; }
      return power();
    }
    function power() {
      var base = primary();
      if (isOp('^')) { pos++; return { k: 'bin', op: '^', l: base, r: unary() }; }  // right-assoc, allows 2^-1
      return base;
    }
    function primary() {
      var t = peek();
      if (!t) throw new Error('Expression ended unexpectedly');
      if (t.t === 'num') { pos++; return { k: 'num', v: t.v }; }
      if (t.t === 'id') {
        pos++;
        if (isOp('(')) {
          pos++;
          var args = [];
          if (!isOp(')')) {
            args.push(expr());
            while (isOp(',')) { pos++; args.push(expr()); }
          }
          eat(')');
          return { k: 'call', f: t.v, args: args, p: t.p };
        }
        return { k: 'id', v: t.v };
      }
      if (isOp('(')) { pos++; var e = expr(); eat(')'); return e; }
      throw new Error("Unexpected '" + t.v + "' at position " + t.p);
    }

    var tree = expr();
    if (pos < toks.length) {
      var bad = toks[pos];
      throw new Error("Unexpected '" + bad.v + "' at position " + bad.p +
        (bad.t === 'id' || bad.t === 'num' ? " (missing an operator? write 2*a, not 2a)" : ''));
    }
    return tree;
  }

  // ----------------------------------------------------------- closure builder
  function truthy(x) { return x !== 0 && x === x; }

  function build(node, ctx) {
    var l, r, a, b, c, fn, f, args, def;
    switch (node.k) {
      case 'num': { var nv = node.v; return function () { return nv; }; }
      case 'id': {
        var name = node.v;
        if (Object.prototype.hasOwnProperty.call(CONSTS, name)) { var cv = CONSTS[name]; return function () { return cv; }; }
        ctx.deps[name] = 1;
        return function (env) { var x = env[name]; return x === undefined ? NaN : x; };
      }
      case 'un':
        a = build(node.a, ctx);
        if (node.op === '-') return function (env) { return -a(env); };
        return function (env) { return truthy(a(env)) ? 0 : 1; };
      case 'tern':
        c = build(node.c, ctx); a = build(node.a, ctx); b = build(node.b, ctx);
        return function (env) { return truthy(c(env)) ? a(env) : b(env); };
      case 'bin':
        l = build(node.l, ctx); r = build(node.r, ctx);
        switch (node.op) {
          case '+': return function (env) { return l(env) + r(env); };
          case '-': return function (env) { return l(env) - r(env); };
          case '*': return function (env) { return l(env) * r(env); };
          case '/': return function (env) { return l(env) / r(env); };
          case '%': return function (env) { return l(env) % r(env); };
          case '^': return function (env) { return Math.pow(l(env), r(env)); };
          case '<': return function (env) { return l(env) < r(env) ? 1 : 0; };
          case '>': return function (env) { return l(env) > r(env) ? 1 : 0; };
          case '<=': return function (env) { return l(env) <= r(env) + 1e-9 ? 1 : 0; };
          case '>=': return function (env) { return l(env) >= r(env) - 1e-9 ? 1 : 0; };
          case '==': return function (env) { return Math.abs(l(env) - r(env)) < 1e-9 ? 1 : 0; };
          case '!=': return function (env) { return Math.abs(l(env) - r(env)) < 1e-9 ? 0 : 1; };
          case '&&': return function (env) { return truthy(l(env)) && truthy(r(env)) ? 1 : 0; };
          case '||': return function (env) { return truthy(l(env)) || truthy(r(env)) ? 1 : 0; };
        }
        throw new Error('Unknown operator ' + node.op);
      case 'call':
        def = FUNCS[node.f];
        if (!def) throw new Error("Unknown function '" + node.f + "'");
        if (node.args.length < def[1] || node.args.length > def[2]) {
          throw new Error(node.f + '() takes ' + (def[1] === def[2] ? def[1] : def[1] + '–' + def[2]) + ' argument(s), got ' + node.args.length);
        }
        f = def[0];
        args = node.args.map(function (x) { return build(x, ctx); });
        if (args.length === 1) { var a0 = args[0]; return function (env) { return f(a0(env)); }; }
        if (args.length === 2) { var b0 = args[0], b1 = args[1]; return function (env) { return f(b0(env), b1(env)); }; }
        if (args.length === 3) { var c0 = args[0], c1 = args[1], c2 = args[2]; return function (env) { return f(c0(env), c1(env), c2(env)); }; }
        return function (env) { var v = new Array(args.length); for (var i = 0; i < args.length; i++) v[i] = args[i](env); return f.apply(null, v); };
    }
    throw new Error('Bad expression node');
  }

  // ---------------------------------------------------------------- public API
  var cache = Object.create(null);

  /** compile(src) -> { fn(env)->number, deps:[names], error:string|null, src } */
  function compile(src) {
    var key = String(src);
    var hit = cache[key];
    if (hit) return hit;
    var res;
    try {
      var ctx = { deps: Object.create(null) };
      var fn = build(parse(tokenize(key)), ctx);
      res = { fn: fn, deps: Object.keys(ctx.deps), error: null, src: key };
    } catch (e) {
      res = { fn: function () { return NaN; }, deps: [], error: e.message, src: key };
    }
    cache[key] = res;
    return res;
  }

  function evaluate(src, env) { return compile(src).fn(env || {}); }

  function formatNumber(x, spec) {
    if (typeof x !== 'number' || x !== x) return '?';
    if (!isFinite(x)) return x > 0 ? '∞' : '-∞';
    var fixed = false, sign = false, intOnly = false, d = 2, s;
    if (spec) {
      spec = String(spec).replace(/\s+/g, '');
      if (spec.charAt(0) === '+') { sign = true; spec = spec.slice(1); }
      if (spec.charAt(0) === '=') { fixed = true; spec = spec.slice(1); }
      if (spec === 'int') intOnly = true;
      else if (/^\d+$/.test(spec)) d = Math.min(8, parseInt(spec, 10));
    }
    if (intOnly) s = String(Math.round(x));
    else {
      s = x.toFixed(d);
      if (!fixed && s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    }
    if (/^-0(\.0*)?$/.test(s)) s = s.slice(1);
    if (sign && x > 0) s = '+' + s;
    return s;
  }

  var TPL_RE = /\{\{\s*([^{}|]+?)\s*(?:\|\s*([^{}]*?)\s*)?\}\}/g;
  // {{if condition | text when true | text when false}}  (the "false" part is optional;
  // the texts may not contain | { or } — keep them short and plain)
  var IF_RE = /\{\{\s*if\s+([^|{}]+?)\s*\|\s*([^|{}]*?)\s*(?:\|\s*([^|{}]*?)\s*)?\}\}/g;

  /** Replaces every {{ expr | fmt }} and {{if cond | a | b}} in a string. */
  function runTemplate(str, env) {
    return String(str)
      .replace(IF_RE, function (_, cond, a, b) { return compile(cond).fn(env) > 0.5 ? a : (b || ''); })
      .replace(TPL_RE, function (_, ex, fmt) { return formatNumber(compile(ex).fn(env), fmt); });
  }

  /** Lists every expression inside a template: [{src, error, deps}] — for linting. */
  function templateExprs(str) {
    var out = [], m, s = String(str);
    var rif = new RegExp(IF_RE.source, 'g');
    while ((m = rif.exec(s))) { var ci = compile(m[1]); out.push({ src: m[1], error: ci.error, deps: ci.deps }); }
    s = s.replace(new RegExp(IF_RE.source, 'g'), '');
    var re = new RegExp(TPL_RE.source, 'g');
    while ((m = re.exec(s))) { var c = compile(m[1]); out.push({ src: m[1], error: c.error, deps: c.deps }); }
    return out;
  }

  function hasTemplate(str) { return /\{\{[\s\S]*?\}\}/.test(String(str)); }

  var EASE = {
    linear: function (t) { return t; },
    'in': function (t) { return t * t * t; },
    out: function (t) { return 1 - Math.pow(1 - t, 3); },
    inOut: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    spring: function (t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  };

  return {
    compile: compile, evaluate: evaluate, formatNumber: formatNumber,
    runTemplate: runTemplate, templateExprs: templateExprs, hasTemplate: hasTemplate,
    EASE: EASE, FUNCS: Object.keys(FUNCS), CONSTS: Object.keys(CONSTS)
  };
});
