// Engine Lab: neon road scene + a dummy-question mini-run that exercises loop, renderer, input, audio,
// physics, FX, perf manager and the rules/progression layers. Not a real game: Neon Racer is Step 5.
import { GameLoop } from './engine/core/loop.js';
import { Renderer } from './engine/core/renderer.js';
import { Input } from './engine/core/input.js';
import { Sfx } from './engine/core/audio.js';
import { Spring, Body, ParticlePool } from './engine/core/physics.js';
import { Fx, Trail } from './engine/core/fx.js';
import { PerfManager, QUALITY } from './engine/core/perf.js';
import { RunRules, POWERUPS } from './engine/rules/rules.js';
import { normalizeAll, QuestionPool } from './engine/mcq/adapter.js';
import { DUMMY_RAW } from './engine/mcq/dummy.js';
import { TRACKS, rankName, rankColor, rankOfLevel, rankFloor, rankLast, difficultyMix, blockPosition, pickTier, levelTarget } from './engine/progression/ranks.js';
import { createState } from './engine/progression/progression.js';

const $ = (id) => document.getElementById(id);
const LANE_COL = ['#19e6c1', '#9b6bff', '#ff3fb4', '#ffc83d'];
const LETTER = ['A', 'B', 'C', 'D'];
const PU_LABEL = { fifty: '50:50', freeze: '❄ Freeze', heal: '♥ Heal', skip: '⏭ Skip' };

// ---------- engine objects ----------
const canvas = $('cv');
const R = new Renderer(canvas, { dprCap: QUALITY[1].dpr });
const fx = new Fx({ reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
const sfx = new Sfx();
const parts = new ParticlePool(QUALITY[1].particles);
const trail = new Trail(16);
const car = { x: new Spring(1, 120, 15), body: new Body(0, 0), lane: 1 };
car.body.drag = 0.9; car.body.angDrag = 2.2;
const pool = new QuestionPool(normalizeAll(DUMMY_RAW));
const stars = Array.from({ length: 140 }, (_, i) => ({ x: ((i * 9301 + 49297) % 233280) / 233280, y: ((i * 4621 + 7919) % 233280) / 233280, s: 0.5 + (i % 5) * 0.35 }));

let perf; let loop;
let cfg = { track: 'middle', mode: 'ranked', rank: 0, quality: 'auto' };
let prog = createState('middle');
let rules = null;
let phase = 'ask';               // ask | result | over
let phaseT = 0;
let scroll = 0, baseSpeed = 1.1, boost = 0;
let lastResult = null;
let q = null;
let score = 0;

// ---------- perf ----------
perf = new PerfManager({ auto: true, level: 1, onChange: applyQuality });
function applyQuality(c) {
  const p = c.preset || perf.preset;
  R.setDprCap(p.dpr); R.glowOn = p.glow; parts.resize(p.particles); fx.shakeScale = p.shake;
  if (loop) loop.renderEvery = perf.fallback30 ? 2 : 1;
  syncPanel();
}

// ---------- run control ----------
function startRun() {
  rules = new RunRules({ trackId: cfg.track, prog, mode: cfg.mode, rng: Math.random });
  score = 0; phase = 'ask'; lastResult = null;
  $('over').classList.remove('show');
  car.lane = 1; car.x.snap(1); car.body.x = car.body.y = car.body.rot = car.body.vx = car.body.vr = 0;
  nextQuestion();
}
function nextQuestion() {
  const track = TRACKS[cfg.track];
  const r = rules.rank;
  const pos = rules.inGate ? 1 : blockPosition(track, prog.level);
  const tier = pickTier(difficultyMix(r, pos), Math.random());
  q = pool.next(tier);
  rules.present(q);
  phase = 'ask'; phaseT = 0;
  renderQuestion();
}
function renderQuestion() {
  $('q').textContent = q.stem;
  const t = rules.timeTotalMs / 1000;
  $('meta').innerHTML = `<span>${q.tier === 'E' ? 'Easy' : q.tier === 'M' ? 'Medium' : 'Hard'}${q.calc ? ' · calc' : ''}</span><span>${t.toFixed(0)} s</span><span>${rules.inGate ? `GATE ${rules.gate.done}/${rules.gate.need} · ${rules.gate.wrong}/3 wrong` : `bar ${Math.round(prog.meter)}/${Math.round(levelTarget(TRACKS[cfg.track], prog.level))}`}</span>`;
  const box = $('opts'); box.innerHTML = '';
  q.options.forEach((o, i) => {
    const b = document.createElement('button');
    b.className = 'opt'; b.style.setProperty('--c', LANE_COL[i]); b.dataset.i = i;
    b.innerHTML = `<b>${LETTER[i]}</b><span></span>`; b.lastChild.textContent = o;
    b.onclick = () => { sfx.unlock(); choose(i); };
    box.appendChild(b);
  });
  renderPowerups();
  setHud();
}
function renderPowerups() {
  const box = $('pw'); box.innerHTML = '';
  for (const p of POWERUPS) {
    const b = document.createElement('button');
    const c = rules.canUse(p);
    b.textContent = `${PU_LABEL[p]} ×${rules.charges[p]}`;
    b.disabled = !c.ok || phase !== 'ask';
    b.title = c.reason || '';
    b.onclick = () => { sfx.unlock(); usePower(p); };
    box.appendChild(b);
  }
}
function usePower(name) {
  if (phase !== 'ask') return;
  const u = rules.usePowerup(name);
  if (!u.ok) return;
  sfx.play(name === 'freeze' ? 'freeze' : name === 'heal' ? 'heart' : 'tap');
  if (name === 'fifty') document.querySelectorAll('.opt').forEach((b) => { if (u.hidden.includes(+b.dataset.i)) b.classList.add('hide'); });
  if (name === 'freeze') { fx.flash('#7fd6ff', 0.25); toast('FREEZE +' + u.extraMs / 1000 + 's', '#7fd6ff'); }
  if (name === 'skip') { nextQuestion(); return; }
  renderPowerups(); setHud();
}
function choose(i) {
  if (phase !== 'ask' || !rules.q) return;
  car.lane = i; car.x.target = i;                              // spring x = lane index
  lock(i);
}
function lock(lane) {
  const res = rules.answer(lane);
  if (!res) return;
  lastResult = res; phase = 'result'; phaseT = 0;
  document.querySelectorAll('.opt').forEach((b) => {
    b.disabled = true;
    if (+b.dataset.i === res.correctIndex) b.classList.add('good');
    else if (+b.dataset.i === lane) b.classList.add('bad');
  });
  const cx = laneX(lane, 0.7);
  if (res.correct) {
    sfx.play('correct'); boost = 1; fx.flash('#3dffa0', 0.18);
    parts.burst(cx, R.h * 0.62, 38, 260, 0.8, 3.2, 160, 0);
    toast(res.streak >= 3 ? `CLEAN PASS ×${res.streak}` : 'CLEAN PASS', '#3dffa0');
  } else {
    sfx.play(res.timeout ? 'wrong' : 'crash'); fx.shake(0.9); fx.slowmo(0.25, 0.7); fx.flash('#ff4d6d', 0.35);
    car.body.impulse((lane % 2 ? -1 : 1) * 140, -120, 9);
    parts.burst(cx, R.h * 0.66, 60, 320, 0.9, 3.6, 340, 220);
    toast('CRASH  −1 ♥', '#ff4d6d');
  }
  for (const e of res.events) {
    if (e.type === 'rankUp') { sfx.play('rankup'); toast('RANK UP: ' + rankName(e.rank), rankColor(e.rank)); fx.flash('#ffc83d', 0.4); }
    if (e.type === 'gateStart') toast(`RANK GATE · ${e.need} to pass`, '#ffc83d');
    if (e.type === 'levelUp') toast('LEVEL ' + e.level, '#19e6c1');
    if (e.type === 'gateFail') toast('GATE FAILED', '#ff4d6d');
  }
  if (res.healed) sfx.play('heart');
  score = rules.score;
  setHud();
}
function finishOver() {
  phase = 'over';
  const rep = rules.finish();
  sfx.play('gameover');
  $('over-sum').textContent = `${rep.correct}/${rep.answered} correct · score ${rep.score} · best streak ${rep.maxStreak}`;
  const list = $('over-list'); list.innerHTML = '';
  if (!rep.wrongs.length) list.innerHTML = '<p>No wrong answers recorded.</p>';
  for (const w of rep.wrongs) {
    const d = document.createElement('div'); d.className = 'wr';
    const picked = w.picked === null ? '— (time ran out)' : w.options[w.picked];
    d.innerHTML = `<strong></strong><small>Your answer: <span class="no"></span></small><small>Correct: <span class="ok"></span></small><small class="ex"></small>`;
    d.querySelector('strong').textContent = w.stem;
    d.querySelector('.no').textContent = picked;
    d.querySelector('.ok').textContent = w.options[w.correct];
    d.querySelector('.ex').textContent = w.explanation;
    list.appendChild(d);
  }
  $('over').classList.add('show');
}

// ---------- HUD ----------
function setHud() {
  const h = rules.hearts;
  $('hearts').innerHTML = [0, 1, 2].map((i) => `<span class="${i < h ? '' : 'off'}">♥</span>`).join('');
  const r = rules.rank;
  $('rank').textContent = rankName(r); $('rank').style.color = rankColor(r);
  $('lvl').textContent = prog.level; $('stv').textContent = rules.streak; $('score').textContent = Math.round(score);
  const t = TRACKS[cfg.track];
  $('barfill').style.transform = `scaleX(${rules.inGate ? 1 : Math.min(1, prog.meter / levelTarget(t, prog.level))})`;
  $('barfill').style.background = rules.inGate ? 'linear-gradient(90deg,#ffc83d,#ff3fb4)' : '';
}
let toastTimer = 0;
function toast(txt, col) {
  const t = $('toast'); t.textContent = txt; t.style.color = col; t.style.opacity = 1;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.style.opacity = 0; }, 900);
}

// ---------- input ----------
const input = new Input(canvas, (it) => {
  sfx.unlock();
  if (phase !== 'ask') return;
  if (it.type === 'lane') choose(it.index);
  else if (it.type === 'left') { car.lane = Math.max(0, car.lane - 1); car.x.target = car.lane; sfx.play('tap'); input.vibrate(8); }
  else if (it.type === 'right') { car.lane = Math.min(3, car.lane + 1); car.x.target = car.lane; sfx.play('tap'); input.vibrate(8); }
  else if (it.type === 'confirm') lock(car.lane);
  else if (it.type === 'power') usePower(it.name);
}, { halves: true, swipe: true, width: () => R.w });

// ---------- scene ----------
const horizon = () => R.h * 0.3;
const CAR_K = 0.8;                                              // car row on the road (0 horizon .. 1 bottom)
const rowT = (k) => Math.pow(k, 2.1);                          // k 0..1 -> depth curve
function roadHalf(t) { return R.w * (0.025 + 0.455 * t); }
function rowY(t) { const hz = horizon(); return hz + (R.h - hz) * t; }
function laneX(lane, t) { const hw = roadHalf(t), cx = R.w / 2; return cx + (lane - 1.5) * (hw * 2 / 4); }

function drawScene(alpha) {
  const c = R.ctx, w = R.w, h = R.h, hz = horizon(), p = perf.preset;
  const col = rankColor(rules ? rules.rank : 0);
  // sky
  const g = c.createLinearGradient(0, 0, 0, hz);
  g.addColorStop(0, '#0a0620'); g.addColorStop(1, '#2a0f4a');
  c.fillStyle = g; c.fillRect(0, 0, w, hz);
  c.fillStyle = '#fff';
  const ns = Math.min(stars.length, p.stars);
  for (let i = 0; i < ns; i++) { const s = stars[i]; c.globalAlpha = 0.25 + 0.5 * Math.abs(Math.sin(fx.t * s.s + i)); c.fillRect(s.x * w, s.y * hz * 0.9, s.s, s.s); }
  c.globalAlpha = 1;
  R.glow(w / 2, hz - 8, Math.min(w, 520) * 0.5, col, 0.55);
  c.fillStyle = col; c.globalAlpha = 0.9;
  c.beginPath(); c.arc(w / 2, hz - 8, Math.min(w, 520) * 0.12, Math.PI, 0); c.fill(); c.globalAlpha = 1;
  // ground
  c.fillStyle = '#070816'; c.fillRect(0, hz, w, h - hz);
  // road surface
  c.fillStyle = '#0d0f26';
  c.beginPath(); c.moveTo(w / 2 - roadHalf(0), hz); c.lineTo(w / 2 + roadHalf(0), hz); c.lineTo(w / 2 + roadHalf(1), h); c.lineTo(w / 2 - roadHalf(1), h); c.closePath(); c.fill();
  // moving cross lines
  const N = p.roadSegs / 4;
  c.strokeStyle = col;
  for (let i = 0; i < N; i++) {
    const k = ((i + (scroll % 1)) / N);
    const t = rowT(k), y = rowY(t), hw = roadHalf(t);
    c.globalAlpha = 0.08 + 0.4 * t; c.lineWidth = 1 + 2 * t;
    c.beginPath(); c.moveTo(w / 2 - hw, y); c.lineTo(w / 2 + hw, y); c.stroke();
    if (i % 2 === 0) { // pylons
      c.globalAlpha = 0.9 * t + 0.1; c.fillStyle = LANE_COL[(i / 2) % 4 | 0];
      const s = 3 + 16 * t;
      c.fillRect(w / 2 - hw - s * 1.6, y - s * 2.2, s * 0.7, s * 2.2);
      c.fillRect(w / 2 + hw + s * 0.9, y - s * 2.2, s * 0.7, s * 2.2);
    }
  }
  c.globalAlpha = 1;
  // lane dividers + edges
  for (let L = 0; L <= 4; L++) {
    const edge = L === 0 || L === 4;
    c.strokeStyle = edge ? col : '#3a3f7a'; c.globalAlpha = edge ? 1 : 0.7;
    const x0 = w / 2 + (L - 2) * roadHalf(0) / 2, x1 = w / 2 + (L - 2) * roadHalf(1) / 2;
    if (edge) R.neonLine(x0, hz, x1, h, col, 2.5, 1);
    else { c.lineWidth = 1.5; c.setLineDash([10, 14]); c.lineDashOffset = -scroll * 60; c.beginPath(); c.moveTo(x0, hz); c.lineTo(x1, h); c.stroke(); c.setLineDash([]); }
  }
  c.globalAlpha = 1;
  // gates
  if (rules && rules.q) {
    const frac = rules.thinkFraction;
    const k = 0.1 + (CAR_K - 0.1) * (1 - frac);           // arrives at the car exactly when the timer ends
    const t = rowT(k), y = rowY(t), hw = roadHalf(t), lw = hw * 2 / 4;
    for (let L = 0; L < 4; L++) {
      const x = laneX(L, t), gh = 14 + 70 * t, dim = rules.hidden.includes(L);
      c.globalAlpha = dim ? 0.12 : 1;
      c.strokeStyle = LANE_COL[L]; c.lineWidth = 2 + 2 * t;
      c.strokeRect(x - lw * 0.42, y - gh, lw * 0.84, gh);
      R.glow(x, y - gh / 2, lw * 0.7, LANE_COL[L], dim ? 0 : 0.35);
      c.fillStyle = LANE_COL[L]; c.font = `700 ${Math.round(12 + 26 * t)}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(LETTER[L], x, y - gh / 2);
    }
    c.globalAlpha = 1;
  }
  // think ring (real-time countdown; the world is slowed)
  if (rules && rules.q) {
    const frac = rules.thinkFraction, cx = w - 34, cy = hz + 36;
    c.lineWidth = 5; c.strokeStyle = '#1b1f45'; c.beginPath(); c.arc(cx, cy, 20, 0, 7); c.stroke();
    c.strokeStyle = frac < 0.25 ? '#ff4d6d' : rules.frozen ? '#7fd6ff' : '#19e6c1';
    c.beginPath(); c.arc(cx, cy, 20, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); c.stroke();
    c.fillStyle = '#e8ecff'; c.font = '700 12px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(Math.ceil(rules.timeLeftMs / 1000), cx, cy);
    if (rules.frozen) { c.fillStyle = 'rgba(127,214,255,.08)'; c.fillRect(0, 0, w, h); }
  }
  drawCar(alpha);
  drawParticles();
}

function drawCar(alpha) {
  const c = R.ctx, t = rowT(CAR_K), y = rowY(t), s = 0.45 + 0.9 * t;
  const px = laneX(car.x.x, t) + car.body.x, py = y + car.body.y;
  trail.push(px, py);
  if (perf.preset.trails) for (let i = 1; i < trail.len; i++) { const [tx, ty] = trail.at(i); c.globalAlpha = (1 - i / trail.len) * 0.35; c.fillStyle = LANE_COL[car.lane]; c.fillRect(tx - 10 * s, ty + 8 * s, 20 * s, 4 * s); }
  c.globalAlpha = 1;
  c.save(); c.translate(px, py); c.rotate(car.body.rot); c.scale(s, s);
  R.glow(0, 12, 70, LANE_COL[car.lane], 0.5 + 0.4 * boost);
  c.fillStyle = '#10143a'; c.strokeStyle = LANE_COL[car.lane]; c.lineWidth = 2.5;
  c.beginPath(); c.moveTo(-26, 16); c.lineTo(-30, -2); c.lineTo(-18, -22); c.lineTo(18, -22); c.lineTo(30, -2); c.lineTo(26, 16); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#1f2766'; c.fillRect(-14, -17, 28, 11);
  c.fillStyle = '#ff3fb4'; c.fillRect(-24, 8, 10, 4); c.fillRect(14, 8, 10, 4);
  c.restore();
}
function drawParticles() {
  const c = R.ctx; c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < parts.count; i++) {
    const a = parts.life[i] / parts.maxLife[i];
    c.globalAlpha = a; c.fillStyle = `hsl(${parts.hue[i]},100%,60%)`;
    const s = parts.size[i] * (0.4 + a);
    c.fillRect(parts.x[i] - s / 2, parts.y[i] - s / 2, s, s);
  }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
}

// ---------- loop ----------
function update(dt, realDt) {
  scroll += (baseSpeed + boost * 2.2) * dt;
  boost = Math.max(0, boost - realDt * 0.9);
  car.x.step(dt); car.body.step(dt);
  car.body.x *= 1 - Math.min(1, 1.5 * realDt); car.body.y *= 1 - Math.min(1, 1.5 * realDt);
  car.body.rot += (0 - car.body.rot) * Math.min(1, 1.2 * dt);
  parts.step(dt);
  fx.update(realDt);
  if (!rules) return;
  if (phase === 'ask') {
    // Racer semantics: when the gate reaches the car, whichever lane you are in is locked.
    if (rules.timeLeftMs - realDt * 1000 <= 0) lock(car.lane);
    else { rules.tick(realDt * 1000); }
    if ((Math.floor(rules.timeLeftMs / 1000) !== Math.floor((rules.timeLeftMs + realDt * 1000) / 1000)) && rules.timeLeftMs < 4000 && !rules.frozen) sfx.play('tick');
  } else if (phase === 'result') {
    phaseT += realDt;
    if (phaseT > (lastResult && lastResult.gameOver ? 1.3 : 1.0)) {
      if (lastResult.gameOver) finishOver(); else nextQuestion();
    }
  }
  loop.timeScale = rules.timeScale * fx.slow;
}
function render(alpha, realDt) {
  if (realDt) perf.frame(realDt * 1000);
  R.begin(fx);
  drawScene(alpha);
  R.end(fx);
  if (++frameN % 20 === 0) { $('fps').textContent = `${perf.fps.toFixed(0)} fps`; $('q-name').textContent = perf.preset.name + (perf.fallback30 ? ' · 30 fps mode' : '') + (perf.auto ? ' (auto)' : ''); }
}
let frameN = 0;

// ---------- panel ----------
function syncPanel() {
  document.querySelectorAll('#r-track button').forEach((b) => b.classList.toggle('on', b.dataset.v === cfg.track));
  document.querySelectorAll('#r-mode button').forEach((b) => b.classList.toggle('on', b.dataset.v === cfg.mode));
  document.querySelectorAll('#r-q button').forEach((b) => b.classList.toggle('on', cfg.quality === 'auto' ? b.dataset.v === 'auto' : b.dataset.v === String(perf.level)));
  const t = TRACKS[cfg.track];
  $('rk').max = t.starts.length - 1; $('rk').value = cfg.rank; $('rk-name').textContent = `${rankName(cfg.rank)} (L${t.starts[cfg.rank]})`;
}
function resetProg() { prog = createState(cfg.track, { level: TRACKS[cfg.track].starts[cfg.rank] }); }
$('lab-btn').onclick = () => $('panel').classList.toggle('open');
$('r-track').onclick = (e) => { const v = e.target.dataset.v; if (!v) return; cfg.track = v; cfg.rank = Math.min(cfg.rank, TRACKS[v].starts.length - 1); resetProg(); startRun(); syncPanel(); };
$('r-mode').onclick = (e) => { const v = e.target.dataset.v; if (!v) return; cfg.mode = v; startRun(); syncPanel(); };
$('r-q').onclick = (e) => { const v = e.target.dataset.v; if (!v) return; if (v === 'auto') { cfg.quality = 'auto'; perf.setAuto(true); } else { cfg.quality = 'manual'; perf.setAuto(false); perf.setFallback30(false, 'manual'); perf.setLevel(+v); applyQuality({ preset: perf.preset }); } syncPanel(); };
$('rk').oninput = (e) => { cfg.rank = +e.target.value; resetProg(); startRun(); syncPanel(); };
$('b-restart').onclick = () => { resetProg(); startRun(); };
$('b-gate').onclick = () => {
  const t = TRACKS[cfg.track], r = rankOfLevel(t, prog.level);
  prog.level = rankLast(t, Math.min(r, t.starts.length - 2)); prog.meter = levelTarget(t, prog.level) - 1; prog.gatePending = false; prog.gateActive = false;
  startRun(); toast('Next correct answer starts the gate', '#ffc83d');
};
$('b-mute').onclick = (e) => { sfx.setMuted(!sfx.muted); e.target.textContent = 'Sound: ' + (sfx.muted ? 'off' : 'on'); };
$('retry').onclick = () => { sfx.unlock(); startRun(); };
addEventListener('resize', fit); addEventListener('orientationchange', fit);
function fit() { R.resize(innerWidth, innerHeight); }

// ---------- boot ----------
fit(); syncPanel(); applyQuality({ preset: perf.preset });
loop = new GameLoop({ update, render });
loop.autoPause();
startRun();
loop.start();

// Hooks for automated checks (Playwright) and manual debugging.
window.__lab = {
  get state() { return { phase, hearts: rules.hearts, over: rules.over, level: prog.level, meter: prog.meter, streak: rules.streak, score, fps: perf.fps, quality: perf.preset.name, fallback30: perf.fallback30, timeScale: loop.timeScale, thinkFraction: rules.thinkFraction, qid: q && q.id, correct: q && q.correct, inGate: rules.inGate, updates: loop.updates, renders: loop.renders }; },
  answer: (i) => choose(i), choose, loop, perf, rules: () => rules, fx, parts, R, startRun, sfx,
};
