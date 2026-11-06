import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, themeForRank, baseSpeed } from '../racer/themes.js';
import { PAINTS, GLOWS, TRAILS, resolveGarage, isUnlocked, coinsForRun } from '../racer/garage.js';
import { ProfileStore, memoryStorage, sanitizeProfile, newProfile } from '../engine/ui/store.js';
import { sanitizeSettings, DEFAULT_SETTINGS, timeMultiplier, graphicsLevel, laneColors, LANE_COLORS_CB } from '../engine/ui/settings.js';
import { badgeSVG } from '../engine/ui/badge.js';
import { RunRules, thinkWindowMs } from '../engine/rules/rules.js';
import { normalizeAll } from '../engine/mcq/adapter.js';
import { DUMMY_RAW } from '../engine/mcq/dummy.js';
import { RANK_NAMES } from '../engine/progression/ranks.js';

test('20 themes, unique names, valid colours, speed grows with rank', () => {
  assert.equal(THEMES.length, 20);
  assert.equal(new Set(THEMES.map((t) => t.name)).size, 20);
  for (const t of THEMES) {
    assert.match(t.accent, /^#[0-9a-f]{6}$/i);
    assert.equal(t.sky.length, 2);
    assert.ok(['disc', 'ring', 'stripes', 'none'].includes(t.sun));
  }
  assert.equal(themeForRank(99), THEMES[19]);
  assert.ok(baseSpeed(19) > baseSpeed(0));
});

test('garage: unlock by rank, locked choice falls back, coins formula', () => {
  assert.ok(isUnlocked(PAINTS[0], 0));
  assert.ok(!isUnlocked(PAINTS[3], 3));
  assert.ok(isUnlocked(PAINTS[3], 4));
  const g = resolveGarage({ paint: 'ice', glow: 'nope', trail: 'rainbow' }, 2);
  assert.equal(g.paint.id, 'cyan'); assert.equal(g.glow.id, 'lane'); assert.equal(g.trail.id, 'none');
  const g2 = resolveGarage({ paint: 'ice', glow: 'rainbow', trail: 'rainbow' }, 19);
  assert.equal(g2.paint.id, 'ice'); assert.equal(g2.trail.id, 'rainbow');
  assert.equal(coinsForRun({ correct: 10, rankUps: 1 }), 55);
  assert.equal(coinsForRun({ correct: 0, rankUps: 0 }), 0);
  assert.ok(GLOWS.length && TRAILS.length);
});

test('settings: sanitiser keeps valid values and drops junk', () => {
  const s = sanitizeSettings({ graphics: 'high', sound: false, volume: 7, textSize: 'xl', extraTime: 'yes', colorBlind: true, evil: 1 });
  assert.equal(s.graphics, 'high'); assert.equal(s.sound, false); assert.equal(s.volume, 1);
  assert.equal(s.textSize, DEFAULT_SETTINGS.textSize); assert.equal(s.extraTime, false); assert.equal(s.colorBlind, true);
  assert.ok(!('evil' in s));
  assert.deepEqual(sanitizeSettings(null), DEFAULT_SETTINGS);
  assert.equal(timeMultiplier({ extraTime: true }), 1.5);
  assert.equal(graphicsLevel({ graphics: 'auto' }), null);
  assert.equal(graphicsLevel({ graphics: 'low' }), 0);
  assert.deepEqual(laneColors({ colorBlind: true }), LANE_COLORS_CB);
});

test('extra reading time multiplies the think window', () => {
  const q = normalizeAll(DUMMY_RAW).find((x) => x.tier === 'M');
  const a = new RunRules({ trackId: 'senior' }); a.present(q);
  const b = new RunRules({ trackId: 'senior', timeMult: 1.5 }); b.present(q);
  assert.equal(b.timeTotalMs, Math.round(a.timeTotalMs * 1.5));
  assert.equal(a.timeTotalMs, thinkWindowMs('senior', 'M', q.calc, 0));
});

test('practice never touches the real progression state', () => {
  const store = new ProfileStore({ storage: memoryStorage() });
  store.setClass(10);
  const prog = store.prog;
  prog.level = 4; prog.meter = prog.meter = 213; prog.gatePending = true;
  const snap = JSON.stringify(prog);
  const r = new RunRules({ trackId: 'senior', prog, mode: 'practice' });
  const q = normalizeAll(DUMMY_RAW)[0];
  for (let i = 0; i < 6; i++) { r.present(q); r.answer(i % 2 ? q.correct : (q.correct + 1) % 4); }
  r.finish();
  assert.equal(JSON.stringify(prog), snap);
});

test('class picker: 6-8 Middle, 9-12 Senior, each ladder keeps its own progress', () => {
  const store = new ProfileStore({ storage: memoryStorage() });
  for (const [c, tr] of [[6, 'middle'], [8, 'middle'], [9, 'senior'], [12, 'senior']]) {
    assert.ok(store.setClass(c)); assert.equal(store.profile.track, tr); assert.equal(store.profile.cls, c);
  }
  assert.equal(store.setClass(5), false); assert.equal(store.setClass(13), false); assert.equal(store.setClass('x'), false);
  store.setClass(7); store.prog.level = 20;
  store.setClass(11); assert.equal(store.prog.level, 1);
  store.setClass(6); assert.equal(store.prog.level, 20);
});

test('store: persists, survives corrupt / hostile saves, works without storage', () => {
  const mem = memoryStorage();
  const a = new ProfileStore({ storage: mem });
  a.setClass(9); a.prog.level = 12; a.prog.meter = 55; a.profile.coins = 40; a.profile.settings.sound = false; a.save();
  const b = new ProfileStore({ storage: mem });
  assert.equal(b.profile.cls, 9); assert.equal(b.prog.level, 12); assert.equal(b.profile.coins, 40); assert.equal(b.profile.settings.sound, false);
  mem.setItem(b.key, '{not json');
  assert.equal(new ProfileStore({ storage: mem }).prog.level, 1);
  const bad = sanitizeProfile({ cls: 99, coins: -5, track: 'x', prog: { senior: { track: 'senior', level: 'abc', meter: 1 } }, stats: { runs: 'many' }, garage: { paint: 5 } });
  assert.equal(bad.coins, 0); assert.equal(bad.prog.senior, null); assert.equal(bad.stats.runs, 0); assert.equal(bad.garage.paint, 'cyan');
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const c = new ProfileStore({ storage: broken });
  assert.equal(c.save(), false); assert.equal(c.prog.level, 1);
  assert.equal(sanitizeProfile(null).track, 'senior');
  assert.ok(newProfile('middle').cls >= 6);
});

test('store: recordRun adds stats and coins', () => {
  const s = new ProfileStore({ storage: memoryStorage() });
  s.recordRun({ answered: 10, correct: 7, maxStreak: 4, score: 120 }, 21);
  s.recordRun({ answered: 5, correct: 5, maxStreak: 5, score: 80 }, 15);
  assert.deepEqual(s.profile.stats, { runs: 2, answers: 15, correct: 12, bestStreak: 5, bestScore: 120 });
  assert.equal(s.profile.coins, 36);
});

test('badge: 20 ranks, band colours, chevron count 1..5, crown only on gold band', () => {
  for (let r = 0; r < 20; r++) {
    const svg = badgeSVG(r, { skin: 'speed' });
    assert.ok(svg.startsWith('<svg')); assert.ok(svg.includes(RANK_NAMES[r]));
    assert.ok(svg.includes(`data-marks="${(r % 5) + 1}"`));
    assert.equal((svg.match(/stroke-linecap="round"/g) || []).length, (r % 5) + 1);
    assert.equal(svg.includes('M34 8 L40 -2'), r >= 15);
  }
  assert.ok(badgeSVG(0, { skin: 'core' }).includes('polygon'));
  assert.ok(badgeSVG(0).includes('#19e6c1')); assert.ok(badgeSVG(19).includes('#ffc83d'));
});
