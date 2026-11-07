// Question bank loader for the Advanced Games.
// The questions come from the same banks as the regular chapter games (games/classes/**/banks/{mcq-arena,speed-challenge}.json),
// pre-converted by tools/build_questions.py into small per-subject files under games/advanced/questions/ (+ index.json).
//
// Which subjects does a student get?
//   Class 6-8  -> every subject of the class (they are enrolled in the whole class).
//   Class 9-12 -> only the subjects in their enrolledScope (SUBJ-PHYS-C12 ...), read from the dashboard cache the rest of the site uses.
//                 If the scope is unknown (e.g. the local sandbox) every subject we have is used.
// Class 9 and 11 have no banks yet: they borrow the nearest class of the same stage (9 -> 10, 11 -> 10/12), per subject.
// A student whose enrolled subjects have no bank at all still gets the nearest class's subjects (never an empty game).

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

function storedScope() {
  try {
    const c = JSON.parse(localStorage.getItem('wha:dashboard_cache') || 'null');
    return c && c.data && c.data.profile && c.data.profile.enrolledScope || '';
  } catch (e) { return ''; }
}

/** Decide which (class, subject) files to load. Pure: index + class + subject keys (or null). */
export function planFiles(index, cls, subjectKeys) {
  const have = index.classes || {};
  const classes = Object.keys(have).map(Number);
  const near = (c) => classes.filter((x) => (c >= 9 ? x >= 9 : x === c)).sort((a, b) => Math.abs(a - c) - Math.abs(b - c) || a - b);
  const order = near(cls);
  const allKeys = [...new Set(order.flatMap((c) => Object.keys(have[c])))];
  const pickFor = (keys) => keys.map((k) => { const c = order.find((x) => have[x][k]); return c ? { cls: c, key: k, ...have[c][k] } : null; }).filter(Boolean);
  let files = pickFor(subjectKeys && subjectKeys.length ? subjectKeys : allKeys);
  if (!files.length && order.length) files = Object.keys(have[order[0]]).map((k) => ({ cls: order[0], key: k, ...have[order[0]][k] }));
  return files;
}

function toRaw(file, data) {
  return data.q.map((r) => ({ id: r[0], stem: r[1], options: r[2], correct: r[3], tier: TIER[r[4]] || 'M', calc: !!r[7], explanation: r[6] || '', subject: data.name, chapter: data.chapters[r[5]] || '' }));
}

/** Load the raw question list for a class (cached). Rejects if the files cannot be fetched. */
export async function loadBankQuestions(cls, scope) {
  const index = await getIndex();
  const files = planFiles(index, Number(cls), parseScope(scope === undefined ? storedScope() : scope));
  if (!files.length) throw new Error('No questions available for this class yet.');
  const key = files.map((f) => f.file).join('|');
  if (!cache.has(key)) cache.set(key, Promise.all(files.map(async (f) => toRaw(f, await getJson(f.file)))).then((a) => a.flat()).catch((e) => { cache.delete(key); throw e; }));
  return cache.get(key);
}
