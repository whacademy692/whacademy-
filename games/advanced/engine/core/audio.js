// WebAudio synth. No audio files: every sound is a tiny recipe. Context is created lazily on the first user gesture.
// A recipe is a list of voices: { type, f (Hz), f2 (end Hz, optional), at (s), dur (s), gain, noise? }

export const RECIPES = {
  tap:     [{ type: 'square', f: 520, at: 0, dur: 0.05, gain: 0.08 }],
  correct: [
    { type: 'triangle', f: 523.25, at: 0, dur: 0.12, gain: 0.18 },
    { type: 'triangle', f: 659.25, at: 0.07, dur: 0.12, gain: 0.18 },
    { type: 'triangle', f: 783.99, at: 0.14, dur: 0.22, gain: 0.2 },
  ],
  wrong:   [
    { type: 'sawtooth', f: 220, f2: 90, at: 0, dur: 0.35, gain: 0.2 },
    { type: 'square', f: 110, f2: 55, at: 0.05, dur: 0.3, gain: 0.12 },
  ],
  crash:   [{ type: 'noise', f: 1800, f2: 200, at: 0, dur: 0.45, gain: 0.3 }, { type: 'sawtooth', f: 140, f2: 40, at: 0, dur: 0.4, gain: 0.18 }],
  tick:    [{ type: 'square', f: 880, at: 0, dur: 0.03, gain: 0.05 }],
  boost:   [{ type: 'sawtooth', f: 200, f2: 900, at: 0, dur: 0.3, gain: 0.12 }, { type: 'noise', f: 3000, f2: 800, at: 0, dur: 0.3, gain: 0.08 }],
  heart:   [{ type: 'sine', f: 440, f2: 880, at: 0, dur: 0.25, gain: 0.2 }],
  freeze:  [{ type: 'sine', f: 1200, f2: 300, at: 0, dur: 0.5, gain: 0.15 }, { type: 'triangle', f: 600, f2: 150, at: 0, dur: 0.5, gain: 0.1 }],
  rankup:  [523.25, 659.25, 783.99, 1046.5].map((f, i) => ({ type: 'triangle', f, at: i * 0.11, dur: 0.3, gain: 0.2 })),
  gameover: [
    { type: 'sawtooth', f: 330, f2: 330, at: 0, dur: 0.2, gain: 0.16 },
    { type: 'sawtooth', f: 262, f2: 262, at: 0.2, dur: 0.2, gain: 0.16 },
    { type: 'sawtooth', f: 196, f2: 98, at: 0.4, dur: 0.6, gain: 0.18 },
  ],
};

export class Sfx {
  constructor() { this.ctx = null; this.volume = 0.8; this.muted = false; this.played = 0; this._noise = null; }

  /** Call from a user gesture (first tap). Safe to call repeatedly. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    this.ctx = new AC();
    const len = this.ctx.sampleRate * 0.6;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noise = buf;
  }

  setMuted(m) { this.muted = !!m; }
  setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); }

  play(name) {
    const rec = RECIPES[name];
    this.played++;
    if (!rec || this.muted || !this.ctx || this.volume <= 0) return false;
    const c = this.ctx, t0 = c.currentTime + 0.001;
    for (const v of rec) {
      const g = c.createGain();
      const peak = v.gain * this.volume;
      g.gain.setValueAtTime(0.0001, t0 + v.at);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + v.at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + v.at + v.dur);
      let src;
      if (v.type === 'noise') {
        src = c.createBufferSource(); src.buffer = this._noise; src.loop = true;
        const f = c.createBiquadFilter(); f.type = 'lowpass';
        f.frequency.setValueAtTime(v.f, t0 + v.at);
        if (v.f2) f.frequency.exponentialRampToValueAtTime(v.f2, t0 + v.at + v.dur);
        src.connect(f); f.connect(g);
      } else {
        src = c.createOscillator(); src.type = v.type;
        src.frequency.setValueAtTime(v.f, t0 + v.at);
        if (v.f2) src.frequency.exponentialRampToValueAtTime(v.f2, t0 + v.at + v.dur);
        src.connect(g);
      }
      g.connect(c.destination);
      src.start(t0 + v.at); src.stop(t0 + v.at + v.dur + 0.02);
    }
    return true;
  }
}
