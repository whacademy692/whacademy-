// Question bank loader for the Advanced Games.
// The questions come from the same banks as the regular chapter games (games/classes/**/banks/{mcq-arena,speed-challenge}.json),
// pre-converted by tools/build_questions.py into small per-subject files under games/advanced/questions/ (+ index.json).
//
// Which questions does a student get?  Strictly their OWN board, their OWN class, their ENROLLED subjects. Nothing is borrowed.
//   Board    : BOARD-PUNJAB* -> punjab, BOARD-KPK -> kpk, BOARD-OLEVEL -> olevel; no board token -> class 6-8 = apsacs, class 9-12 = federal.
//   Class    : exactly the student's class (no "nearest class" borrowing).
//   Subjects : Class 6-8 (FULL-Cxx) -> every subject the board has for that class. Class 9-12 -> only the subjects in the enrolledScope
//              (SUBJ-PHYS-C12 ...), read from the dashboard cache the rest of the site uses. Scope unknown -> every subject the board has.
// Files live in games/advanced/questions/<board>/<class>-<subject>.json and are listed in index.json -> boards.<board>.<class>.<subject>.
// A student whose board/class/subjects have no question file gets a friendly "not ready yet" message (error.noBank) - never another board's questions.

const BASE = new URL('../../questions/', import.meta.url);
const CODE_TO_KEY = { PHYS: 'phys', CHEM: 'chem', BIO: 'bio', MATH: 'math', CS: 'cs', SCI: 'science', GEO: 'geography', HIST: 'history' };
const TIER = ['E', 'M', 'H'];
const cache = new Map();
let indexP = null;

async function getJson(name) {
  const r = await fetch(new URL(name, BASE));
  if (!r.ok) throw new Error('Could not load questions (' + name + ' ' + r.status + ')');
  return r.json();
}
const getIndex = () => (indexP = indexP || getJson('index.json').catch((e) => { indexP = null; throw e; }));

/** Subject keys the student may play, or null when unknown (= all). Pure: takes the scope string. */
export function parseScope(scope) {
  const raw = String(scope || '').trim().toUpperCase();
  if (!raw) return null;
  let full = false; const keys = [];
  for (const tok of raw.split(',').map((t) => t.trim()).filter(Boolean)) {
    const p = tok.split('-');
    if (p[0] === 'FULL') full = true;
    else if (p[0] === 'SUBJ' && CODE_TO_KEY[p[1]] && !keys.includes(CODE_TO_KEY[p[1]])) keys.push(CODE_TO_KEY[p[1]]);
  }
  return full ? null : keys.length ? keys : null;
}

/** Board named by a scope string: 'punjab' | 'kpk' | 'olevel', or null when it carries no board token. Pure. */
export function parseBoard(scope) {
  const m = /(^|,)\s*BOARD-(PUNJAB|KPK|OLEVEL)(-[A-Z]+)?\s*(?=,|$)/.exec(String(scope || '').toUpperCase());
  return m ? m[2].toLowerCase() : null;
}

/** The board whose question files a student reads: the scope's board, else apsacs (class 6-8) / federal (class 9-12). Pure. */
export function boardFor(scope, cls) {
  return parseBoard(scope) || (Number(cls) <= 8 ? 'apsacs' : 'federal');
}

function storedScope() {
  try {
    const c = JSON.parse(localStorage.getItem('wha:dashboard_cache') || 'null');
    return c && c.data && c.data.profile && c.data.profile.enrolledScope || '';
  } catch (e) { return ''; }
}

/** Decide which (class, subject) files to load. Pure: index + class + subject keys (or null = all) + board. Own board and class only. */
export function planFiles(index, cls, subjectKeys, board) {
  const own = (index.boards && index.boards[board] && index.boards[board][cls]) || null;
  if (!own) return [];
  const want = subjectKeys && subjectKeys.length ? subjectKeys : Object.keys(own);
  return want.filter((k) => own[k]).map((k) => ({ cls, key: k, board, ...own[k] }));
}

function toRaw(file, data) {
  return data.q.map((r) => ({ id: r[0], stem: r[1], options: r[2], correct: r[3], tier: TIER[r[4]] || 'M', calc: !!r[7], explanation: r[6] || '', subject: data.name, chapter: data.chapters[r[5]] || '' }));
}

/** Load the raw question list for a class (cached). Rejects if the files cannot be fetched. */
export async function loadBankQuestions(cls, scope) {
  const index = await getIndex();
  const sc = scope === undefined ? storedScope() : scope;
  const files = planFiles(index, Number(cls), parseScope(sc), boardFor(sc, cls));
  if (!files.length) { const e = new Error('Advanced Games questions for your subjects are not ready yet. We are adding them soon.'); e.noBank = true; throw e; }
  const key = files.map((f) => f.file).join('|');
  if (!cache.has(key)) cache.set(key, Promise.all(files.map(async (f) => toRaw(f, await getJson(f.file)))).then((a) => a.flat()).catch((e) => { cache.delete(key); throw e; }));
  return cache.get(key);
}
