/**
 * katex-render.js — W.H. Academy
 * A tiny wrapper around the self-hosted KaTeX build (assets/vendor/katex).
 *
 * WHY IT EXISTS:
 *   Boss-Battle "steps" questions are authored in LaTeX (plan §5). The page's
 *   CSP is `default-src 'self'`, so KaTeX is SELF-HOSTED (no CDN) and loaded as
 *   the global `katex`. This helper renders mixed content — ordinary words with
 *   inline math wrapped in $…$ — the way a teacher naturally writes a step:
 *
 *       "Multiply both sides by $\frac{1}{2}$"
 *
 *   Text outside the $…$ is HTML-escaped; each $…$ span is rendered with KaTeX.
 *   If KaTeX has not loaded (or an expression is malformed) it degrades to the
 *   escaped source text instead of throwing — a step is always readable.
 *
 * PUBLIC API (global `MathText`):
 *   MathText.toHtml(str)   -> safe HTML string (escaped text + rendered math)
 *   MathText.render(root)  -> renders every [data-math] element under `root`
 *                             (uses the element's data-math attribute, else its
 *                             textContent) and marks it done so it is idempotent.
 */
(function (global) {
  'use strict';

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderExpr(expr) {
    // Uses the self-hosted global. throwOnError:false → a bad formula shows its
    // own source rather than crashing the whole paper.
    if (global.katex && typeof global.katex.renderToString === 'function') {
      try {
        return global.katex.renderToString(expr, { throwOnError: false, displayMode: false });
      } catch (e) {
        return escapeHtml(expr);
      }
    }
    return escapeHtml(expr);   // KaTeX not present → plain, still readable
  }

  /**
   * Splits on unescaped `$` and alternates plain-text / math segments.
   * `\$` is treated as a literal dollar sign. An unclosed `$` renders the
   * remainder as text so nothing is lost.
   */
  function toHtml(str) {
    const src = String(str == null ? '' : str);
    // No $ delimiters at all: if the text carries a math signal (^ _ \), render
    // the WHOLE thing as math (so "x^2+1" works without dollars); otherwise it's
    // plain prose — escape it. This keeps word-answers like "None of these" text.
    if (src.indexOf('$') === -1) {
      if (/[\^_\\]/.test(src)) return renderExpr(src);
      return escapeHtml(src).replace(/\n/g, '<br>');
    }
    let out = '';
    let i = 0;
    let inMath = false;
    let buf = '';
    while (i < src.length) {
      const ch = src[i];
      if (ch === '\\' && src[i + 1] === '$') { buf += '$'; i += 2; continue; } // literal $
      if (ch === '$') {
        if (!inMath) { out += escapeHtml(buf).replace(/\n/g, '<br>'); buf = ''; inMath = true; }
        else { out += renderExpr(buf); buf = ''; inMath = false; }
        i++; continue;
      }
      buf += ch; i++;
    }
    // Flush the tail. If we were still "in math" (unclosed $), treat as text.
    if (inMath) out += escapeHtml('$' + buf).replace(/\n/g, '<br>');
    else out += escapeHtml(buf).replace(/\n/g, '<br>');
    return out;
  }

  function render(root) {
    const scope = root || document;
    const nodes = scope.querySelectorAll('[data-math]:not([data-math-done])');
    nodes.forEach(function (node) {
      const src = node.getAttribute('data-math');
      node.innerHTML = toHtml(src != null ? src : node.textContent);
      node.setAttribute('data-math-done', '1');
    });
  }

  global.MathText = { toHtml: toHtml, render: render };
})(window);
