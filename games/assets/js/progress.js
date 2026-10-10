/**
 * progress.js — W.H. Academy · "My Progress" page
 * Two views of the student's own game performance:
 *   1) Accuracy-over-time line graph (X = date, Y = accuracy %).
 *      MULTI-SUBJECT: one or more subjects can be compared at the same time,
 *      with one distinct line per subject and a matching legend.
 *      Filters remain data-driven from the student's own attempts.
 *   2) Per-chapter bars, each expandable to per-topic bars.
 * Data: analytics/myBreakdown → { chapters, trend }.
 *
 * Step 2026-09-15:
 *   - Frontend-only change; backend contract is unchanged.
 *   - Chapter filter is enabled only when exactly one subject is selected.
 */
(function () {
  'use strict';

  var SUBJECT_NAMES = {
    math: 'Mathematics',
    science: 'General Science',
    geography: 'Geography',
    history: 'History',
    bio: 'Biology',
    chem: 'Chemistry',
    cs: 'Computer Science',
    phys: 'Physics'
  };

  var SUBJECT_COLORS = {
    math: '#4f46e5',
    science: '#16a34a',
    geography: '#d97706',
    history: '#dc2626',
    bio: '#db2777',
    chem: '#0891b2',
    cs: '#7c3aed',
    phys: '#2563eb'
  };

  var FALLBACK_COLORS = ['#4f46e5', '#16a34a', '#d97706', '#dc2626', '#0891b2', '#7c3aed', '#db2777', '#2563eb'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function color(a) {
    return a < 0.5 ? '#ef4444' : (a < 0.75 ? '#f59e0b' : '#22c55e');
  }

  function humanize(s) {
    return String(s || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function chapterTitle(ref) {
    return humanize(String(ref).split('/').pop());
  }

  function subjectLabel(k) {
    return SUBJECT_NAMES[k] || humanize(k);
  }

  function subjectColor(k, index) {
    return SUBJECT_COLORS[k] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
  }

  // Keep frontend parsing aligned with the deployed Supabase backend parser.
  function parseRef(ref) {
    var p = String(ref || '').split('/');
    var cl = null;
    var first = p[0] || '';
    var m = first.match(/^class-?(\d+)$/i) || first.match(/^(\d+)$/);
    if (m) cl = parseInt(m[1], 10) || null;

    var subjectKey = '';
    if (p.length >= 3 && String(p[1]).toLowerCase() === 'subjects') subjectKey = p[2];
    else if (p.length >= 2) subjectKey = p[1];

    return { classLevel: cl, subjectKey: subjectKey };
  }

  function distinct(arr) {
    var s = {}, o = [];
    arr.forEach(function (x) {
      if (x != null && x !== '' && !s[x]) {
        s[x] = 1;
        o.push(x);
      }
    });
    return o;
  }

  function fmtDate(d) {
    var p = String(d).split('-');
    return p.length === 3
      ? (parseInt(p[2], 10) + ' ' + (MONTHS[parseInt(p[1], 10) - 1] || ''))
      : d;
  }

  // ---------- accuracy-over-time multi-subject line chart ----------
  var trendRows = [];
  var selectedSubjects = {};
  var subjectSelectionReady = false;

  function trendMeta() {
    return trendRows.map(function (r) {
      var m = parseRef(r.chapterRef);
      return {
        classLevel: m.classLevel,
        subjectKey: m.subjectKey,
        chapterRef: r.chapterRef
      };
    });
  }

  function selectedSubjectKeys() {
    return Object.keys(selectedSubjects).filter(function (k) {
      return !!selectedSubjects[k];
    });
  }

  function availableSubjectsForClass(meta, classValue) {
    return distinct(meta.filter(function (m) {
      return !classValue || String(m.classLevel) === classValue;
    }).map(function (m) {
      return m.subjectKey;
    })).sort();
  }

  function buildClassFilter(meta) {
    var cSel = Utils.qs('#trend-class');
    if (!cSel) return '';
    var curC = cSel.value;
    var classes = distinct(meta.map(function (m) {
      return m.classLevel;
    })).sort(function (a, b) {
      return a - b;
    });

    cSel.innerHTML = '<option value="">All classes</option>' + classes.map(function (c) {
      return '<option value="' + esc(c) + '">Class ' + esc(c) + '</option>';
    }).join('');

    cSel.value = classes.map(String).indexOf(curC) >= 0 ? curC : '';
    return cSel.value;
  }

  function buildSubjectPicker(meta, classValue, resetSelection) {
    var host = Utils.qs('#trend-subject-options');
    var summary = Utils.qs('#trend-subject-summary');
    if (!host || !summary) return [];

    var subs = availableSubjectsForClass(meta, classValue);
    var prior = selectedSubjects;
    var next = {};

    if (!subjectSelectionReady || resetSelection) {
      subs.forEach(function (k) { next[k] = true; });
      subjectSelectionReady = true;
    } else {
      subs.forEach(function (k) {
        next[k] = !!prior[k];
      });
    }

    selectedSubjects = next;
    var selected = selectedSubjectKeys();

    var actionHtml =
      '<div class="trend-subject-actions">' +
        '<button type="button" class="trend-subject-action" data-trend-subject-action="all">Select all</button>' +
        '<button type="button" class="trend-subject-action" data-trend-subject-action="none">Clear</button>' +
      '</div>';

    var checks = subs.map(function (k, i) {
      return '<label class="trend-subject-option">' +
        '<input type="checkbox" value="' + esc(k) + '"' + (selectedSubjects[k] ? ' checked' : '') + '>' +
        '<span class="trend-subject-swatch" style="background:' + subjectColor(k, i) + ';"></span>' +
        '<span>' + esc(subjectLabel(k)) + '</span>' +
      '</label>';
    }).join('');

    host.innerHTML = actionHtml + (checks || '<p class="trend-subject-none">No subject data yet.</p>');

    if (!subs.length) summary.textContent = 'No subjects';
    else if (!selected.length) summary.textContent = 'Choose subjects';
    else if (selected.length === subs.length) summary.textContent = 'All subjects';
    else if (selected.length === 1) summary.textContent = subjectLabel(selected[0]);
    else summary.textContent = selected.length + ' subjects';

    return subs;
  }

  function buildChapterFilter(meta, classValue) {
    var chSel = Utils.qs('#trend-chapter');
    if (!chSel) return;

    var selected = selectedSubjectKeys();
    var curCh = chSel.value;

    if (selected.length !== 1) {
      chSel.disabled = true;
      chSel.innerHTML = '<option value="">Choose one subject for chapter filter</option>';
      return;
    }

    var subjectKey = selected[0];
    var chaps = distinct(meta.filter(function (m) {
      return (!classValue || String(m.classLevel) === classValue) &&
             m.subjectKey === subjectKey;
    }).map(function (m) {
      return m.chapterRef;
    }));

    chSel.disabled = false;
    chSel.innerHTML = '<option value="">All chapters</option>' + chaps.map(function (r) {
      return '<option value="' + esc(r) + '">' + esc(chapterTitle(r)) + '</option>';
    }).join('');
    chSel.value = chaps.indexOf(curCh) >= 0 ? curCh : '';
  }

  function buildTrendFilters(resetSubjects) {
    var cSel = Utils.qs('#trend-class');
    var chSel = Utils.qs('#trend-chapter');
    if (!cSel || !chSel) return;

    var meta = trendMeta();
    var classValue = buildClassFilter(meta);
    buildSubjectPicker(meta, classValue, !!resetSubjects);
    buildChapterFilter(meta, classValue);
  }

  function computeSeries() {
    var cSel = Utils.qs('#trend-class');
    var chSel = Utils.qs('#trend-chapter');
    var c = cSel ? cSel.value : '';
    var ch = chSel && !chSel.disabled ? chSel.value : '';
    var selected = selectedSubjectKeys();

    if (!selected.length) return [];

    var selectedMap = {};
    selected.forEach(function (k) { selectedMap[k] = true; });

    var grouped = {};

    trendRows.forEach(function (r) {
      var m = parseRef(r.chapterRef);
      if (c && String(m.classLevel) !== c) return;
      if (!selectedMap[m.subjectKey]) return;
      if (ch && r.chapterRef !== ch) return;

      if (!grouped[m.subjectKey]) grouped[m.subjectKey] = {};
      if (!grouped[m.subjectKey][r.date]) grouped[m.subjectKey][r.date] = { total: 0, correct: 0 };

      grouped[m.subjectKey][r.date].total += Number(r.total) || 0;
      grouped[m.subjectKey][r.date].correct += Number(r.correct) || 0;
    });

    return selected.map(function (subjectKey, index) {
      var byDate = grouped[subjectKey] || {};
      return {
        subjectKey: subjectKey,
        label: subjectLabel(subjectKey),
        color: subjectColor(subjectKey, index),
        points: Object.keys(byDate).sort().map(function (d) {
          var x = byDate[d];
          return {
            date: d,
            accuracy: x.total ? x.correct / x.total : 0,
            attempts: x.total
          };
        })
      };
    }).filter(function (series) {
      return series.points.length > 0;
    });
  }

  function lineChartSVG(series) {
    var W = 600, H = 250, padL = 40, padR = 14, padT = 14, padB = 34;
    var plotW = W - padL - padR, plotH = H - padT - padB;

    var allDates = distinct([].concat.apply([], series.map(function (s) {
      return s.points.map(function (p) { return p.date; });
    }))).sort();

    var n = allDates.length;
    var dateIndex = {};
    allDates.forEach(function (d, i) { dateIndex[d] = i; });

    function XByDate(date) {
      var i = dateIndex[date] || 0;
      return n <= 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW;
    }

    function Y(a) {
      return padT + (1 - a) * plotH;
    }

    var grid = '';
    [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
      var yy = Y(v);
      grid += '<line x1="' + padL + '" y1="' + yy + '" x2="' + (W - padR) + '" y2="' + yy + '" stroke="#e6e6f0" stroke-width="1"/>';
      grid += '<text x="' + (padL - 6) + '" y="' + (yy + 3) + '" text-anchor="end" font-size="10" fill="#6b7280">' + Math.round(v * 100) + '%</text>';
    });

    var step = n <= 6 ? 1 : Math.ceil(n / 5);
    var xlab = '';
    allDates.forEach(function (date, i) {
      if (i % step === 0 || i === n - 1) {
        xlab += '<text x="' + XByDate(date) + '" y="' + (H - padB + 16) + '" text-anchor="middle" font-size="10" fill="#6b7280">' + esc(fmtDate(date)) + '</text>';
      }
    });

    var drawn = series.map(function (s) {
      var polyline = '';
      if (s.points.length >= 2) {
        var pts = s.points.map(function (pt) {
          return XByDate(pt.date) + ',' + Y(pt.accuracy);
        }).join(' ');
        polyline = '<polyline points="' + pts + '" fill="none" stroke="' + s.color + '" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/>';
      }

      var dots = s.points.map(function (pt) {
        return '<circle cx="' + XByDate(pt.date) + '" cy="' + Y(pt.accuracy) + '" r="' + (s.points.length === 1 ? 4 : 3.5) + '" fill="' + s.color + '" stroke="#fff" stroke-width="1.2">' +
          '<title>' + esc(s.label) + ' · ' + esc(fmtDate(pt.date)) + ': ' + Math.round(pt.accuracy * 100) + '% (' + pt.attempts + ' attempts)</title>' +
        '</circle>';
      }).join('');

      return polyline + dots;
    }).join('');

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Accuracy over time by selected subjects">' +
      grid + drawn + xlab +
    '</svg>';
  }

  function legendHtml(series) {
    return '<div class="trend-legend" aria-label="Subject legend">' + series.map(function (s) {
      return '<span class="trend-legend__item">' +
        '<span class="trend-legend__swatch" style="background:' + s.color + ';"></span>' +
        esc(s.label) +
      '</span>';
    }).join('') + '</div>';
  }

  function renderTrend() {
    var host = Utils.qs('#trend-chart');
    if (!host) return;

    if (!selectedSubjectKeys().length) {
      host.innerHTML = '<p class="trend-empty">Choose at least one subject to compare.</p>';
      return;
    }

    var series = computeSeries();
    if (!series.length) {
      host.innerHTML = '<p class="trend-empty">No attempts for this selection yet — play some games to see your trend.</p>';
      return;
    }

    host.innerHTML = legendHtml(series) + lineChartSVG(series);
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
        Utils.createEl('span', {
          class: 'prog__pct',
          text: pctText,
          style: c.lowSample
            ? 'color:var(--color-text-secondary);font-weight:700;'
            : ('color:' + color(c.accuracy))
        })
      ]);

      var track = Utils.createEl('span', { class: 'prog__track' }, [
        Utils.createEl('i', {
          class: 'prog__fill',
          style: 'width:' + Math.round((c.lowSample ? 0 : c.accuracy) * 100) + '%;background:' +
            (c.lowSample ? '#cbd5e1' : color(c.accuracy)) + ';'
        })
      ]);

      var hint = Utils.createEl('span', {
        class: 'prog__hint',
        text: c.attemptCount + ' attempts' + (c.lowSample ? ' · not enough yet for a score' : '')
      });

      var summary = Utils.createEl('summary', {}, [head, track, hint]);
      var topicsWrap = Utils.createEl('div', { class: 'prog__topics' });

      (c.topics || []).forEach(function (t) {
        var right = t.lowSample
          ? Utils.createEl('span', { class: 'text-caption', text: 'not enough data' })
          : Utils.createEl('span', {
              text: Utils.formatPercent(t.accuracy),
              style: 'color:' + color(t.accuracy) + ';font-weight:700;'
            });

        var thead = Utils.createEl('div', { class: 'prog__topic-head' }, [
          Utils.createEl('span', {
            class: 'prog__topic-name',
            text: String(t.topicTag).replace(/-/g, ' ')
          }),
          right
        ]);

        var kids = [thead];

        if (!t.lowSample) {
          kids.push(Utils.createEl('span', { class: 'prog__ttrack' }, [
            Utils.createEl('i', {
              class: 'prog__tfill',
              style: 'width:' + Math.round(t.accuracy * 100) + '%;background:' + color(t.accuracy) + ';'
            })
          ]));
        }

        topicsWrap.appendChild(Utils.createEl('div', { class: 'prog__topic' }, kids));
      });

      if (!(c.topics || []).length) {
        topicsWrap.appendChild(Utils.createEl('p', {
          class: 'text-caption',
          text: 'No topic breakdown yet.'
        }));
      }

      list.appendChild(Utils.createEl('details', {
        class: 'card prog'
      }, [summary, topicsWrap]));
    });
  }

  function refreshTrend(resetSubjects) {
    buildTrendFilters(!!resetSubjects);
    renderTrend();
  }

  async function load() {
    try {
      var data = await Api.analytics.myBreakdown();
      trendRows = data.trend || [];
      renderChapters(data.chapters || []);
    } catch (err) {
      trendRows = [];
      renderChapters([]);
    }
    refreshTrend(true);
  }

  document.addEventListener('wha:ready', function () {
    if (Router.currentPageName() !== 'progress.html') return;

    var cSel = Utils.qs('#trend-class');
    var chSel = Utils.qs('#trend-chapter');
    var subjectHost = Utils.qs('#trend-subject-options');

    if (cSel) {
      cSel.addEventListener('change', function () {
        refreshTrend(true);
      });
    }

    if (chSel) {
      chSel.addEventListener('change', function () {
        renderTrend();
      });
    }

    if (subjectHost) {
      subjectHost.addEventListener('change', function (event) {
        var input = event.target;
        if (!input || input.type !== 'checkbox') return;
        selectedSubjects[input.value] = !!input.checked;
        buildTrendFilters(false);
        renderTrend();
      });

      subjectHost.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-trend-subject-action]');
        if (!btn) return;

        var action = btn.getAttribute('data-trend-subject-action');
        var c = cSel ? cSel.value : '';
        var subs = availableSubjectsForClass(trendMeta(), c);

        subs.forEach(function (k) {
          selectedSubjects[k] = action === 'all';
        });

        buildTrendFilters(false);
        renderTrend();
      });
    }

    load();
  });
})();
