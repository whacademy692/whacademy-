// Neon Racer scene: pseudo-3D road with a DAY world (sky, sun, clouds, hills, grass, trees) and a NIGHT world
// (moon, stars, lake with reflections, far city lights, street lamps). One option gate per answer, one player car.
// Everything is drawn from one plain state object S, so it can be tested and reused for previews.

export const CAR_K = 0.74;                         // player's default row on the road (0 horizon .. 1 bottom)
export const CAR_MIN_K = 0.42;                     // furthest the car can drive up the road (toward the gates)
export const CAR_MAX_K = 0.82;
export const GATE_K0 = 0.27;                       // where the gates first appear
export const rowT = (k) => Math.pow(k, 2.1);

export function geom(R) {
  const hz = R.h * 0.32;
  const rb = Math.min(R.w * 0.47, R.h * 0.5);      // half road width at the bottom of the screen
  const r0 = R.w * 0.012;
  const roadHalf = (t) => r0 + (rb - r0) * t;
  const rowY = (t) => hz + (R.h - hz) * t;
  const laneX = (lane, t) => R.w / 2 + (lane - 1.5) * (roadHalf(t) * 2 / 4);
  return { hz, roadHalf, rowY, laneX };
}

// ---------- small helpers ----------
const clamp01 = (x) => Math.max(0, Math.min(1, x));
export function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function mix(a, b, t) { const A = hex(a), B = hex(b); return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`; }
export const lighten = (c, t) => mix(c, '#ffffff', t);
export const darken = (c, t) => mix(c, '#000000', t);
export const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// Gate colours: ONE vivid colour for all four boxes (the letter tells them apart). Day = orange, night = electric blue.
export const GATE_COLORS = { day: ['#ff6a00', '#ffc400'], night: ['#00c8ff', '#3b5bff'] };
const GOOD = ['#00c853', '#7dff9c'], BAD = ['#e5173a', '#ff6b6b'];

export const STAR_POS = Array.from({ length: 160 }, (_, i) => ({ x: ((i * 9301 + 49297) % 233280) / 233280, y: ((i * 4621 + 7919) % 233280) / 233280, s: 0.5 + (i % 5) * 0.35 }));

// ---------- sky + far scenery ----------
export function ridge(c, w, y0, amp, freq, phase, fill) {
  c.fillStyle = fill; c.beginPath(); c.moveTo(0, y0 + 40);
  for (let x = 0; x <= w + 16; x += 16) c.lineTo(x, y0 - amp * (0.55 + 0.45 * Math.sin(x * freq + phase) * Math.sin(x * freq * 0.37 + phase * 1.7)));
  c.lineTo(w, y0 + 40); c.closePath(); c.fill();
}

export function drawSkyDay(R, S, g) {
  const c = R.ctx, w = R.w, hz = g.hz;
  const grd = c.createLinearGradient(0, 0, 0, hz);
  grd.addColorStop(0, '#2f8cf0'); grd.addColorStop(0.65, '#8fd0ff'); grd.addColorStop(1, '#dff3ff');
  c.fillStyle = grd; c.fillRect(0, 0, w, hz + 1);
  const sx = w * 0.72, sy = hz * 0.46;
  R.glow(sx, sy, Math.min(w, 600) * 0.45, '#fff2b0', 0.7);
  c.fillStyle = '#fff6c9'; c.beginPath(); c.arc(sx, sy, Math.min(w, 600) * 0.05, 0, 7); c.fill();
  // clouds drift slowly (a still sky looks dead)
  const n = S.preset.name === 'low' ? 3 : 6;
  for (let i = 0; i < n; i++) {
    const sp = 6 + (i % 3) * 3, x = ((hash(i) * w * 1.4 + S.t * sp) % (w * 1.3)) - w * 0.15, y = hz * (0.12 + 0.5 * hash(i + 9)), r = 14 + 22 * hash(i + 4);
    c.fillStyle = 'rgba(255,255,255,.92)';
    for (const [dx, dy, k] of [[0, 0, 1], [r * 0.9, -r * 0.2, 1.15], [r * 1.9, 0, 0.95], [r * 1.0, r * 0.25, 1.1]]) { c.beginPath(); c.arc(x + dx, y + dy, r * k * 0.8, 0, 7); c.fill(); }
    c.fillStyle = 'rgba(190,215,240,.5)'; c.beginPath(); c.ellipse(x + r, y + r * 0.45, r * 1.7, r * 0.28, 0, 0, 7); c.fill();
  }
  ridge(c, w, hz - 4, hz * 0.34, 0.006, 1.1, '#8fb4de');
  ridge(c, w, hz + 2, hz * 0.2, 0.011, 4.2, '#5fa66a');
}

export function drawSkyNight(R, S, g) {
  const c = R.ctx, w = R.w, hz = g.hz, th = S.theme;
  const grd = c.createLinearGradient(0, 0, 0, hz);
  grd.addColorStop(0, th.sky[0]); grd.addColorStop(1, th.sky[1]);
  c.fillStyle = grd; c.fillRect(0, 0, w, hz + 1);
  c.fillStyle = '#fff';
  const ns = Math.min(STAR_POS.length, Math.round(S.preset.stars * (th.stars || 1)));
  for (let i = 0; i < ns; i++) { const s = STAR_POS[i]; c.globalAlpha = 0.25 + 0.6 * Math.abs(Math.sin(S.t * s.s + i)); c.fillRect(s.x * w, s.y * hz * 0.85, s.s, s.s); }
  c.globalAlpha = 1;
  if (th.aurora && !S.reduceMotion) {
    for (let b = 0; b < 3; b++) {
      c.globalAlpha = 0.16; c.fillStyle = th.accent;
      c.beginPath(); c.moveTo(0, hz * (0.2 + b * 0.2));
      for (let x = 0; x <= w; x += 24) c.lineTo(x, hz * (0.2 + b * 0.2) + Math.sin(x * 0.02 + S.t * 0.8 + b) * 14);
      c.lineTo(w, hz * (0.45 + b * 0.2)); c.lineTo(0, hz * (0.45 + b * 0.2)); c.closePath(); c.fill();
    }
    c.globalAlpha = 1;
  }
  const mx = w * 0.68, my = hz * 0.42, mr = Math.min(w, 600) * 0.045;
  R.glow(mx, my, mr * 7, '#bcd6ff', 0.55);
  c.fillStyle = '#f4f7ff'; c.beginPath(); c.arc(mx, my, mr, 0, 7); c.fill();
  c.fillStyle = 'rgba(160,180,220,.35)'; for (const [dx, dy, r] of [[-0.3, -0.2, 0.25], [0.25, 0.15, 0.3], [-0.1, 0.4, 0.18]]) { c.beginPath(); c.arc(mx + dx * mr, my + dy * mr, r * mr, 0, 7); c.fill(); }
  if (th.lightning && S.flash > 0) { c.fillStyle = '#cfe0ff'; c.globalAlpha = S.flash * 0.35; c.fillRect(0, 0, w, hz); c.globalAlpha = 1; }
  ridge(c, w, hz - 3, hz * 0.3, 0.007, 2.3, '#10183a');
  // far shore skyline with lit windows, across the water
  c.fillStyle = '#0a1028';
  for (let x = 0; x < w; x += 22) { const bh = 6 + 26 * hash(x * 0.37) * (0.4 + 0.6 * Math.abs(Math.sin(x * 0.013))); c.fillRect(x, hz - bh, 16, bh + 2); }
  for (let x = 0; x < w; x += 22) { if (hash(x + 3) > 0.55) { c.fillStyle = hash(x) > 0.5 ? '#ffd76a' : '#9bd7ff'; c.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(S.t * 0.8 + x)); c.fillRect(x + 4 + hash(x + 1) * 6, hz - 4 - hash(x + 2) * 14, 2, 2); } }
  c.globalAlpha = 1;
}

// ---------- ground (grass / water) ----------
export function drawGroundDay(R, S, g) {
  const c = R.ctx, w = R.w, h = R.h, hz = g.hz;
  const grd = c.createLinearGradient(0, hz, 0, h);
  grd.addColorStop(0, '#78c653'); grd.addColorStop(1, '#2f8a34');
  c.fillStyle = grd; c.fillRect(0, hz, w, h - hz);
  const N = Math.max(10, Math.round(S.preset.roadSegs / 3)), fr = S.scroll % 2, base = Math.floor(S.scroll / 2);
  for (let i = -1; i < N; i++) {                                    // mown stripes sliding toward the camera
    const k0 = Math.max(0, (i + fr / 2) / N), k1 = Math.min(1, (i + 1 + fr / 2) / N);
    if (k1 <= k0) continue;
    if (((i + base) & 1) === 0) continue;
    const y0 = g.rowY(rowT(k0)), y1 = g.rowY(rowT(k1));
    c.fillStyle = 'rgba(20,90,30,.16)'; c.fillRect(0, y0, w, y1 - y0 + 1);
  }
}

export function drawGroundNight(R, S, g) {
  const c = R.ctx, w = R.w, h = R.h, hz = g.hz, th = S.theme;
  const grd = c.createLinearGradient(0, hz, 0, h);
  grd.addColorStop(0, '#13587f'); grd.addColorStop(0.5, '#0b3558'); grd.addColorStop(1, '#061a33');
  c.fillStyle = grd; c.fillRect(0, hz, w, h - hz);
  // moon reflection: a shimmering column on the water, plus coloured shore lights
  const mx = w * 0.68;
  for (let i = 0; i < 18; i++) {
    const k = 0.02 + i / 18 * 0.9, t = rowT(k), y = g.rowY(t), len = (10 + 90 * t) * (0.6 + 0.4 * Math.sin(S.t * 2 + i * 1.7));
    c.globalAlpha = 0.5 * (1 - k * 0.6); c.fillStyle = '#cfe6ff'; c.fillRect(mx - len / 2 + Math.sin(S.t * 1.3 + i) * 6 * t, y, len, 1.5 + 2.5 * t);
  }
  c.globalAlpha = 1;
  // ripples travelling toward the viewer
  const N = Math.max(10, Math.round(S.preset.roadSegs / 3));
  for (let i = 0; i < N; i++) {
    const k = (i + (S.scroll * 0.35 % 1)) / N, t = rowT(k), y = g.rowY(t);
    c.globalAlpha = 0.1 + 0.28 * t; c.strokeStyle = '#8fd6ff'; c.lineWidth = 1 + 1.4 * t;
    c.beginPath();
    for (let x = 0; x <= w; x += 26) { const yy = y + Math.sin(x * 0.05 + S.t * 1.6 + i) * (1 + 3 * t); if (x === 0) c.moveTo(x, yy); else c.lineTo(x, yy); }
    c.stroke();
  }
  c.globalAlpha = 1;
  void th;
}

// ---------- road ----------
function quad(c, xa0, ya, xa1, xb0, yb, xb1) { c.beginPath(); c.moveTo(xa0, ya); c.lineTo(xa1, ya); c.lineTo(xb1, yb); c.lineTo(xb0, yb); c.closePath(); }

function drawRoad(R, S, g) {
  const c = R.ctx, w = R.w, h = R.h, hz = g.hz, day = S.env === 'day', th = S.theme;
  const cx = w / 2;
  // shoulder (dirt / sand on day, dark bank on night) then asphalt
  const sh = 1.07;
  c.fillStyle = day ? '#b9a98a' : '#0a1a2c';
  c.beginPath(); c.moveTo(cx - g.roadHalf(0) * sh, hz); c.lineTo(cx + g.roadHalf(0) * sh, hz); c.lineTo(cx + g.roadHalf(1) * sh, h); c.lineTo(cx - g.roadHalf(1) * sh, h); c.closePath(); c.fill();
  const rg = c.createLinearGradient(0, hz, 0, h);
  if (day) { rg.addColorStop(0, '#767b86'); rg.addColorStop(1, '#3a3e48'); } else { rg.addColorStop(0, '#232a45'); rg.addColorStop(1, '#0d1122'); }
  c.fillStyle = rg;
  c.beginPath(); c.moveTo(cx - g.roadHalf(0), hz); c.lineTo(cx + g.roadHalf(0), hz); c.lineTo(cx + g.roadHalf(1), h); c.lineTo(cx - g.roadHalf(1), h); c.closePath(); c.fill();
  const N = Math.max(10, Math.round(S.preset.roadSegs / 3)), fr = S.scroll % 1;
  // red/white kerb stones on both edges (day) / reflective studs (night)
  for (let i = -1; i < N; i++) {
    const k0 = Math.max(0, (i + fr) / N), k1 = Math.min(1, (i + 1 + fr) / N);
    if (k1 <= k0) continue;
    const t0 = rowT(k0), t1 = rowT(k1), y0 = g.rowY(t0), y1 = g.rowY(t1), r0 = g.roadHalf(t0), r1 = g.roadHalf(t1);
    const odd = ((i + Math.floor(S.scroll)) & 1) === 0;
    const kw0 = r0 * 0.045, kw1 = r1 * 0.045;
    c.fillStyle = day ? (odd ? '#e8eaee' : '#d5232f') : (odd ? '#ffe9a8' : '#1a2140');
    quad(c, cx - r0 - kw0, y0, cx - r0, cx - r1 - kw1, y1, cx - r1); c.fill();
    quad(c, cx + r0, y0, cx + r0 + kw0, cx + r1, y1, cx + r1 + kw1); c.fill();
    // asphalt grain: faint alternating shade so speed is felt
    if (odd) { c.fillStyle = day ? 'rgba(0,0,0,.05)' : 'rgba(120,150,255,.035)'; quad(c, cx - r0, y0, cx + r0, cx - r1, y1, cx + r1); c.fill(); }
  }
  // solid edge lines
  for (const sgn of [-1, 1]) {
    const x0 = cx + sgn * g.roadHalf(0) * 0.94, x1 = cx + sgn * g.roadHalf(1) * 0.94;
    if (day) { c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x0, hz); c.lineTo(x1, h); c.stroke(); }
    else R.neonLine(x0, hz, x1, h, th.accent, 2.4, 0.95);
  }
  // dashed lane dividers, drawn in perspective so they really move toward you
  for (let L = 1; L <= 3; L++) {
    const f = (L - 2) / 2;
    for (let i = -1; i < N; i++) {
      const k0 = Math.max(0, (i + fr) / N), k1 = Math.min(1, (i + fr + 0.5) / N);
      if (k1 <= k0) continue;
      const t0 = rowT(k0), t1 = rowT(k1), y0 = g.rowY(t0), y1 = g.rowY(t1);
      const xa = cx + f * g.roadHalf(t0), xb = cx + f * g.roadHalf(t1), wa = 0.5 + 3 * t0, wb = 0.5 + 3 * t1;
      c.globalAlpha = day ? 0.92 : 0.85; c.fillStyle = day ? '#f4f4f4' : '#9fb4ff';
      quad(c, xa - wa, y0, xa + wa, xb - wb, y1, xb + wb); c.fill();
    }
  }
  c.globalAlpha = 1;
  if (!day) {                                                         // wet-road sheen under the moon / lamps
    c.globalAlpha = 0.07; c.fillStyle = '#9fb4ff';
    c.beginPath(); c.moveTo(cx - g.roadHalf(0) * 0.2, hz); c.lineTo(cx + g.roadHalf(0) * 0.2, hz); c.lineTo(cx + g.roadHalf(1) * 0.5, h); c.lineTo(cx - g.roadHalf(1) * 0.5, h); c.closePath(); c.fill(); c.globalAlpha = 1;
  }
  if (th.snow && !S.reduceMotion) {
    c.fillStyle = '#fff';
    for (let i = 0; i < 40; i++) { c.globalAlpha = 0.6; c.fillRect(((i * 97) % 100) / 100 * w, ((i * 31 + S.t * (40 + (i % 5) * 12)) % h), 2, 2); }
    c.globalAlpha = 1;
  }
}

// ---------- roadside: trees + bushes (day), street lamps + railings (night) ----------
export function tree(c, x, y, s, kind, shade, night = false) {
  c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.ellipse(x, y, s * 0.55, s * 0.12, 0, 0, 7); c.fill();
  c.fillStyle = night ? '#2a1d14' : '#6b4423'; c.fillRect(x - s * 0.06, y - s * 0.4, s * 0.12, s * 0.4);
  if (kind === 0) {                                                   // conifer
    for (let i = 0; i < 3; i++) {
      const yy = y - s * (0.3 + i * 0.3), ww = s * (0.5 - i * 0.12);
      c.fillStyle = night ? mix('#123d2a', '#08201a', i * 0.25) : mix('#1f7a3a', '#0e4d24', shade * 0.5 + i * 0.15);
      c.beginPath(); c.moveTo(x, yy - s * 0.42); c.lineTo(x + ww, yy); c.lineTo(x - ww, yy); c.closePath(); c.fill();
    }
  } else {                                                            // round crown
    c.fillStyle = night ? '#0f3322' : mix('#2f9e44', '#14602c', shade * 0.6); c.beginPath(); c.arc(x, y - s * 0.72, s * 0.42, 0, 7); c.fill();
    c.fillStyle = night ? '#16452e' : mix('#52c25f', '#2f9e44', shade * 0.6); c.beginPath(); c.arc(x - s * 0.14, y - s * 0.82, s * 0.26, 0, 7); c.fill();
  }
}

function drawSide(R, S, g) {
  const c = R.ctx, w = R.w, day = S.env === 'day', cx = w / 2;
  const N = S.preset.name === 'low' ? 9 : 14, fr = S.scroll % 1, base = Math.floor(S.scroll);
  for (let i = 0; i < N; i++) {                                       // far to near
    const k = (i + fr) / N, kk = Math.max(0.02, 1 - (k - 0.02)), idx = base + (N - i);
    const t = rowT(Math.min(1, k)), y = g.rowY(t), rh = g.roadHalf(t);
    if (t < 0.01) continue;
    for (const side of [-1, 1]) {
      const id = idx * 2 + (side > 0 ? 1 : 0);
      if (day) {
        const near = 1.45 + 0.9 * hash(id), x = cx + side * (rh * near + 6 * t), sz = 8 + 120 * t;
        if (hash(id + 5) > 0.22) tree(c, x, y, sz, hash(id + 2) > 0.45 ? 0 : 1, 1 - t);
        else { c.fillStyle = '#3d9a45'; c.beginPath(); c.ellipse(x, y - sz * 0.1, sz * 0.3, sz * 0.2, 0, 0, 7); c.fill(); }
      } else {
        if ((idx & 1) === 0 && side * 0 === 0) {                      // street lamp every second slot, on both sides
          const x = cx + side * rh * 1.12, ph = 10 + 150 * t, pw = Math.max(1, 5 * t);
          c.fillStyle = '#1b2442'; c.fillRect(x - pw / 2, y - ph, pw, ph);
          c.fillRect(x - side * ph * 0.14, y - ph, side * ph * 0.14, pw * 0.8);
          const lx = x - side * ph * 0.14;
          R.glow(lx, y - ph + pw, 18 + 120 * t, '#ffe7a3', 0.85);
          c.fillStyle = '#fff6d0'; c.beginPath(); c.arc(lx, y - ph + pw, Math.max(1.5, 5 * t), 0, 7); c.fill();
          if (t > 0.18) { c.globalAlpha = 0.16; c.fillStyle = '#ffe7a3'; c.beginPath(); c.ellipse(cx + side * rh * 0.7, y + 4 * t, rh * 0.55, 8 * t + 2, 0, 0, 7); c.fill(); c.globalAlpha = 1; }
        } else {                                                      // railing post with a red reflector
          const x = cx + side * rh * 1.1, ph = 3 + 26 * t;
          c.fillStyle = '#26314f'; c.fillRect(x - Math.max(1, 3 * t), y - ph, Math.max(2, 6 * t), ph);
          c.fillStyle = '#ff4d5a'; c.fillRect(x - Math.max(1, 2 * t), y - ph, Math.max(2, 4 * t), Math.max(1, 5 * t));
        }
      }
    }
    void kk;
  }
}

// ---------- gates ----------
export function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

export function drawGates(R, S, g) {
  const G = S.gates; if (!G) return;
  const c = R.ctx, k = Math.min(1.15, G.k), t = rowT(Math.min(1, k)), y = g.rowY(rowT(k)), lw = g.roadHalf(t) * 2 / 4, gh = 26 + 150 * t;
  const base = GATE_COLORS[S.env === 'day' ? 'day' : 'night'];
  const pass = G.pass || 0;
  for (let L = 0; L < 4; L++) {
    const x = g.laneX(L, t), dim = G.hidden.includes(L);
    const isRight = G.result && L === G.result.correct, isWrong = G.result && L === G.result.picked && L !== G.result.correct;
    let alpha = dim ? 0.12 : 1, sc = 1;
    if (G.result) {
      if (isRight) { alpha = 1 - clamp01((pass - 0.15) / 0.5); sc = 1 + 0.35 * pass; }                       // green, swells, vanishes
      else if (isWrong) alpha = 1 - clamp01((pass - 0.45) / 0.45);
      else alpha = (dim ? 0.12 : 1) * (1 - clamp01(pass * 1.6));
    }
    if (alpha <= 0.01) continue;
    const pal = isRight ? GOOD : isWrong ? BAD : base;
    const pw = lw * 0.86 * sc, ph = gh * 0.46 * sc, top = y - gh * sc, left = x - pw / 2;
    c.globalAlpha = alpha;
    c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(x, y + 2, pw * 0.55, 4 + 6 * t, 0, 0, 7); c.fill();
    // posts
    const post = Math.max(2, pw * 0.055);
    c.fillStyle = '#242a3e'; c.fillRect(left, top, post, y - top); c.fillRect(left + pw - post, top, post, y - top);
    c.fillStyle = pal[1]; c.fillRect(left, y - Math.max(3, 8 * t), post, Math.max(3, 8 * t)); c.fillRect(left + pw - post, y - Math.max(3, 8 * t), post, Math.max(3, 8 * t));
    // header panel: solid vivid gradient (no glass), crisp white rim, flat gloss strip
    const gr = c.createLinearGradient(0, top, 0, top + ph);
    gr.addColorStop(0, pal[1]); gr.addColorStop(1, pal[0]);
    roundRect(c, left, top, pw, ph, Math.max(3, ph * 0.18)); c.fillStyle = gr; c.fill();
    c.lineWidth = Math.max(2, 3.2 * t + (S.colorBlind ? 2 : 0)); c.strokeStyle = '#ffffff'; c.stroke();
    c.save(); roundRect(c, left, top, pw, ph, Math.max(3, ph * 0.18)); c.clip(); c.fillStyle = 'rgba(255,255,255,.22)'; c.fillRect(left, top, pw, ph * 0.38); c.restore();
    const fs = Math.max(12, ph * 0.62);
    c.font = `800 ${Math.round(fs)}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = Math.max(2, fs * 0.12); c.strokeStyle = 'rgba(0,0,0,.45)'; c.strokeText(S.letters[L], x, top + ph / 2 + 1);
    c.fillStyle = '#ffffff'; c.fillText(S.letters[L], x, top + ph / 2 + 1);
    if (!dim) R.glow(x, top + ph / 2, pw * 0.8, pal[0].length === 7 ? pal[0] : '#ffffff', 0.28 * alpha);
  }
  c.globalAlpha = 1;
}

// ---------- the player's car (rear view, drawn from paths; units ~ 60 wide, origin = ground under the middle) ----------
export function drawCarShape(c, paint, opts = {}) {
  const dmg = opts.damage || 0, glowOn = opts.lights !== false;
  const hi = lighten(paint, 0.35), lo = darken(paint, 0.38), dk = darken(paint, 0.55);
  c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(0, 2, 36, 5, 0, 0, 7); c.fill();
  // tyres
  c.fillStyle = '#0d0e14'; roundRect(c, -33, -15, 11, 16, 3); c.fill(); roundRect(c, 22, -15, 11, 16, 3); c.fill();
  c.fillStyle = '#2b2f3d'; c.fillRect(-31, -12, 2, 9); c.fillRect(29, -12, 2, 9);
  // lower body
  const bg = c.createLinearGradient(0, -26, 0, -5); bg.addColorStop(0, hi); bg.addColorStop(0.45, paint); bg.addColorStop(1, lo);
  c.fillStyle = bg; c.beginPath(); c.moveTo(-30, -7); c.lineTo(-31, -19); c.quadraticCurveTo(-31, -25, -24, -26); c.lineTo(24, -26); c.quadraticCurveTo(31, -25, 31, -19); c.lineTo(30, -7); c.closePath(); c.fill();
  // cabin + rear window
  const cg = c.createLinearGradient(0, -40, 0, -25); cg.addColorStop(0, hi); cg.addColorStop(1, paint);
  c.fillStyle = cg; c.beginPath(); c.moveTo(-23, -25); c.lineTo(-17, -39); c.quadraticCurveTo(0, -42, 17, -39); c.lineTo(23, -25); c.closePath(); c.fill();
  const wg = c.createLinearGradient(0, -37, 0, -26); wg.addColorStop(0, '#223a63'); wg.addColorStop(1, '#0b1630');
  c.fillStyle = wg; c.beginPath(); c.moveTo(-19.5, -26.5); c.lineTo(-14.5, -36.5); c.quadraticCurveTo(0, -38.8, 14.5, -36.5); c.lineTo(19.5, -26.5); c.closePath(); c.fill();
  c.fillStyle = 'rgba(255,255,255,.22)'; c.beginPath(); c.moveTo(-14, -35.5); c.lineTo(-5, -36.6); c.lineTo(-13, -27.5); c.lineTo(-17.5, -27.5); c.closePath(); c.fill();
  // spoiler
  c.fillStyle = dk; c.fillRect(-27, -33, 54, 3.4); c.fillRect(-20, -31, 3, 6); c.fillRect(17, -31, 3, 6);
  c.fillStyle = 'rgba(255,255,255,.28)'; c.fillRect(-27, -33, 54, 1);
  // bumper, plate, exhausts
  c.fillStyle = '#14151d'; roundRect(c, -28, -12.5, 56, 6.5, 2); c.fill();
  c.fillStyle = '#f1f3f8'; roundRect(c, -8, -11.5, 16, 5, 1); c.fill();
  c.fillStyle = '#3d4256'; c.fillRect(-6, -9.8, 12, 0.9);
  c.fillStyle = '#0a0a0f'; c.beginPath(); c.ellipse(-18, -3.4, 3.4, 1.8, 0, 0, 7); c.fill(); c.beginPath(); c.ellipse(18, -3.4, 3.4, 1.8, 0, 0, 7); c.fill();
  c.fillStyle = '#9aa1b8'; c.beginPath(); c.ellipse(-18, -3.7, 2.6, 1.1, 0, 0, 7); c.fill(); c.beginPath(); c.ellipse(18, -3.7, 2.6, 1.1, 0, 0, 7); c.fill();
  // tail lights
  const tl = c.createLinearGradient(0, -22, 0, -15); tl.addColorStop(0, '#ff6b6b'); tl.addColorStop(1, '#c2102a');
  c.fillStyle = glowOn ? tl : '#5a1620'; roundRect(c, -29, -22, 14, 6.5, 2); c.fill();
  if (dmg < 3) { roundRect(c, 15, -22, 14, 6.5, 2); c.fill(); } else { c.fillStyle = '#3a0f16'; roundRect(c, 15, -22, 14, 6.5, 2); c.fill(); }
  c.fillStyle = 'rgba(255,255,255,.45)'; c.fillRect(-27, -21, 6, 1.2); if (dmg < 3) c.fillRect(17, -21, 6, 1.2);
  // body highlight
  c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-28, -25.2); c.lineTo(28, -25.2); c.stroke();
  // damage: dents, scratches, cracked glass
  if (dmg >= 1) { c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-26, -23); c.lineTo(-21, -18); c.lineTo(-24, -15); c.moveTo(18, -24); c.lineTo(24, -19); c.stroke(); c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.moveTo(-26, -23); c.lineTo(-20, -24); c.lineTo(-22, -17); c.closePath(); c.fill(); }
  if (dmg >= 2) { c.strokeStyle = 'rgba(235,245,255,.85)'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(3, -37); c.lineTo(-2, -31); c.lineTo(5, -27); c.moveTo(-2, -31); c.lineTo(-11, -29); c.moveTo(-2, -31); c.lineTo(8, -33); c.stroke(); c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(8, -16, 16, 6); }
  if (dmg >= 3) { c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-10, -9); c.lineTo(-4, -22); c.lineTo(4, -12); c.stroke(); }
}

export function drawSmoke(R, S) {
  const c = R.ctx;
  for (const p of S.smoke || []) {
    c.globalAlpha = Math.max(0, p.a); c.fillStyle = p.fire ? `hsl(${20 + 20 * p.a},100%,55%)` : '#5a5f6e';
    c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fill();
  }
  c.globalAlpha = 1;
}

function drawPlayer(R, S, g) {
  const c = R.ctx, k = S.car.z, t = rowT(k), y = g.rowY(t), laneW = g.roadHalf(t) * 2 / 4, s = laneW * 0.96 / 62;
  const px = g.laneX(S.car.x, t) + S.car.bx, py = y + S.car.by;
  S.car.sx = px; S.car.sy = py; S.car.scale = s;
  S.trail.push(px, py);
  const tr = S.garage.trail.id;
  if (tr !== 'none' && S.preset.trails) {
    for (let i = 1; i < S.trail.len; i++) {
      const [tx, ty] = S.trail.at(i), a = 1 - i / S.trail.len;
      c.globalAlpha = a * 0.5;
      c.fillStyle = tr === 'flame' ? `hsl(${20 + 30 * a},100%,55%)` : tr === 'electric' ? '#7fd6ff' : `hsl(${(i * 40 + S.t * 200) % 360},100%,60%)`;
      const jit = tr === 'electric' ? Math.sin(i * 7 + S.t * 50) * 4 : 0;
      c.fillRect(tx - 8 * s * 1.6 + jit, ty - 4 * s, 16 * s * 1.6, 4 * s);
    }
    c.globalAlpha = 1;
  }
  const gl = S.garage.glow.id === 'lane' ? S.theme.accent : S.garage.glow.id === 'paint' ? S.garage.paint.color : S.garage.glow.id === 'white' ? '#ffffff' : `hsl(${(S.t * 120) % 360},100%,60%)`;
  if (S.env === 'night' || S.garage.glow.id !== 'lane') R.glow(px, py - 4 * s, 70 * s, gl.startsWith('hsl') ? '#ff3fb4' : gl, (S.env === 'night' ? 0.4 : 0.22) + 0.3 * S.boost);
  c.save(); c.translate(px, py); c.rotate(S.car.rot); c.scale(s, s);
  drawCarShape(c, S.garage.paint.color, { damage: S.car.damage });
  c.restore();
  // tail-light glow (brighter while boosting)
  R.glow(px - 22 * s, py - 19 * s, 22 * s + 8, '#ff2a40', 0.35 + 0.4 * S.boost); R.glow(px + 22 * s, py - 19 * s, 22 * s + 8, '#ff2a40', 0.35 + 0.4 * S.boost);
}

export function drawRing(R, S) {
  const c = R.ctx, T = S.think; if (!T) return;
  const cx = R.w - 36, cy = R.h * 0.32 + 38;
  c.fillStyle = 'rgba(8,12,34,.82)'; c.beginPath(); c.arc(cx, cy, 25, 0, 7); c.fill();
  c.lineWidth = 5; c.strokeStyle = '#26305e'; c.beginPath(); c.arc(cx, cy, 20, 0, 7); c.stroke();
  c.lineCap = 'round'; c.strokeStyle = T.frac < 0.25 ? '#ff4d6d' : T.frozen ? '#7fd6ff' : '#19e6c1';
  c.beginPath(); c.arc(cx, cy, 20, -Math.PI / 2, -Math.PI / 2 + T.frac * Math.PI * 2); c.stroke(); c.lineCap = 'butt';
  c.fillStyle = '#ffffff'; c.font = '800 15px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(Math.ceil(T.leftMs / 1000), cx, cy + 1);
  if (T.frozen) { c.fillStyle = 'rgba(127,214,255,.08)'; c.fillRect(0, 0, R.w, R.h); }
}

export function drawSpeedLines(R, S, g) {
  if (S.boost < 0.15 || S.reduceMotion) return;
  const c = R.ctx, cx = R.w / 2, cy = g.hz + 14;
  c.strokeStyle = '#ffffff'; c.lineWidth = 1.5;
  for (let i = 0; i < 16; i++) {
    const a = hash(i) * Math.PI, f = ((S.t * 2.6 + hash(i + 3)) % 1), r0 = R.h * 0.3 * f, r1 = r0 + R.h * 0.22 * f;
    c.globalAlpha = 0.35 * S.boost * (1 - f);
    c.beginPath(); c.moveTo(cx + Math.cos(a) * -r0 * 1.8, cy + Math.sin(a) * r0 * 1.2 + R.h * 0.1); c.lineTo(cx + Math.cos(a) * -r1 * 1.8, cy + Math.sin(a) * r1 * 1.2 + R.h * 0.1); c.stroke();
  }
  c.globalAlpha = 1;
}

export function drawVignette(R, S) {
  const c = R.ctx, w = R.w, h = R.h, grd = c.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.35, w / 2, h * 0.55, Math.max(w, h) * 0.75);
  grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, S.env === 'day' ? 'rgba(10,30,20,.22)' : 'rgba(0,0,12,.5)');
  c.fillStyle = grd; c.fillRect(0, 0, w, h);
}

export function drawParticles(R, parts) {
  const c = R.ctx; c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < parts.count; i++) {
    const a = parts.life[i] / parts.maxLife[i];
    c.globalAlpha = a; c.fillStyle = `hsl(${parts.hue[i]},100%,60%)`;
    const s = parts.size[i] * (0.4 + a);
    c.fillRect(parts.x[i] - s / 2, parts.y[i] - s / 2, s, s);
  }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
}

export function drawScene(R, S) {
  const g = geom(R), day = S.env === 'day';
  if (day) drawSkyDay(R, S, g); else drawSkyNight(R, S, g);
  if (day) drawGroundDay(R, S, g); else drawGroundNight(R, S, g);
  drawRoad(R, S, g); drawSide(R, S, g);
  drawGates(R, S, g); drawPlayer(R, S, g); drawSmoke(R, S);
  drawSpeedLines(R, S, g); drawVignette(R, S); drawRing(R, S);
  drawParticles(R, S.parts);
  return g;
}
