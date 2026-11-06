// Player settings shared by both games. Pure: defaults + sanitiser (accepts anything, returns a valid object).

export const DEFAULT_SETTINGS = {
  graphics: 'auto',      // auto | low | medium | high
  sound: true,
  volume: 0.8,           // 0..1
  vibration: true,
  leftHanded: false,
  extraTime: false,      // x1.5 reading time (accessibility)
  colorBlind: false,
  reduceMotion: false,
  textSize: 'm',         // s | m | l
  swipe: true,           // Racer: swipe steering on top of tap
  confirmTap: false,     // Defense: second tap to confirm
};

const ENUMS = { graphics: ['auto', 'low', 'medium', 'high'], textSize: ['s', 'm', 'l'] };

export function sanitizeSettings(s) {
  const out = { ...DEFAULT_SETTINGS };
  if (!s || typeof s !== 'object') return out;
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    const v = s[k], d = DEFAULT_SETTINGS[k];
    if (typeof d === 'boolean') { if (typeof v === 'boolean') out[k] = v; }
    else if (typeof d === 'number') { if (Number.isFinite(v)) out[k] = Math.max(0, Math.min(1, v)); }
    else if (ENUMS[k]) { if (ENUMS[k].includes(v)) out[k] = v; }
  }
  return out;
}

export const timeMultiplier = (settings) => (settings.extraTime ? 1.5 : 1);
export const graphicsLevel = (settings) => ({ auto: null, low: 0, medium: 1, high: 2 }[settings.graphics] ?? null);

/** Colour-blind friendly lane palette (Okabe-Ito) vs the neon default. */
export const LANE_COLORS = ['#19e6c1', '#9b6bff', '#ff3fb4', '#ffc83d'];
export const LANE_COLORS_CB = ['#0072B2', '#E69F00', '#CC79A7', '#F0E442'];
export const laneColors = (settings) => (settings.colorBlind ? LANE_COLORS_CB : LANE_COLORS);
