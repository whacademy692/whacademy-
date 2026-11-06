// Neon Racer: 20 track themes, one per rank. Pure data.
// sky = [top, bottom], ground, accent (road edge / grid), sun = 'disc' | 'ring' | 'stripes' | 'none', pylon style.

const T = (name, top, bottom, ground, accent, sun, extra = {}) => ({ name, sky: [top, bottom], ground, accent, sun, ...extra });

export const THEMES = [
  T('City Night',      '#0a0620', '#2a0f4a', '#070816', '#19e6c1', 'disc'),
  T('Desert Neon',     '#1a0b2e', '#7a2e4a', '#140a12', '#ff9d3d', 'stripes'),
  T('Neon Tunnel',     '#03030a', '#0b0b24', '#04040c', '#3da0ff', 'none', { tunnel: true }),
  T('Coastal Road',    '#0a1233', '#1f6f8b', '#06121c', '#35f0e0', 'disc'),
  T('Snow Ridge',      '#0b1630', '#6d8bbd', '#0b1220', '#bfe8ff', 'disc', { snow: true }),
  T('Cyber Grid',      '#07041a', '#2b0f5c', '#05030f', '#9b6bff', 'ring'),
  T('Space Ring',      '#02020a', '#120a34', '#03030a', '#c07bff', 'ring', { stars: 2 }),
  T('Volcano Run',     '#1a0505', '#7a1e0a', '#120403', '#ff5a2a', 'disc'),
  T('Storm Highway',   '#06081a', '#1c2650', '#05060f', '#8fb3ff', 'none', { lightning: true }),
  T('Vortex Loop',     '#0c0624', '#41107a', '#07041a', '#ff3fb4', 'ring'),
  T('Aurora Pass',     '#031a1a', '#0b6a5a', '#04100f', '#4dffb0', 'none', { aurora: true }),
  T('Nebula Lane',     '#14062a', '#6a1d8a', '#0a0418', '#ff6bd5', 'disc', { stars: 2 }),
  T('Eclipse Bridge',  '#040410', '#1a0f3a', '#05040c', '#ffd23d', 'ring'),
  T('Phantom Alley',   '#05050c', '#202040', '#04040a', '#9aa6ff', 'none'),
  T('Zenith Summit',   '#0a1030', '#4a66c8', '#070b1c', '#7fd0ff', 'disc'),
  T('Titan Foundry',   '#140805', '#5a2a10', '#0e0603', '#ffb02a', 'stripes'),
  T('Cosmic Drift',    '#05020f', '#2a0a50', '#04020a', '#ff3fb4', 'ring', { stars: 3 }),
  T('Quantum Rail',    '#020a14', '#0a3a5a', '#030811', '#3dfcff', 'stripes'),
  T('Infinity Loop',   '#08020f', '#3a0a45', '#05010a', '#ffc83d', 'ring', { stars: 3 }),
  T('Omega Gate',      '#0a0200', '#4a1a05', '#070100', '#ffd76a', 'disc', { stars: 3 }),
];

export const themeForRank = (rankIdx) => THEMES[Math.max(0, Math.min(THEMES.length - 1, rankIdx))];

/** World speed multiplier by rank: later ranks feel faster. */
export const baseSpeed = (rankIdx) => 1.0 + 0.035 * rankIdx;
