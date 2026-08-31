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
 *
 * Flow: choose General or Specific -> (Specific also chooses a role) -> fill the
 * form -> submit. General = free feedback / tips / academy suggestions (name +
 * country + one box). Specific = the class/subject/chapter forms, which now let
 * anyone from any board pick "Other - not listed" and type their own.
 */
(function () {
  'use strict';

  // Same endpoint + public API key the rest of the site uses (games/assets/js/api.js).
  var API_BASE_URL = 'https://script.google.com/macros/s/AKfycbxjaqW5hmUk6B5gYW3hRjAfsPrbrdZB4a3B3VfJRvfKcfepz4WPYIX_aCVKS-STmiwQIA/exec';
  var API_KEY = 'Jdb-iJByoQ-WA0UwlQrorQOH77buDQjepPH0y2SsDyo';

  var TEXT_MAX = 5000;
  var TOPIC_MAX = 700;
  var OTHER = '__other__';   // sentinel value for the "not listed" option

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
  // Collapse runs of 3+ newlines down to a single blank line so AI-pasted text
  // with huge gaps still reads cleanly in the public feed.
  function tidy(v) {
    return String(v == null ? '' : v).replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // text/plain avoids a CORS preflight Apps Script can't answer (same trick as api.js).
  function apiCall(operation, params, _attempt) {
    var attempt = _attempt || 1;
    var body = Object.assign({ operation: operation, apiKey: API_KEY }, params || {});
    return fetch(API_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.text(); })
      .then(function (text) {
        var env = null;
        try { env = JSON.parse(text); } catch (e) { env = null; }
        if (env === null) {
          if (operation === 'insights/approved' && attempt < 4) {
            return new Promise(function (resolve) {
              setTimeout(function () { resolve(apiCall(operation, params, attempt + 1)); }, 700 * attempt);
            });
          }
          throw new Error('The server is waking up - please try again in a moment.');
        }
        if (env.success) return env.data || {};
        var e2 = new Error((env.error && env.error.message) || 'Something went wrong.');
        e2.code = env.error && env.error.code;
        throw e2;
      });
  }

  // ---- Turnstile (Option A - no login, bot check only) --------------------
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
  // Compact "before you write" tips, shown at the top of every form.
  function howtoNote() {
    return '<div class="form-howto">' +
      '<b>Tip:</b> write in any language - Roman Urdu (like WhatsApp), Urdu, or English ' +
      '(or your own, if you are outside Pakistan). Using AI is fine, but please ' +
      'remove any extra blank lines so your card stays short and clean.' +
      '</div>';
  }
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
  // A fixed-option select (used by the General form's "What are you?").
  function pickField(id, label, options, required) {
    var reqMark = required ? ' <span class="req">*</span>' : ' <span class="opt">(optional)</span>';
    var opts = '<option value="">Choose...</option>' + options.map(function (o) {
      return '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>';
    }).join('');
    return '<div class="field">' +
      '<label class="label" for="' + id + '">' + esc(label) + reqMark + '</label>' +
      '<select class="select" id="' + id + '">' + opts + '</select>' +
      '</div>';
  }
  function countryField() {
    return textField('f-country', 'Country', { placeholder: 'e.g. Pakistan (any country welcome)' });
  }
  // A hidden "type your own" input revealed when a select is set to "Other".
  function otherInput(id, ph) {
    return '<div class="field field--other" id="' + id + '-wrap" hidden>' +
      '<input class="input" id="' + id + '" type="text" placeholder="' + esc(ph) + '">' +
      '</div>';
  }
  // class + subject + chapter cascade, shared by student & teacher forms.
  function cascadeFields() {
    return '<div class="grid2">' + selectField('f-class', 'Class') + selectField('f-subject', 'Subject') + '</div>' +
      otherInput('f-class-other', 'Type your class (e.g. Grade 8, O-Level)') +
      otherInput('f-subject-other', 'Type your subject') +
      selectField('f-chapter', 'Chapter') +
      otherInput('f-chapter-other', 'Type your chapter / unit name') +
      areaField('f-topic', 'Topic(s) - the specific part(s) of the chapter', { required: true, max: TOPIC_MAX, rows: 2, placeholder: 'e.g. Long division of decimals; rounding off; word problems...' });
  }

  // ---- General form (free feedback / tips / academy suggestions) -----------
  function generalFields() {
    return howtoNote() +
      textField('f-name', 'Your name', { required: true, placeholder: 'Shown publicly' }) +
      '<div class="grid2">' +
        pickField('f-who', 'What are you?', [
          { value: 'student', label: 'Student' },
          { value: 'parent', label: 'Parent' },
          { value: 'teacher', label: 'Teacher' },
          { value: 'other', label: 'Other' }
        ], true) +
        countryField() +
      '</div>' +
      areaField('f-field1', 'Your feedback, tip or suggestion', {
        required: true,
        placeholder: 'Anything about education in general, a problem you notice, or a suggestion for W.H. Academy...'
      });
  }
  function generalCollect() {
    var who = (val('f-who') || 'other').toLowerCase();
    return {
      category: 'general',
      role: who,
      name: val('f-name'),
      country: val('f-country'),
      field1: val('f-field1')
    };
  }

  // ---- role -> form definition (Specific path) -----------------------------
  var ROLES = {
    student: {
      title: 'Student feedback',
      hint: 'Tell us about a specific chapter and topic you studied.',
      fields: function () {
        return howtoNote() +
          textField('f-name', 'Your name', { required: true, placeholder: 'Shown publicly' }) +
          countryField() +
          cascadeFields() +
          areaField('f-field1', 'What did you find difficult?', { required: true, placeholder: 'The part that was hard, and why...' }) +
          areaField('f-field2', 'If you solved it, how? (your strategy)', { placeholder: 'What finally made it click...' });
      },
      collect: function () {
        var c = cascadeValues();
        return {
          category: 'specific',
          role: 'student',
          name: val('f-name'),
          country: val('f-country'),
          classLevel: c.classLevel,
          subject: c.subject,
          chapter: c.chapter,
          topic: c.topic,
          field1: val('f-field1'),
          field2: val('f-field2')
        };
      }
    },
    parent: {
      title: 'Parent feedback',
      hint: 'General feedback - no class or chapter needed.',
      fields: function () {
        return howtoNote() +
          textField('f-name', 'Your name', { required: true, placeholder: 'Shown publicly' }) +
          countryField() +
          areaField('f-field1', 'What challenges do you face helping your child study?', { required: true }) +
          areaField('f-field2', 'How do you teach or support them? (your approach)', {}) +
          areaField('f-field3', 'What do you seriously expect from teachers / institutions?', {}) +
          textField('f-schools', "Your child's school", { placeholder: 'Only if you want to mention it' });
      },
      collect: function () {
        return {
          category: 'specific',
          role: 'parent',
          name: val('f-name'),
          country: val('f-country'),
          schools: val('f-schools'),
          field1: val('f-field1'),
          field2: val('f-field2'),
          field3: val('f-field3')
        };
      }
    },
    teacher: {
      title: 'Teacher feedback',
      hint: 'Share teaching insight for a specific topic - yours or any board topic.',
      fields: function () {
        return howtoNote() +
          '<div class="grid2">' +
            textField('f-name', 'Your name', { required: true, placeholder: 'Shown publicly' }) +
            textField('f-exp', 'Teaching experience (years)', { required: true, inputmode: 'numeric', placeholder: 'e.g. 6' }) +
          '</div>' +
          countryField() +
          textField('f-schools', 'Schools you have taught at', { placeholder: 'Only if you want to mention them' }) +
          cascadeFields() +
          areaField('f-field1', 'Teaching tips - how would you teach this topic?', { required: true }) +
          areaField('f-field2', "Students' common mistakes & misconceptions", { required: true }) +
          areaField('f-field3', 'Exam tips / importance of this topic', {});
      },
      collect: function () {
        var c = cascadeValues();
        return {
          category: 'specific',
          role: 'teacher',
          name: val('f-name'),
          country: val('f-country'),
          experienceYears: val('f-exp'),
          schools: val('f-schools'),
          classLevel: c.classLevel,
          subject: c.subject,
          chapter: c.chapter,
          topic: c.topic,
          field1: val('f-field1'),
          field2: val('f-field2'),
          field3: val('f-field3')
        };
      }
    }
  };

  function val(id) { var n = qs('#' + id); return n ? n.value.trim() : ''; }

  // ---- cascade wiring (with "Other - not listed") --------------------------
  function fillSelect(sel, items, placeholder, withOther) {
    sel.innerHTML = '';
    sel.appendChild(el('option', { value: '' }, esc(placeholder)));
    items.forEach(function (it) { sel.appendChild(el('option', { value: it.value }, esc(it.label))); });
    if (withOther) sel.appendChild(el('option', { value: OTHER }, 'Other - not listed'));
  }
  function showOther(id, show) {
    var w = qs('#' + id + '-wrap');
    if (w) w.hidden = !show;
    if (!show) { var i = qs('#' + id); if (i) i.value = ''; }
  }
  function wireCascade() {
    var clsSel = qs('#f-class'), subSel = qs('#f-subject'), chSel = qs('#f-chapter');
    if (!clsSel || !subSel || !chSel) return;

    fillSelect(clsSel, classKeys().map(function (k) { return { value: k, label: 'Class ' + k }; }), 'Choose class', true);
    fillSelect(subSel, [], 'Choose class first', false); subSel.disabled = true;
    fillSelect(chSel, [], 'Choose subject first', false); chSel.disabled = true;
    showOther('f-class-other', false); showOther('f-subject-other', false); showOther('f-chapter-other', false);

    clsSel.addEventListener('change', function () {
      var cls = clsSel.value;
      if (cls === OTHER) {
        // Non-APSACS board: let them type class, subject and chapter freely.
        showOther('f-class-other', true);
        subSel.disabled = true; fillSelect(subSel, [], 'Type subject below', false); showOther('f-subject-other', true);
        chSel.disabled = true; fillSelect(chSel, [], 'Type chapter below', false); showOther('f-chapter-other', true);
        return;
      }
      showOther('f-class-other', false);
      if (!cls) {
        fillSelect(subSel, [], 'Choose class first', false); subSel.disabled = true; showOther('f-subject-other', false);
        fillSelect(chSel, [], 'Choose subject first', false); chSel.disabled = true; showOther('f-chapter-other', false);
        return;
      }
      fillSelect(subSel, subjectsFor(cls).map(function (s) { return { value: s.key, label: s.name }; }), 'Choose subject', true);
      subSel.disabled = false; showOther('f-subject-other', false);
      fillSelect(chSel, [], 'Choose subject first', false); chSel.disabled = true; showOther('f-chapter-other', false);
    });

    subSel.addEventListener('change', function () {
      var cls = clsSel.value, sub = subSel.value;
      if (sub === OTHER) {
        showOther('f-subject-other', true);
        chSel.disabled = true; fillSelect(chSel, [], 'Type chapter below', false); showOther('f-chapter-other', true);
        return;
      }
      showOther('f-subject-other', false);
      if (!sub) { fillSelect(chSel, [], 'Choose subject first', false); chSel.disabled = true; showOther('f-chapter-other', false); return; }
      fillSelect(chSel, chaptersFor(cls, sub).map(function (c) { return { value: c.title, label: c.n + '. ' + c.title }; }), 'Choose chapter', true);
      chSel.disabled = false; showOther('f-chapter-other', false);
    });

    chSel.addEventListener('change', function () {
      showOther('f-chapter-other', chSel.value === OTHER);
    });
  }

  // Resolve class/subject/chapter from either the selects or the "Other" inputs.
  function cascadeValues() {
    var clsSel = qs('#f-class');
    var clsRaw = clsSel ? clsSel.value : '';
    var classLevel, subject, chapter;

    if (clsRaw === OTHER) {
      classLevel = val('f-class-other');
      subject = val('f-subject-other');
      chapter = val('f-chapter-other');
    } else {
      classLevel = clsRaw;
      var subSel = qs('#f-subject');
      var subRaw = subSel ? subSel.value : '';
      if (subRaw === OTHER) {
        subject = val('f-subject-other');
        chapter = val('f-chapter-other');
      } else {
        subject = subRaw ? subjectName(clsRaw, subRaw) : '';
        var chSel = qs('#f-chapter');
        var chRaw = chSel ? chSel.value : '';
        chapter = (chRaw === OTHER) ? val('f-chapter-other') : chRaw;
      }
    }
    return { classLevel: classLevel, subject: subject, chapter: chapter, topic: val('f-topic') };
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
  var currentMode = null;   // 'general' | 'specific'
  var currentRole = null;   // student | parent | teacher (specific only)

  function setStep(step) {
    // step: 'type' | 'pick' | 'form' | 'done'
    qs('#howtoSection').hidden = (step === 'form' || step === 'done');
    qs('#typeSection').hidden = (step !== 'type');
    qs('#pickSection').hidden = (step !== 'pick');
    qs('#formSection').hidden = (step !== 'form');
    qs('#doneSection').hidden = (step !== 'done');
  }

  function showNotice(msg, kind) {
    var n = qs('#formNotice');
    n.className = 'notice notice--' + (kind === 'ok' ? 'ok' : 'err');
    n.textContent = msg;
    n.hidden = !msg;
  }

  function openGeneral() {
    currentMode = 'general';
    currentRole = null;
    qs('#formTitle').textContent = 'General feedback';
    qs('#formHint').textContent = 'Education tips, a general issue, or a suggestion for W.H. Academy.';
    qs('#formFields').innerHTML = generalFields();
    showNotice('', null);
    wireCharCounts();
    setStep('form');
    Captcha.render();
    qs('#formSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openForm(role) {
    currentMode = 'specific';
    currentRole = role;
    var def = ROLES[role];
    qs('#formTitle').textContent = def.title;
    qs('#formHint').textContent = def.hint;
    qs('#formFields').innerHTML = def.fields();
    showNotice('', null);

    if (role === 'student' || role === 'teacher') wireCascade();
    wireCharCounts();

    setStep('form');
    Captcha.render();
    qs('#formSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function showRolePicker() {
    Array.prototype.forEach.call(document.querySelectorAll('.role'), function (b) { b.setAttribute('aria-pressed', 'false'); });
    setStep('pick');
    qs('#pickSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function backToStart() {
    currentMode = null;
    currentRole = null;
    Array.prototype.forEach.call(document.querySelectorAll('.type'), function (b) { b.setAttribute('aria-pressed', 'false'); });
    Array.prototype.forEach.call(document.querySelectorAll('.role'), function (b) { b.setAttribute('aria-pressed', 'false'); });
    setStep('type');
    qs('#typeSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // "Change" button inside the form: back to the role picker (specific) or the
  // start (general).
  function backFromForm() {
    if (currentMode === 'specific') showRolePicker();
    else backToStart();
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!currentMode) return;
    showNotice('', null);

    var payload = (currentMode === 'general') ? generalCollect() : ROLES[currentRole].collect();

    // Client-side required checks mirror the backend, for a friendlier message.
    if (!payload.name) return showNotice('Please enter your name.', 'err');
    if (currentMode === 'general' && !val('f-who')) return showNotice('Please pick what you are (student, parent, teacher or other).', 'err');
    if (!payload.field1) return showNotice('Please fill in the main feedback field.', 'err');

    if (currentMode === 'specific' && (currentRole === 'student' || currentRole === 'teacher')) {
      if (!payload.classLevel || !payload.subject || !payload.chapter || !payload.topic) {
        return showNotice('Please choose (or type, if not listed) class, subject, chapter and topic.', 'err');
      }
    }
    if (currentMode === 'specific' && currentRole === 'teacher') {
      if (!payload.experienceYears) return showNotice('Please enter your teaching experience.', 'err');
      if (!payload.field2) return showNotice("Please share students' common mistakes.", 'err');
    }

    if (Captcha.enabled()) {
      var token = Captcha.token();
      if (!token) return showNotice('Please complete the verification check.', 'err');
      payload.captchaToken = token;
    }

    var btn = qs('#submitBtn');
    btn.disabled = true; btn.textContent = 'Submitting...';

    apiCall('insights/submit', payload)
      .then(function () {
        setStep('done');
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
    var t = tidy(text);
    if (!t) return '';
    return '<div class="tile__block"><h4>' + esc(title) + '</h4><p>' + esc(t) + '</p></div>';
  }
  function initials(name) {
    var parts = String(name || 'A').trim().split(/\s+/).slice(0, 2);
    return parts.map(function (p) { return p.charAt(0).toUpperCase(); }).join('') || 'A';
  }
  function metaLine(it) {
    var bits = [];
    if (it.category === 'general') bits.push('General');
    if (it.role === 'teacher' && it.experienceYears) bits.push('<b>' + esc(it.experienceYears) + '</b> yrs experience');
    if (it.classLevel) bits.push('Class <b>' + esc(it.classLevel) + '</b>');
    if (it.subject) bits.push(esc(it.subject));
    if (it.chapter) bits.push(esc(it.chapter));
    if (it.schools) bits.push(esc(it.schools));
    if (it.country) bits.push(esc(it.country));
    return bits.join(' &middot; ');
  }
  function tile(it) {
    var role = String(it.role || 'other');
    var roleName = role.charAt(0).toUpperCase() + role.slice(1);
    var blocks;
    if (it.category === 'general') {
      blocks = block('Feedback', it.field1);
    } else {
      blocks = block('Topic', it.topic);
      if (role === 'student') {
        blocks += block('What was difficult', it.field1) + block('How they solved it', it.field2);
      } else if (role === 'parent') {
        blocks += block('Challenges', it.field1) + block('Their approach', it.field2) + block('Expectations', it.field3);
      } else if (role === 'teacher') {
        blocks += block('Teaching tips', it.field1) + block('Common mistakes', it.field2) + block('Exam tips', it.field3);
      } else {
        blocks += block('Feedback', it.field1);
      }
    }
    var meta = metaLine(it);
    return '<article class="tile tile--' + esc(role) + '">' +
      '<header class="tile__head">' +
        '<div class="tile__avatar tile__avatar--' + esc(role) + '">' + esc(initials(it.name)) + '</div>' +
        '<div class="tile__id">' +
          '<div class="tile__name">' + esc(it.name || 'Anonymous') +
            ' <span class="badge badge--' + esc(role) + '">' + esc(roleName) + '</span></div>' +
          (meta ? '<div class="tile__meta">' + meta + '</div>' : '') +
        '</div>' +
      '</header>' +
      blocks +
      '</article>';
  }

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

  function loadFeed(attempt) {
    attempt = attempt || 1;
    var host = qs('#feed');
    apiCall('insights/approved', {})
      .then(function (data) {
        feedList = (data && data.insights) || [];
        feedShown = 0;
        if (feedObserver) { feedObserver.disconnect(); feedObserver = null; }
        if (!feedList.length) { host.innerHTML = '<p class="empty">No insights yet - be the first to share.</p>'; return; }
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

    // Step 1 - General vs Specific
    Array.prototype.forEach.call(document.querySelectorAll('.type'), function (b) {
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(document.querySelectorAll('.type'), function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        if (b.getAttribute('data-type') === 'general') openGeneral();
        else showRolePicker();
      });
    });

    // Step 2 - role (specific only)
    Array.prototype.forEach.call(document.querySelectorAll('.role'), function (b) {
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(document.querySelectorAll('.role'), function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        openForm(b.getAttribute('data-role'));
      });
    });

    var backBtn = qs('#backToTypeBtn');
    if (backBtn) backBtn.addEventListener('click', backToStart);

    qs('#insightForm').addEventListener('submit', onSubmit);
    qs('#changeRoleBtn').addEventListener('click', backFromForm);
    qs('#againBtn').addEventListener('click', backToStart);

    setStep('type');
    Captcha.render();
    loadFeed();
  });
})();
