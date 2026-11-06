import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RunRules, thinkWindowMs, thinkSlowFactor, FREEZE_EXTRA_SEC,
} from '../engine/rules/rules.js';
import { normalize, normalizeAll, shuffleOptions, QuestionPool, shortExplanation } from '../engine/mcq/adapter.js';
import { DUMMY_RAW } from '../engine/mcq/dummy.js';
import { createState, applyAnswer } from '../engine/progression/progression.js';
import { rankLast } from '../engine/progression/ranks.js';
import { TRACKS } from '../engine/progression/ranks.js';

const Qs = normalizeAll(DUMMY_RAW);
const q = (tier = 'M') => Qs.find((x) => x.tier === tier);

test('dummy set normalises: 24 questions, 8 per tier', () => {
  const bad = [];
  const all = normalizeAll(DUMMY_RAW, bad);
  assert.deepEqual(bad, []);
  assert.equal(all.length, 24);
  for (const t of ['E', 'M', 'H']) assert.equal(all.filter((x) => x.tier === t).length, 8);
});

test('adapter accepts several raw shapes and rejects bad ones', () => {
  const a = normalize({ question: 'Q?', options: { a: '1', b: '2', c: '3', d: '4' }, answer: 'C', difficulty: 'hard' });
  assert.equal(a.correct, 2); assert.equal(a.tier, 'H');
  const b = normalize({ q: 'Q?', optionA: 'x', optionB: 'y', optionC: 'z', optionD: 'w', correct: 'y' });
  assert.equal(b.correct, 1);
  const sink = [];
  assert.equal(normalize({ stem: 'a', options: ['1', '2', '3'], correct: 0 }, sink), null);
  assert.equal(normalize({ stem: 'a', options: ['1', '1', '3', '4'], correct: 0 }, sink), null);
  assert.equal(normalize({ stem: 'a', options: ['1', '2', '3', '4'], correct: 'zz' }, sink), null);
  assert.equal(sink.length, 3);
});

test('shuffle keeps the right option right', () => {
  let s = 3; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (const x of Qs) {
    const y = shuffleOptions(x, rnd);
    assert.equal(y.options[y.correct], x.options[x.correct]);
    assert.deepEqual([...y.options].sort(), [...x.options].sort());
  }
});

test('explanation is cut to 3 lines max', () => {
  const e = shortExplanation('One. Two. Three. Four. Five.');
  assert.equal(e, 'One. Two. Three.');
});

test('pool serves by tier and recycles when exhausted', () => {
  const pool = new QuestionPool(Qs);
  const seen = new Set();
  for (let i = 0; i < 8; i++) seen.add(pool.next('E').id);
  assert.equal(seen.size, 8);
  assert.ok(pool.next('E'));                  // recycles
});

test('think windows per plan', () => {
  assert.equal(thinkWindowMs('middle', 'E', false, 0), 10000);
  assert.equal(thinkWindowMs('middle', 'M', false, 0), 15000);
  assert.equal(thinkWindowMs('middle', 'H', false, 0), 25000);
  assert.equal(thinkWindowMs('senior', 'E', false, 0), 15000);
  assert.equal(thinkWindowMs('senior', 'M', false, 0), 30000);
  assert.equal(thinkWindowMs('senior', 'H', false, 0), 60000);
  assert.equal(thinkWindowMs('senior', 'M', true, 0), 45000);          // calc +50%
  assert.equal(thinkWindowMs('senior', 'H', false, 19), 48000);        // band D = -20%
  assert.ok(thinkWindowMs('senior', 'H', true, 19) >= 0.8 * 90000 - 1);
});

test('think-slow factor per rank band', () => {
  assert.deepEqual([0, 5, 10, 15].map(thinkSlowFactor), [0.35, 0.45, 0.55, 0.65]);
});

test('3 hearts: wrong = -1, third wrong = game over with a full report', () => {
  const r = new RunRules({ trackId: 'senior', rng: () => 0.5 });
  assert.equal(r.hearts, 3);
  const results = [];
  for (let i = 0; i < 3; i++) { r.present(q('M')); results.push(r.answer((q('M').correct + 1) % 4)); }
  assert.deepEqual(results.map((x) => x.hearts), [2, 1, 0]);
  assert.equal(results[2].gameOver, true);
  const rep = results[2].report;
  assert.equal(rep.wrongs.length, 3);
  assert.ok(rep.wrongs[0].explanation.length > 0);
  assert.equal(rep.wrongs[0].correct, q('M').correct);
  assert.equal(r.over, true);
  assert.throws(() => r.present(q('M')));
});

test('timeout counts as a wrong answer', () => {
  const r = new RunRules({ trackId: 'middle' });
  const info = r.present(q('E'));
  assert.equal(info.thinkMs, 10000);
  assert.equal(r.tick(9000), null);
  const res = r.tick(2000);
  assert.ok(res && res.timeout && !res.correct);
  assert.equal(r.hearts, 2);
  assert.equal(r.wrongs[0].timeout, true);
});

test('think-slow: world slows while a question is open, normal after', () => {
  const r = new RunRules({ trackId: 'middle' });
  assert.equal(r.timeScale, 1);
  r.present(q('M'));
  assert.equal(r.timeScale, 0.35);
  r.answer(q('M').correct);
  assert.equal(r.timeScale, 1);
});

test('streak of 10 gives +1 heart (max 3)', () => {
  const r = new RunRules({ trackId: 'middle' });
  r.present(q('M')); r.answer((q('M').correct + 1) % 4);        // hearts 2
  assert.equal(r.hearts, 2);
  let last;
  for (let i = 0; i < 10; i++) { r.present(q('M')); last = r.answer(q('M').correct); }
  assert.equal(last.healed, true);
  assert.equal(r.hearts, 3);
  for (let i = 0; i < 10; i++) { r.present(q('M')); r.answer(q('M').correct); }
  assert.equal(r.hearts, 3);
});

test('power-ups: 50:50 hides two wrong options, never the right one', () => {
  const r = new RunRules({ trackId: 'senior', rng: Math.random });
  for (let k = 0; k < 30; k++) {
    const rr = new RunRules({ trackId: 'senior' });
    const qq = q('H'); rr.present(qq);
    const u = rr.usePowerup('fifty');
    assert.equal(u.hidden.length, 2);
    assert.ok(!u.hidden.includes(qq.correct));
    assert.equal(rr.usePowerup('fifty').ok, false);
  }
  assert.ok(r);
});

test('power-up: Time Freeze stops the world and adds +10 s (Middle) / +20 s (Senior)', () => {
  for (const [t, extra] of [['middle', 10000], ['senior', 20000]]) {
    const r = new RunRules({ trackId: t });
    const info = r.present(q('M'));
    const u = r.usePowerup('freeze');
    assert.equal(u.extraMs, extra);
    assert.equal(FREEZE_EXTRA_SEC[t] * 1000, extra);
    assert.equal(r.timeScale, 0);
    assert.equal(r.timeLeftMs, info.thinkMs + extra);
  }
});

test('power-up: Heal needs a missing heart; Skip costs nothing', () => {
  const r = new RunRules({ trackId: 'middle' });
  r.present(q('M'));
  assert.equal(r.usePowerup('heal').reason, 'full');
  r.answer((q('M').correct + 1) % 4);
  r.present(q('M'));
  assert.equal(r.usePowerup('heal').hearts, 3);
  r.present(q('M'));
  const s = r.usePowerup('skip');
  assert.ok(s.skipped);
  assert.equal(r.hearts, 3);
  assert.equal(r.skipped, 1);
  assert.equal(r.answered, 1);
  r.present(q('M'));
  assert.equal(r.usePowerup('skip').reason, 'empty');
});

test('gates: all power-ups off, no heart regen, 3rd wrong = game over', () => {
  const track = TRACKS.senior;
  const prog = createState('senior', { level: rankLast(track, 0) });
  prog.meter = 163 + 14 * 4 - 1 - 14 * 4 + 14 * 4;               // placeholder, set exactly below
  prog.meter = track.barA + track.barB * prog.level - 1;
  const r = new RunRules({ trackId: 'senior', prog });
  r.present(q('E'));
  const res = r.answer(q('E').correct);                          // fills bar -> gate starts
  assert.ok(res.events.some((e) => e.type === 'gateStart'));
  assert.ok(r.inGate);
  assert.equal(r.hearts, 3);
  r.present(q('M'));
  for (const p of ['fifty', 'freeze', 'heal', 'skip']) assert.equal(r.usePowerup(p).reason, 'gate');
  const out = [];
  for (let i = 0; i < 3; i++) { if (i) r.present(q('M')); out.push(r.answer((q('M').correct + 1) % 4)); }
  assert.ok(out[2].events.some((e) => e.type === 'gateFail'));
  assert.equal(out[2].gameOver, true);
  assert.equal(r.prog.gatePending, true);
});

test('gate pass ends in a rank-up event without game over', () => {
  const track = TRACKS.middle;
  const prog = createState('middle', { level: rankLast(track, 0) });
  prog.meter = track.barA + track.barB * prog.level - 1;
  const r = new RunRules({ trackId: 'middle', prog });
  r.present(q('E')); r.answer(q('E').correct);
  assert.ok(r.inGate);
  let last;
  for (let i = 0; i < 10; i++) { r.present(q('H')); last = r.answer(q('H').correct); }
  assert.ok(last.events.some((e) => e.type === 'rankUp'));
  assert.equal(r.over, false);
  assert.equal(r.inGate, false);
});

test('practice mode never ends the run and scores half', () => {
  const r = new RunRules({ trackId: 'middle', mode: 'practice' });
  for (let i = 0; i < 5; i++) { r.present(q('M')); r.answer((q('M').correct + 1) % 4); }
  assert.equal(r.over, false);
  assert.equal(r.hearts, 3);
  r.present(q('E')); r.answer(q('E').correct);
  assert.equal(r.score, 5);
});

test('answer log records pick, correctness, ms and keeps plausible fields for the server', () => {
  const r = new RunRules({ trackId: 'middle' });
  r.present(q('E')); r.tick(3000); r.answer(q('E').correct);
  assert.equal(r.log[0].ms, 3000);
  assert.equal(r.log[0].correct, true);
  const rep = r.finish();
  assert.equal(rep.answered, 1);
  assert.equal(rep.accuracy, 1);
});

test('ranked stream through RunRules matches pure progression replay', () => {
  const r = new RunRules({ trackId: 'middle', rng: () => 0.3 });
  const mirror = createState('middle');
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 40 && !r.over; i++) {
    const qq = q(['E', 'M', 'H'][i % 3]); r.present(qq);
    const ok = rnd() < 0.8;
    const res = r.answer(ok ? qq.correct : (qq.correct + 1) % 4);
    applyAnswer(mirror, { correct: ok, tier: qq.tier });
    if (res.gameOver) break;
  }
  assert.equal(r.prog.level, mirror.level);
  assert.ok(Math.abs(r.prog.meter - mirror.meter) < 1e-9);
});
