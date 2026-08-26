/**
 * progress.js — W.H. Academy · "My Progress" page
 * Two views of the student's own game performance:
 *   1) Accuracy-over-time line graph (X = date, Y = accuracy %). The line's
 *      colour follows its height — green up high, red down low — so a dip is
 *      obvious. Filter by class / subject / chapter (cascading, from the
 *      student's own data).
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

  // ---------- accuracy-over-time line chart ----------
  var trendRows = [];

  function buildTrendFilters() {
    var cSel = Utils.qs('#trend-class'), sSel = Utils.qs('#trend-subject'), chSel = Utils.qs('#trend-chapter');
    if (!cSel || !sSel || !chSel) return;
    var meta = trendRows.map(function (r) { var m = parseRef(r.chapterRef); return { classLevel: m.classLevel, subjectKey: m.subjectKey, chapterRef: r.chapterRef }; });
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
    var byDate = {};
    trendRows.forEach(function (r) {
      var m = parseRef(r.chapterRef);
      if (c && String(m.classLevel) !== c) return;
      if (s && m.subjectKey !== s) return;
      if (ch && r.chapterRef !== ch) return;
      if (!byDate[r.date]) byDate[r.date] = { total: 0, correct: 0 };
      byDate[r.date].total += r.total; byDate[r.date].correct += r.correct;
    });
    return Object.keys(byDate).sort().map(function (d) {
      var x = byDate[d];
      return { date: d, accuracy: x.total ? x.correct / x.total : 0, attempts: x.total };
    });
  }

  function fmtDate(d) { var p = String(d).split('-'); return p.length === 3 ? (parseInt(p[2], 10) + ' ' + (MONTHS[parseInt(p[1], 10) - 1] || '')) : d; }

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
        xlab += '<text x="' + X(i) + '" y="' + (H - padB + 16) + '" text-anchor="middle" font-size="10" fill="#6b7280">' + fmtDate(pt.date) + '</text>';
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
      return '<circle cx="' + X(i) + '" cy="' + Y(pt.accuracy) + '" r="' + (n === 1 ? 4 : 3) + '" fill="' + color(pt.accuracy) + '"><title>' + fmtDate(pt.date) + ': ' + Math.round(pt.accuracy * 100) + '%</title></circle>';
    }).join('');

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Accuracy over time">' + defs + grid + line + dots + xlab + '</svg>';
  }

  function renderTrend() {
    var host = Utils.qs('#trend-chart');
    if (!host) return;
    var pts = computeSeries();
    if (!pts.length) { host.innerHTML = '<p class="trend-empty">No attempts for this selection yet — play some games to see your trend.</p>'; return; }
    host.innerHTML = lineChartSVG(pts);
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
      renderChapters(data.chapters || []);
    } catch (err) {
      trendRows = [];
      renderChapters([]);
    }
    refreshTrend();
  }

  document.addEventListener('wha:ready', function () {
    if (Router.currentPageName() !== 'progress.html') return;
    ['#trend-class', '#trend-subject', '#trend-chapter'].forEach(function (sel) {
      var el = Utils.qs(sel);
      if (el) el.addEventListener('change', refreshTrend);
    });
    load();
  });
})();
