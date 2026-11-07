// Neon Racer car bodies (rear view, drawn from canvas paths, no images). Cosmetic only: a car never changes the questions or the score.
// Units: about 62 wide, origin = ground under the middle of the car, the car stands up toward negative y.
// Unlock ranks are given on the 20-rank scale and scaled to the student's ladder (see garage.js needRank).

export const CARS = [
  { id: 'street', name: 'Street',  unlockRank: 0,  blurb: 'Everyday hatchback. Honest and quick.' },
  { id: 'sport',  name: 'Sport',   unlockRank: 5,  blurb: 'Low and wide with a big wing.' },
  { id: 'super',  name: 'Super',   unlockRank: 10, blurb: 'Wedge supercar, tiny cockpit, wide diffuser.' },
  { id: 'hyper',  name: 'Hyper',   unlockRank: 15, blurb: 'Neon hypercar with twin fins and glowing thrusters.' },
];

// ---- tiny colour helpers (kept local so this file has no imports) ----
const hexRgb = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mixc = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`; };
const lighten = (c, t) => mixc(c, '#ffffff', t);
const darken = (c, t) => mixc(c, '#000000', t);
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
const ell = (c, x, y, rx, ry) => { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.fill(); };

let _sh = true;                                   // the world renderer draws its own flat ground shadow (so it never tilts with the car)
function shadow(c, rx) { if (_sh) { c.fillStyle = 'rgba(0,0,0,.35)'; ell(c, 0, 2, rx, 5); } }
function tyres(c, half, w, h) {
  c.fillStyle = '#0d0e14'; rr(c, -half - w + 6, -h + 1, w, h, 3); c.fill(); rr(c, half - 6, -h + 1, w, h, 3); c.fill();
  c.fillStyle = '#2b2f3d'; c.fillRect(-half - w + 8, -h + 4, 2, h - 6); c.fillRect(half + w - 10, -h + 4, 2, h - 6);
}
function damage(c, dmg, y0 = -23) {
  if (dmg >= 1) { c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-26, y0); c.lineTo(-21, y0 + 5); c.lineTo(-24, y0 + 8); c.moveTo(18, y0 - 1); c.lineTo(24, y0 + 4); c.stroke(); c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.moveTo(-26, y0); c.lineTo(-20, y0 - 1); c.lineTo(-22, y0 + 6); c.closePath(); c.fill(); }
  if (dmg >= 2) { c.strokeStyle = 'rgba(235,245,255,.85)'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(3, y0 - 14); c.lineTo(-2, y0 - 8); c.lineTo(5, y0 - 4); c.moveTo(-2, y0 - 8); c.lineTo(-11, y0 - 6); c.stroke(); c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(8, y0 + 7, 16, 6); }
  if (dmg >= 3) { c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-10, y0 + 14); c.lineTo(-4, y0 + 1); c.lineTo(4, y0 + 11); c.stroke(); }
}
function tailLight(c, x, y, w, h, on) {
  const tl = c.createLinearGradient(0, y, 0, y + h); tl.addColorStop(0, on ? '#ff6b6b' : '#5a1620'); tl.addColorStop(1, on ? '#c2102a' : '#3a0f16');
  c.fillStyle = tl; rr(c, x, y, w, h, 2); c.fill();
  if (on) { c.fillStyle = 'rgba(255,255,255,.45)'; c.fillRect(x + 2, y + 1, Math.max(2, w * 0.4), 1.1); }
}

// ---------------------------------------------------------------- Street (the original hatchback)
function street(c, paint, o) {
  const dmg = o.damage || 0, hi = lighten(paint, 0.35), lo = darken(paint, 0.38), dk = darken(paint, 0.55);
  shadow(c, 36);
  c.fillStyle = '#0d0e14'; rr(c, -33, -15, 11, 16, 3); c.fill(); rr(c, 22, -15, 11, 16, 3); c.fill();
  c.fillStyle = '#2b2f3d'; c.fillRect(-31, -12, 2, 9); c.fillRect(29, -12, 2, 9);
  const bg = c.createLinearGradient(0, -26, 0, -5); bg.addColorStop(0, hi); bg.addColorStop(0.45, paint); bg.addColorStop(1, lo);
  c.fillStyle = bg; c.beginPath(); c.moveTo(-30, -7); c.lineTo(-31, -19); c.quadraticCurveTo(-31, -25, -24, -26); c.lineTo(24, -26); c.quadraticCurveTo(31, -25, 31, -19); c.lineTo(30, -7); c.closePath(); c.fill();
  const cg = c.createLinearGradient(0, -40, 0, -25); cg.addColorStop(0, hi); cg.addColorStop(1, paint);
  c.fillStyle = cg; c.beginPath(); c.moveTo(-23, -25); c.lineTo(-17, -39); c.quadraticCurveTo(0, -42, 17, -39); c.lineTo(23, -25); c.closePath(); c.fill();
  const wg = c.createLinearGradient(0, -37, 0, -26); wg.addColorStop(0, '#223a63'); wg.addColorStop(1, '#0b1630');
  c.fillStyle = wg; c.beginPath(); c.moveTo(-19.5, -26.5); c.lineTo(-14.5, -36.5); c.quadraticCurveTo(0, -38.8, 14.5, -36.5); c.lineTo(19.5, -26.5); c.closePath(); c.fill();
  c.fillStyle = 'rgba(255,255,255,.22)'; c.beginPath(); c.moveTo(-14, -35.5); c.lineTo(-5, -36.6); c.lineTo(-13, -27.5); c.lineTo(-17.5, -27.5); c.closePath(); c.fill();
  c.fillStyle = dk; c.fillRect(-27, -33, 54, 3.4); c.fillRect(-20, -31, 3, 6); c.fillRect(17, -31, 3, 6);
  c.fillStyle = 'rgba(255,255,255,.28)'; c.fillRect(-27, -33, 54, 1);
  c.fillStyle = '#14151d'; rr(c, -28, -12.5, 56, 6.5, 2); c.fill();
  c.fillStyle = '#f1f3f8'; rr(c, -8, -11.5, 16, 5, 1); c.fill();
  c.fillStyle = '#3d4256'; c.fillRect(-6, -9.8, 12, 0.9);
  c.fillStyle = '#0a0a0f'; ell(c, -18, -3.4, 3.4, 1.8); ell(c, 18, -3.4, 3.4, 1.8);
  c.fillStyle = '#9aa1b8'; ell(c, -18, -3.7, 2.6, 1.1); ell(c, 18, -3.7, 2.6, 1.1);
  tailLight(c, -29, -22, 14, 6.5, true); tailLight(c, 15, -22, 14, 6.5, dmg < 3);
  c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-28, -25.2); c.lineTo(28, -25.2); c.stroke();
  damage(c, dmg);
}

// ---------------------------------------------------------------- Sport (low, wide, big wing)
function sport(c, paint, o) {
  const dmg = o.damage || 0, hi = lighten(paint, 0.38), lo = darken(paint, 0.42), dk = darken(paint, 0.6);
  shadow(c, 39);
  tyres(c, 30, 12, 15);
  const bg = c.createLinearGradient(0, -24, 0, -5); bg.addColorStop(0, hi); bg.addColorStop(0.4, paint); bg.addColorStop(1, lo);
  c.fillStyle = bg; c.beginPath(); c.moveTo(-34, -6); c.lineTo(-35, -16); c.quadraticCurveTo(-35, -22, -27, -23); c.lineTo(27, -23); c.quadraticCurveTo(35, -22, 35, -16); c.lineTo(34, -6); c.closePath(); c.fill();
  const cg = c.createLinearGradient(0, -34, 0, -22); cg.addColorStop(0, hi); cg.addColorStop(1, paint);
  c.fillStyle = cg; c.beginPath(); c.moveTo(-22, -22); c.lineTo(-14, -33); c.quadraticCurveTo(0, -35.5, 14, -33); c.lineTo(22, -22); c.closePath(); c.fill();
  const wg = c.createLinearGradient(0, -32, 0, -23); wg.addColorStop(0, '#1d3158'); wg.addColorStop(1, '#08102a');
  c.fillStyle = wg; c.beginPath(); c.moveTo(-18.5, -23.5); c.lineTo(-12.5, -31.5); c.quadraticCurveTo(0, -33.4, 12.5, -31.5); c.lineTo(18.5, -23.5); c.closePath(); c.fill();
  c.fillStyle = 'rgba(255,255,255,.2)'; c.beginPath(); c.moveTo(-12, -30.8); c.lineTo(-4, -32); c.lineTo(-11, -24.5); c.lineTo(-16, -24.5); c.closePath(); c.fill();
  // big wing on two stands with end plates
  c.fillStyle = dk; c.fillRect(-14, -34, 3.2, 13); c.fillRect(10.8, -34, 3.2, 13);
  c.fillStyle = lo; rr(c, -35, -41, 70, 5.2, 2); c.fill();
  c.fillStyle = 'rgba(255,255,255,.32)'; c.fillRect(-34, -41, 68, 1.1);
  c.fillStyle = dk; c.fillRect(-36, -45, 2.6, 12); c.fillRect(33.4, -45, 2.6, 12);
  // full-width LED tail bar + diffuser + quad exhaust
  tailLight(c, -31, -19, 25, 4.6, true); tailLight(c, 6, -19, 25, 4.6, dmg < 3);
  c.fillStyle = '#12131b'; rr(c, -30, -13.6, 60, 7.6, 2); c.fill();
  c.strokeStyle = '#2c3042'; c.lineWidth = 1; for (let x = -24; x <= 24; x += 8) { c.beginPath(); c.moveTo(x, -13); c.lineTo(x, -6.4); c.stroke(); }
  c.fillStyle = '#f1f3f8'; rr(c, -7, -17.4, 14, 3.4, 1); c.fill();
  c.fillStyle = '#0a0a0f'; for (const x of [-20, -13, 13, 20]) ell(c, x, -3.6, 3, 1.7);
  c.fillStyle = '#b5bbd0'; for (const x of [-20, -13, 13, 20]) ell(c, x, -3.9, 2.1, 1);
  c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-31, -22.2); c.lineTo(31, -22.2); c.stroke();
  damage(c, dmg, -20);
}

// ---------------------------------------------------------------- Super (wedge supercar)
function superCar(c, paint, o) {
  const dmg = o.damage || 0, hi = lighten(paint, 0.4), lo = darken(paint, 0.45), dk = darken(paint, 0.62);
  shadow(c, 41);
  tyres(c, 31, 13, 16);
  const bg = c.createLinearGradient(0, -24, 0, -4); bg.addColorStop(0, hi); bg.addColorStop(0.38, paint); bg.addColorStop(1, lo);
  c.fillStyle = bg; c.beginPath(); c.moveTo(-36, -5); c.lineTo(-37, -14); c.lineTo(-31, -22); c.lineTo(31, -22); c.lineTo(37, -14); c.lineTo(36, -5); c.closePath(); c.fill();
  // engine cover with louvres and a tiny glasshouse
  c.fillStyle = darken(paint, 0.18); c.beginPath(); c.moveTo(-26, -22); c.lineTo(-15, -30); c.lineTo(15, -30); c.lineTo(26, -22); c.closePath(); c.fill();
  c.fillStyle = '#0a1226'; c.beginPath(); c.moveTo(-13, -30); c.lineTo(-9, -35.5); c.lineTo(9, -35.5); c.lineTo(13, -30); c.closePath(); c.fill();
  c.fillStyle = 'rgba(255,255,255,.2)'; c.beginPath(); c.moveTo(-9, -35); c.lineTo(-3, -35.4); c.lineTo(-7, -30.6); c.lineTo(-11.6, -30.6); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1.2; for (let i = 0; i < 4; i++) { const y = -28.6 + i * 1.7, w = 14 + i * 2.4; c.beginPath(); c.moveTo(-w, y); c.lineTo(w, y); c.stroke(); }
  // side intakes
  c.fillStyle = dk; c.beginPath(); c.moveTo(-36, -13); c.lineTo(-31, -20); c.lineTo(-31, -11); c.closePath(); c.fill(); c.beginPath(); c.moveTo(36, -13); c.lineTo(31, -20); c.lineTo(31, -11); c.closePath(); c.fill();
  // thin LED tail bar, big diffuser with fins, centre exhaust pair
  tailLight(c, -29, -19, 58, 3.2, dmg < 3);
  c.fillStyle = '#10111a'; c.beginPath(); c.moveTo(-32, -15); c.lineTo(32, -15); c.lineTo(34, -4); c.lineTo(-34, -4); c.closePath(); c.fill();
  c.strokeStyle = '#2f3447'; c.lineWidth = 1.1; for (let x = -26; x <= 26; x += 6.5) { c.beginPath(); c.moveTo(x * 0.85, -14.4); c.lineTo(x, -4.4); c.stroke(); }
  c.fillStyle = '#f1f3f8'; rr(c, -6, -18.4, 12, 2.6, 1); c.fill();
  c.fillStyle = '#0a0a0f'; ell(c, -9, -8.4, 3.2, 1.9); ell(c, 9, -8.4, 3.2, 1.9);
  c.fillStyle = '#ffb067'; ell(c, -9, -8.6, 2.2, 1.1); ell(c, 9, -8.6, 2.2, 1.1);
  c.strokeStyle = 'rgba(255,255,255,.34)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-30, -21.4); c.lineTo(30, -21.4); c.stroke();
  damage(c, dmg, -20);
}

// ---------------------------------------------------------------- Hyper (neon hypercar, twin fins, thrusters)
function hyper(c, paint, o) {
  const dmg = o.damage || 0, hi = lighten(paint, 0.42), lo = darken(paint, 0.5), dk = darken(paint, 0.66), glow = lighten(paint, 0.55);
  shadow(c, 42);
  tyres(c, 31, 13, 17);
  const bg = c.createLinearGradient(0, -26, 0, -4); bg.addColorStop(0, hi); bg.addColorStop(0.35, paint); bg.addColorStop(1, lo);
  c.fillStyle = bg; c.beginPath(); c.moveTo(-37, -5); c.lineTo(-37, -13); c.quadraticCurveTo(-33, -22, -22, -24); c.lineTo(22, -24); c.quadraticCurveTo(33, -22, 37, -13); c.lineTo(37, -5); c.closePath(); c.fill();
  // canopy
  c.fillStyle = '#071024'; c.beginPath(); c.moveTo(-17, -24); c.quadraticCurveTo(-13, -37, 0, -38); c.quadraticCurveTo(13, -37, 17, -24); c.closePath(); c.fill();
  const cg = c.createLinearGradient(0, -38, 0, -24); cg.addColorStop(0, 'rgba(120,190,255,.55)'); cg.addColorStop(1, 'rgba(10,20,60,0)');
  c.fillStyle = cg; c.beginPath(); c.moveTo(-14, -25); c.quadraticCurveTo(-11, -35, 0, -36); c.quadraticCurveTo(11, -35, 14, -25); c.closePath(); c.fill();
  // twin vertical fins
  c.fillStyle = dk; c.beginPath(); c.moveTo(-26, -23); c.lineTo(-24, -39); c.lineTo(-21, -39); c.lineTo(-20, -23); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(26, -23); c.lineTo(24, -39); c.lineTo(21, -39); c.lineTo(20, -23); c.closePath(); c.fill();
  c.fillStyle = glow; c.fillRect(-23.4, -38.4, 1.6, 12); c.fillRect(21.8, -38.4, 1.6, 12);
  // neon trim lines
  c.strokeStyle = glow; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-34, -15); c.lineTo(-22, -21); c.lineTo(22, -21); c.lineTo(34, -15); c.stroke();
  // light bar + twin thrusters
  tailLight(c, -30, -19.5, 60, 2.6, dmg < 3);
  c.fillStyle = '#0c0d15'; rr(c, -32, -15.4, 64, 10.4, 3); c.fill();
  for (const x of [-15, 15]) {
    c.fillStyle = '#05060a'; ell(c, x, -9.6, 8.6, 4.4);
    const th = c.createRadialGradient(x, -9.6, 0.5, x, -9.6, 7.5); th.addColorStop(0, '#ffffff'); th.addColorStop(0.35, glow); th.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = th; ell(c, x, -9.6, 7.4, 3.8);
  }
  c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-30, -23.4); c.lineTo(30, -23.4); c.stroke();
  damage(c, dmg, -21);
}

const DRAW = { street, sport, super: superCar, hyper };

/** Draw one car. `model` = a CARS id; unknown ids fall back to the street car. */
export function drawCarModel(c, model, paint, opts = {}) { _sh = opts.shadow !== false; (DRAW[model] || street)(c, paint, opts); _sh = true; }
