// Auto Defense: the game. Thin pack on top of the shared engine (loop, renderer, input, audio, physics, FX, perf,
// rules, progression, adapter). Questions come from window.WHA_ADV_QUESTIONS (array or fn(cls)) or the dummy set.
import { GameLoop } from '../engine/core/loop.js';
import { Renderer } from '../engine/core/renderer.js';
import { Input } from '../engine/core/input.js';
import { Sfx } from '../engine/core/audio.js';
import { ParticlePool } from '../engine/core/physics.js';
import { Fx } from '../engine/core/fx.js';
import { PerfManager, QUALITY } from '../engine/core/perf.js';
import { RunRules, POWERUPS } from '../engine/rules/rules.js';
import { normalizeAll, QuestionPool } from '../engine/mcq/adapter.js';
import { DUMMY_RAW } from '../engine/mcq/dummy.js';
import { loadBankQuestions } from '../engine/mcq/bank.js';
import { setMath, fitQuestionUi } from '../engine/ui/mathtext.js';
import { TRACKS, rankName, rankColor, rankOfLevel, rankFloor, rankLast, difficultyMix, blockPosition, pickTier, levelTarget, rankCount } from '../engine/progression/ranks.js';
import { rankIdx, placementNextTier, placementLevel, PLACEMENT_QUESTIONS } from '../engine/progression/progression.js';
import { ProfileStore, memoryStorage } from '../engine/ui/store.js';
import { GameServer, findStudentToken, answersFromLog } from '../engine/net/server.js';
import { sanitizeSettings, timeMultiplier, graphicsLevel } from '../engine/ui/settings.js';
import { badgeSVG } from '../engine/ui/badge.js';
import { themeForRank } from '../racer/themes.js';
import { icon } from '../engine/ui/icons.js';
import { PAINTS, GLOWS, TRAILS, resolveGarage, isUnlocked, needRank, coinsForRun } from '../racer/garage.js';
import { loadPrefs, savePrefs } from '../engine/ui/prefs.js';
import { drawScene, geom as sceneGeom, muzzle, DRONE_COLORS, TL } from './scene.js';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const DEV = qs.get('dev') === '1';
const LETTER = ['A', 'B', 'C', 'D'];
const PU_LABEL = { fifty: ['fifty', '50:50'], freeze: ['snow', 'Freeze'], heal: ['heart', 'Heal'], skip: ['skip', 'Skip'] };
const prefs = loadPrefs();                 // device-only options (ambient sound, "how to play" seen)
const clampN = (x, a, b) => Math.max(a, Math.min(b, x));
const ENV_KEY = 'wha_adv_env';          // day / night is a per-device look, kept locally (not part of the server profile)
let env = 'day'; try { env = localStorage.getItem(ENV_KEY) === 'night' ? 'night' : 'day'; } catch (e) { /* blocked */ }

// ---------- state ----------
// LOCAL = sandbox (no server): ?dev=1 or ?local=1, progress kept in this browser only.
// Otherwise the game runs against the backend: the student's real class, Max-plan check and progress all come from the server.
const LOCAL = DEV || qs.get('local') === '1';
const safeStorages = () => { const a = []; try { a.push(localStorage); } catch (e) { /* blocked */ } try { a.push(sessionStorage); } catch (e) { /* blocked */ } return a; };
const server = LOCAL ? null : new GameServer({ game: 'defense', getToken: () => findStudentToken(safeStorages()) });
const store = new ProfileStore(LOCAL ? { key: 'wha_adv_defense_v1' } : { storage: memoryStorage() });
if (LOCAL && qs.get('class')) store.setClass(Number(qs.get('class')));
let nick = '', hydrated = false, ticket = null, snapshot = null, starting = false, resultNote = '', syncTimer = 0;
const clone = (x) => JSON.parse(JSON.stringify(x));
let settings = store.profile.settings;
let phase = 'menu';          // menu | ask | result | rankup | pause | over
let phaseT = 0;
let rules = null, run = null, pool = null, q = null, lastResult = null, score = 0;
let lightning = 0, lightningT = 3;

// ---------- engine ----------
const canvas = $('cv');
const R = new Renderer(canvas, { dprCap: QUALITY[1].dpr });
const fx = new Fx({ reduceMotion: false });
const sfx = new Sfx();
const parts = new ParticlePool(QUALITY[1].particles);
const smoke = [];
const base = { damage: 0, aim: [-Math.PI / 2, -Math.PI / 2, -Math.PI / 2], recoil: [0, 0, 0], flash: [0, 0, 0], shieldFlash: 0, smokeX: 0, smokeY: 0 };
const D = { phase: 'menu', t: 0, p: 0, pLock: 0, sel: -1, hidden: [], result: null, plan: null, rt: 0, beams: [] };
const minions = [];
let smokeT = 0, minionT = 0, fired = false;
const perf = new PerfManager({ auto: true, level: 1, onChange: applyQuality });
let loop;

// Scene state handed to drawScene each frame.
const S = { t: 0, scroll: 0, env, preset: perf.preset, theme: themeForRank(0), letters: LETTER, colorBlind: false, reduceMotion: false, flash: 0,
  parts, smoke, base, D, minions, dronePos: [null, null, null, null], droneColors: DRONE_COLORS[env], think: null,
  garage: resolveGarage(store.profile.garage, 0, 20) };

function applyQuality(c) {
  const p = (c && c.preset) || perf.preset;
  R.setDprCap(p.dpr); R.glowOn = p.glow; parts.resize(p.particles); fx.shakeScale = p.shake; S.preset = p;
  if (loop) loop.renderEvery = perf.fallback30 ? 2 : 1;
}
function setEnv(e, save = true) {
  env = e === 'night' ? 'night' : 'day'; S.env = env;
  document.body.dataset.env = env;
  S.droneColors = DRONE_COLORS[env]; document.documentElement.style.setProperty('--g1', DRONE_COLORS[env][0]); document.documentElement.style.setProperty('--g2', DRONE_COLORS[env][1]);
  if (save) { try { localStorage.setItem(ENV_KEY, env); } catch (err) { /* blocked */ } }
  sfx.ambience(env);
  for (const id of ['env-quick', 'env-hud']) { const q = $(id); if (q) { q.innerHTML = icon(env === 'day' ? 'sun' : 'moon', { size: id === 'env-hud' ? 18 : 20 }); q.setAttribute('aria-label', env === 'day' ? 'Day scenery (tap for night)' : 'Night scenery (tap for day)'); } }
}
function applySettings() {
  settings = store.profile.settings = sanitizeSettings(store.profile.settings);
  { let mid = false; try { mid = track().id === 'middle'; } catch (e) {} if (mid && !prefs.confirmChosen) settings.confirmTap = true; }   // younger students: a second tap fires (fewer mis-taps) until they choose otherwise
  document.body.classList.remove('ts-s', 'ts-l'); if (settings.textSize !== 'm') document.body.classList.add('ts-' + settings.textSize);
  document.body.classList.toggle('lefty', settings.leftHanded);
  document.body.classList.toggle('rm', settings.reduceMotion);
  sfx.setMuted(!settings.sound); sfx.setVolume(settings.volume); sfx.setAmbientOn(prefs.ambient); sfx.ambience(env);
  input.haptics = settings.vibration;
  fx.reduceMotion = settings.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  S.colorBlind = settings.colorBlind; S.reduceMotion = fx.reduceMotion;
  const gl = graphicsLevel(settings);
  if (gl === null) perf.setAuto(true); else { perf.setAuto(false); perf.setFallback30(false, 'manual'); perf.setLevel(gl); applyQuality({ preset: perf.preset }); }
  store.save();
  if (server && hydrated) scheduleSync();
}
const track = () => TRACKS[store.profile.track];
const curRank = () => rankIdx(store.prog);
const maxRank = () => rankOfLevel(track(), store.prog.maxLevel || store.prog.level);

// ---------- run ----------
let rawCache = null, bankP = null;
/** Questions for this class: a host-provided set (tests) or the real banks. Resolves to a raw array. */
function rawQuestions(cls) {
  const p = window.WHA_ADV_QUESTIONS;
  if (typeof p === 'function') return p(cls);
  if (Array.isArray(p)) return p;
  return rawCache || DUMMY_RAW;
}
async function ensureQuestions() {
  if (window.WHA_ADV_QUESTIONS) return true;
  if (rawCache) return true;
  try {
    bankP = bankP || loadBankQuestions(store.profile.cls);
    if (!rawCache) toast('Loading questions…', '#7fd6ff', 1500);
    rawCache = await bankP; return true;
  } catch (e) { bankP = null; toast('Could not load questions. Check your connection and try again.', '#ff4d6d', 3500); return false; }
}
const preloadBank = () => { if (!bankP && !window.WHA_ADV_QUESTIONS) { bankP = loadBankQuestions(store.profile.cls); bankP.then((r) => { rawCache = r; }).catch(() => { bankP = null; }); } };
async function startRun(mode) {
  sfx.unlock();
  if (!prefs.coach.defense) { showCoach(() => startRun(mode)); return; }
  if (!(await ensureQuestions())) return;
  if (server) {
    if (starting) return;
    starting = true;
    try {
      const r = await server.startRun(mode);
      ticket = r; snapshot = clone(r.state); store.setProg(clone(r.state));
    } catch (e) { starting = false; failMsg(e); return; }
    starting = false;
  }
  beginRun(mode);
}
function beginRun(mode) {
  pool = new QuestionPool(normalizeAll(rawQuestions(store.profile.cls)));
  if (!pool.size) { toast('No questions available', '#ff4d6d'); return; }
  const prog = store.prog;
  run = { mode, history: [], rankUps: 0, hits: 0, asked: 0, gateFailed: false, startLevel: prog.level, startRank: rankIdx(prog), pendingRankUp: null, events: [] };
  lastHearts = null;
  rules = new RunRules({ trackId: store.profile.track, prog, mode: mode === 'ranked' ? 'ranked' : 'practice', timeMult: timeMultiplier(settings) });
  score = 0; lastResult = null;
  parts.clear(); smoke.length = 0; minions.length = 0; resetBase();
  S.garage = resolveGarage(store.profile.garage, maxRank(), rankCount(track()));
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
  phase = 'ask'; phaseT = 0; fired = false;
  D.phase = 'ask'; D.p = 0; D.sel = -1; D.result = null; D.plan = null; D.rt = 0; D.beams.length = 0; D.hidden = [];
  renderQuestion();
}
function renderQuestion() {
  setMath($('q'), q.stem);
  const t = rules.timeTotalMs / 1000, tier = q.tier === 'E' ? 'Easy' : q.tier === 'M' ? 'Medium' : 'Hard';
  const where = run.mode === 'placement' ? `Placement ${run.asked}/${PLACEMENT_QUESTIONS}`
    : rules.inGate ? `GATE ${rules.gate.done}/${rules.gate.need} · ${rules.gate.wrong}/3 wrong`
    : run.mode === 'practice' ? 'Practice' : `bar ${Math.round(store.prog.meter)}/${Math.round(levelTarget(track(), store.prog.level))}`;
  $('meta').innerHTML = `<span>${q.subject && q.subject !== 'Mixed' ? q.subject + ' · ' : ''}${tier}${q.calc ? ' · calc' : ''}</span><span>${t.toFixed(0)} s</span><span>${where}</span>`;
  const box = $('opts'); box.innerHTML = '';
  q.options.forEach((o, i) => {
    const b = document.createElement('button');
    b.className = 'opt'; b.dataset.i = i;
    b.innerHTML = `<b>${LETTER[i]}</b><span></span>`; setMath(b.lastChild, o);
    b.onclick = () => { sfx.unlock(); choose(i); };
    box.appendChild(b);
  });
  fitQuestionUi($('q'), box);
  renderPowerups(); setHud(); measureUi();
}
function renderPowerups() {
  const box = $('pw'); box.innerHTML = '';
  if (run.mode === 'placement') return;
  for (const p of POWERUPS) {
    const b = document.createElement('button'), c = rules.canUse(p);
    b.innerHTML = `${icon(PU_LABEL[p][0], { size: 18 })}<span>${PU_LABEL[p][1]}</span><em>×${rules.charges[p]}</em>`;
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
  if (name === 'heal') base.damage = Math.max(0, base.damage - 1);
  if (name === 'skip') { nextQuestion(); return; }
  renderPowerups(); setHud();
}
function resetBase() {
  base.damage = 0; base.shieldFlash = 0; base.aim = [-Math.PI / 2, -Math.PI / 2, -Math.PI / 2]; base.recoil = [0, 0, 0]; base.flash = [0, 0, 0];
}
// Aim at drone i. With "Confirm tap" on, the first tap only aims and a second tap (or Space) fires.
function choose(i) {
  if (phase !== 'ask' || !rules.q || rules.hidden.includes(i)) return;
  if (settings.confirmTap && D.sel !== i) { D.sel = i; markSel(); sfx.play('tap'); input.vibrate(8); toast('Tap again to FIRE', '#3dffa0', 1100); return; }
  D.sel = i; markSel(); lock(i);
}
function markSel() { document.querySelectorAll('.opt').forEach((b) => b.classList.toggle('sel', +b.dataset.i === D.sel)); }
function aimMove(d) {
  if (phase !== 'ask' || !rules.q) return;
  const vis = [0, 1, 2, 3].filter((i) => !rules.hidden.includes(i));
  let cur = vis.indexOf(D.sel); cur = cur < 0 ? (d > 0 ? 0 : vis.length - 1) : (cur + d + vis.length) % vis.length;
  D.sel = vis[cur]; markSel(); sfx.play('tap'); input.vibrate(8);
}
function lock(i) {
  const res = rules.answer(i);
  if (!res) return;
  lastResult = res; phase = 'result'; phaseT = 0; fired = false;
  const ci = res.correctIndex, plan = [null, null, null, null]; let n = 0;
  for (let k = 0; k < 4; k++) {
    if (rules.hidden.includes(k)) continue;
    if (res.timeout) plan[k] = { kind: 'dive', from: 0, impact: 0.5 + 0.05 * n++, done: false };
    else if (res.correct) plan[k] = { kind: 'explode', at: k === i ? TL.hit : TL.hit + 0.1 + 0.07 * n++, done: false };
    else plan[k] = k === i ? { kind: 'explode', at: TL.hit, done: false } : { kind: 'dive', from: TL.hit, impact: TL.hit + TL.dive + 0.04 * n++, done: false };
  }
  Object.assign(D, { phase: 'result', rt: 0, pLock: D.p, plan, hidden: rules.hidden.slice(), result: { correct: res.correct, picked: i, correctIndex: ci, timeout: res.timeout } });
  D.impacted = false; D.beams.length = 0;
  if (run.mode === 'placement') run.history.push({ tier: q.tier, correct: res.correct });
  document.querySelectorAll('.opt').forEach((b) => { b.disabled = true; if (+b.dataset.i === ci) b.classList.add('good'); else if (+b.dataset.i === i) b.classList.add('bad'); });
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
  if (res.healed) { sfx.play('heart'); toast(`+1 ${icon('heart', { size: 30 })}`, '#ff4d6d'); base.damage = Math.max(0, base.damage - 1); }
  score = rules.score;
  setHud();
}
const lockPos = (g, k) => ({ x: g.colX(k), y: g.y0 + (g.y1 - g.y0) * Math.max(0, Math.min(1, D.pLock)) });
// Effects timed against the shared timeline (TL): shots, explosions, the impact on the dome.
function resultFx(T, g) {
  const res = lastResult; if (!res) return;
  const sh = settings.reduceMotion;
  if (!res.timeout && !fired && T >= TL.fire) {
    fired = true; sfx.play('laser'); input.vibrate(10);
    for (let k = 0; k < 3; k++) { base.recoil[k] = 1; base.flash[k] = 1; }
  }
  D.beams.length = 0;
  if (!res.timeout) {
    const win = res.correct ? TL.hit + 0.5 : TL.hit + 0.08;
    if (T >= TL.fire && T < win) {
      for (let k = 0; k < 3; k++) {
        let tgt = D.result.picked;
        if (res.correct && T > TL.hit + 0.08) { const alive = [0, 1, 2, 3].filter((d) => d !== D.result.picked && D.plan[d] && D.plan[d].kind === 'explode' && T < D.plan[d].at + 0.05); if (alive.length) tgt = alive[k % alive.length]; }
        const p = lockPos(g, tgt); D.beams.push({ k, tx: p.x, ty: p.y, a: 0.9 });
      }
    }
  }
  let impact = false;
  for (let k = 0; k < 4; k++) {
    const pl = D.plan && D.plan[k]; if (!pl || pl.done) continue;
    const p = lockPos(g, k);
    if (pl.kind === 'explode' && T >= pl.at) {
      pl.done = true; sfx.play('explode');
      const big = k === D.result.picked;
      parts.burst(p.x, p.y, big ? 52 : 30, big ? 300 : 220, 0.8, big ? 3.6 : 3, res.correct ? 140 : 20, 40);
      if (res.correct) parts.burst(p.x, p.y, 16, 160, 0.7, 2.6, 60, 0);
      if (big) { fx.shake(res.correct ? 0.35 : 0.5); fx.flash(res.correct ? '#3dffa0' : '#ff9d3d', res.correct ? 0.2 : 0.18); if (res.correct) { sfx.play('correct'); input.vibrate(15); toast(res.streak >= 3 ? `TARGET DESTROYED ×${res.streak}` : 'TARGET DESTROYED', '#3dffa0'); killMinions(); } }
    }
    if (pl.kind === 'dive' && T >= pl.impact) {
      pl.done = true; impact = true;
      const tx = g.baseX + (g.colX(k) - g.baseX) * 0.45, ty = g.domeTop + 6 * g.bs;
      parts.burst(tx, ty, 34, 260, 0.8, 3.2, 12, 120); sfx.play('explode');
    }
  }
  if (impact && !D.impacted) {
    D.impacted = true;
    base.shieldFlash = 1; base.damage = Math.min(run.mode === 'practice' ? 2 : 3, base.damage + 1);
    sfx.play(res.timeout ? 'wrong' : 'crash'); input.vibrate([40, 30, 60]);
    if (!sh) { fx.shake(0.9); fx.slowmo(0.25, 0.7); } fx.flash('#ff4d6d', 0.35);
    for (let i = 0; i < 9; i++) smoke.push({ x: g.baseX + (Math.random() - 0.5) * 60 * g.bs, y: g.towerTop + 20 * g.bs + Math.random() * 30 * g.bs, r: 5 + Math.random() * 6, a: 0.7, vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 40, fire: i < 3 });
    toast(run.mode === 'ranked' ? `${res.timeout ? 'TOO SLOW' : 'BASE HIT'}  −1 ${icon('heart', { size: 30 })}` : (res.timeout ? 'TOO SLOW' : 'BASE HIT'), '#ff4d6d');
  }
}
function killMinions() {
  const g = sceneGeom(R);
  for (const m of minions) if (!m.dead) { m.dead = true; m.dt = 0; parts.burst(m.x, g.baseY + 6 * g.bs, 8, 120, 0.5, 2.6, 30, 80); }
}

async function endRun() {
  if (!rules) return;
  const rep = rules.over && lastResult && lastResult.report ? lastResult.report : rules.finish();
  phase = 'over'; $('hud').classList.remove('on');
  sfx.play('gameover');
  const wasGateRun = run.gateFailed;
  let placed = null, coins = 0;
  resultNote = '';
  if (!server) {
    if (run.mode === 'placement') {
      placed = placementLevel(run.history);
      const prog = store.prog;
      if (prog.answers === 0) { prog.level = placed; prog.maxLevel = placed; prog.meter = 0; }
      store.profile.placementDone = true;
    }
    coins = run.mode === 'placement' ? 0 : coinsForRun({ correct: rep.correct, rankUps: run.rankUps });
    store.recordRun(rep, coins);
    store.save();
    showResult(rep, coins, wasGateRun, placed);
    return;
  }
  // Server mode: the server replays the answer log and decides level / rank / coins. Its answer wins.
  const answers = answersFromLog(rep.log);
  const restore = () => { if (snapshot) store.setProg(clone(snapshot)); run.rankUps = 0; };
  if (!answers.length) { restore(); showResult(rep, 0, wasGateRun, null); return; }
  showMsg('Saving your run…', '', null);
  const extra = { trafficHits: run.hits, healsUsed: Math.max(0, 1 - (rules.charges.heal || 0)), score: Math.round(score) };
  try {
    let res = null;
    for (let attempt = 0; attempt < 3 && !res; attempt++) {
      try { res = await server.submitRun(ticket, answers, extra); }
      catch (e) { if (!e.network || attempt === 2) throw e; await new Promise((r) => setTimeout(r, 900 * (attempt + 1))); }
    }
    if (res.accepted) {
      store.setProg(clone(res.state));
      run.rankUps = (res.events || []).filter((e) => e.type === 'rankUp').length;
      rep.events = res.events || [];
      coins = res.coins || 0;
      store.recordRun(rep, 0);
      store.profile.coins = res.coinsTotal != null ? res.coinsTotal : store.profile.coins + coins;
      if (run.mode === 'placement') { placed = res.level; store.profile.placementDone = true; }
      if (res.flags && res.flags.length) resultNote = '';
    } else {
      restore(); coins = 0;
      resultNote = 'This run could not be saved, so your progress was not changed.';
      if (res.state) store.setProg(clone(res.state));
    }
  } catch (e) {
    restore(); coins = 0;
    resultNote = e.auth ? 'Your session ended. Please log in again; this run was not saved.' : (e.network ? 'No connection. This run was not saved.' : 'This run could not be saved, so your progress was not changed.');
    try { hydrate(await server.profile()); } catch (e2) { /* keep the restored state */ }
  }
  showResult(rep, coins, wasGateRun, placed);
}

// ---------- screens ----------
const SCREENS = ['home', 'settings', 'garage', 'pause', 'rankup', 'result', 'msg', 'coach'];
let curScreen = 'home', backTo = 'home', coachNext = null;
function showScreen(name) {
  curScreen = name;
  for (const s of SCREENS) $('s-' + s).classList.toggle('show', s === name);
  $('nav-btn').hidden = !(name === 'home' || name === 'pause' || name === 'result' || name === 'msg');   // menu is reachable between runs, not mid-run
  if (name !== 'home' && name !== 'pause' && name !== 'result' && name !== 'msg') closeNav();
}

function renderHome() {
  preloadBank();
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
  $('h-nick').textContent = nick ? 'Player: ' + nick : '';
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
  const defs = [['sound', 'Sound'], ['vibration', 'Vibration'], ['confirmTap', 'Confirm tap (second tap fires)'], ['leftHanded', 'Left-handed layout'], ['extraTime', 'Extra reading time (×1.5)'], ['colorBlind', 'Colour-blind mode'], ['reduceMotion', 'Reduce motion']];
  for (const [k, label] of defs) {
    const d = document.createElement('div'); d.className = 'toggle'; d.innerHTML = `<span>${label}</span><button class="${settings[k] ? 'on' : ''}">${settings[k] ? 'On' : 'Off'}</button>`;
    d.lastChild.onclick = () => { if (k === 'confirmTap') { prefs.confirmChosen = true; savePrefs(prefs); } store.profile.settings[k] = !settings[k]; applySettings(); renderSettings(); if (k === 'sound' && settings.sound) { sfx.unlock(); sfx.play('correct'); } };
    tg.appendChild(d);
  }
  const sp = $('set-prefs'); sp.innerHTML = '';
  { const d = document.createElement('div'); d.className = 'toggle'; d.innerHTML = `<span>Ambient sounds (birds, breeze, crickets)</span><button class="${prefs.ambient ? 'on' : ''}">${prefs.ambient ? 'On' : 'Off'}</button>`;
    d.lastChild.onclick = () => { prefs.ambient = !prefs.ambient; savePrefs(prefs); sfx.unlock(); sfx.setAmbientOn(prefs.ambient); renderSettings(); }; sp.appendChild(d); }
  const mk = (id, list, key) => { const row = $(id); row.innerHTML = ''; for (const [v, label] of list) { const b = document.createElement('button'); b.textContent = label; b.className = settings[key] === v ? 'on' : ''; b.onclick = () => { store.profile.settings[key] = v; applySettings(); renderSettings(); }; row.appendChild(b); } };
  const se = $('set-env'); se.innerHTML = '';
  for (const [v, label, ic] of [['day', 'Day', 'sun'], ['night', 'Night', 'moon']]) {
    const b = document.createElement('button'); b.innerHTML = `${icon(ic, { size: 18 })}<span>${label}</span>`; b.className = env === v ? 'on' : '';
    b.onclick = () => { sfx.unlock(); setEnv(v); renderSettings(); }; se.appendChild(b);
  }
  mk('set-graphics', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], 'graphics');
  mk('set-text', [['s', 'Small'], ['m', 'Normal'], ['l', 'Large']], 'textSize');
  $('dev').hidden = !DEV;
  const t = track(); $('dev-rank').max = t.starts.length - 1; $('dev-rank').value = rankIdx(store.prog); $('dev-rank-name').textContent = rankName(+$('dev-rank').value);
}
function renderGarage() {
  const mr = maxRank(), tt = rankCount(track()), cur = resolveGarage(store.profile.garage, mr, tt);
  const fill = (id, list, key, swatch) => {
    const row = $(id); row.innerHTML = '';
    for (const it of list) {
      const b = document.createElement('button'), ok = isUnlocked(it, mr, tt);
      b.innerHTML = (swatch ? `<span class="sw ${cur[key].id === it.id ? 'pick' : ''}" style="background:${it.color}"></span>` : '') + it.name + (ok ? '' : ` ${icon('lock', { size: 14 })} ${rankName(needRank(it, tt))}`);
      b.className = cur[key].id === it.id ? 'on' : ''; b.disabled = !ok;
      b.onclick = () => { store.profile.garage[key] = it.id; store.save(); if (server && hydrated) scheduleSync(); S.garage = resolveGarage(store.profile.garage, mr, tt); renderGarage(); };
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
  $('ru-theme').textContent = 'New sector: ' + themeForRank(rankIdx0).name;
  const tt = rankCount(track()), news = [];
  for (const [list, kind] of [[PAINTS, 'paint'], [GLOWS, 'beam colour'], [TRAILS, 'shot effect']]) for (const it of list) if (it.unlockRank > 0 && needRank(it, tt) === rankIdx0) news.push(`${it.name} ${kind}`);
  $('ru-unlock').textContent = news.length ? 'Unlocked in the Armory: ' + news.join(', ') : '';
  showScreen('rankup');
}
function showResult(rep, coins, gateFailed, placed) {
  $('toast').style.opacity = 0;
  const prog = store.prog, t = track();
  const title = run.mode === 'placement' ? 'Placement complete' : run.mode === 'practice' ? 'Practice finished' : gateFailed ? 'RANK GATE FAILED' : rep.wrongs.length && rules.hearts <= 0 ? 'GAME OVER' : 'Run finished';
  const el = $('r-title'); el.textContent = title; el.style.color = /FAILED|OVER/.test(title) ? 'var(--red)' : 'var(--teal)';
  const ban = $('r-banners'); ban.innerHTML = '';
  const add = (txt, col) => { const d = document.createElement('div'); d.className = 'card'; d.style.cssText = `border-color:${col};color:${col};margin-bottom:8px;font-weight:700`; d.textContent = txt; ban.appendChild(d); };
  if (resultNote) add(resultNote, '#ff9d3d');
  if (placed) add(`Placed at Level ${placed} · ${rankName(rankOfLevel(t, placed))}`, '#19e6c1');
  if (run.rankUps) add(`Rank up ×${run.rankUps}! Now ${rankName(rankIdx(prog))}`, '#ffc83d');
  if (gateFailed) add('Bar stays full. Retry the Rank Gate any time.', '#ff9d3d');
  for (const e of rep.events || []) {
    if (e.type === 'demotionWarning') add('Warning: one more low-accuracy run on this floor level and you drop a rank.', '#ff9d3d');
    if (e.type === 'rankDown') add('Rank dropped. Comeback boost is on for your next 10 correct answers.', '#ff4d6d');
  }
  const acc = rep.answered ? Math.round(100 * rep.accuracy) : 0;
  $('r-stats').innerHTML = [['Correct', `${rep.correct}/${rep.answered} (${acc}%)`], ['Score', rep.score], ['Best streak', rep.maxStreak], ['Level', `${run.startLevel} to ${prog.level}`], ['Coins earned', `${icon('coin', { size: 16 })} ${coins}`]]
    .map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('');
  const w = $('r-wrongs'); w.innerHTML = '';
  if (rep.wrongs.length) { const h = document.createElement('h3'); h.textContent = 'Review your mistakes'; w.appendChild(h); }
  for (const x of rep.wrongs) {
    const d = document.createElement('div'); d.className = 'wr';
    d.innerHTML = '<strong></strong><small>Your answer: <span class="no"></span></small><small>Correct: <span class="ok"></span></small><small class="ex"></small>';
    setMath(d.querySelector('strong'), x.stem);
    setMath(d.querySelector('.no'), x.picked === null ? '— (time ran out)' : x.options[x.picked]);
    setMath(d.querySelector('.ok'), x.options[x.correct]); setMath(d.querySelector('.ex'), x.explanation);
    w.appendChild(d);
  }
  $('r-again').textContent = run.mode === 'ranked' && prog.gatePending ? 'Retry Rank Gate' : 'Play again';
  showScreen('result');
}

function setHud() {
  const h = rules.hearts;
  $('hearts').innerHTML = [0, 1, 2].map((i) => `<span class="hh ${i < h ? '' : 'off'}">${icon(i < h ? 'heart' : 'heartOutline', { size: 34 })}</span>`).join('');
  if (lastHearts !== null && h < lastHearts) { const hb = $('hearts'); hb.classList.remove('hit'); void hb.offsetWidth; hb.classList.add('hit'); }
  lastHearts = h;
  const r = rules.rank;
  $('rank').textContent = rankName(r); $('rank').style.color = rankColor(r);
  $('lvl').textContent = rules.prog.level; $('stv').textContent = rules.streak; $('score').textContent = Math.round(score);
  const t = track(), full = rules.inGate || run.mode !== 'ranked';
  $('barfill').style.transform = `scaleX(${full ? 1 : Math.min(1, store.prog.meter / levelTarget(t, store.prog.level))})`;
  $('barfill').style.background = rules.inGate ? 'linear-gradient(90deg,#ffc83d,#ff3fb4)' : run.mode !== 'ranked' ? '#2a2f66' : '';
  S.theme = themeForRank(r);
}
let lastHearts = null, toastTimer = 0;
function toast(txt, col, ms = 900) { const t = $('toast'); t.innerHTML = txt; t.style.color = col; t.style.opacity = 1; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.style.opacity = 0; }, ms); }

function showPause() { if (phase !== 'ask' && phase !== 'result') return; prevPhase = phase; phase = 'pause'; loop.pause(); showScreen('pause'); }
let prevPhase = 'ask';
function resume() { showScreen(null); phase = prevPhase; loop.resume(); }

// ---------- input ----------
function hitTest(x, y) {
  if (phase !== 'ask' || !rules || !rules.q) return null;
  const g = sceneGeom(R);
  if (y > g.baseY - 24 * g.bs || y < g.y0 - 70 * g.s) return null;
  let best = -1, bd = 1e9;
  for (let i = 0; i < 4; i++) { if (rules.hidden.includes(i)) continue; const d = Math.abs(x - g.colX(i)); if (d < bd) { bd = d; best = i; } }
  return best >= 0 && bd <= g.span / 8 + 14 ? { type: 'lane', index: best } : null;
}
const input = new Input(canvas, (it) => {
  sfx.unlock();
  if (it.type === 'pause') { if (phase === 'pause') resume(); else showPause(); return; }
  if (phase !== 'ask') return;
  if (it.type === 'lane') choose(it.index);
  else if (it.type === 'left') aimMove(-1);
  else if (it.type === 'right') aimMove(1);
  else if (it.type === 'confirm') { if (D.sel >= 0 && !rules.hidden.includes(D.sel)) lock(D.sel); else toast('Aim at a drone first', '#ffc83d', 900); }
  else if (it.type === 'power') usePower(it.name);
}, { halves: false, swipe: false, width: () => R.w, hitTest });

// ---------- loop ----------
function updateSmoke(dt) {
  smokeT -= dt;
  if (base.damage > 0 && smokeT <= 0 && base.smokeX && (phase === 'ask' || phase === 'result')) {
    smokeT = base.damage >= 3 ? 0.07 : base.damage === 2 ? 0.16 : 0.34;
    smoke.push({ x: base.smokeX + (Math.random() - 0.5) * 30, y: base.smokeY, r: 3 + Math.random() * 3, a: 0.5, vx: (Math.random() - 0.5) * 16, vy: -26 - Math.random() * 22, fire: base.damage >= 3 && Math.random() < 0.25 });
  }
  for (const p of smoke) { p.x += p.vx * dt; p.y += p.vy * dt; p.r += 13 * dt; p.a -= (p.fire ? 1.6 : 0.65) * dt; }
  for (let i = smoke.length - 1; i >= 0; i--) if (smoke[i].a <= 0) smoke.splice(i, 1);
  if (smoke.length > 70) smoke.splice(0, smoke.length - 70);
}
function updateMinions(realDt, g) {
  if (phase === 'ask' && minions.length < 5) { minionT -= realDt; if (minionT <= 0) { minionT = 1.2 + Math.random() * 1.6; const dir = Math.random() < 0.5 ? 1 : -1; minions.push({ x: dir > 0 ? -16 : R.w + 16, dir, lane: Math.floor(Math.random() * 3), ph: Math.random() * 6, dead: false, dt: 0 }); } }
  for (const m of minions) {
    if (m.dead) { m.dt += realDt; continue; }
    m.x += m.dir * 34 * g.bs * realDt;
    if ((m.dir > 0 && m.x > g.baseX - 50 * g.bs) || (m.dir < 0 && m.x < g.baseX + 50 * g.bs)) { m.dead = true; m.dt = 0; }   // reaches the base and fizzles; never costs a heart
  }
  for (let i = minions.length - 1; i >= 0; i--) if (minions[i].dead && minions[i].dt > 0.5) minions.splice(i, 1);
}
function aimAngle(k, g, tx, ty) { const m = g.tur[k]; return Math.atan2(ty - (m.y - 8 * g.bs), tx - m.x); }
function update(dt, realDt) {
  const g = sceneGeom(R);
  parts.step(dt); fx.update(realDt); updateSmoke(dt); updateMinions(realDt, g);
  S.t = D.t = fx.t;
  base.shieldFlash = Math.max(0, base.shieldFlash - realDt * 2.2);
  for (let k = 0; k < 3; k++) { base.recoil[k] = Math.max(0, base.recoil[k] - realDt * 5); base.flash[k] = Math.max(0, base.flash[k] - realDt * 7); }
  lightningT -= realDt; if (lightningT < 0) { lightning = 1; lightningT = 2 + Math.random() * 5; } lightning = Math.max(0, lightning - realDt * 3); S.flash = lightning;
  // turrets track the aimed drone (or the lowest one) and the locked target during the shot
  let tgt = null;
  if (phase === 'ask' && rules) {
    const sp = D.sel >= 0 ? S.dronePos[D.sel] : null;
    tgt = sp || [0, 1, 2, 3].map((i) => S.dronePos[i]).filter(Boolean).sort((a, b) => b.y - a.y)[0] || null;
  } else if (phase === 'result' && D.result) { const k = D.result.picked !== null && D.result.picked !== undefined ? D.result.picked : D.result.correctIndex; tgt = lockPos(g, k); }
  for (let k = 0; k < 3; k++) {
    const want = tgt ? aimAngle(k, g, tgt.x, tgt.y) : -Math.PI / 2;
    let d = want - base.aim[k]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    base.aim[k] += d * Math.min(1, (phase === 'result' ? 16 : 7) * realDt);
  }
  if (phase === 'ask' && rules) {
    D.phase = 'ask'; D.p = 1 - rules.thinkFraction;
    if (rules.timeLeftMs - realDt * 1000 <= 0) lock(null);                          // out of time: the drones reach the dome
    else {
      rules.tick(realDt * 1000);
      if (rules.timeLeftMs < 4000 && !rules.frozen && Math.floor(rules.timeLeftMs / 1000) !== Math.floor((rules.timeLeftMs + realDt * 1000) / 1000)) sfx.play('tick');
    }
  } else if (phase === 'result') {
    phaseT += realDt; D.rt = phaseT;
    resultFx(phaseT, g);
    if (phaseT > (lastResult && lastResult.gameOver ? 1.5 : 1.15)) {
      if (lastResult.gameOver || (run.mode === 'placement' && run.asked >= PLACEMENT_QUESTIONS)) endRun();
      else if (run.pendingRankUp !== null) { const r = run.pendingRankUp; run.pendingRankUp = null; showRankUp(r); }
      else nextQuestion();
    }
  }
  loop.timeScale = (phase === 'ask' && rules ? rules.timeScale : 1) * fx.slow;
}

function render(alpha, realDt) {
  if (realDt) perf.frame(realDt * 1000);
  S.garage = S.garage || resolveGarage(store.profile.garage, 0, 20);
  if (rules && phase !== 'menu' && phase !== 'over') { D.hidden = rules.hidden; S.think = phase === 'ask' ? { frac: rules.thinkFraction, leftMs: rules.timeLeftMs, frozen: rules.frozen } : null; if (phase === 'ask') updateTimerBar(); }
  else S.think = null;
  S.gate = rules && rules.inGate && phase !== 'menu' && phase !== 'over' ? { done: rules.gate.done, need: rules.gate.need, wrong: rules.gate.wrong } : null;
  R.begin(fx); drawScene(R, S); R.end(fx);
  if (frameN % 30 === 0) measureUi();
  if (++frameN % 20 === 0 && !$('fps').hidden) $('fps').textContent = `${perf.fps.toFixed(0)} fps · ${perf.preset.name}`;
}
function updateTimerBar() {
  const f = Math.max(0, Math.min(1, rules.thinkFraction)), el = $('tfill');
  el.style.transform = `scaleX(${f})`; el.style.background = rules.frozen ? '#7fd6ff' : f < 0.25 ? 'linear-gradient(90deg,#ff4d6d,#ff9d3d)' : '';
  $('tsec').textContent = Math.ceil(rules.timeLeftMs / 1000);
}
let frameN = 0;

// ---------- dashboard menu (three lines): the student can leave for any dashboard tab ----------
const NAV_LINKS = [['Dashboard', 'dashboard.html', 'home'], ['Chapters', 'games.html', 'list'], ['Animations', 'animations.html', 'play'], ['Boss Battle', 'boss-battle.html', 'shield'],
  ['Badges', 'badges.html', 'medal'], ['Revision', 'revision.html', 'target'], ['Ranks', 'leaderboard.html', 'trophy'], ['Advanced Games', 'advanced-games.html', 'bolt'],
  ['Advanced Ranks', 'advanced-ranks.html', 'star'], ['Support & Rechecking', 'rechecking.html', 'flag'], ['My Progress', 'progress.html', 'gauge'], ['Guide', 'guide.html', 'check'],
  ['Fee', 'fee.html', 'coin'], ['Profile', 'profile.html', 'user'], ['Upgrade Plan', 'upgrade.html', 'up']];
const leaveOk = () => curScreen !== 'pause' || !run || confirm('Leave now? This run will not be saved.');   // only a paused run can be abandoned from the menu
function buildNav() {
  const box = $('nav-list'); box.innerHTML = '';
  const sec = (t) => { const h = document.createElement('div'); h.className = 'navsec'; h.textContent = t; box.appendChild(h); };
  sec('Advanced games');
  for (const [label, href, ic, here] of [['Neon Racer', '../racer/racer.html', 'car', false], ['Auto Defense', 'defense.html', 'shield', true]]) {
    const a = document.createElement('a'); a.href = href; a.className = 'navitem' + (here ? ' here' : '');
    a.innerHTML = `${icon(ic, { size: 20 })}<span></span>${here ? '<em>playing</em>' : ''}`; a.children[1].textContent = label;
    a.onclick = (e) => { if (here) { e.preventDefault(); closeNav(); } else if (!leaveOk()) e.preventDefault(); };
    box.appendChild(a);
  }
  for (const [label, ic, fn] of [['Settings', 'sliders', () => openSettings()], ['Armory', 'shield', () => openGarage()], ['How to play', 'help', () => showCoach(null)]]) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'navitem'; b.innerHTML = `${icon(ic, { size: 20 })}<span></span>`; b.lastChild.textContent = label;
    b.onclick = () => { closeNav(); fn(); }; box.appendChild(b);
  }
  sec('Dashboard');
  for (const [label, href, ic] of NAV_LINKS) {
    const a = document.createElement('a'); a.href = '../../' + href; a.className = 'navitem';
    a.innerHTML = `${icon(ic, { size: 20 })}<span></span>`; a.lastChild.textContent = label;
    a.onclick = (e) => { if (!leaveOk()) e.preventDefault(); };
    box.appendChild(a);
  }
}
function openSettings() { backTo = (curScreen === 'pause' || curScreen === 'result') ? curScreen : 'home'; renderSettings(); showScreen('settings'); }
function openGarage() { backTo = (curScreen === 'pause' || curScreen === 'result') ? curScreen : 'home'; renderGarage(); showScreen('garage'); }
const backFromSub = () => { const t = backTo || 'home'; backTo = 'home'; showScreen(t); if (t === 'home') renderHome(); };
function showCoach(next) { coachNext = next || null; backTo = (curScreen === 'coach' ? 'home' : curScreen); showScreen('coach'); }
function openNav() { $('nav-drawer').classList.add('open'); }
function closeNav() { $('nav-drawer').classList.remove('open'); }
$('nav-btn').onclick = openNav; $('nav-close').onclick = closeNav; $('nav-shade').onclick = closeNav;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNav(); });
buildNav();
document.querySelectorAll('[data-i]').forEach((el) => { el.innerHTML = icon(el.dataset.i, { size: +el.dataset.s || 18 }); });
const flipEnv = () => { sfx.unlock(); setEnv(env === 'day' ? 'night' : 'day'); };
$('env-quick').onclick = flipEnv; $('env-hud').onclick = flipEnv;
document.addEventListener('keydown', (e) => { if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.altKey) flipEnv(); });
setEnv(env, false);

// ---------- wiring ----------
$('b-ranked').onclick = () => startRun('ranked');
$('b-practice').onclick = () => startRun('practice');
$('b-placement').onclick = () => startRun('placement');
$('b-settings').onclick = () => openSettings();
$('set-back').onclick = backFromSub;
$('b-garage').onclick = () => openGarage();
$('g-back').onclick = backFromSub;
$('b-how').innerHTML = `${icon('help', { size: 18 })}<span>How to play</span>`; $('b-how').className = 'swgame'; $('b-how').onclick = () => showCoach(null);
$('set-how').innerHTML = `${icon('help', { size: 18 })}<span>How to play</span>`; $('set-how').onclick = () => showCoach(null);
$('p-settings').onclick = () => openSettings();
for (const id of ['b-switch', 'r-switch', 'p-switch']) $(id).innerHTML = `${icon('swap', { size: 18 })}<span>Switch to Neon Racer</span>`;
$('p-switch').onclick = () => { if (leaveOk()) location.href = '../racer/racer.html'; };
$('b-switch').onclick = (e) => { if (!leaveOk()) e.preventDefault(); }; $('r-switch').onclick = (e) => { if (!leaveOk()) e.preventDefault(); };
$('co-go-btn').onclick = () => { prefs.coach.defense = true; savePrefs(prefs); if (coachNext) { const n = coachNext; coachNext = null; n(); } else backFromSub(); };
$('pause-btn').onclick = () => showPause();
$('p-resume').onclick = resume;
$('p-quit').onclick = () => { showScreen(null); loop.resume(); phase = prevPhase; endRun(); };
$('ru-go').onclick = () => { showScreen(null); phase = 'result'; phaseT = 99; };
$('r-again').onclick = () => startRun(run.mode === 'placement' ? 'ranked' : run.mode);
$('r-home').onclick = () => { phase = 'menu'; renderHome(); showScreen('home'); };
$('dev-rank').oninput = (e) => { const r = +e.target.value, t = track(); const p = store.prog; p.level = rankFloor(t, r); p.maxLevel = Math.max(p.maxLevel, p.level); p.meter = 0; p.gatePending = false; p.gateActive = false; $('dev-rank-name').textContent = rankName(r); store.save(); };
$('dev-gate').onclick = () => { const t = track(), p = store.prog, r = Math.min(rankIdx(p), rankCount(t) - 2); p.level = rankLast(t, r); p.maxLevel = Math.max(p.maxLevel, p.level); p.meter = levelTarget(t, p.level) - 1; p.gatePending = false; p.gateActive = false; store.save(); toast('Next correct answer starts the gate', '#ffc83d'); };
$('dev-reset').onclick = () => { store.reset(); applySettings(); renderSettings(); toast('Progress reset', '#ff9d3d'); };
if (qs.get('debug') === '1') $('fps').hidden = false;
addEventListener('resize', fit); addEventListener('orientationchange', fit);
document.addEventListener('visibilitychange', () => store.save());
function fit() { R.resize(innerWidth, innerHeight); measureUi(); }
function measureUi() {
  const qc = $('qcard'), pw = $('pw'), hud = $('hud');
  if (!hud.classList.contains('on')) return;
  const a = qc.getBoundingClientRect(), b = pw.getBoundingClientRect();
  if (matchMedia('(orientation:landscape) and (max-height:560px)').matches) {          // landscape phone: question + power-ups on the left, answers on the right, the battlefield in the middle
    const tp = hud.querySelector('.top').getBoundingClientRect(), op = $('opts').getBoundingClientRect();
    R.uiTop = tp.bottom; R.uiBot = innerHeight - 8; R.uiL = Math.max(a.right, b.right) + 8; R.uiR = op.left - 8;
    return;
  }
  R.uiL = 0; R.uiR = 0;
  if (a.height && b.top) { R.uiTop = a.bottom; R.uiBot = b.top - 6; }
}

// ---------- server mode ----------
function showMsg(title, text, label, onClick) {
  $('m-title').textContent = title; $('m-text').textContent = text || '';
  const b = $('m-btn'); b.style.display = label ? '' : 'none'; b.textContent = label || ''; b.onclick = onClick || null;
  showScreen('msg');
}
const LOGIN_URL = '../../login.html';
function failMsg(e) {
  if (e && (e.auth || e.noToken)) showMsg('Please log in', 'Open the game from your W.H. Academy dashboard, or log in first.', 'Go to login', () => { location.href = LOGIN_URL; });
  else if (e && e.network) toast(e.message, '#ff4d6d', 3500);
  else toast((e && e.message) || 'Something went wrong.', '#ff4d6d', 3500);
}
function hydrate(p) {
  store.setClass(p.classLevel);
  const g = p.games.defense;
  store.setProg(clone(g.state));
  const pf = store.profile;
  pf.coins = p.coins || 0; pf.placementDone = !!g.placementDone;
  pf.stats = { runs: g.runs, answers: g.totalAnswers, correct: g.totalCorrect, bestStreak: g.bestStreak, bestScore: g.bestScore };
  pf.settings = sanitizeSettings(p.settings); pf.garage = { ...pf.garage, ...p.garage };
  nick = p.nickname || '';
  hydrated = false; applySettings(); hydrated = true;
}
function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { server.saveSettings(store.profile.settings, store.profile.garage).catch(() => { /* retried on the next change */ }); }, 1200);
}
async function bootServer() {
  showMsg('Loading…', '', null);
  try {
    const p = await server.profile();
    if (!p.eligible) {
      showMsg(p.reason === 'class' ? 'Not available for your class' : 'Advanced Games are part of the Max plan',
        p.reason === 'class' ? 'Advanced Games are for Class 6 to 12.' : 'Ask W.H. Academy about upgrading to the Max plan to unlock Neon Racer and Auto Defense.', 'Back to dashboard', () => { location.href = '../../dashboard.html'; });
      return;
    }
    hydrate(p); renderHome(); showScreen('home');
  } catch (e) {
    if (e.network) showMsg('Could not connect', e.message, 'Try again', () => bootServer());
    else failMsg(e);
  }
}

// ---------- boot ----------
fit(); applySettings(); applyQuality({ preset: perf.preset }); renderHome();
loop = new GameLoop({ update, render });
loop.autoPause(() => { if (phase === 'ask' || phase === 'result') showPause(); });
loop.start();
showScreen('home');
if (server) bootServer();

window.__defense = {
  get state() { return { phase, hearts: rules && rules.hearts, over: rules && rules.over, level: store.prog.level, meter: store.prog.meter, streak: rules ? rules.streak : 0, score, fps: perf.fps, quality: perf.preset.name, timeScale: loop.timeScale, qcorrect: q && q.correct, question: q ? { id: q.id, stem: q.stem, subject: q.subject, chapter: q.chapter, options: q.options } : null, inGate: rules && rules.inGate, cls: store.profile.cls, track: store.profile.track, rank: rankIdx(store.prog), asked: run && run.asked, env, damage: base.damage, p: D.p, sel: D.sel, hidden: rules ? rules.hidden.slice() : [], mode: server ? 'server' : 'local', nick, coins: store.profile.coins, minions: minions.length }; },
  store, loop, perf, choose, startRun, setEnv, rules: () => rules, run: () => run,
};
