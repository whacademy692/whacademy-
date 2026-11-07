// Garage: cosmetic only (never changes answers). Unlock by rank; coins come from play (game coins, separate from academy coins).

export const PAINTS = [
  { id: 'cyan',    name: 'Cyan',      color: '#19e6c1', unlockRank: 0 },
  { id: 'violet',  name: 'Violet',    color: '#9b6bff', unlockRank: 0 },
  { id: 'magenta', name: 'Magenta',   color: '#ff3fb4', unlockRank: 0 },
  { id: 'gold',    name: 'Gold',      color: '#ffc83d', unlockRank: 4 },
  { id: 'white',   name: 'Chrome',    color: '#dfe6ff', unlockRank: 7 },
  { id: 'red',     name: 'Ruby',      color: '#ff4d6d', unlockRank: 10 },
  { id: 'lime',    name: 'Lime',      color: '#b6ff3d', unlockRank: 13 },
  { id: 'ice',     name: 'Ice',       color: '#7fd6ff', unlockRank: 16 },
];
export const GLOWS = [
  { id: 'lane',  name: 'Follow lane', unlockRank: 0 },
  { id: 'paint', name: 'Match paint', unlockRank: 0 },
  { id: 'white', name: 'White',       unlockRank: 3 },
  { id: 'rainbow', name: 'Rainbow',   unlockRank: 9 },
];
export const TRAILS = [
  { id: 'none',     name: 'None',     unlockRank: 0 },
  { id: 'flame',    name: 'Flame',    unlockRank: 2 },
  { id: 'electric', name: 'Electric', unlockRank: 6 },
  { id: 'rainbow',  name: 'Rainbow',  unlockRank: 12 },
];

const find = (list, id) => list.find((x) => x.id === id);
/** unlockRank is written on the 20-rank (Senior) scale; Middle has only 12 ranks, so it is scaled to the ladder length. */
export const needRank = (item, total = 20) => Math.round(item.unlockRank * (Math.max(2, total) - 1) / 19);
export const isUnlocked = (item, maxRank, total = 20) => maxRank >= needRank(item, total);

/** Return a valid choice: if the stored one is unknown or locked, fall back to the default. */
export function resolveGarage(garage, maxRank, total = 20) {
  const pick = (list, id) => { const it = find(list, id); return it && isUnlocked(it, maxRank, total) ? it : list[0]; };
  return { paint: pick(PAINTS, garage && garage.paint), glow: pick(GLOWS, garage && garage.glow), trail: pick(TRAILS, garage && garage.trail) };
}

/** Game coins for a finished run: 3 per correct answer, +25 for a rank-up. */
export function coinsForRun({ correct, rankUps = 0 }) {
  return Math.max(0, correct * 3 + rankUps * 25);
}
