/**
 * ============================================================================
 * scope.js — turns an enrolledScope string into "what this student may see".
 * ----------------------------------------------------------------------------
 * The backend issues one of two shapes (see Enrollment / StudentID):
 *
 *   Class 1-8    FULL-C08                       -> the whole class, every subject
 *   Class 9-12   SUBJ-PHYS-C09, SUBJ-CHEM-C09   -> only these subjects
 *
 * This module is the ONLY place that interprets that string. Everything else
 * (dashboard, games list) asks it "is this subject allowed?" and trusts the
 * answer, so the gating rule lives in exactly one testable spot.
 *
 * It is a convenience filter, not a security boundary — the real enforcement is
 * server-side. But it must never SHOW a student something they are not enrolled
 * in, so it fails CLOSED: an unparseable or empty scope reveals nothing.
 * ============================================================================
 */
(function () {
  'use strict';
  // enrolledScope subject codes  ->  registry subject keys
  var CODE_TO_KEY = {
    PHYS: 'phys', CHEM: 'chem', BIO: 'bio', MATH: 'math', CS: 'cs',
    // Class 1-8 subjects (unlocked wholesale by FULL-Cxx, but mapped for completeness)
    SCI: 'science', GEO: 'geography', HIST: 'history',
    ENG: 'english', URDU: 'urdu', ISL: 'islamiat', PAKST: 'pakstudies'
  };

  // --------------------------------------------------------------------------
  // GAME URL NORMALIZATION
  // --------------------------------------------------------------------------
  // content-registry.js was generated with absolute production URLs such as:
  //   https://whacademypk.com/games/chapter.html?ch=8/math/...
  //
  // That makes the GitHub Pages testing clone jump back to the real website.
  // For W.H. Academy's own chapter player, use a same-folder relative URL
  // instead. The SAME relative URL works in both environments:
  //
  //   test clone: https://rehan127testing.github.io/whacademytesting/games/...
  //   production: https://whacademypk.com/games/...
  //
  // External URLs (e.g. a future third-party game) are left untouched.
  function localGameUrl(url) {
    if (!url) return url;
    var raw = String(url);
    var productionPrefix = 'https://whacademypk.com/games/chapter.html';
    if (raw.indexOf(productionPrefix) === 0) {
      return 'chapter.html' + raw.slice(productionPrefix.length);
    }
    return raw;
  }

  function localizeChapters(chapters) {
    return (chapters || []).map(function (chapter) {
      // Return a shallow copy so the shared registry itself stays unchanged.
      var copy = {};
      Object.keys(chapter || {}).forEach(function (key) { copy[key] = chapter[key]; });
      copy.game = localGameUrl(copy.game);
      return copy;
    });
  }

  /**
   * @param {string} enrolledScope  e.g. 'FULL-C08' or 'SUBJ-PHYS-C09, SUBJ-BIO-C09'
   * @returns {{classLevel:(number|null), fullClass:boolean, subjectKeys:string[], raw:string}}
   */
  function parseScope(enrolledScope) {
    var raw = String(enrolledScope || '').trim();
    var result = { classLevel: null, fullClass: false, subjectKeys: [], raw: raw };
    if (!raw) return result;   // fail closed
    var tokens = raw.split(',').map(function (t) { return t.trim().toUpperCase(); })
                    .filter(Boolean);

    tokens.forEach(function (tok) {
      var parts = tok.split('-');   // FULL | C08   or   SUBJ | PHYS | C09

      if (parts[0] === 'FULL' && parts[1]) {
        result.fullClass = true;
        result.classLevel = classFromCode(parts[1]);
      } else if (parts[0] === 'SUBJ' && parts[1] && parts[2]) {
        var key = CODE_TO_KEY[parts[1]];
        if (key && result.subjectKeys.indexOf(key) === -1) result.subjectKeys.push(key);
        var lvl = classFromCode(parts[2]);
        if (lvl !== null) result.classLevel = lvl;
      }
    });

    return result;
  }

  /** 'C09' -> 9,  'C08' -> 8 */
  function classFromCode(code) {
    var m = /^C(\d{2})$/.exec(String(code || '').toUpperCase());
    return m ? Number(m[1]) : null;
  }
  /**
   * Given a parsed scope and the content registry, returns the subjects this
   * student may see, in registry order, each as { key, name, code, chapters }.
   *
   * FULL-Cxx  -> every subject the registry has for that class.
   * SUBJ-...  -> only the named subjects (and only if the registry has them).
   */
  function allowedSubjects(scope, registry) {
    if (scope.classLevel === null) return [];
    var classData = registry && registry.classes && registry.classes[String(scope.classLevel)];
    if (!classData) return [];
    var out = [];
    Object.keys(classData).forEach(function (skey) {
      var allowed = scope.fullClass || scope.subjectKeys.indexOf(skey) !== -1;
      if (!allowed) return;
      var subj = classData[skey];
      out.push({ key: skey, name: subj.name, code: subj.code, chapters: localizeChapters(subj.chapters) });
    });
    return out;
  }

  window.WHA_Scope = {
    parse: parseScope,
    allowedSubjects: allowedSubjects,
    _classFromCode: classFromCode,
    _localGameUrl: localGameUrl
  };
})();
