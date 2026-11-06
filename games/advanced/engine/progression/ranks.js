// Rank ladder + track config. Pure data/logic: no DOM, safe in Node / Deno / browser.
// Source of truth: Master Plan v1.1 (see claude/advanced-games-context.md).

export const RANK_NAMES = [
  'Spark', 'Ember', 'Glow', 'Pulse', 'Flux', 'Volt', 'Surge', 'Blaze', 'Storm', 'Vortex',
  'Aura', 'Nebula', 'Eclipse', 'Phantom', 'Zenith', 'Titan', 'Cosmic', 'Quantum', 'Infinity', 'Omega',
];
export const RANK_RESERVE = ['Echo', 'Lumen', 'Rift', 'Onyx', 'Orbit', 'Drift', 'Helix', 'Zenon'];
export const RANK_COLORS = { teal: '#19e6c1', violet: '#9b6bff', magenta: '#ff3fb4', gold: '#ffc83d' };

export const SENIOR_STARTS = [1, 5, 9, 13, 17, 21, 25, 30, 35, 40, 45, 50, 55, 61, 67, 73, 79, 86, 93, 100];
export const MIDDLE_STARTS = [1, 5, 9, 13, 17, 22, 27, 32, 37, 43, 49, 56];

export const BASE_POINTS = { E: 10, M: 14, H: 20 };
export const GATE_N = [10, 12, 15, 18];          // correct answers needed per band A..D
export const GATE_MAX_WRONG = 2;                 // 3rd wrong fails the gate
export const GRACE_ANSWERS = 30;                 // after a rank-up: no bar penalty
export const COMEBACK_WINDOW = 20;
export const COMEBACK_BOOST_ANSWERS = 10;

export const TRACKS = {
  senior: { id: 'senior', classes: [9, 10, 11, 12], starts: SENIOR_STARTS, barA: 150, barB: 14, penalty: true, cap: 100, maxLevel: 100 },
  middle: { id: 'middle', classes: [6, 7, 8], starts: MIDDLE_STARTS, barA: 250, barB: 20, penalty: false, cap: 60, maxLevel: 60 },
};

export function trackForClass(cls) {
  const c = Number(cls);
  if (c >= 6 && c <= 8) return TRACKS.middle;
  if (c >= 9 && c <= 12) return TRACKS.senior;
  return null;
}

export const rankCount = (track) => track.starts.length;
export const levelTarget = (track, level) => track.barA + track.barB * level;

/** Band A..D = index 0..3 (5 ranks each). Middle uses the same banding. */
export const bandOfRank = (rankIdx) => Math.min(Math.floor(rankIdx / 5), 3);
export const gateN = (rankIdx) => GATE_N[bandOfRank(rankIdx)];

export function rankName(rankIdx) { return RANK_NAMES[Math.max(0, Math.min(RANK_NAMES.length - 1, rankIdx))]; }
export function rankColor(rankIdx) {
  const b = bandOfRank(rankIdx);
  return [RANK_COLORS.teal, RANK_COLORS.violet, RANK_COLORS.magenta, RANK_COLORS.gold][b];
}

/** 0-based rank index for a level. */
export function rankOfLevel(track, level) {
  let r = 0;
  for (let i = 0; i < track.starts.length; i++) if (level >= track.starts[i]) r = i;
  return r;
}
/** First level of a rank. */
export const rankFloor = (track, rankIdx) => track.starts[rankIdx];
/** Last level of a rank (the gate level). Top rank returns track.cap. */
export function rankLast(track, rankIdx) {
  return rankIdx >= track.starts.length - 1 ? track.cap : track.starts[rankIdx + 1] - 1;
}
export const isTopRank = (track, rankIdx) => rankIdx >= track.starts.length - 1;
export const isGateLevel = (track, level) => {
  const r = rankOfLevel(track, level);
  return !isTopRank(track, r) && level === rankLast(track, r);
};

/** Streak multiplier. */
export function streakMult(s) {
  if (s >= 15) return 2.0;
  if (s >= 10) return 1.8;
  if (s >= 6) return 1.5;
  if (s >= 3) return 1.2;
  return 1.0;
}

const MIX_START = [[0.7, 0.3, 0.0], [0.4, 0.5, 0.1], [0.0, 0.6, 0.4], [0.0, 0.3, 0.7]];
const MIX_END = [[0.2, 0.6, 0.2], [0.0, 0.5, 0.5], [0.0, 0.2, 0.8], [0.0, 0.0, 1.0]];

/** Easy/Medium/Hard weights for a rank at position pos (0..1) inside its block. */
export function difficultyMix(rankIdx, pos) {
  const b = bandOfRank(rankIdx);
  const p = Math.max(0, Math.min(1, pos));
  return [0, 1, 2].map((i) => MIX_START[b][i] + (MIX_END[b][i] - MIX_START[b][i]) * p);
}

/** Position of `level` inside its rank block, 0..1. */
export function blockPosition(track, level) {
  const r = rankOfLevel(track, level);
  const s0 = track.starts[r];
  const s1 = isTopRank(track, r) ? track.cap + 1 : track.starts[r + 1];
  return (level - s0) / Math.max(1, s1 - s0 - 1);
}

/** Pick a tier ('E'|'M'|'H') from weights with a 0..1 random number. */
export function pickTier(weights, r01) {
  const total = weights[0] + weights[1] + weights[2];
  let x = r01 * total;
  if ((x -= weights[0]) < 0) return 'E';
  if ((x -= weights[1]) < 0) return 'M';
  return 'H';
}
