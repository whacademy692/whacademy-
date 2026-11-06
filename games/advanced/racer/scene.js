// Neon Racer scene drawing: pseudo-3D road, themed sky, gates, traffic, player car, trails, particles.
// Everything is drawn from one plain state object S, so it can be tested and reused for previews.

export const CAR_K = 0.74;                         // player's row on the road (0 horizon .. 1 bottom)
export const rowT = (k) => Math.pow(k, 2.1);

export function geom(R) {
  const hz = R.h * 0.3;
  const roadHalf = (t) => R.w * (0.025 + 0.455 * t);
  const rowY = (t) => hz + (R.h - hz) * t;
  const laneX = (lane, t) => R.w / 2 + (lane - 1.5) * (roadHalf(t) * 2 / 4);
  return { hz, roadHalf, rowY, laneX };
}

const STAR_POS = Array.from({ length: 160 }, (_, i) => ({ x: ((i * 9301 + 49297) % 233280) / 233280, y: ((i * 4621 + 7919) % 233280) / 233280, s: 0.5 + (i % 5) * 0.35 }));

function drawSky(R, S, g) {
  const c = R.ctx, w = R.w, hz = g.hz, th = S.theme;
  const grd = c.createLinearGradient(0, 0, 0, hz);
  grd.addColorStop(0, th.sky[0]); grd.addColorStop(1, th.sky[1]);
  c.fillStyle = grd; c.fillRect(0, 0, w, hz);
  c.fillStyle = '#fff';
  const ns = Math.min(STAR_POS.length, Math.round(S.preset.stars * (th.stars || 1)));
  for (let i = 0; i < ns; i++) { const s = STAR_POS[i]; c.globalAlpha = 0.25 + 0.5 * Math.abs(Math.sin(S.t * s.s + i)); c.fillRect(s.x * w, s.y * hz * 0.9, s.s, s.s); }
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
  const sx = w / 2, sy = hz - 8, sr = Math.min(w, 520) * 0.12;
  R.glow(sx, sy, Math.min(w, 520) * 0.5, th.accent, 0.5);
  if (th.sun === 'disc' || th.sun === 'stripes') {
    c.fillStyle = th.accent; c.globalAlpha = 0.92;
    c.beginPath(); c.arc(sx, sy, sr, Math.PI, 0); c.fill();
    if (th.sun === 'stripes') { c.fillStyle = th.sky[1]; for (let i = 1; i < 5; i++) c.fillRect(sx - sr, sy - i * sr * 0.22, sr * 2, 2 + i); }
    c.globalAlpha = 1;
  } else if (th.sun === 'ring') {
    c.strokeStyle = th.accent; c.lineWidth = 3;
    c.beginPath(); c.arc(sx, sy - sr * 0.4, sr, Math.PI, 0); c.stroke();
    c.globalAlpha = 0.5; c.beginPath(); c.arc(sx, sy - sr * 0.4, sr * 0.65, Math.PI, 0); c.stroke(); c.globalAlpha = 1;
  }
  if (th.lightning && S.flash > 0) { c.fillStyle = '#cfe0ff'; c.globalAlpha = S.flash * 0.35; c.fillRect(0, 0, w, hz); c.globalAlpha = 1; }
}

function drawRoad(R, S, g) {
  const c = R.ctx, w = R.w, h = R.h, hz = g.hz, th = S.theme, col = th.accent, p = S.preset;
  c.fillStyle = th.ground; c.fillRect(0, hz, w, h - hz);
  c.fillStyle = '#0d0f26';
  c.beginPath(); c.moveTo(w / 2 - g.roadHalf(0), hz); c.lineTo(w / 2 + g.roadHalf(0), hz); c.lineTo(w / 2 + g.roadHalf(1), h); c.lineTo(w / 2 - g.roadHalf(1), h); c.closePath(); c.fill();
  const N = Math.max(6, Math.round(p.roadSegs / 4));
  c.strokeStyle = col;
  for (let i = 0; i < N; i++) {
    const k = (i + (S.scroll % 1)) / N, t = rowT(k), y = g.rowY(t), hw = g.roadHalf(t);
    c.globalAlpha = 0.08 + 0.4 * t; c.lineWidth = 1 + 2 * t;
    c.beginPath(); c.moveTo(w / 2 - hw, y); c.lineTo(w / 2 + hw, y); c.stroke();
    if (i % 2 === 0) {
      c.globalAlpha = 0.9 * t + 0.1; c.fillStyle = S.lanes[(i / 2) % 4 | 0];
      const s = 3 + 16 * t;
      if (th.tunnel) { c.strokeStyle = col; c.lineWidth = 1 + 2 * t; c.strokeRect(w / 2 - hw - s * 1.2, y - s * 9, hw * 2 + s * 2.4, s * 9); c.strokeStyle = col; }
      else { c.fillRect(w / 2 - hw - s * 1.6, y - s * 2.2, s * 0.7, s * 2.2); c.fillRect(w / 2 + hw + s * 0.9, y - s * 2.2, s * 0.7, s * 2.2); }
    }
  }
  c.globalAlpha = 1;
  for (let L = 0; L <= 4; L++) {
    const edge = L === 0 || L === 4;
    const x0 = w / 2 + (L - 2) * g.roadHalf(0) / 2, x1 = w / 2 + (L - 2) * g.roadHalf(1) / 2;
    if (edge) R.neonLine(x0, hz, x1, h, col, 2.5, 1);
    else { c.strokeStyle = '#3a3f7a'; c.globalAlpha = 0.7; c.lineWidth = 1.5; c.setLineDash([10, 14]); c.lineDashOffset = -S.scroll * 60; c.beginPath(); c.moveTo(x0, hz); c.lineTo(x1, h); c.stroke(); c.setLineDash([]); c.globalAlpha = 1; }
  }
  if (th.snow && !S.reduceMotion) {
    c.fillStyle = '#fff';
    for (let i = 0; i < 40; i++) { const x = ((i * 53.7 + S.t * 14 * (1 + (i % 3))) % 1) * 0; c.globalAlpha = 0.6; c.fillRect(((i * 97) % 100) / 100 * w, ((i * 31 + S.t * (40 + (i % 5) * 12)) % h), 2, 2); void x; }
    c.globalAlpha = 1;
  }
}

function drawGates(R, S, g) {
  const G = S.gates; if (!G) return;
  const c = R.ctx, t = rowT(G.k), y = g.rowY(t), hw = g.roadHalf(t), lw = hw * 2 / 4;
  for (let L = 0; L < 4; L++) {
    const x = g.laneX(L, t), gh = 14 + 70 * t, dim = G.hidden.includes(L);
    const res = G.result ? (L === G.result.correct ? 'good' : L === G.result.picked ? 'bad' : '') : '';
    const col = res === 'good' ? '#3dffa0' : res === 'bad' ? '#ff4d6d' : S.lanes[L];
    c.globalAlpha = dim ? 0.12 : 1;
    c.strokeStyle = col; c.lineWidth = 2 + 2 * t;
    c.strokeRect(x - lw * 0.42, y - gh, lw * 0.84, gh);
    if (res) { c.globalAlpha = 0.25; c.fillStyle = col; c.fillRect(x - lw * 0.42, y - gh, lw * 0.84, gh); c.globalAlpha = 1; }
    R.glow(x, y - gh / 2, lw * 0.7, col, dim ? 0 : 0.35);
    c.fillStyle = col; c.font = `700 ${Math.round(12 + 26 * t)}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(S.letters[L], x, y - gh / 2);
    if (S.colorBlind) { // shape cue next to the letter so colour is never the only signal
      const s = 4 + 10 * t, cy = y - gh + s * 1.6;
      c.fillStyle = col; c.beginPath();
      if (L === 0) c.arc(x, cy, s, 0, 7); else if (L === 1) c.rect(x - s, cy - s, s * 2, s * 2);
      else if (L === 2) { c.moveTo(x, cy - s); c.lineTo(x + s, cy + s); c.lineTo(x - s, cy + s); c.closePath(); } else { c.moveTo(x, cy - s); c.lineTo(x + s, cy); c.lineTo(x, cy + s); c.lineTo(x - s, cy); c.closePath(); }
      c.fill();
    }
  }
  c.globalAlpha = 1;
}

export function drawCarShape(c, color, s, glowCol, R, alpha = 1) {
  c.save(); c.scale(s, s); c.globalAlpha = alpha;
  c.fillStyle = '#10143a'; c.strokeStyle = color; c.lineWidth = 2.5;
  c.beginPath(); c.moveTo(-26, 16); c.lineTo(-30, -2); c.lineTo(-18, -22); c.lineTo(18, -22); c.lineTo(30, -2); c.lineTo(26, 16); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#1f2766'; c.fillRect(-14, -17, 28, 11);
  c.fillStyle = glowCol; c.fillRect(-24, 8, 10, 4); c.fillRect(14, 8, 10, 4);
  c.restore();
}

function drawTraffic(R, S, g) {
  const c = R.ctx;
  const cars = S.traffic.slice().sort((a, b) => b.z - a.z);           // far first
  for (const car of cars) {
    const k = 0.1 + (CAR_K - 0.1) * (1 - Math.max(0, car.z)) + Math.max(0, -car.z) * 0.9;
    const t = rowT(Math.min(1, Math.max(0.02, k))), x = g.laneX(car.lane, t), y = g.rowY(t), s = 0.18 + 0.9 * t;
    const col = `hsl(${car.hue},90%,60%)`;
    c.save(); c.translate(x, y); R.glow(0, 6, 40 * s + 10, `#${(car.hue % 2 ? 'ff4d6d' : 'ff9d3d')}`, 0.25);
    drawCarShape(c, col, s, '#ff4d6d', R, car.hit ? 0.35 : 1); c.restore();
  }
}

function drawPlayer(R, S, g) {
  const c = R.ctx, t = rowT(CAR_K), y = g.rowY(t), s = 0.45 + 0.9 * t;
  const px = g.laneX(S.car.x, t) + S.car.bx, py = y + S.car.by;
  S.trail.push(px, py);
  const tr = S.garage.trail.id;
  if (tr !== 'none' && S.preset.trails) {
    for (let i = 1; i < S.trail.len; i++) {
      const [tx, ty] = S.trail.at(i), a = 1 - i / S.trail.len;
      c.globalAlpha = a * 0.5;
      c.fillStyle = tr === 'flame' ? `hsl(${20 + 30 * a},100%,55%)` : tr === 'electric' ? '#7fd6ff' : `hsl(${(i * 40 + S.t * 200) % 360},100%,60%)`;
      const jit = tr === 'electric' ? Math.sin(i * 7 + S.t * 50) * 4 : 0;
      c.fillRect(tx - 8 * s + jit, ty + 10 * s, 16 * s, 4 * s);
    }
    c.globalAlpha = 1;
  }
  c.save(); c.translate(px, py); c.rotate(S.car.rot);
  const glow = S.garage.glow.id === 'lane' ? S.lanes[S.car.lane] : S.garage.glow.id === 'paint' ? S.garage.paint.color : S.garage.glow.id === 'white' ? '#ffffff' : `hsl(${(S.t * 120) % 360},100%,60%)`;
  R.glow(0, 12, 70 * s, glow.startsWith('hsl') ? '#ff3fb4' : glow, 0.5 + 0.4 * S.boost);
  drawCarShape(c, S.garage.paint.color, s, '#ff3fb4', R);
  c.restore();
}

function drawRing(R, S) {
  const c = R.ctx, T = S.think; if (!T) return;
  const cx = R.w - 34, cy = R.h * 0.3 + 36;
  c.lineWidth = 5; c.strokeStyle = '#1b1f45'; c.beginPath(); c.arc(cx, cy, 20, 0, 7); c.stroke();
  c.strokeStyle = T.frac < 0.25 ? '#ff4d6d' : T.frozen ? '#7fd6ff' : '#19e6c1';
  c.beginPath(); c.arc(cx, cy, 20, -Math.PI / 2, -Math.PI / 2 + T.frac * Math.PI * 2); c.stroke();
  c.fillStyle = '#e8ecff'; c.font = '700 12px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(Math.ceil(T.leftMs / 1000), cx, cy);
  if (T.frozen) { c.fillStyle = 'rgba(127,214,255,.08)'; c.fillRect(0, 0, R.w, R.h); }
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
  const g = geom(R);
  drawSky(R, S, g); drawRoad(R, S, g); drawGates(R, S, g); drawTraffic(R, S, g); drawPlayer(R, S, g); drawRing(R, S);
  drawParticles(R, S.parts);
  return g;
}
