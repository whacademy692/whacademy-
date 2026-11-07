// Neon Racer world renderer: five places (Highway, City, Off-road, Snow ridge, Coast), each with a day and a night look,
// the player's car (4 bodies, realistic crash jolt, separate ground shadow, optional headlights) and the shared gates / HUD ring.
// The old scene.js stays as it was (Auto Defense still uses its sky / ground helpers); Racer draws through drawRacerScene().
import { geom, rowT, hash, mix, lighten, darken, ridge, tree, roundRect, STAR_POS, GATE_COLORS, drawGates, drawRing, drawSpeedLines, drawVignette, drawParticles, drawSmoke } from './scene.js';
import { drawCarModel } from './cars.js';

export const PLACES = [
  { id: 'highway', name: 'Highway',    unlockRank: 0,  blurb: 'Green hills, trees and an open road.' },
  { id: 'city',    name: 'City',       unlockRank: 2,  blurb: 'Tall buildings, sidewalks and street lights.' },
  { id: 'offroad', name: 'Off-road',   unlockRank: 5,  blurb: 'A dusty dirt track through rocks and cactus.' },
  { id: 'snow',    name: 'Snow ridge', unlockRank: 9,  blurb: 'Snowy pines and mountain peaks.' },
  { id: 'coast',   name: 'Coast',      unlockRank: 13, blurb: 'Sea on both sides, palm trees, a sandy bank.' },
];

// ---------------------------------------------------------------- world palettes
const WORLD = {
  highway: {
    sky: ['#2f8cf0', '#8fd0ff', '#dff3ff'], sun: '#fff6c9', clouds: 6, far: 'hills', ridge: ['#8fb4de', '#5fa66a'],
    ground: [['#78c653', '#2f8a34'], ['#0e2a1c', '#06120b']], stripe: ['rgba(20,90,30,.16)', 'rgba(0,0,0,.22)'],
    shoulder: ['#b9a98a', '#0a1a2c'], asphalt: [['#767b86', '#3a3e48'], ['#232a45', '#0d1122']],
    kerb: [['#e8eaee', '#d5232f'], ['#ffe9a8', '#1a2140']], edge: 'rgba(255,255,255,.9)', dash: ['#f4f4f4', '#9fb4ff'], side: 'trees',
  },
  city: {
    sky: ['#5f93d3', '#aecbe8', '#e9f0f6'], sun: '#fffbe3', clouds: 4, far: 'skyline', ridge: ['#9db0c8', '#7e92ae'],
    ground: [['#8d929b', '#5d626b'], ['#1b2036', '#0a0d1a']], stripe: ['rgba(0,0,0,.07)', 'rgba(120,150,255,.04)'],
    shoulder: ['#9da1a9', '#161c33'], asphalt: [['#5a5e69', '#2c2f38'], ['#1d2238', '#0a0d1b']],
    kerb: [['#f2f3f6', '#b9bcc6'], ['#b9c4ff', '#141a33']], edge: 'rgba(255,255,255,.85)', dash: ['#f4f4f4', '#9fb4ff'], side: 'buildings',
    bank: { f: 1.34, color: ['#b7bbc3', '#262c47'] },
  },
  offroad: {
    sky: ['#e2833f', '#f6b56c', '#ffe5bb'], sun: '#fff0cb', clouds: 2, far: 'mesas', ridge: ['#c98a5a', '#a96c3c'],
    ground: [['#dba75f', '#a8702f'], ['#2b1b10', '#120a05']], stripe: ['rgba(120,60,10,.15)', 'rgba(0,0,0,.25)'],
    shoulder: ['#c68a4b', '#1d1309'], asphalt: [['#a9773d', '#7b5228'], ['#3b2616', '#1a0f07']],
    kerb: null, edge: 'rgba(255,236,200,.45)', dash: ['#f7e4bd', '#c9b08a'], side: 'desert', fx: 'dust',
  },
  snow: {
    sky: ['#7f9db9', '#c4d4e3', '#f2f6fa'], sun: '#ffffff', clouds: 8, far: 'peaks', ridge: ['#c9d6e4', '#e8eef5'],
    ground: [['#f6f9fd', '#cdd9e7'], ['#35465f', '#19232f']], stripe: ['rgba(120,150,195,.15)', 'rgba(0,0,0,.2)'],
    shoulder: ['#e9eff6', '#26344b'], asphalt: [['#5a606b', '#32363e'], ['#1e2639', '#0b0f1c']],
    kerb: [['#ffffff', '#9fc4e8'], ['#cfe6ff', '#1b2a4a']], edge: 'rgba(255,255,255,.9)', dash: ['#f4f4f4', '#a9c4ff'], side: 'pines', fx: 'snow',
  },
  coast: {
    sky: ['#3fa7ff', '#9be0ff', '#e4f8ff'], sun: '#fff6c9', clouds: 5, far: 'sea', ridge: ['#87b7d6', '#5aa0b8'],
    ground: [['#2ab0d0', '#0b6f98'], ['#13587f', '#061a33']], water: true, stripe: ['rgba(255,255,255,.1)', 'rgba(0,0,0,0)'],
    shoulder: ['#e5d29a', '#1f2233'], asphalt: [['#707682', '#383c46'], ['#232a45', '#0d1122']],
    kerb: [['#f2f4f8', '#2b83d6'], ['#ffe9a8', '#1a2140']], edge: 'rgba(255,255,255,.9)', dash: ['#f4f4f4', '#9fb4ff'], side: 'palms',
    bank: { f: 1.6, color: ['#e9d79f', '#24263a'] },
  },
};
export const placeOf = (id) => WORLD[id] || WORLD.highway;

// ---------------------------------------------------------------- sky + far scenery
function farLayer(R, S, g, W, night) {
  const c = R.ctx, w = R.w, hz = g.hz;
  const [r1, r2] = night ? ['#10183a', '#0b1230'] : W.ridge;
  if (W.far === 'hills' || W.far === 'sea') {
    ridge(c, w, hz - 4, hz * (W.far === 'sea' ? 0.14 : 0.34), 0.006, 1.1, r1);
    ridge(c, w, hz + 2, hz * (W.far === 'sea' ? 0.07 : 0.2), 0.011, 4.2, W.far === 'sea' && !night ? '#6fb7c9' : r2);
  } else if (W.far === 'skyline') {
    for (const [layer, col, sc, step] of [[0, night ? '#0e1433' : '#9fb3cf', 1, 26], [1, night ? '#0a1028' : '#7f93b2', 0.7, 20]]) {
      c.fillStyle = col;
      for (let x = layer * 9; x < w + 30; x += step) { const bh = (10 + 70 * hash(x * 0.31 + layer * 7)) * sc * (0.5 + 0.5 * Math.abs(Math.sin(x * 0.011 + layer))); c.fillRect(x, hz - bh, step * 0.72, bh + 3); }
    }
    if (night) for (let x = 0; x < w; x += 18) { if (hash(x + 3) > 0.5) { c.fillStyle = hash(x) > 0.5 ? '#ffd76a' : '#9bd7ff'; c.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(S.t * 0.8 + x)); c.fillRect(x + 3 + hash(x + 1) * 6, hz - 6 - hash(x + 2) * 40, 2, 2); } }
    c.globalAlpha = 1;
  } else if (W.far === 'mesas') {
    for (const [col, amp, off, sc] of [[r1, 0.42, 0, 1], [r2, 0.26, 60, 1.3]]) {
      c.fillStyle = night ? darken(col, 0.8) : col; c.beginPath(); c.moveTo(0, hz + 4);
      for (let x = 0; x <= w + 40; x += 40) { const bump = hash(Math.floor((x + off) / (70 * sc)) + off) , hh = hz * amp * (0.4 + 0.9 * bump); c.lineTo(x, hz - hh); c.lineTo(x + 28, hz - hh); }
      c.lineTo(w + 40, hz + 4); c.closePath(); c.fill();
    }
  } else if (W.far === 'peaks') {
    for (const [col, amp, off] of [[r1, 0.5, 0], [r2, 0.32, 55]]) {
      c.fillStyle = night ? darken(col, 0.78) : col; c.beginPath(); c.moveTo(-40, hz + 4);
      const pk = [];
      for (let x = -60; x <= w + 120; x += 120) {
        const hh = hz * amp * (0.6 + 0.6 * hash(x * 0.07 + off)), px = x + 60 + (hash(x + off) - 0.5) * 40, py = hz - hh;
        c.lineTo(x + 20, hz - hh * 0.12); c.lineTo(px - 18, py + hh * 0.32); c.lineTo(px, py); c.lineTo(px + 22, py + hh * 0.38); pk.push([px, py, hh]);
      }
      c.lineTo(w + 160, hz + 4); c.closePath(); c.fill();
      c.fillStyle = night ? '#9fb2cf' : '#ffffff';
      for (const [px, py, hh] of pk) { const k = hh * 0.3; c.beginPath(); c.moveTo(px, py); c.lineTo(px - k * 0.62, py + k); c.lineTo(px - k * 0.2, py + k * 0.78); c.lineTo(px + k * 0.05, py + k * 1.05); c.lineTo(px + k * 0.5, py + k * 0.85); c.lineTo(px + k * 0.7, py + k * 1.0); c.closePath(); c.fill(); }
    }
  }
}

function skyDay(R, S, g, W) {
  const c = R.ctx, w = R.w, hz = g.hz;
  const grd = c.createLinearGradient(0, 0, 0, hz);
  grd.addColorStop(0, W.sky[0]); grd.addColorStop(0.65, W.sky[1]); grd.addColorStop(1, W.sky[2]);
  c.fillStyle = grd; c.fillRect(0, 0, w, hz + 1);
  const sx = w * 0.72, sy = hz * 0.46;
  R.glow(sx, sy, Math.min(w, 600) * 0.45, W.sun, 0.7);
  c.fillStyle = W.sun; c.beginPath(); c.arc(sx, sy, Math.min(w, 600) * 0.05, 0, 7); c.fill();
  const n = S.preset.name === 'low' ? Math.min(3, W.clouds) : W.clouds;
  for (let i = 0; i < n; i++) {
    const sp = 6 + (i % 3) * 3, x = ((hash(i) * w * 1.4 + S.t * sp) % (w * 1.3)) - w * 0.15, y = hz * (0.12 + 0.5 * hash(i + 9)), r = 14 + 22 * hash(i + 4);
    c.fillStyle = 'rgba(255,255,255,.9)';
    for (const [dx, dy, k] of [[0, 0, 1], [r * 0.9, -r * 0.2, 1.15], [r * 1.9, 0, 0.95], [r * 1.0, r * 0.25, 1.1]]) { c.beginPath(); c.arc(x + dx, y + dy, r * k * 0.8, 0, 7); c.fill(); }
    c.fillStyle = 'rgba(190,215,240,.45)'; c.beginPath(); c.ellipse(x + r, y + r * 0.45, r * 1.7, r * 0.28, 0, 0, 7); c.fill();
  }
  farLayer(R, S, g, W, false);
}

function skyNight(R, S, g, W) {
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
  if (W === WORLD.coast) {                                         // coast at night keeps its far shore skyline across the water
    ridge(c, w, hz - 3, hz * 0.3, 0.007, 2.3, '#10183a');
    c.fillStyle = '#0a1028';
    for (let x = 0; x < w; x += 22) { const bh = 6 + 26 * hash(x * 0.37) * (0.4 + 0.6 * Math.abs(Math.sin(x * 0.013))); c.fillRect(x, hz - bh, 16, bh + 2); }
    for (let x = 0; x < w; x += 22) { if (hash(x + 3) > 0.55) { c.fillStyle = hash(x) > 0.5 ? '#ffd76a' : '#9bd7ff'; c.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(S.t * 0.8 + x)); c.fillRect(x + 4 + hash(x + 1) * 6, hz - 4 - hash(x + 2) * 14, 2, 2); } }
    c.globalAlpha = 1;
  } else farLayer(R, S, g, W, true);
}

// ---------------------------------------------------------------- ground
function ground(R, S, g, W, night) {
  const c = R.ctx, w = R.w, h = R.h, hz = g.hz, i = night ? 1 : 0;
  const grd = c.createLinearGradient(0, hz, 0, h);
  if (W.water && night) { grd.addColorStop(0, '#13587f'); grd.addColorStop(0.5, '#0b3558'); grd.addColorStop(1, '#061a33'); }
  else { grd.addColorStop(0, W.ground[i][0]); grd.addColorStop(1, W.ground[i][1]); }
  c.fillStyle = grd; c.fillRect(0, hz, w, h - hz);
  const N = Math.max(10, Math.round(S.preset.roadSegs / 3));
  if (W.water) {
    if (night) {                                                    // moon reflection column + ripples (the original night lake)
      const mx = w * 0.68;
      for (let k = 0; k < 18; k++) { const kk = 0.02 + k / 18 * 0.9, t = rowT(kk), y = g.rowY(t), len = (10 + 90 * t) * (0.6 + 0.4 * Math.sin(S.t * 2 + k * 1.7)); c.globalAlpha = 0.5 * (1 - kk * 0.6); c.fillStyle = '#cfe6ff'; c.fillRect(mx - len / 2 + Math.sin(S.t * 1.3 + k) * 6 * t, y, len, 1.5 + 2.5 * t); }
    }
    c.globalAlpha = 1;
    for (let k = 0; k < N; k++) {                                   // ripples travelling toward the viewer
      const kk = (k + (S.scroll * 0.35 % 1)) / N, t = rowT(kk), y = g.rowY(t);
      c.globalAlpha = (night ? 0.1 : 0.14) + 0.28 * t; c.strokeStyle = night ? '#8fd6ff' : '#ffffff'; c.lineWidth = 1 + 1.4 * t;
      c.beginPath();
      for (let x = 0; x <= w; x += 26) { const yy = y + Math.sin(x * 0.05 + S.t * 1.6 + k) * (1 + 3 * t); if (x === 0) c.moveTo(x, yy); else c.lineTo(x, yy); }
      c.stroke();
    }
    c.globalAlpha = 1;
    return;
  }
  const fr = S.scroll % 2, base = Math.floor(S.scroll / 2);
  for (let k = -1; k < N; k++) {                                    // stripes sliding toward the camera (fields / paving / sand ridges)
    const k0 = Math.max(0, (k + fr / 2) / N), k1 = Math.min(1, (k + 1 + fr / 2) / N);
    if (k1 <= k0) continue;
    if (((k + base) & 1) === 0) continue;
    const y0 = g.rowY(rowT(k0)), y1 = g.rowY(rowT(k1));
    c.fillStyle = W.stripe[i]; c.fillRect(0, y0, w, y1 - y0 + 1);
  }
}

// ---------------------------------------------------------------- road
function quad(c, xa0, ya, xa1, xb0, yb, xb1) { c.beginPath(); c.moveTo(xa0, ya); c.lineTo(xa1, ya); c.lineTo(xb1, yb); c.lineTo(xb0, yb); c.closePath(); }

function road(R, S, g, W, night) {
  const c = R.ctx, w = R.w, h = R.h, hz = g.hz, th = S.theme, cx = w / 2, i = night ? 1 : 0;
  if (W.bank) {                                                     // sand bank (coast) / sidewalk (city) beside the road
    c.fillStyle = W.bank.color[i];
    c.beginPath(); c.moveTo(cx - g.roadHalf(0) * W.bank.f, hz); c.lineTo(cx + g.roadHalf(0) * W.bank.f, hz); c.lineTo(cx + g.roadHalf(1) * W.bank.f, h); c.lineTo(cx - g.roadHalf(1) * W.bank.f, h); c.closePath(); c.fill();
  }
  const sh = 1.07;
  c.fillStyle = W.shoulder[i];
  c.beginPath(); c.moveTo(cx - g.roadHalf(0) * sh, hz); c.lineTo(cx + g.roadHalf(0) * sh, hz); c.lineTo(cx + g.roadHalf(1) * sh, h); c.lineTo(cx - g.roadHalf(1) * sh, h); c.closePath(); c.fill();
  const rg = c.createLinearGradient(0, hz, 0, h); rg.addColorStop(0, W.asphalt[i][0]); rg.addColorStop(1, W.asphalt[i][1]);
  c.fillStyle = rg;
  c.beginPath(); c.moveTo(cx - g.roadHalf(0), hz); c.lineTo(cx + g.roadHalf(0), hz); c.lineTo(cx + g.roadHalf(1), h); c.lineTo(cx - g.roadHalf(1), h); c.closePath(); c.fill();
  const N = Math.max(10, Math.round(S.preset.roadSegs / 3)), fr = S.scroll % 1;
  for (let k = -1; k < N; k++) {
    const k0 = Math.max(0, (k + fr) / N), k1 = Math.min(1, (k + 1 + fr) / N);
    if (k1 <= k0) continue;
    const t0 = rowT(k0), t1 = rowT(k1), y0 = g.rowY(t0), y1 = g.rowY(t1), r0 = g.roadHalf(t0), r1 = g.roadHalf(t1);
    const odd = ((k + Math.floor(S.scroll)) & 1) === 0;
    if (W.kerb) {
      const kw0 = r0 * 0.045, kw1 = r1 * 0.045;
      c.fillStyle = W.kerb[i][odd ? 0 : 1];
      quad(c, cx - r0 - kw0, y0, cx - r0, cx - r1 - kw1, y1, cx - r1); c.fill();
      quad(c, cx + r0, y0, cx + r0 + kw0, cx + r1, y1, cx + r1 + kw1); c.fill();
    }
    if (odd) { c.fillStyle = night ? 'rgba(120,150,255,.035)' : (W.side === 'desert' ? 'rgba(60,30,0,.09)' : 'rgba(0,0,0,.05)'); quad(c, cx - r0, y0, cx + r0, cx - r1, y1, cx + r1); c.fill(); }
  }
  for (const sgn of [-1, 1]) {                                      // edge lines
    const x0 = cx + sgn * g.roadHalf(0) * 0.94, x1 = cx + sgn * g.roadHalf(1) * 0.94;
    if (night && W.side !== 'desert') R.neonLine(x0, hz, x1, h, th.accent, 2.4, 0.95);
    else { c.strokeStyle = night ? 'rgba(220,200,170,.5)' : W.edge; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x0, hz); c.lineTo(x1, h); c.stroke(); }
  }
  for (let L = 1; L <= 3; L++) {                                    // dashed lane dividers in perspective
    const f = (L - 2) / 2;
    for (let k = -1; k < N; k++) {
      const k0 = Math.max(0, (k + fr) / N), k1 = Math.min(1, (k + fr + 0.5) / N);
      if (k1 <= k0) continue;
      const t0 = rowT(k0), t1 = rowT(k1), y0 = g.rowY(t0), y1 = g.rowY(t1);
      const xa = cx + f * g.roadHalf(t0), xb = cx + f * g.roadHalf(t1), wa = 0.5 + 3 * t0, wb = 0.5 + 3 * t1;
      c.globalAlpha = night ? 0.85 : 0.92; c.fillStyle = W.dash[i];
      quad(c, xa - wa, y0, xa + wa, xb - wb, y1, xb + wb); c.fill();
    }
  }
  c.globalAlpha = 1;
  if (night && W.side !== 'desert') {                                // wet-road sheen
    c.globalAlpha = 0.07; c.fillStyle = '#9fb4ff';
    c.beginPath(); c.moveTo(cx - g.roadHalf(0) * 0.2, hz); c.lineTo(cx + g.roadHalf(0) * 0.2, hz); c.lineTo(cx + g.roadHalf(1) * 0.5, h); c.lineTo(cx - g.roadHalf(1) * 0.5, h); c.closePath(); c.fill(); c.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- roadside objects
function building(c, x, y, s, id, night, pal) {
  const w = s * (0.62 + 0.4 * hash(id + 1)), h = s * (1.0 + 1.7 * hash(id + 2)), base = pal[Math.floor(hash(id + 3) * pal.length)];
  c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(x, y, w * 0.6, s * 0.05, 0, 0, 7); c.fill();
  c.fillStyle = night ? darken(base, 0.7) : base; c.fillRect(x - w / 2, y - h, w, h);
  c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(x + w * 0.16, y - h, w * 0.34, h);
  c.fillStyle = night ? darken(base, 0.6) : darken(base, 0.22); c.fillRect(x - w / 2, y - h, w, Math.max(1, s * 0.045));
  if (s < 16) return;
  const cols = Math.max(2, Math.round(w / (s * 0.17))), rows = Math.max(3, Math.round(h / (s * 0.22))), cw = w / cols, rh = h / rows;
  for (let r = 0; r < rows - 1; r++) for (let k = 0; k < cols; k++) {
    const on = hash(id * 13 + r * 7 + k * 3) > 0.42;
    c.fillStyle = night ? (on ? '#ffd76a' : '#18203d') : (on ? '#d6eaff' : '#8aa9c8');
    c.fillRect(x - w / 2 + k * cw + cw * 0.22, y - h + (r + 0.5) * rh + rh * 0.08, cw * 0.56, rh * 0.5);
  }
  c.fillStyle = night ? '#2a3354' : darken(base, 0.35); c.fillRect(x - cw * 0.45, y - rh * 0.9, cw * 0.9, rh * 0.9);   // door
}
function rock(c, x, y, s, id, night) {
  const w = s * (0.5 + 0.5 * hash(id)), h = s * (0.3 + 0.3 * hash(id + 1)), col = night ? '#3a2a1e' : '#9a6a3f';
  c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(x, y, w * 0.62, s * 0.05, 0, 0, 7); c.fill();
  c.fillStyle = col; c.beginPath(); c.moveTo(x - w / 2, y); c.lineTo(x - w * 0.4, y - h * 0.7); c.lineTo(x - w * 0.1, y - h); c.lineTo(x + w * 0.25, y - h * 0.85); c.lineTo(x + w / 2, y - h * 0.2); c.lineTo(x + w * 0.45, y); c.closePath(); c.fill();
  c.fillStyle = night ? '#241912' : '#c08755'; c.beginPath(); c.moveTo(x - w * 0.1, y - h); c.lineTo(x + w * 0.25, y - h * 0.85); c.lineTo(x + w * 0.1, y - h * 0.45); c.lineTo(x - w * 0.25, y - h * 0.55); c.closePath(); c.fill();
}
function cactus(c, x, y, s, night) {
  const col = night ? '#16381f' : '#3f8a4a', w = Math.max(2, s * 0.13);
  c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.ellipse(x, y, s * 0.3, s * 0.05, 0, 0, 7); c.fill();
  c.fillStyle = col; roundRect(c, x - w / 2, y - s * 0.85, w, s * 0.85, w / 2); c.fill();
  roundRect(c, x - s * 0.3, y - s * 0.55, s * 0.3, w * 0.8, w * 0.4); c.fill(); roundRect(c, x - s * 0.3, y - s * 0.7, w * 0.8, s * 0.2, w * 0.4); c.fill();
  roundRect(c, x, y - s * 0.4, s * 0.28, w * 0.8, w * 0.4); c.fill(); roundRect(c, x + s * 0.28 - w * 0.8, y - s * 0.58, w * 0.8, s * 0.22, w * 0.4); c.fill();
}
function pine(c, x, y, s, night) {
  c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(x, y, s * 0.5, s * 0.1, 0, 0, 7); c.fill();
  c.fillStyle = night ? '#241a16' : '#5a3b22'; c.fillRect(x - s * 0.05, y - s * 0.3, s * 0.1, s * 0.3);
  for (let i = 0; i < 4; i++) {
    const yy = y - s * (0.22 + i * 0.26), ww = s * (0.46 - i * 0.09);
    c.fillStyle = night ? mix('#173a35', '#0b2020', i * 0.25) : mix('#2c7a4e', '#175533', i * 0.2);
    c.beginPath(); c.moveTo(x, yy - s * 0.36); c.lineTo(x + ww, yy); c.lineTo(x - ww, yy); c.closePath(); c.fill();
    c.fillStyle = night ? '#9db4d4' : '#ffffff'; c.beginPath(); c.moveTo(x, yy - s * 0.36); c.lineTo(x + ww * 0.62, yy - s * 0.12); c.lineTo(x - ww * 0.62, yy - s * 0.12); c.closePath(); c.fill();
  }
}
function palm(c, x, y, s, night, lean) {
  c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(x, y, s * 0.45, s * 0.08, 0, 0, 7); c.fill();
  const tx = x + lean * s * 0.16, ty = y - s * 1.0;
  c.strokeStyle = night ? '#2a1d14' : '#8a5a2b'; c.lineWidth = Math.max(2, s * 0.07); c.lineCap = 'round';
  c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + lean * s * 0.02, y - s * 0.55, tx, ty); c.stroke(); c.lineCap = 'butt';
  c.strokeStyle = night ? '#0f3a25' : '#2fa24a'; c.lineWidth = Math.max(1.5, s * 0.06);
  for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + (k - 2.5) * 0.62; c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(tx + Math.cos(a) * s * 0.3, ty + Math.sin(a) * s * 0.3 - s * 0.05, tx + Math.cos(a) * s * 0.55, ty + Math.sin(a) * s * 0.4 + s * 0.14); c.stroke(); }
  c.fillStyle = night ? '#3a2a1e' : '#6b4423'; c.beginPath(); c.arc(tx, ty + s * 0.03, Math.max(1.5, s * 0.05), 0, 7); c.fill();
}
function lamp(R, c, g, cx, y, t, rh, side) {
  const x = cx + side * rh * 1.12, ph = 10 + 150 * t, pw = Math.max(1, 5 * t);
  c.fillStyle = '#1b2442'; c.fillRect(x - pw / 2, y - ph, pw, ph); c.fillRect(x - side * ph * 0.14, y - ph, side * ph * 0.14, pw * 0.8);
  const lx = x - side * ph * 0.14;
  R.glow(lx, y - ph + pw, 18 + 120 * t, '#ffe7a3', 0.85);
  c.fillStyle = '#fff6d0'; c.beginPath(); c.arc(lx, y - ph + pw, Math.max(1.5, 5 * t), 0, 7); c.fill();
  if (t > 0.18) { c.globalAlpha = 0.16; c.fillStyle = '#ffe7a3'; c.beginPath(); c.ellipse(cx + side * rh * 0.7, y + 4 * t, rh * 0.55, 8 * t + 2, 0, 0, 7); c.fill(); c.globalAlpha = 1; }
}
function post(c, cx, y, t, rh, side) {
  const x = cx + side * rh * 1.1, ph = 3 + 26 * t;
  c.fillStyle = '#26314f'; c.fillRect(x - Math.max(1, 3 * t), y - ph, Math.max(2, 6 * t), ph);
  c.fillStyle = '#ff4d5a'; c.fillRect(x - Math.max(1, 2 * t), y - ph, Math.max(2, 4 * t), Math.max(1, 5 * t));
}
const CITY_PAL = ['#c9d2e0', '#a8b8d0', '#d9c9b0', '#b9a9c9', '#9fc0c0', '#d8b4a6'];

function side(R, S, g, W, night) {
  const c = R.ctx, w = R.w, cx = w / 2;
  const N = S.preset.name === 'low' ? 9 : 14, fr = S.scroll % 1, base = Math.floor(S.scroll);
  for (let i = 0; i < N; i++) {                                     // far to near
    const k = (i + fr) / N, idx = base + (N - i);
    const t = rowT(Math.min(1, k)), y = g.rowY(t), rh = g.roadHalf(t);
    if (t < 0.01) continue;
    for (const sd of [-1, 1]) {
      const id = idx * 2 + (sd > 0 ? 1 : 0), sz = 8 + 120 * t, bf = W.bank ? W.bank.f : 1.07;
      switch (W.side) {
        case 'trees': {
          if (night) {
            if ((idx & 1) === 0) lamp(R, c, g, cx, y, t, rh, sd); else post(c, cx, y, t, rh, sd);
            const near = 1.7 + 1.1 * hash(id), x = cx + sd * (rh * near + 6 * t);
            if (hash(id + 5) > 0.3) tree(c, x, y, sz, hash(id + 2) > 0.45 ? 0 : 1, 1 - t, true);
          } else {
            const near = 1.45 + 0.9 * hash(id), x = cx + sd * (rh * near + 6 * t);
            if (hash(id + 5) > 0.22) tree(c, x, y, sz, hash(id + 2) > 0.45 ? 0 : 1, 1 - t);
            else { c.fillStyle = '#3d9a45'; c.beginPath(); c.ellipse(x, y - sz * 0.1, sz * 0.3, sz * 0.2, 0, 0, 7); c.fill(); }
          }
          break;
        }
        case 'buildings': {
          const s2 = 10 + 150 * t, x = cx + sd * (rh * (bf + 0.1) + s2 * 0.42 + 4 * t);
          if (hash(id + 6) > 0.12) building(c, x, y, s2, id, night, CITY_PAL);
          if (night && (idx & 1) === 0) lamp(R, c, g, cx, y, t, rh, sd);
          break;
        }
        case 'desert': {
          const near = 1.4 + 1.3 * hash(id), x = cx + sd * (rh * near + 6 * t), r = hash(id + 5);
          if (r > 0.7) cactus(c, x, y, sz * 1.0, night); else if (r > 0.2) rock(c, x, y, sz * 1.1, id, night);
          else { c.fillStyle = night ? '#3a2a14' : '#8a6a2f'; c.beginPath(); c.ellipse(x, y - sz * 0.08, sz * 0.26, sz * 0.14, 0, 0, 7); c.fill(); }
          if (night && (idx & 1) === 0) post(c, cx, y, t, rh, sd);
          break;
        }
        case 'pines': {
          if (night && (idx & 1) === 0) lamp(R, c, g, cx, y, t, rh, sd);
          const near = 1.5 + 1.0 * hash(id), x = cx + sd * (rh * near + 6 * t);
          if (hash(id + 5) > 0.2) pine(c, x, y, sz * 1.1, night);
          break;
        }
        case 'palms': {
          const near = bf * (1.0 + 0.18 * hash(id)) + 0.1, x = cx + sd * (rh * near + 6 * t);
          if (hash(id + 5) > 0.25) palm(c, x, y, sz * 1.15, night, -sd);
          if (night && (idx & 1) === 0) lamp(R, c, g, cx, y, t, rh, sd);
          break;
        }
        default: break;
      }
    }
  }
}

// ---------------------------------------------------------------- weather / dust overlay + headlights
function weather(R, S, g, W, night) {
  if (S.reduceMotion || !W.fx) return;
  const c = R.ctx, w = R.w, h = R.h;
  if (W.fx === 'snow') {
    c.fillStyle = '#fff';
    const n = S.preset.name === 'low' ? 30 : 60;
    for (let i = 0; i < n; i++) { c.globalAlpha = night ? 0.7 : 0.8; c.fillRect(((i * 97) % 100) / 100 * w + Math.sin(S.t + i) * 6, ((i * 31 + S.t * (40 + (i % 5) * 12)) % h), 2 + (i % 3), 2 + (i % 3)); }
    c.globalAlpha = 1;
  } else if (W.fx === 'dust') {
    const n = S.preset.name === 'low' ? 5 : 10;
    for (let i = 0; i < n; i++) {
      const f = (S.t * 0.35 + hash(i)) % 1, t = rowT(0.05 + 0.95 * f), y = g.rowY(t), rh = g.roadHalf(t), sd = i % 2 ? 1 : -1;
      const x = w / 2 + sd * rh * (1.05 + 0.5 * hash(i + 4)), r = 6 + 60 * t;
      c.globalAlpha = (night ? 0.07 : 0.14) * (1 - f * 0.6); c.fillStyle = night ? '#a88a62' : '#f1cf98'; c.beginPath(); c.ellipse(x, y - r * 0.3, r * 1.2, r * 0.55, 0, 0, 7); c.fill();
    }
    c.globalAlpha = 1;
  }
}
function headlights(R, S, g, px, py, s) {
  const c = R.ctx, cx = R.w / 2, hz = g.hz;
  c.save(); c.globalCompositeOperation = 'lighter';
  const gr = c.createLinearGradient(0, py - 24 * s, 0, hz + (py - hz) * 0.25); gr.addColorStop(0, 'rgba(255,240,190,.34)'); gr.addColorStop(1, 'rgba(255,240,190,0)');
  c.fillStyle = gr; c.beginPath();
  c.moveTo(px - 24 * s, py - 24 * s); c.lineTo(px + 24 * s, py - 24 * s);
  c.lineTo(cx + (px - cx) * 0.35 + 46 * s, hz + (py - hz) * 0.22); c.lineTo(cx + (px - cx) * 0.35 - 46 * s, hz + (py - hz) * 0.22); c.closePath(); c.fill();
  c.restore();
}

// ---------------------------------------------------------------- the player's car + crash jolt
const bump = (x, tau) => (x <= 0 ? 0 : (x / tau) * Math.exp(1 - x / tau));      // 0 -> 1 at x = tau -> back to 0 fast, never oscillates wildly

/**
 * Crash pose at `t` seconds after impact. `dir` = -1 / +1 (which way the car is knocked).
 * Returns { bx, rot, sq }: sideways shove (in car-widths * 0.3), body lean (radians), squash (0..1).
 * It is a quick jolt: one hit, one small counter-swing, and the car is straight again after about 0.6 s. Nothing floats.
 */
export function crashPose(t, dir) {
  if (t < 0 || t > 1.2) return { bx: 0, rot: 0, sq: 0 };
  const bx = dir * 20 * bump(t, 0.09);
  const rot = dir * (0.17 * bump(t, 0.1) - 0.07 * bump(t - 0.16, 0.12));
  const sq = 0.09 * bump(t, 0.06);
  return { bx, rot, sq };
}

function player(R, S, g, night) {
  const c = R.ctx, k = S.car.z, t = rowT(k), y = g.rowY(t), laneW = g.roadHalf(t) * 2 / 4, s = laneW * 0.96 / 62;
  const px = g.laneX(S.car.x, t) + S.car.bx * s, py = y;
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
  if (night && S.headlights) headlights(R, S, g, px, py, s);
  const gl = S.garage.glow.id === 'lane' ? S.theme.accent : S.garage.glow.id === 'paint' ? S.garage.paint.color : S.garage.glow.id === 'white' ? '#ffffff' : `hsl(${(S.t * 120) % 360},100%,60%)`;
  if (night || S.garage.glow.id !== 'lane') R.glow(px, py - 4 * s, 70 * s, gl.startsWith('hsl') ? '#ff3fb4' : gl, (night ? 0.4 : 0.22) + 0.3 * S.boost);
  // ground shadow: stays flat on the road (never tilts), so the car can never look like it floats
  c.fillStyle = 'rgba(0,0,0,.38)'; c.beginPath(); c.ellipse(px, py + 2 * s, 38 * s, 5.5 * s, 0, 0, 7); c.fill();
  c.save(); c.translate(px, py); c.rotate(S.car.rot); c.scale(s * (1 + S.car.sq * 0.5), s * (1 - S.car.sq)); // squash on impact
  drawCarModel(c, S.car.model || 'street', S.garage.paint.color, { damage: S.car.damage, shadow: false });
  c.restore();
  R.glow(px - 22 * s, py - 19 * s, 22 * s + 8, '#ff2a40', 0.35 + 0.4 * S.boost); R.glow(px + 22 * s, py - 19 * s, 22 * s + 8, '#ff2a40', 0.35 + 0.4 * S.boost);
}

export function drawRacerScene(R, S) {
  const g = geom(R), night = S.env !== 'day', W = placeOf(S.place);
  if (night) skyNight(R, S, g, W); else skyDay(R, S, g, W);
  ground(R, S, g, W, night);
  road(R, S, g, W, night); side(R, S, g, W, night);
  drawGates(R, S, g); player(R, S, g, night); drawSmoke(R, S);
  weather(R, S, g, W, night);
  drawSpeedLines(R, S, g); drawVignette(R, S); drawRing(R, S);
  drawParticles(R, S.parts);
  return g;
}
export { GATE_COLORS };
