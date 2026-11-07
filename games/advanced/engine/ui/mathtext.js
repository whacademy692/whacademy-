// Shows question text that may contain LaTeX written as \( ... \) or \[ ... \] (the platform banks use it).
// Plain text is set with textContent (safe, fast). Maths is rendered with the self-hosted KaTeX (games/assets/vendor/katex),
// loaded on demand the first time a maths question appears. While it loads, or if it fails, the formula shows as readable text.

const MATH = /\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g;
const ROOT = new URL('../../../assets/vendor/katex/', import.meta.url);
let loading = null;

export const hasMath = (s) => /\\\(|\\\[/.test(String(s));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** The text with the \( \) markers removed (used until KaTeX is ready). */
export const plainMath = (s) => String(s).replace(MATH, (m, a, b) => a || b);

function ensureKatex() {
  if (window.katex) return Promise.resolve(true);
  if (loading) return loading;
  loading = new Promise((resolve) => {
    try {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('katex.min.css', ROOT).href; document.head.appendChild(l);
      const s = document.createElement('script'); s.src = new URL('katex.min.js', ROOT).href;
      s.onload = () => resolve(!!window.katex); s.onerror = () => { loading = null; resolve(false); };
      document.head.appendChild(s);
    } catch (e) { loading = null; resolve(false); }
  });
  return loading;
}

function html(text) {
  let out = '', last = 0, m;
  MATH.lastIndex = 0;
  while ((m = MATH.exec(text))) {
    out += esc(text.slice(last, m.index));
    try { out += window.katex.renderToString(m[1] || m[2], { throwOnError: false, displayMode: false }); } catch (e) { out += esc(m[1] || m[2]); }
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

/** Put `text` into `el`. */
export function setMath(el, text) {
  const t = String(text == null ? '' : text);
  el.__mt = t;
  if (!hasMath(t)) { el.textContent = t; return; }
  if (window.katex) { el.innerHTML = html(t); return; }
  el.textContent = plainMath(t);
  ensureKatex().then((ok) => { if (ok && el.__mt === t) { el.innerHTML = html(t); window.dispatchEvent(new Event('wha-math')); } });
}

// ---- keep long questions / answers from covering the game ----
// Shrinks the text (CSS variable --fit, 1 -> min) until the question and the answer buttons fit in their share of the screen.
let lastFit = null;
function fitEl(el, maxPx, min) {
  let s = 1; el.style.setProperty('--fit', '1');
  while (s > min && el.getBoundingClientRect().height > maxPx) { s = Math.round((s - 0.05) * 100) / 100; el.style.setProperty('--fit', String(s)); }
}
export function fitQuestionUi(qEl, optsEl) {
  lastFit = [qEl, optsEl];
  const H = window.innerHeight, land = matchMedia('(orientation:landscape) and (max-height:560px)').matches;
  fitEl(optsEl, land ? H * 0.84 : H * 0.27, 0.6);
  fitEl(qEl, land ? H * 0.62 : H * 0.2, 0.7);
}
window.addEventListener('wha-math', () => { if (lastFit) fitQuestionUi(lastFit[0], lastFit[1]); });
