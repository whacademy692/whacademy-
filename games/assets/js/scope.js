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
      out.push({ key: skey, name: subj.name, code: subj.code, chapters: subj.chapters || [] });
    });
    return out;
  }

  window.WHA_Scope = {
    parse: parseScope,
    allowedSubjects: allowedSubjects,
    _classFromCode: classFromCode
  };
})();
