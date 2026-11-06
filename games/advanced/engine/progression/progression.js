// Progression brain: XP bar, levels, rank gates, demotion, comeback, placement.
// Pure functions over a plain JSON state. No DOM, no randomness, no clocks.
// Used by the browser games AND (later) server-side to replay answer logs for anti-cheat.
// Numbers are a direct port of the validated simulator (sim3.py) in Master Plan v1.1.

import {
  TRACKS, BASE_POINTS, GATE_MAX_WRONG, GRACE_ANSWERS, COMEBACK_WINDOW, COMEBACK_BOOST_ANSWERS,
  levelTarget, rankOfLevel, rankFloor, rankLast, isTopRank, gateN, streakMult,
} from './ranks.js';

export const PENALTY_FRAC = 0.35;      // Senior: share of base points lost from the bar on a wrong answer
export const LEVEL_DROP_FILL = 0.7;    // after a level drop the bar restarts at 70% of that level's target
export const DEMOTION_ACC = 0.4;       // ranked run accuracy below this counts as a "low" run
export const DEMOTION_MIN_ANSWERS = 10;

export function createState(trackId, opts = {}) {
  const track = TRACKS[trackId];
  if (!track) throw new Error('unknown track ' + trackId);
  const level = Math.max(1, Math.min(track.cap, opts.level || 1));
  return {
    track: trackId,
    level,
    meter: 0,
    streak: 0,
    boost: 0,              // comeback boosted answers remaining
    graceLeft: 0,          // answers left in post rank-up grace
    recent: [],            // last <=20 results (1/0)
    gateActive: false,
    gateDone: 0,
    gateWrong: 0,
    gatePending: false,    // bar full at gate level, waiting for the player to (re)start the gate
    lowRuns: 0,
    warned: false,
    answers: 0,
    maxLevel: level,
  };
}

export const trackOf = (state) => TRACKS[state.track];
export const rankIdx = (state) => rankOfLevel(trackOf(state), state.level);
export const targetOf = (state) => levelTarget(trackOf(state), state.level);
export const clone = (s) => JSON.parse(JSON.stringify(s));

/** Start of a new run: streak resets; a pending gate begins immediately. */
export function startRun(state) {
  const ev = [];
  state.streak = 0;
  if (state.gatePending) startGate(state, ev);
  else { state.gateActive = false; state.gateDone = 0; state.gateWrong = 0; }
  return ev;
}

function startGate(state, ev) {
  state.gateActive = true;
  state.gatePending = false;
  state.gateDone = 0;
  state.gateWrong = 0;
  state.streak = 0;
  state.meter = targetOf(state);
  ev.push({ type: 'gateStart', rank: rankIdx(state), need: gateN(rankIdx(state)), maxWrong: GATE_MAX_WRONG });
}

/**
 * Apply one answer. Mutates `state`, returns { gained, events }.
 * answer = { correct:boolean, tier:'E'|'M'|'H' }
 * opts.grace (default GRACE_ANSWERS), opts.autoRetryGate (sim only: restart a failed gate at once)
 */
export function applyAnswer(state, answer, opts = {}) {
  const track = trackOf(state);
  const graceN = opts.grace ?? GRACE_ANSWERS;
  const ev = [];
  const ok = !!answer.correct;
  const base = BASE_POINTS[answer.tier] || BASE_POINTS.M;
  let gained = 0;

  state.answers++;
  state.recent.push(ok ? 1 : 0);
  if (state.recent.length > COMEBACK_WINDOW) state.recent.shift();
  if (state.graceLeft > 0) state.graceLeft--;

  if (ok) {
    state.streak++;
    let mu = streakMult(state.streak);
    if (state.boost > 0) { mu = Math.min(2.5, mu + 0.5); state.boost--; }
    if (!state.gateActive) { gained = base * mu; state.meter += gained; }
    if (state.streak === 3 || state.streak === 6 || state.streak === 10 || state.streak === 15) {
      ev.push({ type: 'streakTier', streak: state.streak, mult: streakMult(state.streak) });
    }
  } else {
    state.streak = 0;
    if (track.penalty && !state.gateActive && state.graceLeft <= 0) {
      state.meter -= PENALTY_FRAC * base;
      gained = -PENALTY_FRAC * base;
      if (state.meter < 0) {
        const floorLvl = rankFloor(track, rankIdx(state));
        if (state.level > floorLvl) {
          state.level--;
          state.meter = LEVEL_DROP_FILL * targetOf(state);
          ev.push({ type: 'levelDown', level: state.level });
        } else state.meter = 0;
      }
    }
  }

  // Comeback boost (after a slump)
  if (state.recent.length === COMEBACK_WINDOW && sum(state.recent) < 10 && ok && state.streak >= 3 && state.boost === 0) {
    state.boost = COMEBACK_BOOST_ANSWERS;
    ev.push({ type: 'comeback', answers: COMEBACK_BOOST_ANSWERS });
  }

  // Gate bookkeeping
  if (state.gateActive) {
    if (ok) state.gateDone++; else state.gateWrong++;
    const r = rankIdx(state);
    if (state.gateWrong > GATE_MAX_WRONG) {
      state.gateActive = false;
      state.gateDone = 0;
      state.gateWrong = 0;
      state.meter = targetOf(state);      // bar stays full, retry unlimited
      state.gatePending = true;
      ev.push({ type: 'gateFail', rank: r });
      if (opts.autoRetryGate) startGate(state, ev);
    } else if (state.gateDone >= gateN(r)) {
      state.gateActive = false;
      state.gateDone = 0;
      state.gateWrong = 0;
      state.level++;
      state.meter = 0;
      state.maxLevel = Math.max(state.maxLevel, state.level);
      state.graceLeft = graceN;
      state.lowRuns = 0; state.warned = false;
      ev.push({ type: 'gatePass', rank: r }, { type: 'rankUp', rank: r + 1, level: state.level });
    }
  }

  // Level-up loop (bar overflow)
  if (!state.gateActive && !state.gatePending) {
    while (state.meter >= targetOf(state)) {
      const r = rankIdx(state);
      if (isTopRank(track, r)) {
        if (state.level >= track.cap) { state.meter = targetOf(state); break; }
        state.meter -= targetOf(state); state.level++;
        state.maxLevel = Math.max(state.maxLevel, state.level);
        ev.push({ type: 'levelUp', level: state.level });
        continue;
      }
      if (state.level === rankLast(track, r)) {          // gate level: bar full -> gate
        state.meter = targetOf(state);
        startGate(state, ev);
        break;
      }
      state.meter -= targetOf(state);
      state.level++;
      state.maxLevel = Math.max(state.maxLevel, state.level);
      ev.push({ type: 'levelUp', level: state.level });
    }
  }
  return { gained, events: ev };
}

/**
 * End of a RANKED run. Handles the Senior demotion rule:
 * on the floor level AND 2 consecutive runs < 40% AND a prior warning.
 * summary = { answers:number, correct:number }
 */
export function endRun(state, summary) {
  const track = trackOf(state);
  const ev = [];
  state.streak = 0;
  if (state.gateActive) {                     // abandoned/lost gate attempt
    state.gateActive = false; state.gateDone = 0; state.gateWrong = 0;
    state.meter = targetOf(state); state.gatePending = true;
  }
  if (!track.penalty || !summary || summary.answers < DEMOTION_MIN_ANSWERS) return ev;
  const r = rankIdx(state);
  const onFloor = r > 0 && state.level === rankFloor(track, r);
  const acc = summary.correct / summary.answers;
  if (onFloor && state.graceLeft <= 0 && acc < DEMOTION_ACC) {
    state.lowRuns++;
    if (state.lowRuns >= 2 && state.warned) {
      state.level = rankLast(track, r - 1);
      state.meter = 0.5 * targetOf(state);
      state.boost = COMEBACK_BOOST_ANSWERS;
      state.lowRuns = 0; state.warned = false; state.gatePending = false;
      ev.push({ type: 'rankDown', rank: r - 1, level: state.level }, { type: 'comeback', answers: COMEBACK_BOOST_ANSWERS });
    } else {
      state.warned = true;
      ev.push({ type: 'demotionWarning', rank: r });
    }
  } else {
    state.lowRuns = 0; state.warned = false;
  }
  return ev;
}

/** Replay a stored answer log (server anti-cheat). Entries: {correct,tier} or {endRun:true,answers,correct} or {startRun:true}. */
export function replay(state, log, opts = {}) {
  const events = [];
  for (const e of log) {
    if (e.startRun) events.push(...startRun(state));
    else if (e.endRun) events.push(...endRun(state, e));
    else events.push(...applyAnswer(state, e, opts).events);
  }
  return { state, events };
}

// ---------- Placement Run (15 adaptive questions, level 1..9) ----------
export const PLACEMENT_QUESTIONS = 15;
export const PLACEMENT_MAX_LEVEL = 9;
const TIERS = ['E', 'M', 'H'];

/** Next tier for the placement run: 2 correct in a row go up, a wrong goes down. history=[{tier,correct}] */
export function placementNextTier(history) {
  if (!history.length) return 'M';
  // replay the walk so it is deterministic from the log alone
  let ti = 1, run = 0;
  for (const h of history) {
    if (h.correct) { run++; if (run >= 2 && ti < 2) { ti++; run = 0; } }
    else { run = 0; if (ti > 0) ti--; }
  }
  return TIERS[ti];
}
/** Final start level from the placement log. Gates ahead are still required. */
export function placementLevel(history) {
  let pts = 0;
  for (const h of history) if (h.correct) pts += BASE_POINTS[h.tier] || 0;
  return Math.max(1, Math.min(PLACEMENT_MAX_LEVEL, 1 + Math.floor(pts / 22)));
}

const sum = (a) => a.reduce((x, y) => x + y, 0);
