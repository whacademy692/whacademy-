// Neon Racer: the game. Thin pack on top of the shared engine (loop, renderer, input, audio, physics, FX, perf,
// rules, progression, adapter). Questions come from window.WHA_ADV_QUESTIONS (array or fn(cls)) or the dummy set.
import { GameLoop } from '../engine/core/loop.js';
import { Renderer } from '../engine/core/renderer.js';
import { Input } from '../engine/core/input.js';
import { Sfx } from '../engine/core/audio.js';
import { Spring, Body, ParticlePool } from '../engine/core/physics.js';
import { Fx, Trail } from '../engine/core/fx.js';
import { PerfManager, QUALITY } from '../engine/core/perf.js';
import { RunRules, POWERUPS } from '../engine/rules/rules.js';
import { normalizeAll, QuestionPool } from '../engine/mcq/adapter.js';
import { DUMMY_RAW } from '../engine/mcq/dummy.js';
import { TRACKS, rankName, rankColor, rankOfLevel, rankFloor, rankLast, difficultyMix, blockPosition, pickTier, levelTarget, rankCount } from '../engine/progression/ranks.js';
import { rankIdx, placementNextTier, placementLevel, PLACEMENT_QUESTIONS } from '../engine/progression/progression.js';
import { ProfileStore } from '../engine/ui/store.js';
import { sanitizeSettings, timeMultiplier, graphicsLevel, laneColors } from '../engine/ui/settings.js';
import { badgeSVG } from '../engine/ui/badge.js';
import { themeForRank, baseSpeed, trafficInterval } from './themes.js';
import { Traffic } from './traffic.js';
import { PAINTS, GLOWS, TRAILS, resolveGarage, isUnlocked, coinsForRun } from './garage.js';
import { drawScene, CAR_K } from './scene.js';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const DEV = qs.get('dev') === '1';
const LETTER = ['A', 'B', 'C', 'D'];
const PU_LABEL = { fifty: '50:50', freeze: '❄ Freeze', heal: '♥ Heal', skip: '⏭ Skip' };

// ---------- state ----------
const store = new ProfileStore();
if (qs.get('class')) store.setClass(Number(qs.get('class')));
let settings = store.profile.settings;
let phase = 'menu';          // menu | ask | result | rankup | pause | over
let phaseT = 0;
let rules = null, run = null, pool = null, q = null, lastResult = null, score = 0;
let scroll = 0, boost = 0, rush = 0, gateK0 = 0, lightning = 0, lightningT = 3;

// ---------- engine ----------
const canvas = $('cv');
const R = new Renderer(canvas, { dprCap: QUALITY[1].dpr });
const fx = new Fx({ reduceMotion: false });
const sfx = new Sfx();
const parts = new ParticlePool(QUALITY[1].particles);
const trail = new Trail(16);
const traffic = new Traffic();
const car = { x: new Spring(1, 120, 15), body: new Body(0, 0), lane: 1 };
car.body.drag = 0.9; car.body.angDrag = 2.2;
const perf = new PerfManager({ auto: true, level: 1, onChange: applyQuality });
let loop;

// Scene state handed to drawScene each frame.
const S = { t: 0, scroll: 0, preset: perf.preset, theme: themeForRank(0), lanes: laneColors(settings), letters: LETTER, colorBlind: false, reduceMotion: false, flash: 0,
  car: { x: 1, lane: 1, bx: 0, by: 0, rot: 0 }, trail, parts, traffic: traffic.cars, boost: 0, gates: null, think: null,
  garage: resolveGarage(store.profile.garage, 0) };

function applyQuality(c) {
  const p = (c && c.preset) || perf.preset;
  R.setDprCap(p.dpr); R.glowOn = p.glow; parts.resize(p.particles); fx.shakeScale = p.shake; S.preset = p;
  if (loop) loop.renderEvery = perf.fallback30 ? 2 : 1;
}
function applySettings() {
  settings = store.profile.settings = sanitizeSettings(store.profile.settings);
  document.body.classList.remove('ts-s', 'ts-l'); if (settings.textSize !== 'm') document.body.classList.add('ts-' + settings.textSize);
  document.body.classList.toggle('lefty', settings.leftHanded);
  document.body.classList.toggle('rm', settings.reduceMotion);
  sfx.setMuted(!settings.sound); sfx.setVolume(settings.volume);
  input.haptics = settings.vibration; input.o.swipe = settings.swipe;
  fx.reduceMotion = settings.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  S.lanes = laneColors(settings); S.colorBlind = settings.colorBlind; S.reduceMotion = fx.reduceMotion;
  const gl = graphicsLevel(settings);
  if (gl === null) perf.setAuto(true); else { perf.setAuto(false); perf.setFallback30(false, 'manual'); perf.setLevel(gl); applyQuality({ preset: perf.preset }); }
  store.save();
}
const track = () => TRACKS[store.profile.track];
const curRank = () => rankIdx(store.prog);
const maxRank = () => rankOfLevel(track(), store.prog.maxLevel || store.prog.level);

// ---------- run ----------
function rawQuestions(cls) {
  const p = window.WHA_ADV_QUESTIONS;
  if (typeof p === 'function') return p(cls);
  if (Array.isArray(p)) return p;
  return DUMMY_RAW;
}
function startRun(mode) {
  sfx.unlock();
  pool = new QuestionPool(normalizeAll(rawQuestions(store.profile.cls)));
  if (!pool.size) { toast('No questions available', '#ff4d6d'); return; }
  const prog = store.prog;
  run = { mode, history: [], rankUps: 0, hits: 0, asked: 0, gateFailed: false, startLevel: prog.level, startRank: rankIdx(prog), pendingRankUp: null, events: [] };
  rules = new RunRules({ trackId: store.profile.track, prog, mode: mode === 'ranked' ? 'ranked' : 'practice', timeMult: timeMultiplier(settings) });
  score = 0; boost = 0; lastResult = null;
  traffic.clear(); parts.clear();
  car.lane = 1; car.x.snap(1); car.body.x = car.body.y = car.body.rot = car.body.vx = car.body.vr = 0;
  S.garage = resolveGarage(store.profile.garage, maxRank());
  showScreen(null); $('hud').classList.add('on');
  for (const e of rules.progEvents) if (e.type === 'gateStart') toast(`RANK GATE · ${e.need} to pass`, '#ffc83d');
  nextQuestion();
}
function pickNextTier() {
  if (run.mode === 'placement') return placementNextTier(run.history);
  const t = track(), prog = store.prog, r = rules.rank;
  const pos = rules.inGate ? 1 : blockPosition(t, prog.level);
  return pickTier(difficultyMix(r, pos), Math.random());
}
function nextQuestion() {
  if (run.mode === 'placement' && run.asked >= PLACEMENT_QUESTIONS) return endRun();
  q = pool.next(pickNextTier());
  if (!q) return endRun();
  run.asked++;
  rules.present(q);
  phase = 'ask'; phaseT = 0; rush = 0;
  renderQuestion();
}
function renderQuestion() {
  $('q').textContent = q.stem;
  const t = rules.timeTotalMs / 1000, tier = q.tier === 'E' ? 'Easy' : q.tier === 'M' ? 'Medium' : 'Hard';
  const where = run.mode === 'placement' ? `Placement ${run.asked}/${PLACEMENT_QUESTIONS}`
    : rules.inGate ? `GATE ${rules.gate.done}/${rules.gate.need} · ${rules.gate.wrong}/3 wrong`
    : run.mode === 'practice' ? 'Practice' : `bar ${Math.round(store.prog.meter)}/${Math.round(levelTarget(track(), store.prog.level))}`;
  $('meta').innerHTML = `<span>${tier}${q.calc ? ' · calc' : ''}</span><span>${t.toFixed(0)} s</span><span>${where}</span>`;
  const box = $('opts'); box.innerHTML = '';
  q.options.forEach((o, i) => {
    const b = document.createElement('button');
    b.className = 'opt'; b.style.setProperty('--c', S.lanes[i]); b.dataset.i = i;
    b.innerHTML = `<b>${LETTER[i]}</b><span></span>`; b.lastChild.textContent = o;
    b.onclick = () => { sfx.unlock(); choose(i); };
    box.appendChild(b);
  });
  renderPowerups(); setHud();
}
function renderPowerups() {
  const box = $('pw'); box.innerHTML = '';
  if (run.mode === 'placement') return;
  for (const p of POWERUPS) {
    const b = document.createElement('button'), c = rules.canUse(p);
    b.textContent = `${PU_LABEL[p]} ×${rules.charges[p]}`;
    b.disabled = !c.ok || phase !== 'ask'; b.title = c.reason || '';
    b.onclick = () => { sfx.unlock(); usePower(p); };
    box.appendChild(b);
  }
}
function usePower(name) {
  if (phase !== 'ask' || run.mode === 'placement') return;
  const u = rules.usePowerup(name);
  if (!u.ok) return;
  sfx.play(name === 'freeze' ? 'freeze' : name === 'heal' ? 'heart' : 'tap');
  input.vibrate(10);
  if (name === 'fifty') document.querySelectorAll('.opt').forEach((b) => { if (u.hidden.includes(+b.dataset.i)) b.classList.add('hide'); });
  if (name === 'freeze') { fx.flash('#7fd6ff', 0.25); toast(`FREEZE +${u.extraMs / 1000}s`, '#7fd6ff'); }
  if (name === 'skip') { nextQuestion(); return; }
  renderPowerups(); setHud();
}
function choose(i) {
  if (phase !== 'ask' || !rules.q || rules.hidden.includes(i)) return;
  car.lane = i; car.x.target = i;
  lock(i);
}
function lock(lane) {
  const res = rules.answer(lane);
  if (!res) return;
  lastResult = res; phase = 'result'; phaseT = 0; rush = 0; gateK0 = S.gates ? S.gates.k : 0.1;
  if (run.mode === 'placement') run.history.push({ tier: q.tier, correct: res.correct });
  document.querySelectorAll('.opt').forEach((b) => { b.disabled = true; if (+b.dataset.i === res.correctIndex) b.classList.add('good'); else if (+b.dataset.i === lane) b.classList.add('bad'); });
  const g = geom(), cx = g.laneX(lane, 0.7);
  if (res.correct) {
    sfx.play('correct'); boost = 1; fx.flash('#3dffa0', 0.18); input.vibrate(15);
    parts.burst(cx, R.h * 0.62, 38, 260, 0.8, 3.2, 160, 0);
    toast(res.streak >= 3 ? `CLEAN PASS ×${res.streak}` : 'CLEAN PASS', '#3dffa0');
  } else {
    sfx.play(res.timeout ? 'wrong' : 'crash'); input.vibrate([40, 30, 60]);
    fx.shake(0.9); fx.slowmo(0.25, 0.7); fx.flash('#ff4d6d', 0.35);
    car.body.impulse((lane % 2 ? -1 : 1) * 140, -120, 9);
    parts.burst(cx, R.h * 0.66, 60, 320, 0.9, 3.6, 340, 220);
    toast(run.mode === 'ranked' ? 'CRASH  −1 ♥' : 'CRASH', '#ff4d6d');
  }
  for (const e of res.events) {
    run.events.push(e);
    if (e.type === 'rankUp') { run.rankUps++; run.pendingRankUp = e.rank; sfx.play('rankup'); fx.flash('#ffc83d', 0.4); }
    else if (e.type === 'gateStart') toast(`RANK GATE · ${e.need} to pass`, '#ffc83d');
    else if (e.type === 'levelUp') toast('LEVEL ' + e.level, '#19e6c1');
    else if (e.type === 'levelDown') toast('Level ' + e.level, '#ff9d3d');
    else if (e.type === 'gateFail') { run.gateFailed = true; toast('GATE FAILED', '#ff4d6d'); }
    else if (e.type === 'comeback') toast('COMEBACK BOOST ×10', '#ffc83d');
    else if (e.type === 'streakTier') sfx.play('boost');
  }
  if (res.healed) { sfx.play('heart'); toast('+1 ♥', '#ff4d6d'); }
  score = rules.score;
  G.result = { correct: res.correctIndex, picked: lane };
  setHud();
}
function endRun() {
  if (!rules) return;
  const rep = rules.over && lastResult && lastResult.report ? lastResult.report : rules.finish();
  phase = 'over'; $('hud').classList.remove('on');
  sfx.play('gameover');
  const wasGateRun = run.gateFailed;
  let placed = null;
  if (run.mode === 'placement') {
    placed = placementLevel(run.history);
    const prog = store.prog;
    if (prog.answers === 0) { prog.level = placed; prog.maxLevel = placed; prog.meter = 0; }
    store.profile.placementDone = true;
  }
  const coins = run.mode === 'placement' ? 0 : coinsForRun({ correct: rep.correct, trafficHits: run.hits, rankUps: run.rankUps });
  store.recordRun(rep, coins);
  store.save();
  showResult(rep, coins, wasGateRun, placed);
}

// ---------- screens ----------
const SCREENS = ['home', 'settings', 'garage', 'pause', 'rankup', 'result'];
function showScreen(name) { for (const s of SCREENS) $('s-' + s).classList.toggle('show', s === name); }
function geom() { const hz = R.h * 0.3, hw = (t) => R.w * (0.025 + 0.455 * t); return { laneX: (l, t) => R.w / 2 + (l - 1.5) * (hw(t) * 2 / 4) }; }

function renderHome() {
  const p = store.profile, prog = store.prog, t = track(), r = rankIdx(prog);
  $('cls-wrap').hidden = !DEV;                                   // class picker is a test tool; the dashboard will pass the student's real class
  $('cls-row').innerHTML = '';
  for (let c = 6; c <= 12; c++) {
    const b = document.createElement('button'); b.textContent = c; b.className = c === p.cls ? 'on' : '';
    b.setAttribute('aria-label', 'Class ' + c); b.onclick = () => { store.setClass(c); renderHome(); };
    $('cls-row').appendChild(b);
  }
  $('ladder-name').textContent = `Class ${p.cls} · ${t.id === 'middle' ? 'Middle' : 'Senior'} ladder (${t.maxLevel} levels, ${rankCount(t)} ranks)`;
  $('theme-name').textContent = themeForRank(r).name;
  $('home-badge').innerHTML = badgeSVG(r, { size: 84 });
  $('h-rank').textContent = rankName(r); $('h-rank').style.color = rankColor(r); $('h-lvl').textContent = prog.level;
  const full = prog.gatePending || prog.gateActive;
  $('h-bar').style.transform = `scaleX(${full ? 1 : Math.min(1, prog.meter / levelTarget(t, prog.level))})`;
  $('h-bar').style.background = full ? 'linear-gradient(90deg,#ffc83d,#ff3fb4)' : '';
  $('h-barlabel').textContent = full ? 'Rank Gate ready' : `${Math.round(prog.meter)} / ${Math.round(levelTarget(t, prog.level))} XP`;
  $('h-coins').textContent = p.coins; $('h-bs').textContent = p.stats.bestStreak;
  $('h-acc').textContent = p.stats.answers ? Math.round(100 * p.stats.correct / p.stats.answers) + '%' : '–';
  $('b-ranked').textContent = full ? 'Retry Rank Gate' : 'Ranked Run'; $('b-ranked').classList.toggle('gate', !!full);
  $('b-placement').style.display = !p.placementDone && prog.answers === 0 ? '' : 'none';
  S.theme = themeForRank(r);
}
function renderSettings() {
  const tg = $('set-toggles'); tg.innerHTML = '';
  const defs = [['sound', 'Sound'], ['vibration', 'Vibration'], ['swipe', 'Swipe steering'], ['leftHanded', 'Left-handed layout'], ['extraTime', 'Extra reading time (×1.5)'], ['colorBlind', 'Colour-blind mode'], ['reduceMotion', 'Reduce motion']];
  for (const [k, label] of defs) {
    const d = document.createElement('div'); d.className = 'toggle'; d.innerHTML = `<span>${label}</span><button class="${settings[k] ? 'on' : ''}">${settings[k] ? 'On' : 'Off'}</button>`;
    d.lastChild.onclick = () => { store.profile.settings[k] = !settings[k]; applySettings(); renderSettings(); if (k === 'sound' && settings.sound) { sfx.unlock(); sfx.play('correct'); } };
    tg.appendChild(d);
  }
  const mk = (id, list, key) => { const row = $(id); row.innerHTML = ''; for (const [v, label] of list) { const b = document.createElement('button'); b.textContent = label; b.className = settings[key] === v ? 'on' : ''; b.onclick = () => { store.profile.settings[key] = v; applySettings(); renderSettings(); }; row.appendChild(b); } };
  mk('set-graphics', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], 'graphics');
  mk('set-text', [['s', 'Small'], ['m', 'Normal'], ['l', 'Large']], 'textSize');
  $('dev').hidden = !DEV;
  const t = track(); $('dev-rank').max = t.starts.length - 1; $('dev-rank').value = rankIdx(store.prog); $('dev-rank-name').textContent = rankName(+$('dev-rank').value);
}
function renderGarage() {
  const mr = maxRank(), cur = resolveGarage(store.profile.garage, mr);
  const fill = (id, list, key, swatch) => {
    const row = $(id); row.innerHTML = '';
    for (const it of list) {
      const b = document.createElement('button'), ok = isUnlocked(it, mr);
      b.innerHTML = (swatch ? `<span class="sw ${cur[key].id === it.id ? 'pick' : ''}" style="background:${it.color}"></span>` : '') + it.name + (ok ? '' : ` 🔒 ${rankName(it.unlockRank)}`);
      b.className = cur[key].id === it.id ? 'on' : ''; b.disabled = !ok;
      b.onclick = () => { store.profile.garage[key] = it.id; store.save(); S.garage = resolveGarage(store.profile.garage, mr); renderGarage(); };
      row.appendChild(b);
    }
  };
  fill('g-paint', PAINTS, 'paint', true); fill('g-glow', GLOWS, 'glow', false); fill('g-trail', TRAILS, 'trail', false);
  S.garage = cur;
}
function showRankUp(rankIdx0) {
  phase = 'rankup'; $('toast').style.opacity = 0;
  $('ru-badge').innerHTML = badgeSVG(rankIdx0, { size: 150 });
  $('ru-name').textContent = rankName(rankIdx0); $('ru-name').style.color = rankColor(rankIdx0);
  $('ru-theme').textContent = 'New track: ' + themeForRank(rankIdx0).name;
  showScreen('rankup');
}
function showResult(rep, coins, gateFailed, placed) {
  const prog = store.prog, t = track();
  const title = run.mode === 'placement' ? 'Placement complete' : run.mode === 'practice' ? 'Practice finished' : gateFailed ? 'RANK GATE FAILED' : rep.wrongs.length && rules.hearts <= 0 ? 'GAME OVER' : 'Run finished';
  const el = $('r-title'); el.textContent = title; el.style.color = /FAILED|OVER/.test(title) ? 'var(--red)' : 'var(--teal)';
  const ban = $('r-banners'); ban.innerHTML = '';
  const add = (txt, col) => { const d = document.createElement('div'); d.className = 'card'; d.style.cssText = `border-color:${col};color:${col};margin-bottom:8px;font-weight:700`; d.textContent = txt; ban.appendChild(d); };
  if (placed) add(`Placed at Level ${placed} · ${rankName(rankOfLevel(t, placed))}`, '#19e6c1');
  if (run.rankUps) add(`Rank up ×${run.rankUps}! Now ${rankName(rankIdx(prog))}`, '#ffc83d');
  if (gateFailed) add('Bar stays full. Retry the Rank Gate any time.', '#ff9d3d');
  for (const e of rep.events || []) {
    if (e.type === 'demotionWarning') add('Warning: one more low-accuracy run on this floor level and you drop a rank.', '#ff9d3d');
    if (e.type === 'rankDown') add('Rank dropped. Comeback boost is on for your next 10 correct answers.', '#ff4d6d');
  }
  const acc = rep.answered ? Math.round(100 * rep.accuracy) : 0;
  $('r-stats').innerHTML = [['Correct', `${rep.correct}/${rep.answered} (${acc}%)`], ['Score', rep.score], ['Best streak', rep.maxStreak], ['Level', `${run.startLevel} → ${prog.level}`], ['Traffic hits', run.hits], ['Coins earned', '🪙 ' + coins]]
    .map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('');
  const w = $('r-wrongs'); w.innerHTML = '';
  if (rep.wrongs.length) { const h = document.createElement('h3'); h.textContent = 'Review your mistakes'; w.appendChild(h); }
  for (const x of rep.wrongs) {
    const d = document.createElement('div'); d.className = 'wr';
    d.innerHTML = '<strong></strong><small>Your answer: <span class="no"></span></small><small>Correct: <span class="ok"></span></small><small class="ex"></small>';
    d.querySelector('strong').textContent = x.stem;
    d.querySelector('.no').textContent = x.picked === null ? '— (time ran out)' : x.options[x.picked];
    d.querySelector('.ok').textContent = x.options[x.correct]; d.querySelector('.ex').textContent = x.explanation;
    w.appendChild(d);
  }
  $('r-again').textContent = run.mode === 'ranked' && prog.gatePending ? 'Retry Rank Gate' : 'Play again';
  showScreen('result');
}

function setHud() {
  const h = rules.hearts;
  $('hearts').innerHTML = [0, 1, 2].map((i) => `<span class="${i < h ? '' : 'off'}">♥</span>`).join('');
  const r = rules.rank;
  $('rank').textContent = rankName(r); $('rank').style.color = rankColor(r);
  $('lvl').textContent = rules.prog.level; $('stv').textContent = rules.streak; $('score').textContent = Math.round(score);
  const t = track(), full = rules.inGate || run.mode !== 'ranked';
  $('barfill').style.transform = `scaleX(${full ? 1 : Math.min(1, store.prog.meter / levelTarget(t, store.prog.level))})`;
  $('barfill').style.background = rules.inGate ? 'linear-gradient(90deg,#ffc83d,#ff3fb4)' : run.mode !== 'ranked' ? '#2a2f66' : '';
  S.theme = themeForRank(r);
}
let toastTimer = 0;
function toast(txt, col) { const t = $('toast'); t.textContent = txt; t.style.color = col; t.style.opacity = 1; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.style.opacity = 0; }, 900); }

function showPause() { if (phase !== 'ask' && phase !== 'result') return; prevPhase = phase; phase = 'pause'; loop.pause(); showScreen('pause'); }
let prevPhase = 'ask';
function resume() { showScreen(null); phase = prevPhase; loop.resume(); }

// ---------- input ----------
const input = new Input(canvas, (it) => {
  sfx.unlock();
  if (it.type === 'pause') { if (phase === 'pause') resume(); else showPause(); return; }
  if (phase !== 'ask') return;
  if (it.type === 'lane') choose(it.index);
  else if (it.type === 'left') steer(-1);
  else if (it.type === 'right') steer(1);
  else if (it.type === 'confirm') lock(car.lane);
  else if (it.type === 'power') usePower(it.name);
}, { halves: true, swipe: true, width: () => R.w });
function steer(d) { car.lane = Math.max(0, Math.min(3, car.lane + d)); car.x.target = car.lane; sfx.play('tap'); input.vibrate(8); }

// ---------- loop ----------
const G = { k: 0.1, hidden: [], result: null };
function update(dt, realDt) {
  scroll += (baseSpeed(S.theme ? curRankLive() : 0) + boost * 2.2) * dt;
  boost = Math.max(0, boost - realDt * 0.9);
  car.x.step(dt); car.body.step(dt);
  const decay = 1 - Math.min(1, 1.5 * realDt);
  car.body.x *= decay; car.body.y *= decay; car.body.rot += (0 - car.body.rot) * Math.min(1, 1.2 * dt);
  parts.step(dt); fx.update(realDt);
  S.t = fx.t; S.scroll = scroll; S.boost = boost;
  lightningT -= realDt; if (lightningT < 0) { lightning = 1; lightningT = 2 + Math.random() * 5; } lightning = Math.max(0, lightning - realDt * 3); S.flash = lightning;
  const live = (phase === 'ask' || phase === 'result') && rules;
  if (live) {
    const r = rules.rank, tr = traffic.step(dt, baseSpeed(r) + boost, trafficInterval(r, rules.inGate), Math.round(car.x.x));
    if (tr.hit) { boost = 0; run.hits++; fx.shake(0.3); sfx.play('crash'); input.vibrate(25); car.body.impulse(0, 0, 4); toast('TRAFFIC! speed lost', '#ff9d3d'); }
  } else if (phase === 'menu') { if (!traffic.cars.length || Math.random() < 0.01) traffic.step(dt, 1, 2.2, -1); else traffic.step(dt, 1, 2.2, -1); }
  if (phase === 'ask') {
    if (rules.timeLeftMs - realDt * 1000 <= 0) lock(car.lane);            // gate reached the car: the lane you are in is locked
    else {
      rules.tick(realDt * 1000);
      if (rules.timeLeftMs < 4000 && !rules.frozen && Math.floor(rules.timeLeftMs / 1000) !== Math.floor((rules.timeLeftMs + realDt * 1000) / 1000)) sfx.play('tick');
    }
  } else if (phase === 'result') {
    phaseT += realDt; rush = Math.min(1, phaseT / 0.3);
    if (phaseT > (lastResult && lastResult.gameOver ? 1.3 : 1.0)) {
      if (lastResult.gameOver || (run.mode === 'placement' && run.asked >= PLACEMENT_QUESTIONS)) endRun();
      else if (run.pendingRankUp !== null) { const r = run.pendingRankUp; run.pendingRankUp = null; showRankUp(r); }
      else nextQuestion();
    }
  }
  loop.timeScale = (phase === 'ask' && rules ? rules.timeScale : 1) * fx.slow;
}
const curRankLive = () => (rules && (phase === 'ask' || phase === 'result') ? rules.rank : curRank());

function render(alpha, realDt) {
  if (realDt) perf.frame(realDt * 1000);
  S.car.x = car.x.x; S.car.lane = car.lane; S.car.bx = car.body.x; S.car.by = car.body.y; S.car.rot = car.body.rot;
  S.traffic = traffic.cars;
  if (rules && phase !== 'menu' && phase !== 'over' && (rules.q || phase === 'result')) {
    if (phase === 'ask') { G.k = 0.1 + (CAR_K - 0.1) * (1 - rules.thinkFraction); G.result = null; }
    else G.k = gateK0 + (CAR_K - gateK0) * rush;
    G.hidden = rules.hidden;
    S.gates = G;
    S.think = phase === 'ask' ? { frac: rules.thinkFraction, leftMs: rules.timeLeftMs, frozen: rules.frozen } : null;
  } else { S.gates = null; S.think = null; }
  R.begin(fx); drawScene(R, S); R.end(fx);
  if (++frameN % 20 === 0 && !$('fps').hidden) $('fps').textContent = `${perf.fps.toFixed(0)} fps · ${perf.preset.name}`;
}
let frameN = 0;

// ---------- wiring ----------
$('b-ranked').onclick = () => startRun('ranked');
$('b-practice').onclick = () => startRun('practice');
$('b-placement').onclick = () => startRun('placement');
$('b-settings').onclick = () => { renderSettings(); showScreen('settings'); };
$('set-back').onclick = () => { showScreen('home'); renderHome(); };
$('b-garage').onclick = () => { renderGarage(); showScreen('garage'); };
$('g-back').onclick = () => showScreen('home');
$('pause-btn').onclick = () => showPause();
$('p-resume').onclick = resume;
$('p-quit').onclick = () => { showScreen(null); loop.resume(); phase = prevPhase; endRun(); };
$('ru-go').onclick = () => { showScreen(null); phase = 'result'; phaseT = 99; };
$('r-again').onclick = () => startRun(run.mode === 'placement' ? 'ranked' : run.mode);
$('r-home').onclick = () => { phase = 'menu'; traffic.clear(); renderHome(); showScreen('home'); };
$('dev-rank').oninput = (e) => { const r = +e.target.value, t = track(); const p = store.prog; p.level = rankFloor(t, r); p.maxLevel = Math.max(p.maxLevel, p.level); p.meter = 0; p.gatePending = false; p.gateActive = false; $('dev-rank-name').textContent = rankName(r); store.save(); };
$('dev-gate').onclick = () => { const t = track(), p = store.prog, r = Math.min(rankIdx(p), rankCount(t) - 2); p.level = rankLast(t, r); p.maxLevel = Math.max(p.maxLevel, p.level); p.meter = levelTarget(t, p.level) - 1; p.gatePending = false; p.gateActive = false; store.save(); toast('Next correct answer starts the gate', '#ffc83d'); };
$('dev-reset').onclick = () => { store.reset(); applySettings(); renderSettings(); toast('Progress reset', '#ff9d3d'); };
if (qs.get('debug') === '1') $('fps').hidden = false;
addEventListener('resize', fit); addEventListener('orientationchange', fit);
document.addEventListener('visibilitychange', () => store.save());
function fit() { R.resize(innerWidth, innerHeight); }

// ---------- boot ----------
fit(); applySettings(); applyQuality({ preset: perf.preset }); renderHome();
loop = new GameLoop({ update, render });
loop.autoPause(() => { if (phase === 'ask' || phase === 'result') showPause(); });
loop.start();

window.__racer = {
  get state() { return { phase, hearts: rules && rules.hearts, over: rules && rules.over, level: store.prog.level, meter: store.prog.meter, streak: rules ? rules.streak : 0, score, fps: perf.fps, quality: perf.preset.name, timeScale: loop.timeScale, qcorrect: q && q.correct, inGate: rules && rules.inGate, cls: store.profile.cls, track: store.profile.track, rank: rankIdx(store.prog), asked: run && run.asked, hits: run && run.hits, trafficCars: traffic.cars.length }; },
  store, loop, perf, choose, startRun, rules: () => rules, run: () => run,
};
