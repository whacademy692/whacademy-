/**
 * sound.js — W.H. Academy
 *
 * A tiny sound-effects layer. Effects are generated with the Web Audio API,
 * so there are NO audio files to ship, and every effect is gated behind the
 * "Sound effects" setting. This makes the setting genuinely functional today
 * and ready for richer sounds tomorrow.
 *
 * Usage anywhere:  Sound.play('correct')
 * Built-in names:  'correct' | 'wrong' | 'click' | 'complete' | 'toggle'
 *
 * To add more sounds later: register another entry in TONES, or swap play()
 * to load real audio files. The on/off wiring (soundEnabled) already works,
 * so new sounds respect the toggle automatically.
 */
(function () {
  'use strict';

  var ctx = null;

  function audioCtx() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { ctx = null; }
    return ctx;
  }

  // Each effect is a short sequence of tones: { f: frequency Hz, d: seconds,
  // type: oscillator wave (default 'sine') }.
  var TONES = {
    correct:  [{ f: 660, d: 0.10 }, { f: 880, d: 0.14 }],
    wrong:    [{ f: 220, d: 0.22, type: 'sawtooth' }],
    click:    [{ f: 440, d: 0.05 }],
    complete: [{ f: 523, d: 0.10 }, { f: 659, d: 0.10 }, { f: 784, d: 0.20 }],
    toggle:   [{ f: 587, d: 0.09 }, { f: 784, d: 0.12 }]
  };

  function enabled() {
    try { return !!(window.Storage && Storage.getSettings().soundEnabled); }
    catch (e) { return false; }
  }

  function play(name) {
    if (!enabled()) return;
    var steps = TONES[name];
    if (!steps) return;
    var ac = audioCtx();
    if (!ac) return;
    // Browsers start the audio context suspended until a user gesture.
    if (ac.state === 'suspended') { try { ac.resume(); } catch (e) {} }

    var t = ac.currentTime;
    steps.forEach(function (s) {
      var osc = ac.createOscillator();
      var gain = ac.createGain();
      osc.type = s.type || 'sine';
      osc.frequency.value = s.f;
      // Quick fade in/out so the tone doesn't click.
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + s.d);
      osc.connect(gain).connect(ac.destination);
      osc.start(t);
      osc.stop(t + s.d + 0.02);
      t += s.d;
    });
  }

  window.Sound = { play: play, enabled: enabled, TONES: TONES };
})();
