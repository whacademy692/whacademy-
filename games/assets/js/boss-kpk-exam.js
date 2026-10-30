/**
 * boss-kpk-exam.js — W.H. Academy
 * Board-exam screen for Boss Battle papers whose layout.format === 'board-exam'
 * (KPK / BISE pattern: Section A 12 MCQs on an OMR-style sheet, Section B any 8 of 11
 * short questions, Section C any 3 of 4 long questions).
 *
 * Rules implemented here:
 *  - Section A opens first with its own timer (layout.timing.mcqMinutes, 20).
 *  - "Go to Sections B & C" button moves on early; when the MCQ timer ends it moves on by itself.
 *  - Sections B & C get layout.timing.subjectiveMinutes (160 = 2 h 40 min). The student can go
 *    back to Section A at any time; nothing already written is lost.
 *  - EVERY answer is autosaved to this device (localStorage) while the student works, so a power
 *    cut, lost internet, dead phone, refresh or closed tab loses nothing. The paper itself is cached
 *    on the device too, so an open exam can be resumed even with no internet.
 *  - NOTHING is sent to the server until the student presses Submit (or the exam time ends).
 *    One write, at the end. If the network is down at that moment the answers stay saved on the
 *    device and are sent automatically as soon as the student is online again.
 *  - Timers are wall-clock deadlines stored in the draft, so closing the page does not pause them.
 *
 * Public API (global BossKpkExam):
 *   isBoardPaper(paper)            -> bool
 *   start(data, hooks)             -> opens the exam (intro / resume) for an Api.bossBattle.paper() result
 *   tryOffline(paperId, hooks)     -> true if a saved draft + cached paper let us open the exam offline
 *   hasDraft(paperId)              -> bool
 *   cardNote(paper)                -> html chip for the list card
 *   renderResult(submission, el, hooks) -> board-style result view
 * hooks = { showView(name), onDone(paperId), onBack() }
 */
(function (global) {
  'use strict';

  var PFX = 'whx:kpk:'; // own prefix on purpose: Storage.clearAll() (logout) only clears 'wha:' keys
  var RETRY_MS = 15000;

  function esc(v) { return Utils.escapeHtml(v == null ? '' : String(v)); }
  function mathHtml(text) {
    return global.MathText ? global.MathText.toHtml(text) : esc(text).replace(/\n/g, '<br>');
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
  function nonBlank(v) { return v != null && String(v).replace(/\s+/g, '').length > 0; }
  function fmt(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    var mm = (m < 10 ? '0' : '') + m, xx = (x < 10 ? '0' : '') + x;
    return h > 0 ? h + ':' + mm + ':' + xx : mm + ':' + xx;
  }
  function isBoardPaper(p) { return !!(p && p.layout && p.layout.format === 'board-exam'); }

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

  function saveDraftNow() {
    if (!S) return true;
    S.draft.updatedAt = Date.now();
    var ok = lsSet(dKey(S.paper.paperId, S.who), S.draft);
    setSaveState(ok);
    return ok;
  }
  function scheduleSave() {
    setSaveState('dirty');
    if (S.saveTimer) clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(function () { S.saveTimer = null; saveDraftNow(); }, 350);
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
  function hasDraft(pid) { return !!lsGet(dKey(pid)); }
  function cardNote(paper) {
    if (!paper || !paper.boardExam) return '';
    var t = paper.timing || {};
    var txt = '📝 Board exam · ' + (Number(t.mcqMinutes) || 20) + ' min MCQs + ' + fmtHM((Number(t.subjectiveMinutes) || 160)) + ' written';
    var resume = (!paper.attempted && hasDraft(paper.paperId)) ? ' <span class="bb-pill bb-pill--pending">In progress · resume</span>' : '';
    return '<p class="kx-card-note">' + esc(txt) + resume + '</p>';
  }
  function fmtHM(mins) { var h = Math.floor(mins / 60), m = mins % 60; return (h ? h + ' h ' : '') + (m ? m + ' min' : '').trim(); }

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
      draft = { v: 1, paperId: paper.paperId, answers: {}, phase: 'intro', tab: 'A', startedAt: null,
        mcqDeadline: null, subjDeadline: null, submitPending: false, updatedAt: Date.now() };
    }
    S = { paper: paper, student: student, layout: layout, hooks: hooks, mount: mount, draft: draft, who: who,
      T: T, tickId: null, saveTimer: null, retryId: null, submitting: false, warned5: false };
    bindLifecycle();
    hooks.showView('bb-attempt-view');
    if (draft.submitPending) { renderShell(); submit(true, true); return; }
    if (draft.phase === 'intro') renderIntro(); else { renderShell(); startTicking(); }
  }
  function stop() {
    if (!S) return;
    flush();
    if (S.tickId) clearInterval(S.tickId);
    if (S.retryId) clearInterval(S.retryId);
    unbindLifecycle();
    S = null;
  }

  // ---- lifecycle (save when the page is hidden / closed, resend when back online) ----------------
  var lifecycleBound = false;
  function onHide() { if (document.visibilityState === 'hidden') flush(); }
  function onPageHide() { flush(); }
  function onOnline() { if (S && S.draft.submitPending && !S.submitting) submit(true, true); }
  function bindLifecycle() {
    if (lifecycleBound) return; lifecycleBound = true;
    document.addEventListener('visibilitychange', onHide);
    global.addEventListener('pagehide', onPageHide);
    global.addEventListener('online', onOnline);
  }
  function unbindLifecycle() {
    if (!lifecycleBound) return; lifecycleBound = false;
    document.removeEventListener('visibilitychange', onHide);
    global.removeEventListener('pagehide', onPageHide);
    global.removeEventListener('online', onOnline);
  }

  // ---- intro ----------------------------------------------------------------------------------
  function renderIntro() {
    var p = S.paper, L = S.layout, T = S.T;
    var secs = (L.sections || []).map(function (s) {
      return '<li><strong>Section ' + esc(s.id) + '</strong> — ' + esc(s.title || '') + ': ' +
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
            '<div><b>' + fmt(T.mcq).replace(/^0/, '') + '</b><span>min · Section A (MCQs) first</span></div>' +
            '<div><b>' + fmt(T.subj) + '</b><span>h:mm:ss · Sections B &amp; C</span></div>' +
          '</div>' +
          '<ul class="kx-rules">' +
            '<li>Section A opens first. Fill the circle for your answer — like an OMR sheet. Tap the same circle again to clear it.</li>' +
            '<li>Finished early? Use <em>Go to Sections B &amp; C</em>. You can come back to Section A any time; nothing you wrote is lost.</li>' +
            '<li>Your answers are saved on this device automatically. Power cut, no internet, phone off or page closed — open the paper again on the <strong>same device and browser</strong> and carry on.</li>' +
            '<li>Your paper is sent to your teacher <strong>only when you press Submit</strong> (or when the time ends). You can submit before the time ends.</li>' +
            '<li>The clock keeps running even if you close the page, just like in the real exam hall.</li>' +
            '<li>Once submitted, answers cannot be changed. Section A is checked automatically; Sections B and C are marked by your teacher.</li>' +
          '</ul>' +
          '<button class="btn btn--primary btn--lg" id="kx-begin" type="button">Start exam — Section A timer begins</button>' +
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
      if (!map[g]) { map[g] = { id: g, num: (q.num != null ? q.num : (q.group != null ? q.group : '')), items: [] }; order.push(g); }
      map[g].items.push(q);
    });
    return order.map(function (g) { return map[g]; });
  }

  function renderShell() {
    var mcq = qsOf('A');
    S.mount.innerHTML =
      '<div class="bb-paper-sheet kx-sheet">' +
        '<div class="kx-bar" id="kx-bar">' +
          '<div class="kx-bar__row">' +
            '<button class="btn btn--tertiary btn--sm" id="kx-exit" type="button">‹ Save &amp; leave</button>' +
            '<div class="kx-timer" id="kx-timer" role="timer" aria-live="off"><span id="kx-timer-label"></span><b id="kx-timer-val">--:--</b></div>' +
            '<button class="btn btn--primary btn--sm" id="kx-submit" type="button">Submit paper</button>' +
          '</div>' +
          '<div class="kx-tabs" role="tablist">' +
            '<button class="kx-tab" data-tab="A" role="tab" type="button">A · MCQs <small id="kx-cnt-A"></small></button>' +
            '<button class="kx-tab" data-tab="B" role="tab" type="button">B · Short <small id="kx-cnt-B"></small></button>' +
            '<button class="kx-tab" data-tab="C" role="tab" type="button">C · Long <small id="kx-cnt-C"></small></button>' +
          '</div>' +
          '<div class="kx-save" id="kx-save"></div>' +
        '</div>' +
        '<div class="kx-banner" id="kx-banner" hidden></div>' +
        '<h2 class="bb-paper-head__title kx-title">' + esc(S.paper.title) + '</h2>' +
        '<section class="kx-panel" data-panel="A">' + panelA(mcq) + '</section>' +
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
    return '<div class="kx-sec-head"><h3>Section A — Multiple choice <span>' + esc(s.of || mcq.length) + ' questions · ' +
      esc(s.marksEach) + ' mark each · compulsory</span></h3>' +
      '<p class="kx-hint">Fill ONE circle per question. Tap a filled circle again to clear it.</p></div>' +
      '<div class="kx-omr-wrap"><table class="kx-omr"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="kx-nav"><button class="btn btn--secondary" id="kx-to-bc" type="button">Go to Sections B &amp; C →</button></div>';
  }

  function qBlock(q, label) {
    var rows = Utils.clamp(Math.ceil((Number(q.maxChars) || 700) / 90), 4, 14);
    var lim = Number(q.maxChars) || 1100;
    return '<div class="kx-q" data-qwrap="' + esc(q.qId) + '">' +
      '<div class="bb-q__head"><span class="kx-q__label">' + esc(label) + '</span>' +
        '<div class="bb-q__text">' + mathHtml(q.text) + '</div>' +
        '<span class="bb-q__marks">' + esc(q.marks) + '</span></div>' +
      (q.split ? '<p class="kx-split">Marks split: ' + esc(q.split) + '</p>' : '') +
      '<textarea class="bb-answer kx-answer" data-qid="' + esc(q.qId) + '" rows="' + rows + '" maxlength="' + lim + '" placeholder="Write your answer here…"></textarea>' +
      '<div class="bb-answer-meta"><span class="bb-answer-count" data-count-for="' + esc(q.qId) + '">0 / ' + lim + ' characters</span></div>' +
    '</div>';
  }
  function panelB() {
    var s = sectionDef('B');
    var qs = qsOf('B').map(function (q) { return qBlock(q, 'Q.' + (q.label || q.num)); }).join('');
    return '<div class="kx-sec-head"><h3>Section B — Short questions <span>attempt any ' + esc(s.attempt) + ' of ' + esc(s.of) + ' · ' +
      esc(s.marksEach) + ' marks each</span></h3>' +
      '<p class="kx-limit" id="kx-limit-B"></p></div>' + qs +
      '<div class="kx-nav"><button class="btn btn--tertiary" data-go="A" type="button">← Back to MCQs</button>' +
      '<button class="btn btn--secondary" data-go="C" type="button">Section C →</button></div>';
  }
  function panelC() {
    var s = sectionDef('C');
    var gs = groupsOf('C').map(function (g) {
      var tot = g.items.reduce(function (a, q) { return a + (Number(q.marks) || 0); }, 0);
      var inner = g.items.map(function (q) {
        return qBlock(q, q.part ? '(' + q.part + ')' : '');
      }).join('');
      return '<div class="kx-group" data-group="' + esc(g.id) + '"><div class="kx-group__head">Question C-' + esc(g.num) +
        ' <span>' + esc(tot) + ' marks</span></div>' + inner + '</div>';
    }).join('');
    return '<div class="kx-sec-head"><h3>Section C — Long questions <span>attempt any ' + esc(s.attempt) + ' of ' + esc(s.of) + ' · ' +
      esc(s.marksEach) + ' marks each</span></h3>' +
      '<p class="kx-limit" id="kx-limit-C"></p></div>' + gs +
      '<div class="kx-nav"><button class="btn btn--tertiary" data-go="B" type="button">← Section B</button>' +
      '<button class="btn btn--tertiary" data-go="A" type="button">← Back to MCQs</button>' +
      '<button class="btn btn--primary" id="kx-submit2" type="button">Submit paper</button></div>';
  }

  // ---- events ---------------------------------------------------------------------------------
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
    m.onclick = function (e) {
      var b = e.target.closest ? e.target.closest('.kx-bubble') : null;
      if (!b || S.draft.submitPending) return;
      var q = b.getAttribute('data-q'), i = Number(b.getAttribute('data-i'));
      if (S.draft.answers[q] === i) delete S.draft.answers[q]; else S.draft.answers[q] = i;
      paintMcq(q); refreshAll(); scheduleSave();
    };
    m.oninput = function (e) {
      var t = e.target;
      if (!t || !t.classList || !t.classList.contains('kx-answer')) return;
      var qid = t.getAttribute('data-qid');
      if (nonBlank(t.value)) S.draft.answers[qid] = t.value; else delete S.draft.answers[qid];
      refreshAll(); scheduleSave();
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
    Array.prototype.forEach.call(S.mount.querySelectorAll('.kx-answer'), function (t) {
      var v = S.draft.answers[t.getAttribute('data-qid')];
      if (v != null) t.value = v;
    });
  }

  // counts, limits (disable extra questions once the allowed number is attempted)
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
          var t = S.mount.querySelector('.kx-answer[data-qid="' + q.qId + '"]');
          if (!t) return;
          var lock = full && !groupAttempted;
          t.disabled = lock;
          var wrap = t.closest('.kx-q'); if (wrap) wrap.classList.toggle('kx-q--locked', lock);
          var c = S.mount.querySelector('[data-count-for="' + q.qId + '"]');
          if (c) c.textContent = (t.value || '').length + ' / ' + (t.maxLength > 0 ? t.maxLength : '') + ' characters' + (lock ? ' · limit reached' : '');
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
  function toast(msg, kind) { try { Notifications.toast(msg, kind || 'info'); } catch (e) { /* ignore */ } }

  // ---- phases & timers ------------------------------------------------------------------------
  function goToBC(auto) {
    if (!S || S.draft.phase !== 'A') return;
    if (!auto) {
      var A = qsOf('A'), left = A.filter(function (q) { return S.draft.answers[q.qId] === undefined; }).length;
      var msg = left ? 'You have ' + left + ' MCQ(s) unanswered. You can still come back to Section A later. Move to Sections B & C now? The 2 h 40 min timer will start.'
        : 'All MCQs answered. Move to Sections B & C now? The 2 h 40 min timer will start.';
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
    if (d.phase === 'BC' && now >= d.subjDeadline) { setTimer('BC', 0); autoSubmit(); return; }
    if (d.submitPending) return;
    var left = d.phase === 'A' ? d.mcqDeadline - now : d.subjDeadline - now;
    setTimer(d.phase, left);
    if (d.phase === 'BC' && left <= 300000 && !S.warned5) { S.warned5 = true; toast('5 minutes left. Your paper will be submitted automatically when time ends.', 'warning'); }
  }
  function setTimer(phase, left) {
    var lab = S.mount.querySelector('#kx-timer-label'), val = S.mount.querySelector('#kx-timer-val'), box = S.mount.querySelector('#kx-timer');
    if (!val) return;
    lab.textContent = phase === 'A' ? 'Section A · ' : 'Sections B & C · ';
    val.textContent = fmt(left);
    box.className = 'kx-timer' + (left <= 60000 ? ' kx-timer--crit' : left <= 300000 ? ' kx-timer--warn' : '');
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
    Array.prototype.forEach.call(S.mount.querySelectorAll('.kx-answer'), function (t) { if (lock) t.disabled = true; });
    if (!lock) refreshAll();
  }
  async function submit(auto, resuming) {
    if (!S || S.submitting) return;
    var sm = summary();
    if (!auto && !resuming) {
      var msg = 'Submit your paper now?\n\nSection A: ' + sm.a + ' of ' + sm.aOf + ' answered\nSection B: ' + sm.b + ' of ' + sm.bAtt +
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
    S = null;
    toast('Paper submitted! Section A is checked already; your teacher will mark B and C.', 'success');
    hooks.onDone(pid);
  }

  // ---- result view ----------------------------------------------------------------------------
  function renderResult(sub, mount, hooks) {
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
        var ans = it.attempted ? esc(it.yourAnswer).replace(/\n/g, '<br>') : '<em class="bb-muted-note">Not attempted</em>';
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
      head + overall + omr + written('B', 'Section B — Short questions') + written('C', 'Section C — Long questions') + '</div>';
    if (global.MathText) global.MathText.render(mount);
    mount.querySelector('#kx-res-back').addEventListener('click', function () { hooks.onBack(); });
    hooks.showView('bb-result-view');
  }

  // Remove a leftover local draft (e.g. the paper was already submitted from another device).
  function discard(pid) { lsDel(dKey(pid)); lsDel(pKey(pid)); }

  global.BossKpkExam = {
    discard: discard, isBoardPaper: isBoardPaper, start: start, tryOffline: tryOffline, hasDraft: hasDraft,
    cardNote: cardNote, renderResult: renderResult, stop: stop,
    _debug: function () { return S; }
  };
})(window);
