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
  whoosh:  [{ type: 'noise', f: 400, f2: 2600, at: 0, dur: 0.3, gain: 0.05 }],
  laser:   [{ type: 'sawtooth', f: 1500, f2: 260, at: 0, dur: 0.16, gain: 0.1 }, { type: 'square', f: 900, f2: 200, at: 0.02, dur: 0.12, gain: 0.05 }],
  explode: [{ type: 'noise', f: 2600, f2: 120, at: 0, dur: 0.5, gain: 0.26 }, { type: 'sawtooth', f: 120, f2: 36, at: 0, dur: 0.45, gain: 0.16 }],
  gameover: [
    { type: 'sawtooth', f: 330, f2: 330, at: 0, dur: 0.2, gain: 0.16 },
    { type: 'sawtooth', f: 262, f2: 262, at: 0.2, dur: 0.2, gain: 0.16 },
    { type: 'sawtooth', f: 196, f2: 98, at: 0.4, dur: 0.6, gain: 0.18 },
  ],
};

export class Sfx {
  constructor() { this.ctx = null; this.volume = 0.8; this.muted = false; this.played = 0; this._noise = null; this._env = null; this._amb = null; this.ambStarts = 0; this._eng = null; this.engineStarts = 0; this.engineOn = true; this.ambientOn = true; }

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
    this._bindLifecycle();
    if (this._env) this.ambience(this._env);
  }

  // Silence everything when the page is hidden, backgrounded, or left (tab switch, app switch, back button, bfcache).
  // Without this the bird chirps kept firing from the background timer after the game was closed.
  _bindLifecycle() {
    if (this._lc || typeof document === 'undefined') return;
    this._lc = true;
    const hush = () => { try { this._engStop(); if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); } catch (e) { /* ignore */ } };
    const wake = () => { try { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); } catch (e) { /* ignore */ } };
    document.addEventListener('visibilitychange', () => { if (document.hidden) hush(); else wake(); });
    addEventListener('pagehide', hush);
    addEventListener('pageshow', () => { if (!document.hidden) wake(); });
  }

  setMuted(m) { this.muted = !!m; this._ambLevel(); }
  setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); this._ambLevel(); }

  // ---- ambience: a quiet environment bed (never loud, never static) ----
  // 'day'   = only the odd soft bird chirp: NO continuous noise bed at all (a noise bed was the "wind" students heard).
  // 'night' = a faint low breeze + quiet crickets.   null = off.   `ambientOn` (player option) switches the whole thing off.
  ambience(env) {
    this._env = env || null;
    if (!this.ctx) return;                                   // starts on unlock()
    const want = this.ambientOn ? env : null;
    if (this._amb && this._amb.env === want) { this._ambLevel(); return; }
    this._ambStop();
    if (!want) return;
    const c = this.ctx, master = c.createGain();
    master.gain.value = 0.0001; master.connect(c.destination);
    let src = null, lfo = null;
    if (want === 'night') {                                  // breeze: low-passed noise with a slow swell (always positive gain)
      src = c.createBufferSource(); src.buffer = this._noise; src.loop = true;
      const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 230; filt.Q.value = 0.4;
      const windGain = c.createGain(); windGain.gain.value = 0.4;
      lfo = c.createOscillator(); const lfoGain = c.createGain(); lfo.frequency.value = 0.11; lfoGain.gain.value = 0.2;
      lfo.connect(lfoGain); lfoGain.connect(windGain.gain);
      src.connect(filt); filt.connect(windGain); windGain.connect(master);
      src.start(); lfo.start();
    }
    const amb = { env: want, master, src, lfo, timer: 0 };
    this._amb = amb; this.ambStarts++;
    const loop = () => {
      if (this._amb !== amb) return;
      if (!this.muted && this.volume > 0 && c.state === 'running' && !(typeof document !== 'undefined' && document.hidden)) (want === 'day' ? this._bird() : this._crickets());
      amb.timer = setTimeout(loop, want === 'day' ? 2200 + Math.random() * 4200 : 700 + Math.random() * 1500);
    };
    amb.timer = setTimeout(loop, 900);
    this._ambLevel();
  }
  setAmbientOn(on) { this.ambientOn = !!on; if (this.ctx) this.ambience(this._env); }
  setEngineOn(on) { this.engineOn = !!on; if (!on) this._engStop(); }
  _ambLevel() {
    const a = this._amb; if (!a || !this.ctx) return;
    const v = this.muted ? 0 : this.volume * (a.env === 'day' ? 0.14 : 0.1);
    a.master.gain.setTargetAtTime(Math.max(0.0001, v), this.ctx.currentTime, 0.4);
  }
  _ambStop() {
    const a = this._amb; if (!a) return;
    clearTimeout(a.timer); this._amb = null;
    try { a.master.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.15); if (a.src) a.src.stop(this.ctx.currentTime + 0.6); if (a.lfo) a.lfo.stop(this.ctx.currentTime + 0.6); } catch (e) { /* already stopped */ }
  }

  // ---- car engine: a soft, low hum whose pitch follows `level` (0..1). Call every frame while driving; it stops by itself
  // when not refreshed for a moment (pause, menu, tab hidden) and when level is null/0 or the player switched it off. ----
  engine(level) {
    if (!this.engineOn || level === null || level === undefined || level <= 0) { this._engStop(); return; }
    if (!this.ctx) return;
    const c = this.ctx, k = Math.max(0, Math.min(1, level));
    if (!this._eng) {
      const master = c.createGain(); master.gain.value = 0.0001; master.connect(c.destination);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 360; lp.Q.value = 0.5; lp.connect(master);
      const pulse = c.createGain(); pulse.gain.value = 0.8; pulse.connect(lp);                  // the cylinder pulse modulates THIS gain (never goes negative)
      const o1 = c.createOscillator(); o1.type = 'triangle';
      const o2 = c.createOscillator(); o2.type = 'sawtooth';
      const g1 = c.createGain(); g1.gain.value = 0.7; const g2 = c.createGain(); g2.gain.value = 0.12;
      o1.connect(g1); g1.connect(pulse); o2.connect(g2); g2.connect(pulse);
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 24; lg.gain.value = 0.16; lfo.connect(lg); lg.connect(pulse.gain);
      o1.start(); o2.start(); lfo.start();
      const e = { master, lp, o1, o2, lfo, t: 0, iv: 0 };
      e.iv = setInterval(() => { if (this._eng === e && Date.now() - e.t > 280) this._engStop(); }, 140);
      this._eng = e; this.engineStarts++;
    }
    const e = this._eng, now = c.currentTime; e.t = Date.now();
    const f = 58 + k * 62;                                     // 58..120 Hz fundamental
    e.o1.frequency.setTargetAtTime(f, now, 0.1); e.o2.frequency.setTargetAtTime(f * 0.5, now, 0.1);
    e.lfo.frequency.setTargetAtTime(16 + k * 26, now, 0.12); e.lp.frequency.setTargetAtTime(280 + k * 380, now, 0.12);
    const v = this.muted ? 0 : this.volume * (0.05 + k * 0.045);
    e.master.gain.setTargetAtTime(Math.max(0.0001, v), now, 0.12);
  }
  _engStop() {
    const e = this._eng; if (!e) return;
    clearInterval(e.iv); this._eng = null;
    try { const t = this.ctx.currentTime; e.master.gain.setTargetAtTime(0.0001, t, 0.08); e.o1.stop(t + 0.4); e.o2.stop(t + 0.4); e.lfo.stop(t + 0.4); } catch (err) { /* already stopped */ }
  }
  _tone(type, f, f2, at, dur, gain) {
    const c = this.ctx, t0 = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * this.volume), t0 + dur * 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  _bird() {                                                   // two or three soft chirps
    const base = 2200 + Math.random() * 1400, n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this._tone('sine', base, base * (1.15 + Math.random() * 0.3), i * 0.13, 0.09, 0.035);
  }
  _crickets() {                                               // a quick pulse train, very quiet
    for (let i = 0; i < 4; i++) this._tone('sine', 4300 + (i % 2) * 120, 0, i * 0.055, 0.035, 0.012);
  }

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
