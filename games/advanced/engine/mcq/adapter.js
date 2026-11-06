// MCQ adapter: turns any question shape used on the platform into one normal form.
//   { id, stem, options:[4 strings], correct:0..3, tier:'E'|'M'|'H', calc:boolean, explanation, subject, chapter }
// Also: deterministic option shuffle and a tier-aware pool. No DOM.

const LETTERS = ['a', 'b', 'c', 'd'];

function tierOf(v) {
  if (v === undefined || v === null) return 'M';
  if (typeof v === 'number') return v <= 1 ? 'E' : v === 2 ? 'M' : 'H';
  const s = String(v).trim().toLowerCase();
  if (['e', 'easy', '1', 'low'].includes(s)) return 'E';
  if (['h', 'hard', '3', 'high', 'difficult'].includes(s)) return 'H';
  return 'M';
}

/** Trim an explanation to at most 3 short lines (game over screen). */
export function shortExplanation(text, maxLines = 3) {
  if (!text) return '';
  const lines = String(text).split(/\r?\n|(?<=[.!?])\s+(?=[A-Z])/).map((x) => x.trim()).filter(Boolean);
  return lines.slice(0, maxLines).join(' ');
}

/**
 * Normalise one raw question. Returns null (and sets reason via the optional sink) if unusable.
 * Accepts: question|stem|q|text ; options|choices|opts as array or {a,b,c,d} or optionA..optionD ;
 * answer|correct|correctIndex|correct_option as index, letter, or the option text.
 */
export function normalize(raw, sink) {
  const fail = (why) => { if (sink) sink.push({ id: raw && raw.id, why }); return null; };
  if (!raw || typeof raw !== 'object') return fail('not an object');
  const stem = raw.stem ?? raw.question ?? raw.q ?? raw.text;
  if (!stem || !String(stem).trim()) return fail('no stem');

  let options = raw.options ?? raw.choices ?? raw.opts;
  if (options && !Array.isArray(options) && typeof options === 'object') {
    options = LETTERS.map((l) => options[l] ?? options[l.toUpperCase()]);
  }
  if (!options) options = ['optionA', 'optionB', 'optionC', 'optionD'].map((k) => raw[k] ?? raw[k.toLowerCase()] ?? raw['option_' + k.slice(-1).toLowerCase()]);
  options = (options || []).map((o) => (o === undefined || o === null ? '' : String(o).trim()));
  if (options.length !== 4 || options.some((o) => !o)) return fail('need exactly 4 non-empty options');
  if (new Set(options.map((o) => o.toLowerCase())).size !== 4) return fail('duplicate options');

  const a = raw.correct ?? raw.answer ?? raw.correctIndex ?? raw.correct_option ?? raw.ans;
  let correct = -1;
  if (typeof a === 'number' && a >= 0 && a <= 3) correct = a;
  else if (typeof a === 'string') {
    const t = a.trim();
    const li = LETTERS.indexOf(t.toLowerCase());
    if (t.length === 1 && li >= 0) correct = li;
    else if (/^[0-3]$/.test(t)) correct = Number(t);
    else correct = options.findIndex((o) => o.toLowerCase() === t.toLowerCase());
  }
  if (correct < 0) return fail('cannot resolve correct option');

  return {
    id: String(raw.id ?? hash(stem + options.join('|'))),
    stem: String(stem).trim(),
    options,
    correct,
    tier: tierOf(raw.tier ?? raw.difficulty ?? raw.level),
    calc: !!(raw.calc ?? raw.calculation ?? raw.numerical),
    explanation: shortExplanation(raw.explanation ?? raw.exp ?? raw.solution ?? ''),
    subject: raw.subject || '',
    chapter: raw.chapter || raw.topic || '',
  };
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 'q' + (h >>> 0).toString(36);
}

/** Return a copy with options shuffled; `correct` follows the right option. */
export function shuffleOptions(q, rng = Math.random) {
  const idx = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return { ...q, options: idx.map((i) => q.options[i]), correct: idx.indexOf(q.correct) };
}

export function normalizeAll(list, sink) {
  const out = [];
  for (const r of list || []) { const n = normalize(r, sink); if (n) out.push(n); }
  return out;
}

/** Pool that hands out questions by tier without repeating until a tier is exhausted. */
export class QuestionPool {
  constructor(questions, rng = Math.random) {
    this.rng = rng;
    this.byTier = { E: [], M: [], H: [] };
    for (const q of questions) this.byTier[q.tier].push(q);
    this.used = new Set();
  }
  get size() { return this.byTier.E.length + this.byTier.M.length + this.byTier.H.length; }

  /** Next question of `tier`; falls back to the nearest tier if empty. Options are shuffled. */
  next(tier = 'M', { exclude } = {}) {
    const order = { E: ['E', 'M', 'H'], M: ['M', 'E', 'H'], H: ['H', 'M', 'E'] }[tier];
    for (const t of order) {
      let cand = this.byTier[t].filter((q) => !this.used.has(q.id) && !(exclude && exclude.has(q.id)));
      if (!cand.length && this.byTier[t].length) {            // tier exhausted: recycle it
        for (const q of this.byTier[t]) this.used.delete(q.id);
        cand = this.byTier[t].filter((q) => !(exclude && exclude.has(q.id)));
      }
      if (cand.length) {
        const q = cand[Math.floor(this.rng() * cand.length)];
        this.used.add(q.id);
        return shuffleOptions(q, this.rng);
      }
    }
    return null;
  }
}
