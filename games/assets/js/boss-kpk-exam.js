/**
 * boss-kpk-exam.js — W.H. Academy
 * Board-exam screen for Boss Battle papers whose layout.format === 'board-exam'
 * (KPK / BISE pattern: Section A 12 MCQs on an OMR-style sheet, Section B any 8 of 11
 * short questions, Section C any 3 of 4 long questions).
 *
 * Flow and rules:
 *  - Intro -> Start. Section A opens first: Step 1 is the ROLL NUMBER OMR grid (one circle per column,
 *    digits 0-9, exactly like the board sheet), Step 2 the MCQ OMR table. 20-minute timer.
 *  - "Go to Sections B & C" moves on early; at 20:00 it moves on by itself. B & C get 2 h 40 min
 *    (so the whole paper is at most 3 hours). When the clock reaches 0 the paper is submitted by itself.
 *  - The student can return to Section A at any time; nothing already written is lost.
 *  - Short answers (<= 2000 characters) and long answers (<= 6000) are written in a small rich-text box
 *    (heading, bold, italic, underline, colour, bullets). They are stored as light tags: [h] [b] [i] [u] [c=red]…[/c].
 *  - EVERY change is autosaved to this device (localStorage). A power cut, lost internet, dead phone, refresh or
 *    closed tab loses nothing; the paper is also cached so an open exam resumes offline.
 *  - NOTHING is sent to the server until Submit (or the time ends). One write. If the network is down at that
 *    moment the answers stay on the device and are sent automatically when the student is online again.
 *  - Timers are wall-clock deadlines in the draft, so closing the page does not pause them.
 *
 * Public API (global BossKpkExam): isBoardPaper, start, tryOffline, hasDraft, discard, cardNote,
 *   renderResult(submission, el, hooks), richHtml(text), stop
 * hooks = { showView(name), onDone(paperId), onBack() }
 */
(function (global) {
  'use strict';

  var PFX = 'whx:kpk:'; // own prefix on purpose: Storage.clearAll() (logout) only clears 'wha:' keys
  var RETRY_MS = 15000;
  var DEFAULT_LIMIT = { short: 2000, long: 6000 };

  function esc(v) { return Utils.escapeHtml(v == null ? '' : String(v)); }
  // Board papers are plain prose. Blanks are written "________" — the generic MathText helper would treat the
  // underscores as LaTeX subscripts and paint the whole statement red (KaTeX error colour). So: math only when
  // the author explicitly wrote $…$; everything else is escaped text.
  function mathHtml(text) {
    var t = text == null ? '' : String(text);
    if (t.indexOf('$') !== -1 && global.MathText) return global.MathText.toHtml(t);
    return esc(t).replace(/\n/g, '<br>');
  }
  function lsGet(k) { try { var r = global.localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { global.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function lsDel(k) { try { global.localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  function sid(fallback) {
    var s = global.Storage && Storage.getStudentId ? Storage.getStudentId() : null;
    return String(s || fallback || 'anon');
  }
  function dKey(pid, who) { return PFX + 'd:' + sid(who) + ':' + pid; }
  function pKey(pid, who) { return PFX + 'p:' + sid(who) + ':' + pid; }
  function fmt(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    var mm = (m < 10 ? '0' : '') + m, xx = (x < 10 ? '0' : '') + x;
    return h > 0 ? h + ':' + mm + ':' + xx : mm + ':' + xx;
  }
  function isBoardPaper(p) { return !!(p && p.layout && p.layout.format === 'board-exam'); }
  function toast(msg, kind) { try { Notifications.toast(msg, kind || 'info'); } catch (e) { /* ignore */ } }

  // ---- rich text: light tags <-> safe HTML --------------------------------------------------------
  var COLORS = { red: '#dc2626', blue: '#2563eb', green: '#15803d', purple: '#7c3aed', orange: '#ea580c' };
  function plain(bb) { return String(bb == null ? '' : bb).replace(/\[\/?(?:b|i|u|h)\]|\[c=[a-z]+\]|\[\/c\]/g, ''); }
  function nonBlank(v) { return plain(v).replace(/\s+/g, '').length > 0; }
  function richHtml(bb) {
    var h = esc(bb == null ? '' : bb);
    h = h.replace(/\[h\]/g, '<h4 class="rt-h">').replace(/\[\/h\]\n?/g, '</h4>')
      .replace(/\[(b|i|u)\]/g, '<$1>').replace(/\[\/(b|i|u)\]/g, '</$1>')
      .replace(/\[c=(red|blue|green|purple|orange)\]/g, function (m, c) { return '<span data-c="' + c + '" style="color:' + COLORS[c] + '">'; })
      .replace(/\[\/c\]/g, '</span>')
      .replace(/\n/g, '<br>');
    return h;
  }
  function nearestColor(css) {
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css || ''), r, g, b;
    if (m) { r = +m[1]; g = +m[2]; b = +m[3]; }
    else {
      var hx = /^#([0-9a-f]{6})$/i.exec(css || '');
      if (!hx) return '';
      r = parseInt(hx[1].slice(0, 2), 16); g = parseInt(hx[1].slice(2, 4), 16); b = parseInt(hx[1].slice(4, 6), 16);
    }
    var best = '', bd = 1e9;
    Object.keys(COLORS).forEach(function (k) {
      var c = COLORS[k], cr = parseInt(c.slice(1, 3), 16), cg = parseInt(c.slice(3, 5), 16), cb = parseInt(c.slice(5, 7), 16);
      var d = Math.sqrt((r - cr) * (r - cr) + (g - cg) * (g - cg) + (b - cb) * (b - cb));
      if (d < bd) { bd = d; best = k; }
    });
    return bd < 110 ? best : '';
  }
  function htmlToBb(root) {
    var out = '';
    function nl() { if (out && out.charAt(out.length - 1) !== '\n') out += '\n'; }
    function kids(n) { for (var c = n.firstChild; c; c = c.nextSibling) walk(c); }
    function colorOf(n) {
      var c = n.getAttribute && n.getAttribute('data-c');
      if (c && COLORS[c]) return c;
      return nearestColor((n.style && n.style.color) || (n.getAttribute && n.getAttribute('color')) || '');
    }
    function walk(n) {
      if (n.nodeType === 3) { out += n.nodeValue.replace(/\u00a0/g, ' ').replace(/\[/g, '\uff3b'); return; }
      if (n.nodeType !== 1) return;
      if (n.tagName === 'BR') { out += '\n'; return; }
      var col = colorOf(n);              // the browser may put the colour on <u>, <b>, <span> or <font>
      if (col) out += '[c=' + col + ']';
      walkEl(n);
      if (col) out += '[/c]';
    }
    function walkEl(n) {
      var t = n.tagName;
      if (/^H[1-6]$/.test(t)) { nl(); out += '[h]'; kids(n); out += '[/h]\n'; return; }
      if (t === 'DIV' || t === 'P') { nl(); kids(n); nl(); return; }
      if (t === 'UL' || t === 'OL') { nl(); kids(n); nl(); return; }
      if (t === 'LI') { nl(); out += '\u2022 '; kids(n); nl(); return; }
      if (t === 'B' || t === 'STRONG') { out += '[b]'; kids(n); out += '[/b]'; return; }
      if (t === 'I' || t === 'EM') { out += '[i]'; kids(n); out += '[/i]'; return; }
      if (t === 'U') { out += '[u]'; kids(n); out += '[/u]'; return; }
      if (t === 'FONT' || t === 'SPAN') {
        var bold = n.style && (n.style.fontWeight === 'bold' || +n.style.fontWeight >= 600);
        var ital = n.style && n.style.fontStyle === 'italic';
        var und = n.style && /underline/.test(n.style.textDecoration || n.style.textDecorationLine || '');
        if (bold) out += '[b]'; if (ital) out += '[i]'; if (und) out += '[u]';
        kids(n);
        if (und) out += '[/u]'; if (ital) out += '[/i]'; if (bold) out += '[/b]';
        return;
      }
      kids(n);
    }
    kids(root);
    out = out.replace(/\[(b|i|u|h)\]\[\/\1\]/g, '').replace(/\[c=[a-z]+\]\[\/c\]/g, '').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '');
    return out;
  }

  // ---- state of the exam currently on screen --------------------------------------------------
  var S = null;

  function timing(layout) {
    var t = (layout && layout.timing) || {};
    return { mcq: (Number(t.mcqMinutes) || 20) * 60000, subj: (Number(t.subjectiveMinutes) || 160) * 60000 };
  }
  function sectionDef(id) {
    var arr = (S.layout.sections || []);
    for (var i = 0; i < arr.length; i++) if (String(arr[i].id) === id) return arr[i];
    return { id: id, attempt: 0, of: 0, marksEach: 0 };
  }
  function limitOf(q) { return Number(q.maxChars) > 0 ? Number(q.maxChars) : (q.type === 'long' ? DEFAULT_LIMIT.long : DEFAULT_LIMIT.short); }
  function rollCols() {
    var a = S.student && S.student.rollNumber ? String(S.student.rollNumber).length : 0;
    var d = S.layout.roll && Number(S.layout.roll.digits) || 6;
    return Math.min(8, Math.max(d, a));
  }
  function rollString() { return S.draft.roll.map(function (d) { return d === '' || d == null ? '_' : d; }).join(''); }
  function rollStatus() {
    var filled = S.draft.roll.filter(function (d) { return d !== '' && d != null; }).length, cols = S.draft.roll.length;
    var assigned = S.student && S.student.rollNumber ? String(S.student.rollNumber).replace(/^0+/, '') : '';
    if (filled < cols) return { ok: false, msg: filled + ' of ' + cols + ' columns filled — fill ONE circle in every column.', kind: 'todo' };
    var got = S.draft.roll.join('').replace(/^0+/, '');
    if (assigned && got !== assigned) return { ok: false, msg: 'This does not match your roll number ' + S.student.rollNumber + '. Please correct the circles.', kind: 'bad' };
    return { ok: true, msg: '✓ Roll number filled' + (assigned ? ' and matches your roll number.' : '.'), kind: 'ok' };
  }

  function saveDraftNow() {
    if (!S) return true;
    S.draft.updatedAt = Date.now();
    var ok = lsSet(dKey(S.paper.paperId, S.who), S.draft);
    S.lastSaved = S.draft.updatedAt;
    setSaveState(ok);
    return ok;
  }
  function scheduleSave() {
    setSaveState('dirty');
    if (S.saveTimer) clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(function () { S.saveTimer = null; saveDraftNow(); }, 300);
  }
  function flush() { if (S) { if (S.saveTimer) { clearTimeout(S.saveTimer); S.saveTimer = null; } saveDraftNow(); } }
  function setSaveState(state) {
    var n = S && S.mount && S.mount.querySelector('#kx-save');
    if (!n) return;
    if (state === 'dirty') { n.textContent = 'Saving…'; n.className = 'kx-save'; return; }
    if (state === true) {
      var d = new Date();
      n.textContent = '✓ Saved on this device ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      n.className = 'kx-save kx-save--ok';
    } else {
      n.textContent = '⚠ Could not save on this device (storage full or blocked)';
      n.className = 'kx-save kx-save--bad';
    }
  }

  // ---- list-card helpers ----------------------------------------------------------------------
  function hasDraft(pid) { var d = lsGet(dKey(pid)); return !!(d && d.phase && d.phase !== 'intro'); }
  function fmtHM(mins) { var h = Math.floor(mins / 60), m = mins % 60; return (h ? h + ' h ' : '') + (m ? m + ' min' : '').trim(); }
  function cardNote(paper) {
    if (!paper || !paper.boardExam) return '';
    var t = paper.timing || {};
    var txt = '📝 Board exam · ' + (Number(t.mcqMinutes) || 20) + ' min MCQs + ' + fmtHM((Number(t.subjectiveMinutes) || 160)) + ' written';
    var resume = (!paper.attempted && hasDraft(paper.paperId)) ? ' <span class="bb-pill bb-pill--pending">In progress · resume</span>' : '';
    return '<p class="kx-card-note">' + esc(txt) + resume + '</p>';
  }
  function discard(pid) { lsDel(dKey(pid)); lsDel(pKey(pid)); }

  // ---- entry points ---------------------------------------------------------------------------
  function start(data, hooks) {
    var paper = data.paper;
    var who = data.student && data.student.studentId;
    lsSet(pKey(paper.paperId, who), { paper: paper, student: data.student || null, cachedAt: Date.now() });
    open(paper, data.student || null, hooks, who);
  }
  function tryOffline(paperId, hooks) {
    var cached = lsGet(pKey(paperId));
    var draft = lsGet(dKey(paperId));
    if (!cached || !cached.paper || !draft) return false;
    open(cached.paper, cached.student || null, hooks, null);
    return true;
  }
  function open(paper, student, hooks, who) {
    stop();
    var mount = document.getElementById('bb-attempt-view');
    var layout = paper.layout;
    var T = timing(layout);
    var draft = lsGet(dKey(paper.paperId, who));
    if (!draft || draft.v !== 1) {
      draft = { v: 1, paperId: paper.paperId, answers: {}, roll: [], phase: 'intro', tab: 'A', startedAt: null,
        mcqDeadline: null, subjDeadline: null, submitPending: false, updatedAt: Date.now() };
    }
    S = { paper: paper, student: student, layout: layout, hooks: hooks, mount: mount, draft: draft, who: who,
      T: T, tickId: null, saveTimer: null, retryId: null, submitting: false, warned5: false, lastSaved: draft.updatedAt };
    var cols = rollCols();
    if (!Array.isArray(S.draft.roll) || S.draft.roll.length !== cols) {
      var old = Array.isArray(S.draft.roll) ? S.draft.roll : [];
      S.draft.roll = []; for (var i = 0; i < cols; i++) S.draft.roll.push(old[i] || '');
    }
    bindLifecycle();
    hooks.showView('bb-attempt-view');
    if (draft.submitPending) { renderShell(); submit(true, true); return; }
    if (draft.phase === 'intro') renderIntro(); else { renderShell(); startTicking(); }
  }
  function removeClock() { var c = document.getElementById('kx-clock'); if (c && c.parentNode) c.parentNode.removeChild(c); }
  function stop() {
    if (!S) { removeClock(); return; }
    flush();
    if (S.tickId) clearInterval(S.tickId);
    if (S.retryId) clearInterval(S.retryId);
    unbindLifecycle();
    removeClock();
    S = null;
  }

  // ---- lifecycle (save when hidden/closed, resend when online, pick up edits from another tab) ----
  var lifecycleBound = false;
  function onVisibility() {
    if (!S) return;
    if (document.visibilityState === 'hidden') { flush(); return; }
    // Coming back to this tab: if another tab changed the same draft meanwhile, load the newer one.
    var d = lsGet(dKey(S.paper.paperId, S.who));
    if (d && d.v === 1 && d.updatedAt > S.lastSaved && !S.saveTimer && !S.submitting && !d.submitPending && d.phase !== 'intro') {
      S.draft = d; S.lastSaved = d.updatedAt;
      var cols = rollCols(); if (!Array.isArray(S.draft.roll) || S.draft.roll.length !== cols) { S.draft.roll = []; for (var i = 0; i < cols; i++) S.draft.roll.push(''); }
      renderShell(); startTicking();
    }
  }
  function onPageHide() { flush(); }
  function onOnline() { if (S && S.draft.submitPending && !S.submitting) submit(true, true); }
  function bindLifecycle() {
    if (lifecycleBound) return; lifecycleBound = true;
    document.addEventListener('visibilitychange', onVisibility);
    global.addEventListener('pagehide', onPageHide);
    global.addEventListener('online', onOnline);
  }
  function unbindLifecycle() {
    if (!lifecycleBound) return; lifecycleBound = false;
    document.removeEventListener('visibilitychange', onVisibility);
    global.removeEventListener('pagehide', onPageHide);
    global.removeEventListener('online', onOnline);
  }

  // ---- intro ----------------------------------------------------------------------------------
  function renderIntro() {
    var p = S.paper, L = S.layout, T = S.T;
    var secs = (L.sections || []).map(function (s) {
      return '<li><strong>Section ' + esc(s.id) + '</strong> — ' + esc(String(s.title || '').replace(/^Section [ABC] — /, '')) + ': ' +
        (s.attempt === s.of ? 'all ' + esc(s.of) : 'attempt any ' + esc(s.attempt) + ' of ' + esc(s.of)) +
        ' · ' + esc(s.marksEach) + ' mark' + (Number(s.marksEach) === 1 ? '' : 's') + ' each</li>';
    }).join('');
    S.mount.innerHTML =
      '<div class="bb-paper-sheet kx-sheet">' +
        '<div class="bb-paper-topbar"><button class="btn btn--tertiary btn--sm" id="kx-intro-back" type="button">‹ Back to Arena</button></div>' +
        '<div class="kx-intro">' +
          '<span class="kx-eyebrow">' + esc(L.board || 'Board') + ' board pattern · ' + esc(L.totalMarks || p.totalMarks) + ' marks</span>' +
          (S.student && S.student.rollNumber ? '<p class="kx-intro__exam">Roll No: <strong>' + esc(S.student.rollNumber) + '</strong> · ' + esc(S.student.fullName || '') + '</p>' : '') +
          '<h2 class="kx-intro__title">' + esc(p.title) + '</h2>' +
          '<p class="kx-intro__exam">' + esc(L.examName || '') + '</p>' +
          (p.description ? '<p class="kx-intro__desc">' + esc(p.description) + '</p>' : '') +
          '<ul class="kx-intro__secs">' + secs + '</ul>' +
          '<div class="kx-intro__clock">' +
            '<div><b>' + fmt(T.mcq) + '</b><span>Section A (MCQs) first</span></div>' +
            '<div><b>' + fmt(T.subj) + '</b><span>Sections B &amp; C (3 hours in all)</span></div>' +
          '</div>' +
          '<ul class="kx-rules">' +
            '<li><strong>First fill your Roll Number</strong> in the circles (one circle in every column), exactly like the board OMR sheet. Then do the MCQs by filling the circle of your answer; tap the same circle again to clear it.</li>' +
            '<li>The timer is always shown at the top-right corner of your screen, even when you scroll.</li>' +
            '<li>Finished Section A early? Use <em>Go to Sections B &amp; C</em>. You can come back to Section A any time; nothing you wrote is lost.</li>' +
            '<li>In Sections B and C <strong>write neatly</strong>: for every long question start with a proper <strong>heading</strong>, then your points or paragraphs. Use <b>bold</b>, <u>underline</u>, <i>italic</i> and colours to make key words stand out. Short answers: up to 2000 characters. Long answers: up to 6000 characters.</li>' +
            '<li>Your answers are saved on this device automatically. Power cut, no internet, phone off or page closed — open the paper again on the <strong>same device and browser</strong> and carry on.</li>' +
            '<li>Your paper is sent to your teacher <strong>only when you press Submit</strong>. You can submit before the time ends; if you do not, it is submitted automatically when the clock reaches zero.</li>' +
            '<li>The clock keeps running even if you close the page, just like in the real exam hall.</li>' +
            '<li>Once submitted, answers cannot be changed. Section A is checked automatically; Sections B and C are marked by your teacher.</li>' +
          '</ul>' +
          '<button class="btn btn--primary btn--lg" id="kx-begin" type="button">Start exam — the Section A timer begins</button>' +
        '</div>' +
      '</div>';
    document.getElementById('kx-begin').addEventListener('click', function () {
      var now = Date.now();
      S.draft.phase = 'A'; S.draft.tab = 'A'; S.draft.startedAt = now; S.draft.mcqDeadline = now + S.T.mcq;
      saveDraftNow();
      renderShell(); startTicking();
    });
    document.getElementById('kx-intro-back').addEventListener('click', function () { var h = S.hooks; stop(); h.onBack(); });
  }

  // ---- main exam shell ------------------------------------------------------------------------
  function qsOf(section) {
    return (S.paper.questions || []).filter(function (q) { return q.section === section; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }
  function groupsOf(section) {
    var map = {}, order = [];
    qsOf(section).forEach(function (q) {
      var g = String(q.group != null ? q.group : q.qId);
      if (!map[g]) { map[g] = { id: g, items: [] }; order.push(g); }
      map[g].items.push(q);
    });
    return order.map(function (g, i) { map[g].no = i + 1; return map[g]; });
  }

  function ensureClock() {
    var c = document.getElementById('kx-clock');
    if (!c) {
      c = document.createElement('div');
      c.id = 'kx-clock'; c.className = 'kx-clock'; c.setAttribute('role', 'timer');
      c.innerHTML = '<span id="kx-timer-label"></span><b id="kx-timer-val">--:--</b>';
      document.body.appendChild(c);
    }
    return c;
  }

  function renderShell() {
    var mcq = qsOf('A');
    ensureClock();
    S.mount.innerHTML =
      '<div class="bb-paper-sheet kx-sheet">' +
        '<div class="kx-bar" id="kx-bar">' +
          '<div class="kx-bar__row">' +
            '<button class="btn btn--tertiary btn--sm" id="kx-exit" type="button">‹ Save &amp; leave</button>' +
            '<div class="kx-save" id="kx-save"></div>' +
            '<button class="btn btn--primary btn--sm" id="kx-submit" type="button">Submit paper</button>' +
          '</div>' +
          '<div class="kx-tabs" role="tablist">' +
            '<button class="kx-tab" data-tab="A" role="tab" type="button">A · MCQs <small id="kx-cnt-A"></small></button>' +
            '<button class="kx-tab" data-tab="B" role="tab" type="button">B · Short <small id="kx-cnt-B"></small></button>' +
            '<button class="kx-tab" data-tab="C" role="tab" type="button">C · Long <small id="kx-cnt-C"></small></button>' +
          '</div>' +
        '</div>' +
        '<div class="kx-banner" id="kx-banner" hidden></div>' +
        '<h2 class="bb-paper-head__title kx-title">' + esc(S.paper.title) + '</h2>' +
        '<section class="kx-panel" data-panel="A">' + rollPanel() + panelA(mcq) + '</section>' +
        '<section class="kx-panel" data-panel="B" hidden>' + panelB() + '</section>' +
        '<section class="kx-panel" data-panel="C" hidden>' + panelC() + '</section>' +
      '</div>';
    wire();
    applyAnswersToDom();
    refreshAll();
    if (global.MathText) global.MathText.render(S.mount);
    showTab(S.draft.tab || 'A', true);
    setSaveState(true);
  }

  // ---- roll number OMR grid ---------------------------------------------------------------------
  function rollPanel() {
    var cols = S.draft.roll.length, boxes = '', grid = '';
    for (var c = 0; c < cols; c++) {
      boxes += '<div class="kx-roll__box" data-rbox="' + c + '"></div>';
      var col = '';
      for (var d = 0; d <= 9; d++) {
        col += '<button type="button" class="kx-bubble kx-bubble--roll" data-rc="' + c + '" data-rd="' + d + '" data-l="' + d +
          '" role="radio" aria-checked="false" aria-label="Roll number column ' + (c + 1) + ', digit ' + d + '"></button>';
      }
      grid += '<div class="kx-roll__col">' + col + '</div>';
    }
    var sr = S.student && S.student.rollNumber;
    return '<div class="kx-roll" id="kx-roll" style="--kx-cols:' + cols + '">' +
      '<div class="kx-sec-head"><h3>Step 1 — Roll Number <span>Fill ONE circle in each column to match your roll number' +
      (sr ? ': <b class="kx-roll__no">' + esc(sr) + '</b>' : '') + '</span></h3></div>' +
      '<div class="kx-roll__sheet"><div class="kx-roll__boxes">' + boxes + '</div><div class="kx-roll__grid">' + grid + '</div></div>' +
      '<p class="kx-roll__msg" id="kx-roll-msg"></p></div>';
  }
  function paintRoll() {
    var cols = S.draft.roll.length;
    for (var c = 0; c < cols; c++) {
      var v = S.draft.roll[c];
      Array.prototype.forEach.call(S.mount.querySelectorAll('.kx-bubble[data-rc="' + c + '"]'), function (b) {
        var on = (v !== '' && v != null && String(b.getAttribute('data-rd')) === String(v));
        b.classList.toggle('kx-bubble--on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      var box = S.mount.querySelector('[data-rbox="' + c + '"]'); if (box) box.textContent = (v === '' || v == null) ? '' : v;
    }
    var st = rollStatus(), m = S.mount.querySelector('#kx-roll-msg');
    if (m) { m.textContent = st.msg; m.className = 'kx-roll__msg kx-roll__msg--' + st.kind; }
  }

  function panelA(mcq) {
    var s = sectionDef('A');
    var cols = 0; mcq.forEach(function (q) { cols = Math.max(cols, (q.options || []).length); });
    cols = cols || 4;
    var head = '<tr><th class="kx-omr__no">#</th><th class="kx-omr__stmt">MCQ statement &amp; options</th>';
    for (var c = 0; c < cols; c++) head += '<th class="kx-omr__col">' + String.fromCharCode(65 + c) + '</th>';
    head += '</tr>';
    var rows = mcq.map(function (q, i) {
      var opts = (q.options || []).map(function (o, k) {
        return '<li><span class="kx-optl">' + String.fromCharCode(65 + k) + '</span> ' + mathHtml(o) + '</li>';
      }).join('');
      var bubbles = '';
      for (var c2 = 0; c2 < cols; c2++) {
        bubbles += (c2 < (q.options || []).length)
          ? '<td class="kx-omr__col"><button type="button" class="kx-bubble" data-q="' + esc(q.qId) + '" data-i="' + c2 +
            '" data-l="' + String.fromCharCode(65 + c2) + '" role="radio" aria-checked="false" aria-label="Question ' + (i + 1) + ', option ' + String.fromCharCode(65 + c2) + '"></button></td>'
          : '<td class="kx-omr__col"></td>';
      }
      return '<tr data-row="' + esc(q.qId) + '"><td class="kx-omr__no">' + esc(q.num != null ? q.num : i + 1) + '</td>' +
        '<td class="kx-omr__stmt"><div class="kx-omr__q">' + mathHtml(q.text) + '</div><ol class="kx-omr__opts">' + opts + '</ol></td>' + bubbles + '</tr>';
    }).join('');
    return '<div class="kx-sec-head"><h3>Step 2 — Section A · Multiple choice <span>' + esc(s.of || mcq.length) + ' questions · ' +
      esc(s.marksEach) + ' mark each · compulsory</span></h3>' +
      '<p class="kx-hint">Fill ONE circle per question. Tap a filled circle again to clear it.</p></div>' +
      '<div class="kx-omr-wrap"><table class="kx-omr"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="kx-nav"><button class="btn btn--secondary" id="kx-to-bc" type="button">Go to Sections B &amp; C →</button></div>';
  }

  // ---- rich answer box ---------------------------------------------------------------------------
  function toolbar(qid) {
    var cols = Object.keys(COLORS).map(function (k) {
      return '<button type="button" class="kx-tb__c" data-cmd="color" data-arg="' + k + '" style="--c:' + COLORS[k] + '" title="Text colour: ' + k + '" aria-label="Colour ' + k + '"></button>';
    }).join('');
    return '<div class="kx-tb" data-tb="' + esc(qid) + '">' +
      '<button type="button" data-cmd="head" title="Heading (use for the title of your answer)"><span class="kx-tb__h">H</span> Heading</button>' +
      '<button type="button" data-cmd="bold" title="Bold"><b>B</b></button>' +
      '<button type="button" data-cmd="italic" title="Italic"><i>I</i></button>' +
      '<button type="button" data-cmd="underline" title="Underline"><u>U</u></button>' +
      '<button type="button" data-cmd="list" title="Bullet points">• List</button>' +
      '<span class="kx-tb__sep"></span>' + cols +
      '<button type="button" data-cmd="color" data-arg="auto" title="Normal text colour">A</button>' +
      '</div>';
  }
  function qBlock(q, label, hint) {
    var lim = limitOf(q);
    return '<div class="kx-q" data-qwrap="' + esc(q.qId) + '">' +
      '<div class="bb-q__head"><span class="kx-q__label">' + esc(label) + '</span>' +
        '<div class="bb-q__text">' + mathHtml(q.text) + '</div>' +
        '<span class="bb-q__marks">' + esc(q.marks) + '</span></div>' +
      (q.split ? '<p class="kx-split">Marks split: ' + esc(q.split) + '</p>' : '') +
      (hint ? '<p class="kx-tip">' + hint + '</p>' : '') +
      toolbar(q.qId) +
      '<div class="kx-rt" contenteditable="true" role="textbox" aria-multiline="true" data-qid="' + esc(q.qId) + '" data-max="' + lim +
        '" data-ph="Write your answer here…" spellcheck="true"></div>' +
      '<div class="bb-answer-meta"><span class="bb-answer-count" data-count-for="' + esc(q.qId) + '">0 / ' + lim + ' characters</span></div>' +
    '</div>';
  }
  var ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi'];
  function panelB() {
    var s = sectionDef('B');
    var qs = qsOf('B').map(function (q, i) { return qBlock(q, 'Q.' + (ROMAN[i] || (i + 1)) + ')', ''); }).join('');
    return '<div class="kx-sec-head"><h3>Section B — Short questions <span>attempt any ' + esc(s.attempt) + ' of ' + esc(s.of) + ' · ' +
      esc(s.marksEach) + ' marks each · up to 2000 characters per answer</span></h3>' +
      '<p class="kx-limit" id="kx-limit-B"></p></div>' + qs +
      '<div class="kx-nav"><button class="btn btn--tertiary" data-go="A" type="button">← Back to MCQs</button>' +
      '<button class="btn btn--secondary" data-go="C" type="button">Section C →</button></div>';
  }
  function panelC() {
    var s = sectionDef('C');
    var gs = groupsOf('C').map(function (g) {
      var tot = g.items.reduce(function (a, q) { return a + (Number(q.marks) || 0); }, 0);
      var inner = g.items.map(function (q, pi) {
        var tip = pi === 0 ? 'Neat answer tip: begin with a <b>heading</b>, then write in points or short paragraphs. Use bold / underline for key words.' : '';
        return qBlock(q, '(' + (q.part || ROMAN[pi]) + ')', tip);
      }).join('');
      return '<div class="kx-group" data-group="' + esc(g.id) + '"><div class="kx-group__head">Long Question ' + g.no +
        ' <span>' + esc(tot) + ' marks · ' + g.items.length + ' part' + (g.items.length > 1 ? 's' : '') + '</span></div>' + inner + '</div>';
    }).join('');
    return '<div class="kx-sec-head"><h3>Section C — Long questions <span>attempt any ' + esc(s.attempt) + ' of ' + esc(s.of) + ' · ' +
      esc(s.marksEach) + ' marks each · up to 6000 characters per part</span></h3>' +
      '<p class="kx-hint">Write every long answer under a proper <b>heading</b> so the page stays neat, clean and easy to read.</p>' +
      '<p class="kx-limit" id="kx-limit-C"></p></div>' + gs +
      '<div class="kx-nav"><button class="btn btn--tertiary" data-go="B" type="button">← Section B</button>' +
      '<button class="btn btn--tertiary" data-go="A" type="button">← Back to MCQs</button>' +
      '<button class="btn btn--primary" id="kx-submit2" type="button">Submit paper</button></div>';
  }

  // ---- events ---------------------------------------------------------------------------------
  function edOf(qid) { return S.mount.querySelector('.kx-rt[data-qid="' + qid + '"]'); }
  function plainLen(ed) { return plain(htmlToBb(ed)).length; }
  function cleanEmpty(ed) {
    if (!ed.textContent.replace(/\s+/g, '') && !ed.querySelector('h4,li,img')) ed.innerHTML = '';
  }
  function runCmd(ed, cmd, arg) {
    ed.focus();
    try { document.execCommand('styleWithCSS', false, false); } catch (e) { /* ignore */ }
    if (cmd === 'bold' || cmd === 'italic' || cmd === 'underline') document.execCommand(cmd, false, null);
    else if (cmd === 'list') document.execCommand('insertUnorderedList', false, null);
    else if (cmd === 'head') {
      var cur = String(document.queryCommandValue('formatBlock') || '').toLowerCase();
      document.execCommand('formatBlock', false, cur === 'h4' ? 'div' : 'h4');
    } else if (cmd === 'color') {
      var col = arg === 'auto' ? global.getComputedStyle(ed).color : COLORS[arg];
      try { document.execCommand('styleWithCSS', false, true); } catch (e) { /* ignore */ }
      document.execCommand('foreColor', false, col);
      try { document.execCommand('styleWithCSS', false, false); } catch (e) { /* ignore */ }
    }
    onEditorChange(ed);
  }
  function onEditorChange(ed) {
    if (!S) return;
    cleanEmpty(ed);
    var qid = ed.getAttribute('data-qid'), bb = htmlToBb(ed);
    if (nonBlank(bb)) S.draft.answers[qid] = bb; else delete S.draft.answers[qid];
    refreshAll(); scheduleSave();
  }

  function wire() {
    var m = S.mount;
    m.querySelector('#kx-exit').addEventListener('click', function () {
      if (!global.confirm('Leave the paper? Your answers stay saved on this device and the clock keeps running.')) return;
      var h = S.hooks; stop(); h.onBack();
    });
    m.querySelector('#kx-submit').addEventListener('click', function () { submit(false, false); });
    var s2 = m.querySelector('#kx-submit2'); if (s2) s2.addEventListener('click', function () { submit(false, false); });
    var toBc = m.querySelector('#kx-to-bc'); if (toBc) toBc.addEventListener('click', function () { goToBC(false); });
    Array.prototype.forEach.call(m.querySelectorAll('.kx-tab'), function (b) {
      b.addEventListener('click', function () { showTab(b.getAttribute('data-tab'), false); });
    });
    Array.prototype.forEach.call(m.querySelectorAll('[data-go]'), function (b) {
      b.addEventListener('click', function () { showTab(b.getAttribute('data-go'), false); });
    });
    // Assigned (not addEventListener) on purpose: this mount element is reused every time an exam
    // is opened, and stacked listeners would toggle a circle twice per tap.
    m.onmousedown = function (e) { // keep the text selection when a toolbar button is pressed
      var t = e.target.closest ? e.target.closest('.kx-tb button') : null; if (t) e.preventDefault();
    };
    m.onclick = function (e) {
      var tb = e.target.closest ? e.target.closest('.kx-tb button') : null;
      if (tb) {
        var wrap = tb.closest('.kx-q'), ed = wrap && wrap.querySelector('.kx-rt');
        if (ed && ed.getAttribute('contenteditable') === 'true') runCmd(ed, tb.getAttribute('data-cmd'), tb.getAttribute('data-arg'));
        return;
      }
      var b = e.target.closest ? e.target.closest('.kx-bubble') : null;
      if (!b || S.draft.submitPending) return;
      if (b.hasAttribute('data-rc')) { // roll number grid
        var c = Number(b.getAttribute('data-rc')), d = String(b.getAttribute('data-rd'));
        S.draft.roll[c] = (S.draft.roll[c] === d) ? '' : d;
        paintRoll(); scheduleSave(); return;
      }
      var q = b.getAttribute('data-q'), i = Number(b.getAttribute('data-i'));
      if (S.draft.answers[q] === i) delete S.draft.answers[q]; else S.draft.answers[q] = i;
      paintMcq(q); refreshAll(); scheduleSave();
    };
    m.oninput = function (e) {
      var t = e.target;
      if (t && t.classList && t.classList.contains('kx-rt')) onEditorChange(t);
    };
    m.onbeforeinput = function (e) {
      var t = e.target;
      if (!t || !t.classList || !t.classList.contains('kx-rt')) return;
      var max = Number(t.getAttribute('data-max')) || 0;
      if (max && /^insert/.test(e.inputType || '') && plainLen(t) >= max) e.preventDefault();
    };
    m.onpaste = function (e) {
      var t = e.target.closest ? e.target.closest('.kx-rt') : null;
      if (!t) return;
      e.preventDefault();
      var txt = ((e.clipboardData || global.clipboardData).getData('text/plain') || '').replace(/\r/g, '');
      var max = Number(t.getAttribute('data-max')) || 0;
      if (max) txt = txt.slice(0, Math.max(0, max - plainLen(t)));
      if (txt) document.execCommand('insertText', false, txt);
    };
  }

  function paintMcq(qid) {
    var v = S.draft.answers[qid];
    Array.prototype.forEach.call(S.mount.querySelectorAll('.kx-bubble[data-q="' + qid + '"]'), function (b) {
      var on = (v !== undefined && Number(b.getAttribute('data-i')) === Number(v));
      b.classList.toggle('kx-bubble--on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    var row = S.mount.querySelector('tr[data-row="' + qid + '"]');
    if (row) row.classList.toggle('kx-row--done', v !== undefined);
  }
  function applyAnswersToDom() {
    qsOf('A').forEach(function (q) { paintMcq(q.qId); });
    paintRoll();
    Array.prototype.forEach.call(S.mount.querySelectorAll('.kx-rt'), function (t) {
      var v = S.draft.answers[t.getAttribute('data-qid')];
      if (v != null) t.innerHTML = richHtml(v);
    });
  }

  // counts, limits (lock the extra questions once the allowed number is attempted)
  function attemptedGroups(section) {
    return groupsOf(section).filter(function (g) {
      return g.items.some(function (q) { return nonBlank(S.draft.answers[q.qId]); });
    }).map(function (g) { return g.id; });
  }
  function refreshAll() {
    var A = qsOf('A'), done = A.filter(function (q) { return S.draft.answers[q.qId] !== undefined; }).length;
    setTxt('kx-cnt-A', done + '/' + A.length);
    ['B', 'C'].forEach(function (sec) {
      var def = sectionDef(sec), att = attemptedGroups(sec), full = att.length >= def.attempt;
      setTxt('kx-cnt-' + sec, att.length + '/' + def.attempt);
      var lim = S.mount.querySelector('#kx-limit-' + sec);
      if (lim) {
        lim.textContent = att.length + ' of ' + def.attempt + ' attempted' +
          (full ? ' — limit reached. Clear one answer if you want to attempt a different question.' : '');
        lim.className = 'kx-limit' + (full ? ' kx-limit--full' : '');
      }
      groupsOf(sec).forEach(function (g) {
        var groupAttempted = att.indexOf(g.id) >= 0;
        g.items.forEach(function (q) {
          var ed = edOf(q.qId);
          if (!ed) return;
          var lock = (full && !groupAttempted) || !!S.draft.submitPending;
          ed.setAttribute('contenteditable', lock ? 'false' : 'true');
          var wrap = ed.closest('.kx-q'); if (wrap) wrap.classList.toggle('kx-q--locked', lock);
          var c = S.mount.querySelector('[data-count-for="' + q.qId + '"]');
          var max = Number(ed.getAttribute('data-max')) || 0, len = plainLen(ed);
          if (c) {
            c.textContent = len + ' / ' + max + ' characters' + ((full && !groupAttempted) ? ' · limit reached' : '');
            c.classList.toggle('bb-answer-count--full', len >= max);
          }
        });
        var gEl = S.mount.querySelector('[data-group="' + g.id + '"]');
        if (gEl) gEl.classList.toggle('kx-group--on', groupAttempted);
      });
    });
  }
  function setTxt(id, t) { var n = S.mount.querySelector('#' + id); if (n) n.textContent = t; }

  function showTab(tab, silent) {
    if (!S) return;
    if (tab !== 'A' && S.draft.phase === 'A') {
      toast('Sections B and C open when you press “Go to Sections B & C” or when the MCQ time ends.', 'info');
      tab = 'A';
    }
    S.draft.tab = tab;
    ['A', 'B', 'C'].forEach(function (id) {
      var p = S.mount.querySelector('[data-panel="' + id + '"]'); if (p) p.hidden = (id !== tab);
      var b = S.mount.querySelector('.kx-tab[data-tab="' + id + '"]');
      if (b) { b.classList.toggle('kx-tab--on', id === tab); b.setAttribute('aria-selected', id === tab ? 'true' : 'false');
        b.classList.toggle('kx-tab--locked', id !== 'A' && S.draft.phase === 'A'); }
    });
    if (!silent) { flush(); global.scrollTo({ top: 0, behavior: 'smooth' }); }
  }

  // ---- phases & timers ------------------------------------------------------------------------
  function goToBC(auto) {
    if (!S || S.draft.phase !== 'A') return;
    if (!auto) {
      var A = qsOf('A'), left = A.filter(function (q) { return S.draft.answers[q.qId] === undefined; }).length;
      var rs = rollStatus();
      var msg = (rs.ok ? '' : 'Your Roll Number is not filled correctly yet. You can fix it later from Section A.\n\n') +
        (left ? 'You have ' + left + ' MCQ(s) unanswered. You can still come back to Section A later. Move to Sections B & C now? The 2 h 40 min timer will start.'
        : 'All MCQs answered. Move to Sections B & C now? The 2 h 40 min timer will start.');
      if (!global.confirm(msg)) return;
    }
    var at = auto ? Math.min(Date.now(), S.draft.mcqDeadline) : Date.now();
    S.draft.phase = 'BC'; S.draft.subjDeadline = at + S.T.subj; S.draft.tab = 'B';
    saveDraftNow();
    var btn = S.mount.querySelector('#kx-to-bc'); if (btn) btn.hidden = true;
    showTab('B', false);
    toast(auto ? 'MCQ time is over. Sections B and C are open now.' : 'Sections B and C are open. Your 2 h 40 min timer has started.', 'info');
    tick();
  }
  function startTicking() {
    if (S.tickId) clearInterval(S.tickId);
    var btn = S.mount.querySelector('#kx-to-bc'); if (btn) btn.hidden = (S.draft.phase !== 'A');
    tick();
    S.tickId = setInterval(tick, 1000);
  }
  function tick() {
    if (!S) return;
    var now = Date.now(), d = S.draft;
    if (d.phase === 'A' && now >= d.mcqDeadline) { goToBC(true); }
    if (!S) return;
    if (d.phase === 'BC' && now >= d.subjDeadline) { setTimer('BC', 0); autoSubmit(); return; }
    if (d.submitPending) return;
    var left = d.phase === 'A' ? d.mcqDeadline - now : d.subjDeadline - now;
    setTimer(d.phase, left);
    if (d.phase === 'BC' && left <= 300000 && !S.warned5) { S.warned5 = true; toast('5 minutes left. Your paper will be submitted automatically when time ends.', 'warning'); }
  }
  function setTimer(phase, left) {
    var box = ensureClock(), lab = document.getElementById('kx-timer-label'), val = document.getElementById('kx-timer-val');
    if (!val) return;
    lab.textContent = phase === 'A' ? 'Section A ⏱' : 'Sections B & C ⏱';
    val.textContent = fmt(left);
    box.className = 'kx-clock' + (left <= 60000 ? ' kx-clock--crit' : left <= 300000 ? ' kx-clock--warn' : '');
  }
  function autoSubmit() {
    if (S.submitting || S.draft.submitPending) return;
    toast('Time is over — submitting your paper.', 'info');
    submit(true, false);
  }

  // ---- submit (the ONE backend write) ---------------------------------------------------------
  function summary() {
    var A = qsOf('A'), a = A.filter(function (q) { return S.draft.answers[q.qId] !== undefined; }).length;
    var b = attemptedGroups('B').length, c = attemptedGroups('C').length;
    return { a: a, aOf: A.length, b: b, bAtt: sectionDef('B').attempt, c: c, cAtt: sectionDef('C').attempt };
  }
  function setBanner(html, kind) {
    var n = S && S.mount.querySelector('#kx-banner'); if (!n) return;
    if (!html) { n.hidden = true; n.innerHTML = ''; return; }
    n.hidden = false; n.className = 'kx-banner' + (kind ? ' kx-banner--' + kind : ''); n.innerHTML = html;
  }
  function lockUi(lock) {
    ['#kx-submit', '#kx-submit2', '#kx-to-bc', '#kx-exit'].forEach(function (id) {
      var n = S.mount.querySelector(id); if (n) n.disabled = lock;
    });
    refreshAll();
  }
  async function submit(auto, resuming) {
    if (!S || S.submitting) return;
    var sm = summary();
    if (!auto && !resuming) {
      var rs = rollStatus();
      if (!rs.ok) {
        showTab('A', false);
        toast('Fill your Roll Number correctly before submitting. ' + rs.msg, 'error');
        var rEl = S.mount.querySelector('#kx-roll'); if (rEl && rEl.scrollIntoView) rEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      var msg = 'Submit your paper now?\n\nRoll number: ' + S.draft.roll.join('') + '\nSection A: ' + sm.a + ' of ' + sm.aOf + ' answered\nSection B: ' + sm.b + ' of ' + sm.bAtt +
        ' attempted\nSection C: ' + sm.c + ' of ' + sm.cAtt + ' attempted\n\nOnce submitted you cannot change your answers.';
      if (!global.confirm(msg)) return;
    }
    S.submitting = true;
    S.draft.submitPending = true;
    flush();
    lockUi(true);
    setBanner('<b>Submitting…</b> Please keep this page open.', 'info');
    var answers = {};
    Object.keys(S.draft.answers).forEach(function (k) { var v = S.draft.answers[k]; if (v !== undefined && v !== '') answers[k] = v; });
    answers.__roll = rollString();
    var pid = S.paper.paperId, hooks = S.hooks;
    try {
      await Api.bossBattle.submit(pid, answers);
      done(pid, hooks);
    } catch (err) {
      var m = (err && err.message) || '';
      if (/already submitted/i.test(m)) { done(pid, hooks); return; }
      if (!S) return;
      S.submitting = false;
      var offline = (err && err.isNetworkError) || (global.navigator && global.navigator.onLine === false);
      if (offline) {
        setBanner('<b>No internet right now.</b> Your paper is safely saved on this device. It will be sent automatically as soon as you are online — keep this page open, or open it again later. ' +
          '<button class="btn btn--primary btn--sm" id="kx-retry" type="button">Try again now</button>', 'warn');
        var r = S.mount.querySelector('#kx-retry'); if (r) r.addEventListener('click', function () { submit(true, true); });
        if (S.retryId) clearInterval(S.retryId);
        S.retryId = setInterval(function () { if (S && !S.submitting && S.draft.submitPending && global.navigator.onLine !== false) submit(true, true); }, RETRY_MS);
      } else {
        S.draft.submitPending = false; saveDraftNow(); lockUi(false);
        setBanner('<b>Could not submit:</b> ' + esc(m || 'Please try again.') + ' Your answers are still saved on this device.', 'bad');
        toast(m || 'Could not submit. Please try again.', 'error');
      }
    }
  }
  function done(pid, hooks) {
    var who = S && S.who;
    if (S && S.tickId) clearInterval(S.tickId);
    if (S && S.retryId) clearInterval(S.retryId);
    if (S && S.saveTimer) clearTimeout(S.saveTimer);
    lsDel(dKey(pid, who)); lsDel(pKey(pid, who));
    unbindLifecycle();
    removeClock();
    S = null;
    toast('Paper submitted! Section A is checked already; your teacher will mark B and C.', 'success');
    hooks.onDone(pid);
  }

  // ---- result view ----------------------------------------------------------------------------
  function renderResult(sub, mount, hooks) {
    removeClock();
    var items = sub.items || [], graded = !!sub.graded;
    var mcq = items.filter(function (i) { return i.type === 'mcq'; });
    var auto = sub.autoMcq || { awarded: 0, total: 0 };
    var head = graded
      ? '<div class="bb-result-score"><div class="bb-result-score__ring"><span>' + esc(sub.awardedMarks) + '</span><small>/ ' + esc(sub.totalMarks) + '</small></div>' +
        '<div><h2 class="bb-result-score__title">Paper graded!</h2>' +
        (Number(sub.totalMarks) > 0 ? '<p class="bb-result-score__pct">' + Math.round(Number(sub.awardedMarks) / Number(sub.totalMarks) * 100) + '%</p>' : '') +
        '<p class="bb-result-score__sub">Section A was auto-checked. Sections B and C were marked by your teacher.</p></div></div>'
      : '<div class="bb-result-pending"><div class="bb-result-pending__spinner" aria-hidden="true"></div><div>' +
        '<h2 class="bb-result-pending__title">Submitted — Section A checked</h2>' +
        '<p class="bb-result-pending__sub">MCQs: <strong>' + esc(auto.awarded) + ' / ' + esc(auto.total) + '</strong> (auto-checked). Your teacher will mark Sections B and C; the full result will appear here.</p></div></div>';

    var rollLine = '';
    if (sub.roll && sub.roll.filled) {
      var okRoll = sub.roll.assigned && sub.roll.filled.replace(/^0+/, '') === sub.roll.assigned.replace(/^0+/, '');
      rollLine = '<p class="kx-rollline">Roll number you filled: <b>' + esc(sub.roll.filled.replace(/_/g, '·')) + '</b>' +
        (sub.roll.assigned ? (okRoll ? ' ✓ matches your roll number' : ' — your roll number is <b>' + esc(sub.roll.assigned) + '</b>') : '') + '</p>';
    }

    var omr = '';
    if (mcq.length) {
      omr = '<div class="kx-sec-head"><h3>Section A — your OMR sheet <span>' + esc(auto.awarded) + ' / ' + esc(auto.total) + '</span></h3></div>' +
        '<div class="kx-omr-wrap"><table class="kx-omr kx-omr--result"><thead><tr><th class="kx-omr__no">#</th><th class="kx-omr__stmt">Statement</th>' +
        '<th class="kx-omr__col">Your answer</th><th class="kx-omr__col">Correct</th></tr></thead><tbody>' +
        mcq.map(function (it, i) {
          var picked = (it.yourAnswer === '' || it.yourAnswer == null) ? null : Number(it.yourAnswer);
          var L = function (n) { return n == null ? '—' : String.fromCharCode(65 + n); };
          return '<tr class="' + (it.autoCorrect ? 'kx-row--ok' : 'kx-row--bad') + '"><td class="kx-omr__no">' + (i + 1) + '</td>' +
            '<td class="kx-omr__stmt"><div class="kx-omr__q">' + mathHtml(it.text) + '</div></td>' +
            '<td class="kx-omr__col"><span class="kx-mark ' + (it.autoCorrect ? 'kx-mark--ok' : 'kx-mark--bad') + '">' + L(picked) + '</span></td>' +
            '<td class="kx-omr__col"><span class="kx-mark kx-mark--key">' + L(it.correctIndex == null ? null : Number(it.correctIndex)) + '</span></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    function written(sec, title) {
      var list = items.filter(function (i) { return i.section === sec; });
      if (!list.length) return '';
      return '<div class="kx-sec-head"><h3>' + esc(title) + '</h3></div>' + list.map(function (it) {
        var ans = it.attempted ? '<div class="kx-rich">' + richHtml(it.yourAnswer) + '</div>' : '<em class="bb-muted-note">Not attempted</em>';
        var g = graded && it.attempted
          ? '<div class="bb-result-q__graded"><span class="bb-pill bb-pill--graded">' + (it.awardedMarks == null ? '—' : esc(it.awardedMarks)) + ' / ' + esc(it.marks) + '</span>' +
            (it.correction ? '<p class="bb-result-q__fb"><strong>Teacher:</strong> ' + esc(it.correction).replace(/\n/g, '<br>') + '</p>' : '') + '</div>' : '';
        var model = '';
        if (graded && it.attempted && it.modelAnswer) {
          model = '<details class="kx-model"><summary>Model answer &amp; marking points</summary><div class="kx-model__body">' +
            '<p>' + esc(it.modelAnswer).replace(/\n/g, '<br>') + '</p>' +
            ((it.rubric && it.rubric.length) ? '<ul>' + it.rubric.map(function (r) { return '<li>' + esc(r.t) + ' <em>(' + esc(r.m) + ')</em></li>'; }).join('') + '</ul>' : '') +
            '</div></details>';
        }
        return '<div class="bb-result-q' + (it.attempted ? '' : ' kx-q--skipped') + '"><div class="bb-q__head"><span class="kx-q__label">' + esc(it.label || '') + '</span>' +
          '<div class="bb-q__text">' + mathHtml(it.text) + '</div><span class="bb-q__marks">' + esc(it.marks) + '</span></div>' +
          '<div class="bb-result-q__ans"><span class="bb-result-q__label">Your answer</span><div class="bb-result-q__ansbody">' + ans + '</div></div>' + g + model + '</div>';
      }).join('');
    }
    var overall = (graded && sub.overallFeedback) ? '<div class="bb-result-overall"><span class="bb-result-overall__label">Overall feedback</span><p class="bb-result-overall__body">' +
      esc(sub.overallFeedback).replace(/\n/g, '<br>') + '</p></div>' : '';
    mount.innerHTML = '<div class="bb-paper-sheet kx-sheet"><div class="bb-paper-topbar"><button class="btn btn--tertiary btn--sm" id="kx-res-back" type="button">‹ Back to Arena</button></div>' +
      '<h2 class="bb-paper-head__title" style="margin-bottom:var(--space-4);">' + esc(sub.paperTitle || 'Your submission') + '</h2>' +
      head + rollLine + overall + omr + written('B', 'Section B — Short questions') + written('C', 'Section C — Long questions') + '</div>';
    if (global.MathText) global.MathText.render(mount);
    mount.querySelector('#kx-res-back').addEventListener('click', function () { hooks.onBack(); });
    hooks.showView('bb-result-view');
  }

  global.BossKpkExam = {
    discard: discard, isBoardPaper: isBoardPaper, start: start, tryOffline: tryOffline, hasDraft: hasDraft,
    cardNote: cardNote, renderResult: renderResult, richHtml: richHtml, stop: stop,
    _debug: function () { return S; }
  };
})(window);
