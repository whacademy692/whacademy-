/**
 * insights.js — W.H. Academy · public Insights / Feedback page
 *
 * Self-contained on purpose: this page lives at the site root (not inside the
 * games/ app), so it does NOT depend on Storage / Notifications / router. It
 * talks to the SAME Apps Script API.gs endpoint as the rest of the site, using
 * two public routes:
 *     insights/submit    -> writes a row with status=pending (Turnstile-gated)
 *     insights/approved  -> reads approved rows for the list below
 * Chapters come from window.WHA_CONTENT (content-registry.js).
 */
(function () {
  'use strict';

  // Same endpoint + public API key the rest of the site uses (games/assets/js/api.js).
  var API_BASE_URL = 'https://script.google.com/macros/s/AKfycbxjaqW5hmUk6B5gYW3hRjAfsPrbrdZB4a3B3VfJRvfKcfepz4WPYIX_aCVKS-STmiwQIA/exec';
  var API_KEY = 'Jdb-iJByoQ-WA0UwlQrorQOH77buDQjepPH0y2SsDyo';

  var TEXT_MAX = 5000;
  var TOPIC_MAX = 700;

  // ---- tiny DOM + API helpers ---------------------------------------------
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // text/plain avoids a CORS preflight Apps Script can't answer (same trick as api.js).
  function apiCall(operation, params) {
    var body = Object.assign({ operation: operation, apiKey: API_KEY }, params || {});
    return fetch(API_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json(); })
      .then(function (env) {
        if (env && env.success) return env.data || {};
        var e = new Error((env && env.error && env.error.message) || 'Something went wrong.');
        e.code = env && env.error && env.error.code;
        throw e;
      });
  }

  // ---- Turnstile (Option A — no login, bot check only) --------------------
  var Captcha = (function () {
    var SITE_KEY = window.WHA_TURNSTILE_SITE_KEY || '';
    var widgetId;
    return {
      enabled: function () { return !!SITE_KEY; },
      render: function () {
        if (!SITE_KEY || !window.turnstile || widgetId !== undefined) return;
        var host = qs('#captchaHost');
        if (!host) return;
        try { widgetId = window.turnstile.render('#captchaHost', { sitekey: SITE_KEY }); } catch (e) { /* not ready */ }
      },
      token: function () {
        if (!SITE_KEY || !window.turnstile || widgetId === undefined) return '';
        try { return window.turnstile.getResponse(widgetId) || ''; } catch (e) { return ''; }
      },
      reset: function () {
        if (!SITE_KEY || !window.turnstile || widgetId === undefined) return;
        try { window.turnstile.reset(widgetId); } catch (e) { /* ignore */ }
      }
    };
  })();
  // Exposed so the Turnstile onload callback (in the HTML) can trigger a render
  // even if the script loads in the other order.
  window.WHAInsights = { renderCaptcha: function () { Captcha.render(); } };

  // ---- content registry (class -> subject -> chapter) ---------------------
  function content() { return (window.WHA_CONTENT && window.WHA_CONTENT.classes) || {}; }
  function classKeys() {
    return Object.keys(content()).sort(function (a, b) { return Number(a) - Number(b); });
  }
  function subjectsFor(cls) {
    var c = content()[cls] || {};
    return Object.keys(c).map(function (key) { return { key: key, name: (c[key] && c[key].name) || key }; });
  }
  function chaptersFor(cls, subjKey) {
    var s = (content()[cls] || {})[subjKey];
    return (s && s.chapters) || [];
  }
  function subjectName(cls, subjKey) {
    var s = (content()[cls] || {})[subjKey];
    return (s && s.name) || subjKey;
  }

  // ---- field templates -----------------------------------------------------
  function textField(id, label, opts) {
    opts = opts || {};
    var reqMark = opts.required ? ' <span class="req">*</span>' : ' <span class="opt">(optional)</span>';
    return '<div class="field">' +
      '<label class="label" for="' + id + '">' + esc(label) + reqMark + '</label>' +
      '<input class="input" id="' + id + '" type="' + (opts.type || 'text') + '"' +
      (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') +
      (opts.inputmode ? ' inputmode="' + opts.inputmode + '"' : '') + '>' +
      '</div>';
  }
  function areaField(id, label, opts) {
    opts = opts || {};
    var max = opts.max || TEXT_MAX;
    var reqMark = opts.required ? ' <span class="req">*</span>' : ' <span class="opt">(optional)</span>';
    return '<div class="field">' +
      '<label class="label" for="' + id + '">' + esc(label) + reqMark + '</label>' +
      '<textarea class="textarea" id="' + id + '" maxlength="' + max + '"' +
      (opts.rows ? ' rows="' + opts.rows + '"' : '') +
      (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') + '></textarea>' +
      '<span class="charcount" data-for="' + id + '">0 / ' + max + ' characters</span>' +
      '</div>';
  }
  function selectField(id, label) {
    return '<div class="field">' +
      '<label class="label" for="' + id + '">' + esc(label) + ' <span class="req">*</span></label>' +
      '<select class="select" id="' + id + '"></select>' +
      '</div>';
  }
  // class + subject + chapter cascade, shared by student & teacher forms.
  function cascadeFields() {
    return '<div class="grid2">' + selectField('f-class', 'Class') + selectField('f-subject', 'Subject') + '</div>' +
      selectField('f-chapter', 'Chapter') +
      areaField('f-topic', 'Topic(s) — the specific part(s) of the chapter', { required: true, max: TOPIC_MAX, rows: 2, placeholder: 'e.g. Long division of decimals; rounding off; word problems…' });
  }

  // ---- role -> form definition --------------------------------------------
  var ROLES = {
    student: {
      title: 'Student feedback',
      hint: 'Tell us about a specific chapter and topic you studied.',
      fields: function () {
        return textField('f-name', 'Your name', { required: true, placeholder: 'Shown publicly' }) +
          cascadeFields() +
          areaField('f-field1', 'What did you find difficult?', { required: true, placeholder: 'The part that was hard, and why…' }) +
          areaField('f-field2', 'If you solved it, how? (your strategy)', { placeholder: 'What finally made it click…' });
      },
      collect: function () {
        return {
          role: 'student',
          name: val('f-name'),
          classLevel: val('f-class'),
          subject: subjectName(val('f-class'), val('f-subject')),
          chapter: val('f-chapter'),
          topic: val('f-topic'),
          field1: val('f-field1'),
          field2: val('f-field2')
        };
      }
    },
    parent: {
      title: 'Parent feedback',
      hint: 'General feedback — no class or chapter needed.',
      fields: function () {
        return textField('f-name', 'Your name', { required: true, placeholder: 'Shown publicly' }) +
          areaField('f-field1', 'What challenges do you face helping your child study?', { required: true }) +
          areaField('f-field2', 'How do you teach or support them? (your approach)', {}) +
          areaField('f-field3', 'What do you seriously expect from teachers / institutions?', {}) +
          textField('f-schools', "Your child's school", { placeholder: 'Only if you want to mention it' });
      },
      collect: function () {
        return {
          role: 'parent',
          name: val('f-name'),
          schools: val('f-schools'),
          field1: val('f-field1'),
          field2: val('f-field2'),
          field3: val('f-field3')
        };
      }
    },
    teacher: {
      title: 'Teacher feedback',
      hint: 'Share teaching insight for a specific topic — yours or any board topic.',
      fields: function () {
        return '<div class="grid2">' +
            textField('f-name', 'Your name', { required: true, placeholder: 'Shown publicly' }) +
            textField('f-exp', 'Teaching experience (years)', { required: true, inputmode: 'numeric', placeholder: 'e.g. 6' }) +
          '</div>' +
          textField('f-schools', 'Schools you have taught at', { placeholder: 'Only if you want to mention them' }) +
          cascadeFields() +
          areaField('f-field1', 'Teaching tips — how would you teach this topic?', { required: true }) +
          areaField('f-field2', "Students' common mistakes & misconceptions", { required: true }) +
          areaField('f-field3', 'Exam tips / importance of this topic', {});
      },
      collect: function () {
        return {
          role: 'teacher',
          name: val('f-name'),
          experienceYears: val('f-exp'),
          schools: val('f-schools'),
          classLevel: val('f-class'),
          subject: subjectName(val('f-class'), val('f-subject')),
          chapter: val('f-chapter'),
          topic: val('f-topic'),
          field1: val('f-field1'),
          field2: val('f-field2'),
          field3: val('f-field3')
        };
      }
    }
  };

  function val(id) { var n = qs('#' + id); return n ? n.value.trim() : ''; }

  // ---- cascade wiring ------------------------------------------------------
  function fillSelect(sel, items, placeholder) {
    sel.innerHTML = '';
    sel.appendChild(el('option', { value: '' }, esc(placeholder)));
    items.forEach(function (it) { sel.appendChild(el('option', { value: it.value }, esc(it.label))); });
  }
  function wireCascade() {
    var clsSel = qs('#f-class'), subSel = qs('#f-subject'), chSel = qs('#f-chapter');
    if (!clsSel || !subSel || !chSel) return;

    fillSelect(clsSel, classKeys().map(function (k) { return { value: k, label: 'Class ' + k }; }), 'Choose class');
    fillSelect(subSel, [], 'Choose class first'); subSel.disabled = true;
    fillSelect(chSel, [], 'Choose subject first'); chSel.disabled = true;

    clsSel.addEventListener('change', function () {
      var cls = clsSel.value;
      if (!cls) { fillSelect(subSel, [], 'Choose class first'); subSel.disabled = true; fillSelect(chSel, [], 'Choose subject first'); chSel.disabled = true; return; }
      fillSelect(subSel, subjectsFor(cls).map(function (s) { return { value: s.key, label: s.name }; }), 'Choose subject');
      subSel.disabled = false;
      fillSelect(chSel, [], 'Choose subject first'); chSel.disabled = true;
    });
    subSel.addEventListener('change', function () {
      var cls = clsSel.value, sub = subSel.value;
      if (!sub) { fillSelect(chSel, [], 'Choose subject first'); chSel.disabled = true; return; }
      fillSelect(chSel, chaptersFor(cls, sub).map(function (c) { return { value: c.title, label: c.n + '. ' + c.title }; }), 'Choose chapter');
      chSel.disabled = false;
    });
  }

  function wireCharCounts() {
    Array.prototype.forEach.call(document.querySelectorAll('.textarea'), function (t) {
      var counter = document.querySelector('.charcount[data-for="' + t.id + '"]');
      if (!counter) return;
      var max = t.getAttribute('maxlength') || TEXT_MAX;
      var update = function () { counter.textContent = t.value.length + ' / ' + max + ' characters'; };
      t.addEventListener('input', update); update();
    });
  }

  // ---- flow ----------------------------------------------------------------
  var currentRole = null;

  function showNotice(msg, kind) {
    var n = qs('#formNotice');
    n.className = 'notice notice--' + (kind === 'ok' ? 'ok' : 'err');
    n.textContent = msg;
    n.hidden = !msg;
  }

  function openForm(role) {
    currentRole = role;
    var def = ROLES[role];
    qs('#formTitle').textContent = def.title;
    qs('#formHint').textContent = def.hint;
    qs('#formFields').innerHTML = def.fields();
    showNotice('', null);

    if (role === 'student' || role === 'teacher') wireCascade();
    wireCharCounts();

    qs('#pickSection').hidden = true;
    qs('#doneSection').hidden = true;
    qs('#formSection').hidden = false;
    Captcha.render();
    qs('#formSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function backToPicker() {
    currentRole = null;
    qs('#formSection').hidden = true;
    qs('#doneSection').hidden = true;
    Array.prototype.forEach.call(document.querySelectorAll('.role'), function (b) { b.setAttribute('aria-pressed', 'false'); });
    qs('#pickSection').hidden = false;
    qs('#pickSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!currentRole) return;
    showNotice('', null);

    var payload = ROLES[currentRole].collect();

    // Client-side required checks mirror the backend, for a friendlier message.
    if (!payload.name) return showNotice('Please enter your name.', 'err');
    if (!payload.field1) return showNotice('Please fill in the main feedback field.', 'err');
    if (currentRole === 'student' || currentRole === 'teacher') {
      if (!payload.classLevel || !val('f-subject') || !payload.chapter || !payload.topic) {
        return showNotice('Please choose class, subject, chapter and topic.', 'err');
      }
    }
    if (currentRole === 'teacher') {
      if (!payload.experienceYears) return showNotice('Please enter your teaching experience.', 'err');
      if (!payload.field2) return showNotice("Please share students' common mistakes.", 'err');
    }

    if (Captcha.enabled()) {
      var token = Captcha.token();
      if (!token) return showNotice('Please complete the verification check.', 'err');
      payload.captchaToken = token;
    }

    var btn = qs('#submitBtn');
    btn.disabled = true; btn.textContent = 'Submitting…';

    apiCall('insights/submit', payload)
      .then(function () {
        qs('#formSection').hidden = true;
        qs('#doneSection').hidden = false;
        qs('#doneSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
      .catch(function (err) {
        showNotice((err && err.message) || 'Could not submit. Please try again.', 'err');
        Captcha.reset();
      })
      .then(function () { btn.disabled = false; btn.textContent = 'Submit feedback'; });
  }

  // ---- approved feed -------------------------------------------------------
  function block(title, text) {
    if (!text) return '';
    return '<div class="tile__block"><h4>' + esc(title) + '</h4><p>' + esc(text) + '</p></div>';
  }
  function initials(name) {
    var parts = String(name || 'A').trim().split(/\s+/).slice(0, 2);
    return parts.map(function (p) { return p.charAt(0).toUpperCase(); }).join('') || 'A';
  }
  function metaLine(it) {
    var bits = [];
    if (it.role === 'teacher' && it.experienceYears) bits.push('<b>' + esc(it.experienceYears) + '</b> yrs experience');
    if (it.classLevel) bits.push('Class <b>' + esc(it.classLevel) + '</b>');
    if (it.subject) bits.push(esc(it.subject));
    if (it.chapter) bits.push(esc(it.chapter));
    if (it.schools) bits.push(esc(it.schools));
    return bits.join(' · ');
  }
  function tile(it) {
    var roleName = it.role.charAt(0).toUpperCase() + it.role.slice(1);
    var blocks = block('Topic', it.topic);
    if (it.role === 'student') {
      blocks += block('What was difficult', it.field1) + block('How they solved it', it.field2);
    } else if (it.role === 'parent') {
      blocks += block('Challenges', it.field1) + block('Their approach', it.field2) + block('Expectations', it.field3);
    } else {
      blocks += block('Teaching tips', it.field1) + block('Common mistakes', it.field2) + block('Exam tips', it.field3);
    }
    var meta = metaLine(it);
    return '<article class="tile tile--' + esc(it.role) + '">' +
      '<header class="tile__head">' +
        '<div class="tile__avatar tile__avatar--' + esc(it.role) + '">' + esc(initials(it.name)) + '</div>' +
        '<div class="tile__id">' +
          '<div class="tile__name">' + esc(it.name || 'Anonymous') +
            ' <span class="badge badge--' + esc(it.role) + '">' + esc(roleName) + '</span></div>' +
          (meta ? '<div class="tile__meta">' + meta + '</div>' : '') +
        '</div>' +
      '</header>' +
      blocks +
      '</article>';
  }

  // Fetched once, drawn in batches as the reader scrolls (no page reload needed).
  var feedList = [];
  var feedShown = 0;
  var feedObserver = null;
  var FEED_BATCH = 8;

  function renderMoreFeed() {
    var host = qs('#feed');
    var old = document.getElementById('feed-sentinel'); if (old) old.remove();
    var slice = feedList.slice(feedShown, feedShown + FEED_BATCH);
    feedShown += slice.length;
    slice.forEach(function (it) { host.insertAdjacentHTML('beforeend', tile(it)); });
    if (feedShown < feedList.length) {
      host.insertAdjacentHTML('beforeend', '<div id="feed-sentinel" style="height:1px;"></div>');
      var s = document.getElementById('feed-sentinel');
      if (feedObserver) feedObserver.disconnect();
      feedObserver = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) { feedObserver.disconnect(); renderMoreFeed(); }
      }, { rootMargin: '300px' });
      feedObserver.observe(s);
    }
  }

  // Retries a few times: the very first call after a fresh Apps Script deploy
  // can be a cold start, which is why the feed sometimes only appeared after a
  // reload. Now it loads in place, first time.
  function loadFeed(attempt) {
    attempt = attempt || 1;
    var host = qs('#feed');
    apiCall('insights/approved', {})
      .then(function (data) {
        feedList = (data && data.insights) || [];
        feedShown = 0;
        if (feedObserver) { feedObserver.disconnect(); feedObserver = null; }
        if (!feedList.length) { host.innerHTML = '<p class="empty">No insights yet — be the first to share.</p>'; return; }
        host.innerHTML = '';
        renderMoreFeed();
      })
      .catch(function () {
        if (attempt < 3) { setTimeout(function () { loadFeed(attempt + 1); }, 1200); return; }
        host.innerHTML = '<p class="empty">Could not load insights right now. Please refresh.</p>';
      });
  }

  // ---- init ---------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', function () {
    qs('#year').textContent = new Date().getFullYear();

    Array.prototype.forEach.call(document.querySelectorAll('.role'), function (b) {
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(document.querySelectorAll('.role'), function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        openForm(b.getAttribute('data-role'));
      });
    });

    qs('#insightForm').addEventListener('submit', onSubmit);
    qs('#changeRoleBtn').addEventListener('click', backToPicker);
    qs('#againBtn').addEventListener('click', backToPicker);

    Captcha.render();
    loadFeed();
  });
})();
