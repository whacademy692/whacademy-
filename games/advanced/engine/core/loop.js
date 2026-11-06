// Game loop: fixed 60 Hz simulation step, variable render, global time-scale (slow-mo / think-slow).
// The loop never touches the DOM except an optional visibility hook, so frame() is testable in Node.

export class GameLoop {
  /**
   * @param {object} o
   * @param {(dt:number, realDt:number)=>void} o.update  dt is already multiplied by timeScale (seconds)
   * @param {(alpha:number, realDt:number)=>void} o.render  alpha = leftover fraction of a step (0..1)
   */
  constructor({ update, render, step = 1 / 60, maxFrame = 0.25, raf, caf } = {}) {
    this.update = update || (() => {});
    this.render = render || (() => {});
    this.step = step;
    this.maxFrame = maxFrame;
    this.timeScale = 1;
    this.renderEvery = 1;          // 2 = 30 fps fallback (simulation still runs at 60 Hz)
    this.paused = false;
    this.running = false;
    this.acc = 0;
    this.last = null;
    this.frames = 0;
    this.updates = 0;
    this.renders = 0;
    this._raf = raf || (typeof requestAnimationFrame === 'function' ? (f) => requestAnimationFrame(f) : null);
    this._caf = caf || (typeof cancelAnimationFrame === 'function' ? (h) => cancelAnimationFrame(h) : null);
    this._handle = null;
    this._tick = (t) => { this.frame(t); if (this.running) this._handle = this._raf(this._tick); };
    this._vis = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = null;
    if (this._raf) this._handle = this._raf(this._tick);
  }
  stop() {
    this.running = false;
    if (this._handle !== null && this._caf) this._caf(this._handle);
    this._handle = null;
    if (this._vis && typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._vis);
  }
  pause() { this.paused = true; }
  resume() { this.paused = false; this.last = null; }

  /** Auto-pause when the tab is hidden (so a student never loses a heart in the background). */
  autoPause(onPause) {
    if (typeof document === 'undefined') return;
    this._vis = () => { if (document.hidden) { this.pause(); if (onPause) onPause(); } };
    document.addEventListener('visibilitychange', this._vis);
  }

  /** One browser frame. tMs is a DOMHighResTimeStamp. Public so tests can drive it with fake time. */
  frame(tMs) {
    this.frames++;
    if (this.last === null) { this.last = tMs; return; }
    let realDt = (tMs - this.last) / 1000;
    this.last = tMs;
    if (realDt < 0) realDt = 0;
    if (realDt > this.maxFrame) realDt = this.maxFrame;     // tab was asleep: don't spiral
    if (this.paused) { this.render(0, 0); return; }
    this.acc += realDt;
    while (this.acc >= this.step - 1e-9) {
      this.update(this.step * this.timeScale, this.step);
      this.acc -= this.step;
      this.updates++;
    }
    if (this.acc < 0) this.acc = 0;
    if (this.frames % this.renderEvery === 0) { this.render(this.acc / this.step, realDt); this.renders++; }
  }
}
