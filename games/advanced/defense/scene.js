// Auto Defense scene: a base (tower, shield dome, three turrets) on a platform, four labelled drones descending slowly.
// Day = green hills, trees, blue sky. Night = lake, city lights, stars. One drone colour pair for all four drones (letters tell them apart).
// Everything is drawn from one plain state object S so it can be tested / previewed.
import { drawSkyDay, drawSkyNight, drawGroundDay, drawGroundNight, tree, roundRect, mix, lighten, darken, hash, drawParticles, drawVignette } from '../racer/scene.js';

export const DRONE_COLORS = { day: ['#ff6a00', '#ffc400'], night: ['#00c8ff', '#3b5bff'] };
export const BOSS = ['#b3122e', '#ffb02e'];            // Rank Gate: armoured crimson + gold drones
export const GOOD = ['#00c853', '#7dff9c'], BAD = ['#e5173a', '#ff6b6b'];
export { drawParticles };

/** Timeline (seconds after the answer is locked). Shared with defense.js so sounds/particles line up with the drawing. */
export const TL = { fire: 0.06, hit: 0.34, dive: 0.5, end: 1.0 };

export function geom(R) {
  const W = R.w, H = R.h;
  const top = (R.uiTop > 0 ? R.uiTop : H * 0.27) + (R.gateBar ? 34 : 0), bot = R.uiBot > top + 150 ? R.uiBot : H * 0.78;   // free area between the question card and the power-up row (measured by the host)
  const avail = bot - top;
  const cx = R.uiR > R.uiL ? (R.uiL + R.uiR) / 2 : W / 2, room = R.uiR > R.uiL ? R.uiR - R.uiL : W * 0.94;   // landscape: the free strip between the left and right panels
  const span = Math.min(W * 0.94, H * 0.92, room);
  const bs = Math.max(0.5, Math.min(1.5, span / 390, avail * 0.45 / 215));       // base scale
  const s = Math.max(0.5, Math.min(1.4, span / 280, avail / 430));                 // drone scale
  const hz = Math.min(H * 0.4, top + avail * 0.2), baseX = cx, baseY = bot - 58 * bs;
  const colX = (i) => cx + (i - 1.5) * span / 4;
  const domeTop = baseY - 172 * bs, y1 = domeTop - 30 * s, y0 = Math.min(top + 62 * s, y1 - 40);
  const towerTop = baseY - 128 * bs;
  const tur = [{ x: baseX - 124 * bs, y: baseY - 8 * bs }, { x: baseX, y: towerTop }, { x: baseX + 124 * bs, y: baseY - 8 * bs }];
  return { W, H, span, bs, s, hz, baseX, baseY, colX, y0, y1, domeTop, towerTop, tur, rowY: (t) => hz + (H - hz) * t };
}

const easeIn = (x) => x * x;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** Where drone i is right now, or null when it is gone. Pure function of the scene state (D). */
export function dronePos(g, D, i) {
  const bx = g.colX(i), bob = Math.sin(D.t * 2.1 + i * 1.7) * 4 * g.s;
  const hidden = D.hidden && D.hidden.includes(i);
  if (D.phase !== 'result') {
    if (D.phase === 'ask' && !hidden) return { x: bx + Math.sin(D.t * 0.9 + i * 2.3) * 5 * g.s, y: g.y0 + (g.y1 - g.y0) * clamp01(D.p) + bob, a: 1, mode: 'fly' };
    if (hidden) return D.phase === 'ask' ? null : null;
    return null;
  }
  const pl = D.plan && D.plan[i]; if (!pl) return null;
  const T = D.rt;
  const yLock = g.y0 + (g.y1 - g.y0) * clamp01(D.pLock);
  if (hidden && !pl.dive) return null;
  if (pl.kind === 'explode') return T < pl.at ? { x: bx, y: yLock + bob * 0.5, a: 1, mode: 'locked', shake: T > TL.fire } : null;
  // dive toward the base
  const k = clamp01((T - pl.from) / (pl.impact - pl.from));
  if (T >= pl.impact) return null;
  const tx = g.baseX + (bx - g.baseX) * 0.45, ty = g.domeTop + 6 * g.bs;
  const kk = easeIn(k);
  return { x: bx + (tx - bx) * kk, y: yLock + (ty - yLock) * kk, a: 1, mode: 'dive', k };
}

// ---------- backdrop ----------
function drawBackdrop(R, S, g) {
  const c = R.ctx, day = S.env === 'day', gg = { hz: g.hz, rowY: g.rowY };
  S.scroll = day ? 0 : S.t * 0.3;
  if (day) drawSkyDay(R, S, gg); else drawSkyNight(R, S, gg);
  if (day) drawGroundDay(R, S, gg); else drawGroundNight(R, S, gg);
  const W = R.w, hz = g.hz;
  if (day) {                                                           // trees and bushes on the field, flat rows (no road)
    for (let i = 0; i < 9; i++) {
      const t = 0.08 + 0.34 * hash(i + 3), y = g.rowY(t), side = i % 2 ? 1 : -1, x = W / 2 + side * (W * 0.22 + hash(i) * W * 0.3);
      tree(c, x, y, 12 + 96 * t, hash(i + 7) > 0.5 ? 0 : 1, 1 - t);
    }
  }
  void hz;
}

function drawPlatform(R, S, g) {
  const c = R.ctx, day = S.env === 'day', { baseX, baseY, bs } = g, w = g.span * 1.02, h = 26 * bs;
  const pg = c.createLinearGradient(0, baseY, 0, baseY + h * 2.4);
  pg.addColorStop(0, day ? '#8c93a8' : '#2a3358'); pg.addColorStop(1, day ? '#4b5168' : '#10162f');
  c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(baseX, baseY + h * 2.2, w * 0.56, h * 0.9, 0, 0, 7); c.fill();
  c.fillStyle = pg; roundRect(c, baseX - w / 2, baseY, w, h * 2.1, 10 * bs); c.fill();
  c.fillStyle = day ? '#b9c0d4' : '#3a4678'; roundRect(c, baseX - w / 2, baseY, w, 7 * bs, 6 * bs); c.fill();
  // edge lights
  for (let i = 0; i < 9; i++) {
    const x = baseX - w / 2 + 14 * bs + i * (w - 28 * bs) / 8;
    c.fillStyle = S.theme.accent; c.globalAlpha = 0.5 + 0.4 * Math.abs(Math.sin(S.t * 1.6 + i)); c.fillRect(x - 3 * bs, baseY + 14 * bs, 6 * bs, 3 * bs);
  }
  c.globalAlpha = 1;
  if (S.env === 'night') R.glow(baseX, baseY + 14 * bs, w * 0.5, S.theme.accent, 0.1);
}

function drawTower(R, S, g) {
  const c = R.ctx, { baseX, baseY, bs, towerTop } = g, day = S.env === 'day', dmg = S.base.damage;
  const tw = 92 * bs, base = day ? '#cdd3e4' : '#39447a', hi = day ? '#eef1fb' : '#5568b4', lo = day ? '#8e97b3' : '#1c2450';
  // body
  const bg = c.createLinearGradient(baseX - tw / 2, 0, baseX + tw / 2, 0); bg.addColorStop(0, hi); bg.addColorStop(0.5, base); bg.addColorStop(1, lo);
  c.fillStyle = bg;
  c.beginPath(); c.moveTo(baseX - tw / 2, baseY); c.lineTo(baseX - tw * 0.36, towerTop + 16 * bs); c.quadraticCurveTo(baseX, towerTop - 6 * bs, baseX + tw * 0.36, towerTop + 16 * bs); c.lineTo(baseX + tw / 2, baseY); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1.2; c.stroke();
  // windows (lit at night)
  for (let r = 0; r < 3; r++) for (let k = -1; k <= 1; k++) {
    const x = baseX + k * 20 * bs, y = baseY - 28 * bs - r * 26 * bs;
    c.fillStyle = day ? '#1d2c55' : (hash(r * 3 + k + 9) > 0.35 ? '#ffd76a' : '#6fd4ff');
    roundRect(c, x - 6 * bs, y - 8 * bs, 12 * bs, 14 * bs, 3 * bs); c.fill();
  }
  // accent stripe + antenna
  c.fillStyle = S.theme.accent; c.fillRect(baseX - tw * 0.42, baseY - 6 * bs, tw * 0.84, 4 * bs);
  c.strokeStyle = lo; c.lineWidth = 2 * bs; c.beginPath(); c.moveTo(baseX + 18 * bs, towerTop + 6 * bs); c.lineTo(baseX + 18 * bs, towerTop - 24 * bs); c.stroke();
  c.fillStyle = Math.sin(S.t * 5) > 0 ? '#ff4d6d' : '#7a1d2d'; c.beginPath(); c.arc(baseX + 18 * bs, towerTop - 24 * bs, 3.2 * bs, 0, 7); c.fill();
  R.glow(baseX + 18 * bs, towerTop - 24 * bs, 14 * bs, '#ff4d6d', 0.5);
  // damage: cracks, scorch, holes
  if (dmg >= 1) { c.strokeStyle = 'rgba(20,20,30,.7)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(baseX - 26 * bs, baseY - 20 * bs); c.lineTo(baseX - 14 * bs, baseY - 42 * bs); c.lineTo(baseX - 22 * bs, baseY - 62 * bs); c.stroke(); }
  if (dmg >= 2) { c.beginPath(); c.moveTo(baseX + 24 * bs, baseY - 16 * bs); c.lineTo(baseX + 8 * bs, baseY - 48 * bs); c.lineTo(baseX + 18 * bs, baseY - 76 * bs); c.stroke(); c.fillStyle = 'rgba(10,10,16,.45)'; c.beginPath(); c.ellipse(baseX - 6 * bs, baseY - 58 * bs, 16 * bs, 10 * bs, 0.3, 0, 7); c.fill(); }
  if (dmg >= 3) { c.fillStyle = 'rgba(8,8,14,.7)'; c.beginPath(); c.ellipse(baseX + 14 * bs, baseY - 34 * bs, 13 * bs, 9 * bs, -0.4, 0, 7); c.fill(); R.glow(baseX + 14 * bs, baseY - 34 * bs, 26 * bs, '#ff7a1f', 0.55 + 0.2 * Math.sin(S.t * 9)); }
  S.base.smokeX = baseX; S.base.smokeY = towerTop + 26 * bs;
}

function drawTurret(R, S, g, k) {
  const c = R.ctx, { bs } = g, T = g.tur[k], B = S.base, ang = B.aim[k], rec = B.recoil[k] || 0;
  const paint = S.garage.paint.color, hi = lighten(paint, 0.4), lo = darken(paint, 0.4), day = S.env === 'day';
  // pad
  c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(T.x, T.y + 8 * bs, 28 * bs, 7 * bs, 0, 0, 7); c.fill();
  const pad = c.createLinearGradient(0, T.y - 4 * bs, 0, T.y + 10 * bs); pad.addColorStop(0, day ? '#c6cde0' : '#4a5690'); pad.addColorStop(1, day ? '#7a829c' : '#222a58');
  c.fillStyle = pad; roundRect(c, T.x - 24 * bs, T.y - 2 * bs, 48 * bs, 14 * bs, 5 * bs); c.fill();
  // barrel (rotated), recoil pulls it back along its axis
  c.save(); c.translate(T.x, T.y - 8 * bs); c.rotate(ang);
  const bl = 40 * bs, bw = 9 * bs, ox = -rec * 7 * bs;
  const bgd = c.createLinearGradient(0, -bw / 2, 0, bw / 2); bgd.addColorStop(0, hi); bgd.addColorStop(0.5, paint); bgd.addColorStop(1, lo);
  c.fillStyle = '#1a1f38'; roundRect(c, ox + 2 * bs, -bw * 0.62, bl, bw * 1.24, 3 * bs); c.fill();
  c.fillStyle = bgd; roundRect(c, ox + 4 * bs, -bw / 2, bl - 4 * bs, bw, 3 * bs); c.fill();
  c.fillStyle = '#0c0f22'; c.fillRect(ox + bl - 3 * bs, -bw * 0.62, 5 * bs, bw * 1.24);
  c.restore();
  // swivel head
  const hg = c.createRadialGradient(T.x - 6 * bs, T.y - 16 * bs, 2, T.x, T.y - 8 * bs, 18 * bs); hg.addColorStop(0, hi); hg.addColorStop(0.6, paint); hg.addColorStop(1, lo);
  c.fillStyle = hg; c.beginPath(); c.arc(T.x, T.y - 8 * bs, 15 * bs, 0, 7); c.fill();
  c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 1.2; c.stroke();
  c.fillStyle = '#10142c'; c.beginPath(); c.arc(T.x, T.y - 8 * bs, 5 * bs, 0, 7); c.fill();
  c.fillStyle = S.theme.accent; c.beginPath(); c.arc(T.x, T.y - 8 * bs, 2.2 * bs, 0, 7); c.fill();
  // muzzle flash
  if (B.flash[k] > 0.02) {
    const mx = T.x + Math.cos(ang) * (bl + 6 * bs), my = T.y - 8 * bs + Math.sin(ang) * (bl + 6 * bs);
    R.glow(mx, my, 40 * bs * B.flash[k] + 10, beamColor(S, k), 0.95 * B.flash[k]);
  }
}

export function muzzle(g, S, k) {
  const T = g.tur[k], ang = S.base.aim[k], bl = 46 * g.bs;
  return { x: T.x + Math.cos(ang) * bl, y: T.y - 8 * g.bs + Math.sin(ang) * bl };
}
function beamColor(S, k) {
  const id = S.garage.glow.id;
  if (id === 'paint') return S.garage.paint.color;
  if (id === 'white') return '#ffffff';
  if (id === 'rainbow') return ['#ff3fb4', '#ffc83d', '#19e6c1'][k % 3];
  return S.theme.accent && S.env === 'night' ? '#7fe9ff' : '#fff3a0';
}

function drawShield(R, S, g) {
  const c = R.ctx, cx = g.baseX, cy = g.baseY - 10 * g.bs, r = 150 * g.bs, B = S.base;
  const a = 0.1 + 0.05 * Math.sin(S.t * 2) + B.shieldFlash * 0.5;
  const col = B.shieldFlash > 0.05 ? '#ff4d6d' : (S.env === 'day' ? '#7fd6ff' : '#4cd6ff');
  const gr = c.createRadialGradient(cx, cy, r * 0.5, cx, cy, r); gr.addColorStop(0, col + '00'); gr.addColorStop(0.85, col + '22'); gr.addColorStop(1, col + '88');
  c.globalAlpha = Math.min(1, a * 3.2); c.fillStyle = gr; c.beginPath(); c.arc(cx, cy, r, Math.PI, 0); c.closePath(); c.fill();
  c.globalAlpha = Math.min(1, 0.45 + B.shieldFlash); c.strokeStyle = col; c.lineWidth = 2 * g.bs; c.beginPath(); c.arc(cx, cy, r, Math.PI, 0); c.stroke();
  c.globalAlpha = 1;
  if (B.damage >= 2) { c.strokeStyle = 'rgba(255,120,120,.6)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(cx - r * 0.5, cy - r * 0.86); c.lineTo(cx - r * 0.38, cy - r * 0.7); c.lineTo(cx - r * 0.46, cy - r * 0.58); c.stroke(); }
}

// ---------- drones ----------
function drawDrone(R, S, g, i, P, label) {
  const c = R.ctx, s = g.s, pal = S.droneColors, { x, y } = P, t = S.t;
  const good = S.D.result && S.D.result.correctIndex === i, bad = S.D.result && S.D.result.picked === i && !S.D.result.correct;
  const boss = !!S.gate && !(P.mode === 'locked' && S.D.result && bad);
  const col = P.mode === 'locked' && S.D.result ? (bad ? BAD : (boss ? BOSS : pal)) : (boss ? BOSS : pal);
  c.save(); c.translate(x + (P.shake ? Math.sin(t * 90 + i) * 2 : 0), y); c.scale(s, s);
  if (P.mode === 'dive') c.rotate(0.35 * Math.sin(t * 6 + i) + (g.baseX - x) * 0.002);
  // shadow glow
  R.glow(0, 4, 54 * s, col[1], S.env === 'night' ? 0.55 : 0.34);
  // rotors (spinning ellipses on arms)
  c.strokeStyle = '#242b4d'; c.lineWidth = 4; c.beginPath(); c.moveTo(-14, 2); c.lineTo(-34, -8); c.moveTo(14, 2); c.lineTo(34, -8); c.stroke();
  for (const sx of [-34, 34]) {
    c.fillStyle = 'rgba(255,255,255,.28)'; c.beginPath(); c.ellipse(sx, -10, 17 * (0.55 + 0.45 * Math.abs(Math.sin(t * 40 + i + sx))), 3.4, 0, 0, 7); c.fill();
    c.fillStyle = '#1a2040'; c.beginPath(); c.arc(sx, -9, 3.4, 0, 7); c.fill();
  }
  // body
  const bg = c.createLinearGradient(0, -20, 0, 20); bg.addColorStop(0, lighten(col[1], 0.2)); bg.addColorStop(0.5, col[1]); bg.addColorStop(1, col[0]);
  c.fillStyle = bg; roundRect(c, -24, -18, 48, 34, 14); c.fill();
  c.strokeStyle = darken(col[0], 0.5); c.lineWidth = 2.2; c.stroke();
  c.fillStyle = 'rgba(255,255,255,.3)'; roundRect(c, -18, -15, 36, 7, 4); c.fill();
  if (S.gate) {                                                           // boss armour: shoulder plates, horns and a gold crest
    c.fillStyle = '#2a0f1c'; c.strokeStyle = '#ffd36b'; c.lineWidth = 1.8;
    for (const sx of [-1, 1]) {
      c.beginPath(); c.moveTo(sx * 22, -16); c.lineTo(sx * 36, -6); c.lineTo(sx * 33, 10); c.lineTo(sx * 22, 12); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(sx * 12, -18); c.lineTo(sx * 17, -34); c.lineTo(sx * 22, -17); c.closePath(); c.fill(); c.stroke();
    }
    c.fillStyle = '#ffd36b'; c.beginPath(); c.moveTo(-6, -18); c.lineTo(0, -28); c.lineTo(6, -18); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,211,107,.75)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-16, 8); c.lineTo(16, 8); c.stroke();
  }
  // underside thruster
  c.fillStyle = darken(col[0], 0.55); roundRect(c, -12, 12, 24, 7, 3); c.fill();
  R.glow(0, 22, 20, '#ffe08a', 0.55 + 0.25 * Math.sin(t * 12 + i));
  // eye
  c.fillStyle = '#0b1026'; c.beginPath(); c.ellipse(0, 3, 11, 7, 0, 0, 7); c.fill();
  c.fillStyle = good && S.D.phase === 'result' ? '#7dff9c' : '#ff2d55'; c.beginPath(); c.arc(0, 3, 4 + Math.sin(t * 6 + i) * 0.8, 0, 7); c.fill();
  c.restore();
  // letter badge above the drone (unscaled text, scaled position)
  const bx = x, by = y - 38 * s, br = 15 * Math.max(0.9, s);
  const lg = c.createLinearGradient(0, by - br, 0, by + br); lg.addColorStop(0, '#ffffff'); lg.addColorStop(1, '#dfe6ff');
  c.fillStyle = 'rgba(8,12,34,.9)'; c.beginPath(); c.arc(bx, by, br + 3, 0, 7); c.fill();
  c.fillStyle = lg; c.beginPath(); c.arc(bx, by, br, 0, 7); c.fill();
  c.fillStyle = '#0f1538'; c.font = `900 ${Math.round(br * 1.25)}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, bx, by + 1);
  if (S.D.phase === 'result' && good) { c.strokeStyle = '#3dffa0'; c.lineWidth = 3; c.beginPath(); c.arc(bx, by, br + 6, 0, 7); c.stroke(); }
}

function drawReticle(R, S, g, P) {
  const c = R.ctx, r = 40 * g.s, t = S.t;
  c.save(); c.translate(P.x, P.y); c.strokeStyle = '#3dffa0'; c.fillStyle = '#3dffa0'; c.lineWidth = 3;
  c.globalAlpha = 0.65 + 0.3 * Math.sin(t * 8);
  c.rotate(S.reduceMotion ? 0 : t * 1.2);
  for (let k = 0; k < 4; k++) { c.rotate(Math.PI / 2); c.beginPath(); c.moveTo(r, -r * 0.45); c.lineTo(r, -r); c.lineTo(r * 0.45, -r); c.stroke(); }
  c.restore(); c.globalAlpha = 1;
  R.glow(P.x, P.y, r * 1.7, '#3dffa0', 0.2);
}

function drawBeams(R, S, g) {
  const D = S.D; if (D.phase !== 'result') return;
  const c = R.ctx, T = D.rt, id = S.garage.trail.id;
  c.globalCompositeOperation = 'lighter';
  for (const b of D.beams) {                                        // beams are computed by the host: {k, tx, ty, a}
    const m = muzzle(g, S, b.k), col = beamColor(S, b.k);
    c.globalAlpha = b.a; c.strokeStyle = col; c.lineWidth = 6 * g.bs; c.lineCap = 'round';
    c.beginPath(); c.moveTo(m.x, m.y);
    if (id === 'electric') { const n = 6; for (let q = 1; q < n; q++) { const f = q / n; c.lineTo(m.x + (b.tx - m.x) * f + Math.sin(T * 90 + q * 3 + b.k) * 8 * g.bs, m.y + (b.ty - m.y) * f + Math.cos(T * 80 + q) * 8 * g.bs); } }
    c.lineTo(b.tx, b.ty); c.stroke();
    c.globalAlpha = b.a; c.strokeStyle = id === 'flame' ? '#ff7a1f' : id === 'rainbow' ? `hsl(${(T * 600) % 360},100%,60%)` : '#ffffff'; c.lineWidth = 2.4 * g.bs; c.beginPath(); c.moveTo(m.x, m.y); c.lineTo(b.tx, b.ty); c.stroke();
  }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.lineCap = 'butt';
}

function drawMinions(R, S, g) {
  const c = R.ctx, day = S.env === 'day';
  for (const m of S.minions) {
    const y = g.baseY + 12 * g.bs + m.lane * 5 * g.bs, s = g.bs * 0.9 * (m.dead ? Math.max(0, 1 - m.dt * 3) : 1);
    if (s <= 0.02) continue;
    c.save(); c.translate(m.x, y); c.scale(m.dir * s, s);
    c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(0, 3, 12, 3, 0, 0, 7); c.fill();
    const step = Math.sin(S.t * 14 + m.ph) * 3;
    c.strokeStyle = '#1a1f38'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(-5, -2); c.lineTo(-7 - step * 0.3, 3 + step); c.moveTo(5, -2); c.lineTo(7 + step * 0.3, 3 - step); c.stroke();
    const grd = c.createLinearGradient(0, -14, 0, 0); grd.addColorStop(0, day ? '#ff9a4d' : '#ff7ad1'); grd.addColorStop(1, day ? '#e0541d' : '#a52fb8');
    c.fillStyle = grd; roundRect(c, -9, -13, 18, 13, 6); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(3, -8, 3, 0, 7); c.fill(); c.fillStyle = '#10142c'; c.beginPath(); c.arc(4, -8, 1.4, 0, 7); c.fill();
    c.restore();
  }
}

function drawTimerFrost(R, S) {
  const T = S.think; if (!T || !T.frozen) return;
  R.ctx.fillStyle = 'rgba(127,214,255,.1)'; R.ctx.fillRect(0, 0, R.w, R.h);
}

function drawSmokeD(R, S) {
  const c = R.ctx;
  for (const p of S.smoke || []) { c.globalAlpha = Math.max(0, p.a); c.fillStyle = p.fire ? `hsl(${20 + 20 * p.a},100%,55%)` : '#5a5f6e'; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fill(); }
  c.globalAlpha = 1;
}

function c0(R) { const c = R.ctx, g = c.createRadialGradient(R.w / 2, R.h * 0.5, R.h * 0.2, R.w / 2, R.h * 0.5, R.h * 0.75); g.addColorStop(0, 'rgba(120,0,30,0)'); g.addColorStop(1, 'rgba(140,0,30,.28)'); c.fillStyle = g; c.fillRect(0, 0, R.w, R.h); }   // red edge glow while a gate is open
function drawGateBar(R, S, g) {
  const G = S.gate; if (!G) return;
  const c = R.ctx, t = S.t, w = Math.min(R.w * 0.9, g.span), h = 26, x = g.baseX - w / 2, y = Math.max(6, (R.uiTop > 0 ? R.uiTop : g.hz) - 2);
  c.save();
  c.fillStyle = 'rgba(30,6,16,.88)'; roundRect(c, x, y, w, h, 9); c.fill();
  c.strokeStyle = `rgba(255,${176 + (S.reduceMotion ? 0 : Math.round(40 * Math.sin(t * 5)))},46,.95)`; c.lineWidth = 2; c.stroke();
  c.fillStyle = '#ffd36b'; c.font = '900 11px system-ui, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillText('RANK GATE', x + 10, y + h / 2 + 1);
  const x0 = x + 92, x1 = x + w - 58, n = Math.max(1, G.need), gap = 3, sw = (x1 - x0 - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) { c.fillStyle = i < G.done ? '#3dffa0' : 'rgba(255,255,255,.18)'; roundRect(c, x0 + i * (sw + gap), y + 8, Math.max(2, sw), h - 16, 2); c.fill(); }
  for (let k = 0; k < 3; k++) {                                              // three strike marks: the gate fails on the third mistake
    const mx = x + w - 44 + k * 14, my = y + h / 2;
    c.strokeStyle = k < G.wrong ? '#ff4d6d' : 'rgba(255,255,255,.28)'; c.lineWidth = k < G.wrong ? 3 : 2;
    c.beginPath(); c.moveTo(mx - 4, my - 4); c.lineTo(mx + 4, my + 4); c.moveTo(mx + 4, my - 4); c.lineTo(mx - 4, my + 4); c.stroke();
  }
  c.restore();
}

export function drawScene(R, S) {
  R.gateBar = !!S.gate;                                             // geom() leaves room under the question card for the Rank Gate bar
  const g = geom(R);
  drawBackdrop(R, S, g); drawPlatform(R, S, g);
  drawMinions(R, S, g);
  drawTower(R, S, g);
  for (let k = 0; k < 3; k++) drawTurret(R, S, g, k);
  drawShield(R, S, g);
  const D = S.D;
  if (D && (D.phase === 'ask' || D.phase === 'result')) {
    const order = [0, 1, 2, 3];
    for (const i of order) {
      const P = dronePos(g, D, i); S.dronePos[i] = P;
      if (P) drawDrone(R, S, g, i, P, S.letters[i]);
    }
    if (D.phase === 'ask' && D.sel >= 0 && S.dronePos[D.sel]) drawReticle(R, S, g, S.dronePos[D.sel]);
  }
  drawBeams(R, S, g);
  drawSmokeD(R, S); drawVignette(R, S); drawTimerFrost(R, S);
  if (S.gate) { c0(R); drawGateBar(R, S, g); }
  drawParticles(R, S.parts);
  return g;
}
