/**
 * progress.js — W.H. Academy · "My Progress" page
 * Two views of the student's own game performance:
 *   1) Accuracy-over-time line graph (X = time, Y = accuracy %). The line's
 *      colour follows its height — green up high, red down low — so a dip is
 *      obvious. Filter by TIME (daily / weekly / monthly) and by
 *      class / subject / chapter (cascading, from the student's own data).
 *      A live caption shows exactly how many attempts (and buckets) the graph
 *      is drawn from, so even one game already shows something.
 *   2) Per-chapter bars, each expandable to per-topic bars.
 * Data: analytics/myBreakdown → { chapters, trend }.
 */
(function () {
  'use strict';

  var SUBJECT_NAMES = {
    math: 'Mathematics', science: 'General Science', geography: 'Geography', history: 'History',
    bio: 'Biology', chem: 'Chemistry', cs: 'Computer Science', phys: 'Physics'
  };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function color(a) { return a < 0.5 ? '#ef4444' : (a < 0.75 ? '#f59e0b' : '#22c55e'); }
  function humanize(s) { return String(s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function chapterTitle(ref) { return humanize(String(ref).split('/').pop()); }
  function subjectLabel(k) { return SUBJECT_NAMES[k] || humanize(k); }
  function parseRef(ref) {
    var p = String(ref).split('/');
    var cl = null;
    if (p[0] && p[0].indexOf('class') === 0) { var n = parseInt(p[0].replace('class', ''), 10); cl = isNaN(n) ? null : n; }
    return { classLevel: cl, subjectKey: p.length >= 3 ? p[2] : '' };
  }
  function distinct(arr) { var s = {}, o = []; arr.forEach(function (x) { if (x != null && x !== '' && !s[x]) { s[x] = 1; o.push(x); } }); return o; }

  // ---------- date helpers (used by the daily/weekly/monthly buckets) ----------
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function toUTCDate(s) { var p = String(s).split('-'); return new Date(Date.UTC(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10))); }
  function dayLabel(s) { var p = String(s).split('-'); return p.length === 3 ? (parseInt(p[2], 10) + ' ' + (MONTHS[parseInt(p[1], 10) - 1] || '')) : s; }
  function mondayOf(d) { var day = d.getUTCDay(); var diff = (day === 0 ? -6 : 1 - day); var m = new Date(d.getTime()); m.setUTCDate(d.getUTCDate() + diff); return m; }
  function keyStr(d) { return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()); }

  // Turn a YYYY-MM-DD row date into a {key,label} bucket for the chosen range.
  function bucketOf(dateStr, gran) {
    if (!dateStr || String(dateStr).length !== 10) return null;
    if (gran === 'week') {
      var m = mondayOf(toUTCDate(dateStr)); var k = keyStr(m);
      return { key: k, label: 'wk ' + dayLabel(k) };
    }
    if (gran === 'month') {
      var p = String(dateStr).split('-');
      var k2 = p[0] + '-' + p[1];
      return { key: k2, label: (MONTHS[parseInt(p[1], 10) - 1] || '') + " '" + p[0].slice(2) };
    }
    return { key: dateStr, label: dayLabel(dateStr) }; // daily (default)
  }

  // ---------- accuracy-over-time line chart ----------
  var trendRows = [];      // [{chapterRef, date, total, correct}] — has dates
  var chapterMeta = [];    // [{chapterRef}] — every attempted chapter, even if trend has no dated rows

  function granularity() { var el = Utils.qs('#trend-range'); return (el && el.value) || 'day'; }

  function buildTrendFilters() {
    var cSel = Utils.qs('#trend-class'), sSel = Utils.qs('#trend-subject'), chSel = Utils.qs('#trend-chapter');
    if (!cSel || !sSel || !chSel) return;

    // Dropdowns are built from the UNION of trend rows AND the chapter list, so
    // a chapter the student has attempted shows up even if its dated trend rows
    // are missing — no chapter silently disappears from the filters.
    var refs = distinct(
      trendRows.map(function (r) { return r.chapterRef; })
        .concat(chapterMeta.map(function (c) { return c.chapterRef; }))
    );
    var meta = refs.map(function (ref) { var m = parseRef(ref); return { classLevel: m.classLevel, subjectKey: m.subjectKey, chapterRef: ref }; });

    var curC = cSel.value, curS = sSel.value, curCh = chSel.value;

    var classes = distinct(meta.map(function (m) { return m.classLevel; })).sort(function (a, b) { return a - b; });
    cSel.innerHTML = '<option value="">All classes</option>' + classes.map(function (c) { return '<option value="' + c + '">Class ' + c + '</option>'; }).join('');
    cSel.value = classes.map(String).indexOf(curC) >= 0 ? curC : '';

    var subs = distinct(meta.filter(function (m) { return !cSel.value || String(m.classLevel) === cSel.value; }).map(function (m) { return m.subjectKey; })).sort();
    sSel.innerHTML = '<option value="">All subjects</option>' + subs.map(function (k) { return '<option value="' + k + '">' + subjectLabel(k) + '</option>'; }).join('');
    sSel.value = subs.indexOf(curS) >= 0 ? curS : '';

    var chaps = distinct(meta.filter(function (m) { return (!cSel.value || String(m.classLevel) === cSel.value) && (!sSel.value || m.subjectKey === sSel.value); }).map(function (m) { return m.chapterRef; }));
    chSel.innerHTML = '<option value="">All chapters</option>' + chaps.map(function (r) { return '<option value="' + r + '">' + chapterTitle(r) + '</option>'; }).join('');
    chSel.value = chaps.indexOf(curCh) >= 0 ? curCh : '';
  }

  function computeSeries() {
    var c = Utils.qs('#trend-class').value, s = Utils.qs('#trend-subject').value, ch = Utils.qs('#trend-chapter').value;
    var gran = granularity();
    var byBucket = {}; // key -> { key, label, total, correct }
    trendRows.forEach(function (r) {
      var m = parseRef(r.chapterRef);
      if (c && String(m.classLevel) !== c) return;
      if (s && m.subjectKey !== s) return;
      if (ch && r.chapterRef !== ch) return;
      var b = bucketOf(r.date, gran);
      if (!b) return;
      if (!byBucket[b.key]) byBucket[b.key] = { key: b.key, label: b.label, total: 0, correct: 0 };
      byBucket[b.key].total += r.total; byBucket[b.key].correct += r.correct;
    });
    return Object.keys(byBucket).sort().map(function (k) {
      var x = byBucket[k];
      return { key: k, label: x.label, accuracy: x.total ? x.correct / x.total : 0, attempts: x.total };
    });
  }

  function lineChartSVG(points) {
    var W = 600, H = 240, padL = 40, padR = 14, padT = 14, padB = 34;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var n = points.length;
    function X(i) { return n <= 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW; }
    function Y(a) { return padT + (1 - a) * plotH; }

    var grid = '';
    [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
      var yy = Y(v);
      grid += '<line x1="' + padL + '" y1="' + yy + '" x2="' + (W - padR) + '" y2="' + yy + '" stroke="#e6e6f0" stroke-width="1"/>';
      grid += '<text x="' + (padL - 6) + '" y="' + (yy + 3) + '" text-anchor="end" font-size="10" fill="#6b7280">' + Math.round(v * 100) + '%</text>';
    });

    var step = n <= 6 ? 1 : Math.ceil(n / 5);
    var xlab = '';
    points.forEach(function (pt, i) {
      if (i % step === 0 || i === n - 1) {
        xlab += '<text x="' + X(i) + '" y="' + (H - padB + 16) + '" text-anchor="middle" font-size="10" fill="#6b7280">' + pt.label + '</text>';
      }
    });

    var defs = '<defs><linearGradient id="accGrad" x1="0" y1="' + padT + '" x2="0" y2="' + (padT + plotH) + '" gradientUnits="userSpaceOnUse">' +
      '<stop offset="0" stop-color="#22c55e"/><stop offset="0.5" stop-color="#f59e0b"/><stop offset="1" stop-color="#ef4444"/></linearGradient></defs>';

    var line = '';
    if (n >= 2) {
      var pts = points.map(function (pt, i) { return X(i) + ',' + Y(pt.accuracy); }).join(' ');
      line = '<polyline points="' + pts + '" fill="none" stroke="url(#accGrad)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
    }
    var dots = points.map(function (pt, i) {
      return '<circle cx="' + X(i) + '" cy="' + Y(pt.accuracy) + '" r="' + (n === 1 ? 4 : 3) + '" fill="' + color(pt.accuracy) + '"><title>' + pt.label + ': ' + Math.round(pt.accuracy * 100) + '% (' + pt.attempts + ' attempts)</title></circle>';
    }).join('');

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Accuracy over time">' + defs + grid + line + dots + xlab + '</svg>';
  }

  function renderCaption(pts) {
    var meta = Utils.qs('#trend-meta');
    if (!meta) return;
    if (!pts.length) { meta.textContent = ''; return; }
    var gran = granularity();
    var totalAttempts = pts.reduce(function (a, p) { return a + p.attempts; }, 0);
    var unit = gran === 'week' ? 'week' : (gran === 'month' ? 'month' : 'day');
    var bucketWord = pts.length === 1 ? unit : unit + 's';
    meta.textContent = 'Graph based on ' + totalAttempts + ' question' + (totalAttempts === 1 ? '' : 's') +
      ' across ' + pts.length + ' ' + bucketWord + '. It updates automatically as you play more.';
  }

  function renderTrend() {
    var host = Utils.qs('#trend-chart');
    if (!host) return;
    var pts = computeSeries();
    if (!pts.length) {
      host.innerHTML = '<p class="trend-empty">No attempts for this selection yet — play a game (even one) and your trend appears here.</p>';
      renderCaption([]);
      return;
    }
    host.innerHTML = lineChartSVG(pts);
    renderCaption(pts);
  }

  // ---------- per-chapter bars ----------
  function renderChapters(chapters) {
    var status = Utils.qs('#progress-status');
    var list = Utils.qs('#progress-list');
    if (!list) return;
    list.innerHTML = '';
    if (!chapters || !chapters.length) {
      if (status) status.textContent = 'Play a few games and your chapter-by-chapter progress will appear here.';
      return;
    }
    if (status) status.remove();

    chapters.forEach(function (c) {
      var pctText = c.lowSample ? 'keep going' : Utils.formatPercent(c.accuracy);
      var head = Utils.createEl('div', { class: 'prog__head' }, [
        Utils.createEl('span', { class: 'prog__name', text: chapterTitle(c.chapterRef) }),
        Utils.createEl('span', { class: 'prog__pct', text: pctText, style: c.lowSample ? 'color:var(--color-text-secondary);font-weight:700;' : ('color:' + color(c.accuracy)) })
      ]);
      var track = Utils.createEl('span', { class: 'prog__track' }, [
        Utils.createEl('i', { class: 'prog__fill', style: 'width:' + Math.round((c.lowSample ? 0 : c.accuracy) * 100) + '%;background:' + (c.lowSample ? '#cbd5e1' : color(c.accuracy)) + ';' })
      ]);
      var hint = Utils.createEl('span', { class: 'prog__hint', text: c.attemptCount + ' attempts' + (c.lowSample ? ' · not enough yet for a score' : '') });
      var summary = Utils.createEl('summary', {}, [head, track, hint]);

      var topicsWrap = Utils.createEl('div', { class: 'prog__topics' });
      (c.topics || []).forEach(function (t) {
        var right = t.lowSample
          ? Utils.createEl('span', { class: 'text-caption', text: 'not enough data' })
          : Utils.createEl('span', { text: Utils.formatPercent(t.accuracy), style: 'color:' + color(t.accuracy) + ';font-weight:700;' });
        var thead = Utils.createEl('div', { class: 'prog__topic-head' }, [
          Utils.createEl('span', { class: 'prog__topic-name', text: String(t.topicTag).replace(/-/g, ' ') }), right
        ]);
        var kids = [thead];
        if (!t.lowSample) {
          kids.push(Utils.createEl('span', { class: 'prog__ttrack' }, [
            Utils.createEl('i', { class: 'prog__tfill', style: 'width:' + Math.round(t.accuracy * 100) + '%;background:' + color(t.accuracy) + ';' })
          ]));
        }
        topicsWrap.appendChild(Utils.createEl('div', { class: 'prog__topic' }, kids));
      });
      if (!(c.topics || []).length) topicsWrap.appendChild(Utils.createEl('p', { class: 'text-caption', text: 'No topic breakdown yet.' }));

      list.appendChild(Utils.createEl('details', { class: 'card prog' }, [summary, topicsWrap]));
    });
  }

  function refreshTrend() { buildTrendFilters(); renderTrend(); }

  async function load() {
    try {
      var data = await Api.analytics.myBreakdown();
      trendRows = data.trend || [];
      chapterMeta = (data.chapters || []).map(function (c) { return { chapterRef: c.chapterRef }; });
      renderChapters(data.chapters || []);
    } catch (err) {
      trendRows = [];
      chapterMeta = [];
      renderChapters([]);
    }
    refreshTrend();
  }

  document.addEventListener('wha:ready', function () {
    if (Router.currentPageName() !== 'progress.html') return;
    ['#trend-range', '#trend-class', '#trend-subject', '#trend-chapter'].forEach(function (sel) {
      var el = Utils.qs(sel);
      if (el) el.addEventListener('change', refreshTrend);
    });
    load();
  });
})();
