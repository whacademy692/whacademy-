// Local profile store. Until the backend (Step 4) exists, progress lives in localStorage; the same shape
// will be what the server returns. Storage is injectable and every access is guarded (private windows,
// blocked storage, quota): the game must always work without it.

import { createState } from '../progression/progression.js';
import { sanitizeSettings } from './settings.js';
import { trackForClass } from '../progression/ranks.js';

export const PROFILE_VERSION = 1;

export function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}

export function defaultStorage() {
  try {
    if (typeof localStorage !== 'undefined') { const k = '__wha_t'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; }
  } catch (e) { /* blocked */ }
  return memoryStorage();
}

export function newProfile(trackId = 'senior') {
  return {
    v: PROFILE_VERSION,
    track: trackId,
    cls: trackId === 'middle' ? 8 : 9,       // class being played (6-12); decides the ladder (Middle 6-8 / Senior 9-12)
    prog: { senior: null, middle: null },
    coins: 0,
    placementDone: false,
    stats: { runs: 0, answers: 0, correct: 0, bestStreak: 0, bestScore: 0 },
    garage: { paint: 'cyan', glow: 'lane', trail: 'none' },
    settings: sanitizeSettings({}),
  };
}

const num = (x, d = 0) => (Number.isFinite(x) ? x : d);

/** Repair anything unexpected from storage so a corrupt save can never crash the game. */
export function sanitizeProfile(p) {
  const base = newProfile(p && (p.track === 'middle' || p.track === 'senior') ? p.track : 'senior');
  if (!p || typeof p !== 'object') return base;
  const t = Number.isInteger(p.cls) ? trackForClass(p.cls) : null;
  if (t) { base.cls = p.cls; base.track = t.id; }
  base.coins = Math.max(0, Math.floor(num(p.coins)));
  base.placementDone = !!p.placementDone;
  if (p.stats && typeof p.stats === 'object') for (const k of Object.keys(base.stats)) base.stats[k] = Math.max(0, num(p.stats[k]));
  if (p.garage && typeof p.garage === 'object') for (const k of Object.keys(base.garage)) if (typeof p.garage[k] === 'string') base.garage[k] = p.garage[k].slice(0, 20);
  base.settings = sanitizeSettings(p.settings);
  for (const t of ['senior', 'middle']) {
    const s = p.prog && p.prog[t];
    if (s && typeof s === 'object' && s.track === t && Number.isFinite(s.level) && Number.isFinite(s.meter)) {
      const fresh = createState(t);
      base.prog[t] = { ...fresh, ...s, recent: Array.isArray(s.recent) ? s.recent.slice(-20).map((x) => (x ? 1 : 0)) : [] };
    }
  }
  return base;
}

export class ProfileStore {
  constructor({ storage, key = 'wha_adv_racer_v1' } = {}) {
    this.storage = storage || defaultStorage();
    this.key = key;
    this.profile = this.load();
  }
  load() {
    try {
      const raw = this.storage.getItem(this.key);
      return sanitizeProfile(raw ? JSON.parse(raw) : null);
    } catch (e) { return newProfile(); }
  }
  save() {
    try { this.storage.setItem(this.key, JSON.stringify(this.profile)); return true; } catch (e) { return false; }
  }
  reset() { this.profile = newProfile(this.profile.track); this.save(); }

  /** Progression state of the active track (created on first use). */
  get prog() {
    const t = this.profile.track;
    if (!this.profile.prog[t]) this.profile.prog[t] = createState(t);
    return this.profile.prog[t];
  }
  /** Choose the class being played (6-12). Switches the ladder automatically; each ladder keeps its own progress. */
  setClass(c) {
    const t = trackForClass(c);
    if (!t) return false;
    this.profile.cls = Number(c); this.profile.track = t.id; this.save();
    return true;
  }
  setProg(state) { this.profile.prog[state.track] = state; }

  /** Record the result of a finished run. */
  recordRun(rep, coins = 0) {
    const s = this.profile.stats;
    s.runs++; s.answers += rep.answered; s.correct += rep.correct;
    s.bestStreak = Math.max(s.bestStreak, rep.maxStreak || 0);
    s.bestScore = Math.max(s.bestScore, rep.score || 0);
    this.profile.coins += Math.max(0, Math.floor(coins));
    this.save();
  }
}
