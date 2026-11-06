// Progression simulator (JS port of sim3.py). Seeded, deterministic.
// Run:  node engine/progression/sim.js [--grace]
// Parity mode (grace 0, auto gate retry) must reproduce the Master Plan v1.1 tables.

import { TRACKS, difficultyMix, blockPosition, rankOfLevel, pickTier, isTopRank } from './ranks.js';
import { createState, applyAnswer, rankIdx } from './progression.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TIER_BONUS = { E: 0.08, M: 0.0, H: -0.12 };

/**
 * Simulate one student with a fixed skill (probability of a medium question).
 * Returns { reached: {rank1based: answers}, answers }.
 * track: 'senior' | 'middle'; barA/barB override the bar (plan variants).
 */
export function simulate(skill, trackId, { seed = 0, maxAnswers = 60000, grace = 0, bar } = {}) {
  const base = TRACKS[trackId];
  const track = bar ? { ...base, barA: bar[0], barB: bar[1] } : base;
  // applyAnswer reads the track from TRACKS by id, so temporarily patch the bar when overridden
  const saved = { a: base.barA, b: base.barB };
  if (bar) { TRACKS[trackId].barA = bar[0]; TRACKS[trackId].barB = bar[1]; }
  try {
    const rnd = mulberry32(seed + 1);
    const st = createState(trackId);
    const reached = {};
    const nranks = track.starts.length;
    let answers = 0;
    while (answers < maxAnswers && rankIdx(st) < nranks - 1) {
      const r = rankIdx(st);
      const pos = st.gateActive ? 1 : blockPosition(track, st.level);
      const tier = pickTier(difficultyMix(r, pos), rnd());
      let p = skill + TIER_BONUS[tier] - 0.004 * r;
      p = Math.max(0.05, Math.min(0.99, p));
      const correct = rnd() < p;
      answers++;
      const { events } = applyAnswer(st, { correct, tier }, { grace, autoRetryGate: true });
      for (const e of events) if (e.type === 'rankUp') reached[e.rank + 1] = answers;
      if (st.level >= track.cap) break;
    }
    return { reached, answers };
  } finally {
    if (bar) { TRACKS[trackId].barA = saved.a; TRACKS[trackId].barB = saved.b; }
  }
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Median answers-to-rank over `seeds` students. Needs >= half to reach it. */
export function medianTable(skill, trackId, opts = {}) {
  const seeds = opts.seeds ?? 60;
  const n = TRACKS[trackId].starts.length;
  const res = {};
  for (let sd = 0; sd < seeds; sd++) {
    const { reached } = simulate(skill, trackId, { ...opts, seed: sd });
    for (const [k, v] of Object.entries(reached)) (res[k] ||= []).push(v);
  }
  const med = (k) => (res[k] && res[k].length >= seeds / 2 ? Math.round(median(res[k])) : null);
  return { R2: med(2), R4: med(4), R6: med(6), R10: med(10), TOP: med(n), reachedTop: (res[n] || []).length };
}

// CLI
if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('sim.js')) {
  const grace = process.argv.includes('--grace') ? 30 : 0;
  console.log(`Progression sim (grace=${grace}), median answers to reach rank`);
  const variants = [['senior', null], ['middle', [250, 20]]];
  for (const [t, bar] of variants) {
    console.log(`\n${t}${bar ? ' bar ' + bar.join('+') + 'L' : ''}`);
    for (const skill of [0.95, 0.9, 0.85, 0.8, 0.7, 0.6]) {
      const r = medianTable(skill, t, { grace, bar, seeds: 40 });
      console.log(`  acc ${Math.round(skill * 100)}%: R2=${r.R2} R4=${r.R4} R6=${r.R6} R10=${r.R10} TOP=${r.TOP} (reached ${r.reachedTop}/40)`);
    }
  }
}
