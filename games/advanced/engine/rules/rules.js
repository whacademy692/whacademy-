// Rules layer: hearts, think-slow, power-ups, game over. No DOM, no timers of its own.
// The host (a game) calls present() -> tick(dt) -> answer(); everything is deterministic given an rng.
// Wraps progression.js so a ranked run advances XP/level/rank/gate with the same answer stream.

import { TRACKS, bandOfRank, gateN } from '../progression/ranks.js';
import { createState, startRun as progStart, applyAnswer, endRun as progEnd, rankIdx } from '../progression/progression.js';

export const MAX_HEARTS = 3;
export const HEAL_STREAK = 10;
export const THINK_SLOW = [0.35, 0.45, 0.55, 0.65];     // world speed while thinking, rank band A..D
export const BAND_TIME_CUT = [0, 0.07, 0.14, 0.2];      // rank bands shorten windows by at most 20%
export const THINK_SEC = {                               // [Easy, Medium, Hard] seconds
  middle: { E: 10, M: 15, H: 25 },
  senior: { E: 15, M: 30, H: 60 },
};
export const CALC_BONUS = 0.5;
export const FREEZE_EXTRA_SEC = { middle: 10, senior: 20 };
export const POWERUPS = ['fifty', 'freeze', 'heal', 'skip'];
export const MIN_PLAUSIBLE_MS = 1200;                    // server rejects faster "answers"

/** Think window in ms for one question. */
export function thinkWindowMs(trackId, tier, calc, rank = 0) {
  let s = THINK_SEC[trackId][tier] ?? THINK_SEC[trackId].M;
  if (calc) s *= 1 + CALC_BONUS;
  s *= 1 - BAND_TIME_CUT[bandOfRank(rank)];
  return Math.round(s * 1000);
}
export const thinkSlowFactor = (rank) => THINK_SLOW[bandOfRank(rank)];

export class RunRules {
  /**
   * @param {object} o
   * @param {'middle'|'senior'} o.trackId
   * @param {object} [o.prog]      progression state (persisted between runs). Created if missing.
   * @param {'ranked'|'practice'|'endless'|'daily'|'revenge'} [o.mode]
   * @param {function} [o.rng]     0..1
   * @param {object} [o.powerups]  charges per run
   */
  constructor(o) {
    this.trackId = o.trackId;
    this.track = TRACKS[o.trackId];
    this.mode = o.mode || 'ranked';
    this.rng = o.rng || Math.random;
    this.prog = o.prog || createState(o.trackId);
    this.progEvents = progStart(this.prog);
    this.hearts = MAX_HEARTS;
    this.charges = { fifty: 1, freeze: 1, heal: 1, skip: 1, ...(o.powerups || {}) };
    this.over = false;
    this.q = null;
    this.timeLeftMs = 0;
    this.timeTotalMs = 0;
    this.frozen = false;
    this.hidden = [];          // option indexes removed by 50:50
    this.score = 0;
    this.correctCount = 0;
    this.answered = 0;
    this.skipped = 0;
    this.log = [];             // per-question record (for the server + game over screen)
    this.wrongs = [];
    this.elapsedMs = 0;
    this.maxStreak = 0;
  }

  get ranked() { return this.mode === 'ranked'; }
  get rank() { return this.ranked ? rankIdx(this.prog) : (this.rankOverride || 0); }
  get inGate() { return this.ranked && this.prog.gateActive; }
  get streak() { return this.prog.streak; }
  /** Speed of the game world: 1 normally, slowed while thinking, 0 when Time Freeze is active. */
  get timeScale() {
    if (this.over) return 1;
    if (!this.q) return 1;
    return this.frozen ? 0 : thinkSlowFactor(this.rank);
  }
  get thinkFraction() { return this.timeTotalMs ? Math.max(0, this.timeLeftMs / this.timeTotalMs) : 0; }
  get gate() {
    if (!this.inGate) return null;
    return { need: gateN(this.rank), done: this.prog.gateDone, wrong: this.prog.gateWrong };
  }

  /** Show a question. q must be normalised by mcq/adapter.js. */
  present(q) {
    if (this.over) throw new Error('run is over');
    this.q = q;
    this.hidden = [];
    this.frozen = false;
    this.timeTotalMs = thinkWindowMs(this.trackId, q.tier, q.calc, this.rank);
    this.timeLeftMs = this.timeTotalMs;
    this.askedAtMs = this.elapsedMs;
    return { thinkMs: this.timeTotalMs, timeScale: this.timeScale };
  }

  /** Advance the think clock (real ms, NOT scaled). Returns the answer() result if time ran out. */
  tick(dtMs) {
    this.elapsedMs += dtMs;
    if (!this.q || this.over) return null;
    this.timeLeftMs -= dtMs;
    if (this.timeLeftMs <= 0) { this.timeLeftMs = 0; return this.answer(null); }
    return null;
  }

  /** pick = option index, or null for a timeout. */
  answer(pick) {
    if (this.over || !this.q) return null;
    const q = this.q;
    const timeout = pick === null || pick === undefined;
    const correct = !timeout && pick === q.correct;
    const ms = Math.round(this.timeTotalMs - this.timeLeftMs);
    const heartsBefore = this.hearts;
    let events = [], gained = 0, healed = false;

    this.answered++;
    if (correct) {
      this.correctCount++;
    }
    if (this.ranked) {
      const r = applyAnswer(this.prog, { correct, tier: q.tier });
      events = r.events; gained = r.gained;
    } else {
      // non-ranked modes track a plain streak; practice scores half
      this.prog.streak = correct ? this.prog.streak + 1 : 0;
    }
    if (correct) {
      const pts = this.ranked ? Math.max(0, gained) : (q.tier === 'E' ? 10 : q.tier === 'M' ? 14 : 20) * (this.mode === 'practice' ? 0.5 : 1);
      this.score += pts;
      this.maxStreak = Math.max(this.maxStreak, this.prog.streak);
    }

    if (!correct && this.mode !== 'practice') this.hearts--;
    // streak 10 -> +1 heart, never inside a gate
    if (correct && this.prog.streak === HEAL_STREAK && this.hearts < MAX_HEARTS && !this.inGate && this.mode !== 'practice') {
      this.hearts++; healed = true; events.push({ type: 'heartRegen' });
    }
    // a freshly started gate always begins with full hearts
    if (events.some((e) => e.type === 'gateStart')) this.hearts = MAX_HEARTS;
    const gateFailed = events.some((e) => e.type === 'gateFail');
    if (gateFailed) this.hearts = 0;

    if (!correct) {
      this.wrongs.push({
        id: q.id, stem: q.stem, options: q.options, correct: q.correct, picked: timeout ? null : pick,
        timeout, explanation: q.explanation || '', subject: q.subject, chapter: q.chapter, tier: q.tier,
      });
    }
    this.log.push({ id: q.id, tier: q.tier, pick: timeout ? null : pick, correct, ms, timeout, hidden: this.hidden.length ? this.hidden.slice() : undefined });

    const result = {
      correct, timeout, correctIndex: q.correct, explanation: q.explanation || '',
      hearts: this.hearts, heartLost: this.hearts < heartsBefore, healed, gained, events,
      streak: this.prog.streak, gameOver: false, gate: this.gate,
    };
    this.q = null; this.frozen = false; this.timeLeftMs = 0; this.timeTotalMs = 0;
    if (this.hearts <= 0 && this.mode !== 'practice') {
      this.over = true; result.gameOver = true;
      result.report = this.finish();
    }
    return result;
  }

  canUse(name) {
    if (this.over || !this.q) return { ok: false, reason: 'no-question' };
    if (!POWERUPS.includes(name)) return { ok: false, reason: 'unknown' };
    if (this.inGate) return { ok: false, reason: 'gate' };          // all power-ups are off in rank gates
    if ((this.charges[name] || 0) <= 0) return { ok: false, reason: 'empty' };
    if (name === 'freeze' && this.frozen) return { ok: false, reason: 'already' };
    if (name === 'fifty' && this.hidden.length) return { ok: false, reason: 'already' };
    if (name === 'heal' && this.hearts >= MAX_HEARTS) return { ok: false, reason: 'full' };
    return { ok: true };
  }

  usePowerup(name) {
    const c = this.canUse(name);
    if (!c.ok) return c;
    this.charges[name]--;
    if (name === 'fifty') {
      const wrong = this.q.options.map((_, i) => i).filter((i) => i !== this.q.correct);
      for (let i = wrong.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [wrong[i], wrong[j]] = [wrong[j], wrong[i]]; }
      this.hidden = wrong.slice(0, 2).sort((a, b) => a - b);
      return { ok: true, hidden: this.hidden.slice() };
    }
    if (name === 'freeze') {
      const extra = FREEZE_EXTRA_SEC[this.trackId] * 1000;
      this.frozen = true; this.timeLeftMs += extra; this.timeTotalMs += extra;
      return { ok: true, extraMs: extra };
    }
    if (name === 'heal') { this.hearts++; return { ok: true, hearts: this.hearts }; }
    // skip: no right/wrong, no points, streak untouched
    this.skipped++;
    this.log.push({ id: this.q.id, tier: this.q.tier, skipped: true });
    this.q = null; this.frozen = false; this.timeLeftMs = 0; this.timeTotalMs = 0;
    return { ok: true, skipped: true };
  }

  /** Close the run (also called on game over / quit). Applies end-of-run demotion rules. */
  finish() {
    const acc = this.answered ? this.correctCount / this.answered : 0;
    let endEvents = [];
    if (this.ranked) endEvents = progEnd(this.prog, { answers: this.answered, correct: this.correctCount });
    this.over = true;
    return {
      mode: this.mode, answered: this.answered, correct: this.correctCount, accuracy: acc,
      score: Math.round(this.score), maxStreak: this.maxStreak, skipped: this.skipped,
      wrongs: this.wrongs, events: endEvents, progress: this.ranked ? this.prog : null,
      log: this.log,
    };
  }
}
