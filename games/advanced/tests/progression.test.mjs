import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACKS, RANK_NAMES, SENIOR_STARTS, MIDDLE_STARTS, levelTarget, rankOfLevel, rankLast, isGateLevel,
  streakMult, difficultyMix, gateN, trackForClass,
} from '../engine/progression/ranks.js';
import {
  createState, applyAnswer, startRun, endRun, replay, placementLevel, placementNextTier, rankIdx, targetOf,
} from '../engine/progression/progression.js';
import { medianTable } from '../engine/progression/sim.js';

test('rank tables are consistent', () => {
  assert.equal(RANK_NAMES.length, 20);
  assert.equal(new Set(RANK_NAMES).size, 20);
  assert.equal(SENIOR_STARTS.length, 20);
  assert.equal(MIDDLE_STARTS.length, 12);
  assert.equal(RANK_NAMES[11], 'Nebula');                  // Middle top rank
  assert.equal(trackForClass(7).id, 'middle');
  assert.equal(trackForClass(10).id, 'senior');
  assert.equal(trackForClass(12).id, 'senior');
  assert.equal(trackForClass(5), null);
});

test('bar targets: Senior 150+14L, Middle 250+20L', () => {
  assert.equal(levelTarget(TRACKS.senior, 1), 164);
  assert.equal(levelTarget(TRACKS.senior, 100), 1550);
  assert.equal(levelTarget(TRACKS.middle, 1), 270);
});

test('gate levels sit at the last level of each block', () => {
  assert.equal(rankLast(TRACKS.senior, 0), 4);
  assert.ok(isGateLevel(TRACKS.senior, 4));
  assert.ok(!isGateLevel(TRACKS.senior, 5));
  assert.ok(!isGateLevel(TRACKS.senior, 100));           // top rank has no gate
  assert.equal(rankOfLevel(TRACKS.senior, 9), 2);
  assert.deepEqual([0, 5, 10, 15].map(gateN), [10, 12, 15, 18]);
});

test('streak multiplier steps', () => {
  const m = [0, 2, 3, 5, 6, 9, 10, 14, 15, 40].map(streakMult);
  assert.deepEqual(m, [1, 1, 1.2, 1.2, 1.5, 1.5, 1.8, 1.8, 2, 2]);
});

test('difficulty mix ramps and sums to 1', () => {
  for (let r = 0; r < 20; r++) for (const p of [0, 0.5, 1]) {
    const m = difficultyMix(r, p);
    assert.ok(Math.abs(m[0] + m[1] + m[2] - 1) < 1e-9);
  }
  assert.deepEqual(difficultyMix(0, 0), [0.7, 0.3, 0]);
  assert.deepEqual(difficultyMix(19, 1), [0, 0, 1]);
});

test('points: base x streak multiplier', () => {
  const s = createState('senior');
  const out = [];
  for (let i = 0; i < 4; i++) out.push(applyAnswer(s, { correct: true, tier: 'E' }).gained);
  assert.deepEqual(out, [10, 10, 12, 12]);               // streak 3 -> x1.2
});

test('Senior wrong answer loses 35% of base and resets streak; Middle loses nothing', () => {
  const s = createState('senior'); s.meter = 50; s.streak = 5;
  applyAnswer(s, { correct: false, tier: 'H' });
  assert.equal(s.streak, 0);
  assert.ok(Math.abs(s.meter - (50 - 7)) < 1e-9);
  const m = createState('middle'); m.meter = 50;
  applyAnswer(m, { correct: false, tier: 'H' });
  assert.equal(m.meter, 50);
});

test('Senior level drops when bar hits zero, never below rank floor', () => {
  const s = createState('senior', { level: 7 });          // rank 2 (floor 5)... rank idx1 floor=5
  s.meter = 1;
  applyAnswer(s, { correct: false, tier: 'M' });
  assert.equal(s.level, 6);
  assert.ok(Math.abs(s.meter - 0.7 * levelTarget(TRACKS.senior, 6)) < 1e-9);
  const f = createState('senior', { level: 5 }); f.meter = 1;
  applyAnswer(f, { correct: false, tier: 'M' });
  assert.equal(f.level, 5);
  assert.equal(f.meter, 0);
});

test('bar overflow levels up; last level of block starts the gate', () => {
  const s = createState('senior', { level: 3 });
  s.meter = targetOf(s) - 1;
  let r = applyAnswer(s, { correct: true, tier: 'E' });
  assert.equal(s.level, 4);
  assert.ok(r.events.some((e) => e.type === 'levelUp'));
  s.meter = targetOf(s) - 1;
  r = applyAnswer(s, { correct: true, tier: 'E' });
  assert.ok(s.gateActive);
  assert.ok(r.events.some((e) => e.type === 'gateStart' && e.need === 10 && e.maxWrong === 2));
  assert.equal(s.meter, targetOf(s));
});

function enterGate(trackId = 'senior') {
  const track = TRACKS[trackId];
  const s = createState(trackId, { level: rankLast(track, 0) });
  s.meter = targetOf(s) - 1;
  applyAnswer(s, { correct: true, tier: 'E' });
  assert.ok(s.gateActive);
  return s;
}

test('gate: pass with N correct and <=2 wrong -> rank up, grace on, bar 0', () => {
  const s = enterGate();
  applyAnswer(s, { correct: false, tier: 'H' });
  applyAnswer(s, { correct: false, tier: 'H' });
  let last;
  for (let i = 0; i < 10; i++) last = applyAnswer(s, { correct: true, tier: 'H' });
  assert.ok(last.events.some((e) => e.type === 'rankUp'));
  assert.equal(rankIdx(s), 1);
  assert.equal(s.level, 5);
  assert.equal(s.meter, 0);
  assert.equal(s.graceLeft, 30);
  assert.equal(s.gateActive, false);
});

test('gate: 3rd wrong fails, bar stays full, retry unlimited', () => {
  const s = enterGate();
  applyAnswer(s, { correct: false, tier: 'H' });
  applyAnswer(s, { correct: false, tier: 'H' });
  const r = applyAnswer(s, { correct: false, tier: 'H' });
  assert.ok(r.events.some((e) => e.type === 'gateFail'));
  assert.equal(s.gateActive, false);
  assert.equal(s.gatePending, true);
  assert.equal(s.meter, targetOf(s));
  for (let k = 0; k < 5; k++) {                          // retry 5 times
    startRun(s);
    assert.ok(s.gateActive);
    for (let i = 0; i < 3; i++) applyAnswer(s, { correct: false, tier: 'H' });
    assert.ok(s.gatePending);
  }
});

test('gate gives no bar points', () => {
  const s = enterGate();
  const before = s.meter;
  const r = applyAnswer(s, { correct: true, tier: 'H' });
  assert.equal(r.gained, 0);
  assert.equal(s.meter, before);
});

test('grace after rank-up: wrong answers do not cost bar', () => {
  const s = createState('senior', { level: 5 }); s.meter = 100; s.graceLeft = 30;
  applyAnswer(s, { correct: false, tier: 'H' });
  assert.equal(s.meter, 100);
});

test('comeback: slump of 20 then streak 3 -> +0.5 mult for 10 answers (cap 2.5)', () => {
  const s = createState('middle', { level: 10 });
  for (let i = 0; i < 17; i++) applyAnswer(s, { correct: false, tier: 'M' });
  const evs = [];
  for (let i = 0; i < 3; i++) evs.push(...applyAnswer(s, { correct: true, tier: 'M' }).events);
  assert.ok(evs.some((e) => e.type === 'comeback'));
  assert.equal(s.boost, 10);
  const g = applyAnswer(s, { correct: true, tier: 'M' }).gained;   // streak 4 -> 1.2 + 0.5
  assert.ok(Math.abs(g - 14 * 1.7) < 1e-9);
});

test('demotion needs floor level + 2 low runs + warning; Middle never drops', () => {
  const s = createState('senior', { level: 5 });          // floor of rank idx 1
  assert.deepEqual(endRun(s, { answers: 20, correct: 5 }).map((e) => e.type), ['demotionWarning']);
  const ev = endRun(s, { answers: 20, correct: 6 }).map((e) => e.type);
  assert.deepEqual(ev, ['rankDown', 'comeback']);
  assert.equal(s.level, 4);                               // last level of previous rank
  assert.equal(rankIdx(s), 0);
  assert.ok(Math.abs(s.meter - 0.5 * targetOf(s)) < 1e-9);
  assert.equal(s.boost, 10);
  // a good run in between clears the warning
  const t = createState('senior', { level: 5 });
  endRun(t, { answers: 20, correct: 5 });
  endRun(t, { answers: 20, correct: 15 });
  assert.deepEqual(endRun(t, { answers: 20, correct: 5 }).map((e) => e.type), ['demotionWarning']);
  // not on floor -> no warning
  const u = createState('senior', { level: 6 });
  assert.deepEqual(endRun(u, { answers: 20, correct: 2 }), []);
  // middle never
  const m = createState('middle', { level: 5 });
  assert.deepEqual(endRun(m, { answers: 20, correct: 1 }), []);
  assert.deepEqual(endRun(m, { answers: 20, correct: 1 }), []);
});

test('replay of an answer log reproduces the live state', () => {
  const live = createState('senior');
  const log = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 600; i++) {
    const a = { correct: rnd() < 0.85, tier: ['E', 'M', 'H'][Math.floor(rnd() * 3)] };
    log.push(a);
    applyAnswer(live, a);
  }
  const copy = replay(createState('senior'), log).state;
  assert.deepEqual(copy, live);
});

test('placement: adaptive tiers and start level 1..9', () => {
  assert.equal(placementNextTier([]), 'M');
  assert.equal(placementNextTier([{ tier: 'M', correct: true }, { tier: 'M', correct: true }]), 'H');
  assert.equal(placementNextTier([{ tier: 'M', correct: false }]), 'E');
  const none = Array.from({ length: 15 }, () => ({ tier: 'M', correct: false }));
  const all = Array.from({ length: 15 }, () => ({ tier: 'H', correct: true }));
  assert.equal(placementLevel(none), 1);
  assert.equal(placementLevel(all), 9);
});

// Simulator parity with Master Plan v1.1 tables (median answers to reach rank). Tolerance 12%.
const near = (got, want, tol = 0.12) => assert.ok(got !== null && Math.abs(got - want) / want <= tol, `got ${got}, want ~${want}`);
test('simulator matches plan: Senior 95% / 90%', () => {
  const a = medianTable(0.95, 'senior', { seeds: 30 });
  near(a.R2, 51); near(a.R4, 180); near(a.R6, 360); near(a.R10, 1008); near(a.TOP, 5523);
  const b = medianTable(0.9, 'senior', { seeds: 30 });
  near(b.R2, 58); near(b.R4, 206); near(b.R6, 414); near(b.R10, 1180); near(b.TOP, 6981);
});
test('simulator matches plan: Middle 95% / 85% (250+20L)', () => {
  const a = medianTable(0.95, 'middle', { seeds: 30, bar: [250, 20] });
  near(a.R2, 73); near(a.R4, 264); near(a.R6, 551); near(a.R10, 1565); near(a.TOP, 2433);
  const b = medianTable(0.85, 'middle', { seeds: 30, bar: [250, 20] });
  near(b.R2, 93); near(b.R4, 343); near(b.R6, 729); near(b.R10, 2099); near(b.TOP, 3285);
});
test('simulator: Senior 70% accuracy mostly never reaches Omega', () => {
  const r = medianTable(0.7, 'senior', { seeds: 20 });
  assert.equal(r.TOP, null);
});
