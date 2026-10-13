/**
 * anim-registry.js — W.H. Academy · Animation Lab catalogue
 * ----------------------------------------------------------------------------
 * The list of animations the Animations tab can show. SAME shape as
 * content-registry.js (classes → subject key → chapters) so scope.js can gate
 * it with the very same call:  WHA_Scope.allowedSubjects(scope, WHA_ANIMS).
 *
 * To add an animation:
 *   1. put its spec at  games/anim-data/<class>/<subject>/<slug>.json
 *   2. add one entry below under the right class → subject → chapter
 *   3. bump CACHE_VERSION in sw.js and deploy
 *
 * Entry fields:
 *   id       unique, never changes (it is the key the student's saved values use)
 *   title    card title                      topic   short topic line
 *   summary  one sentence on the card        file    path of the JSON spec (relative to /games/)
 *   minutes  rough lesson length             level   "Starter" | "Core" | "Challenge"
 *   icon     optional emoji
 * ----------------------------------------------------------------------------
 */
window.WHA_ANIMS = {
  "version": 1,
  "classes": {
    "8": {
      "math": {
        "name": "Mathematics",
        "code": "MATH",
        "chapters": [
          {
            "n": 7,
            "title": "Pythagoras Theorem",
            "animations": [
              {
                "id": "g8-math-pythagoras",
                "title": "Pythagoras Theorem",
                "topic": "Right-angled triangles",
                "summary": "Stretch the triangle, watch the squares grow, and see why p² + b² = h².",
                "file": "anim-data/8/math/pythagoras-theorem.json",
                "minutes": 8,
                "level": "Core",
                "icon": "📐"
              }
            ]
          }
        ]
      }
    }
  }
};
