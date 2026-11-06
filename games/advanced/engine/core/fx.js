// Screen-feel effects: trauma-based shake, slow-mo, flash, trails. Pure state; the renderer applies the output.

export class Fx {
  constructor({ reduceMotion = false } = {}) {
    this.reduceMotion = reduceMotion;
    this.trauma = 0;            // 0..1, shake = trauma^2
    this.shakeScale = 1;        // quality preset scales it
    this.slow = 1;              // current slow-mo multiplier (1 = normal)
    this._slowTarget = 1; this._slowTime = 0; this._slowEase = 0.12;
    this.flashA = 0; this.flashColor = '#ffffff';
    this.t = 0;
    this.ox = 0; this.oy = 0; this.rot = 0;
  }

  shake(amount = 0.5) { this.trauma = Math.min(1, this.trauma + amount); }
  /** Slow the whole world to `scale` for `seconds` (real time), then ease back. */
  slowmo(scale = 0.25, seconds = 0.6) { this._slowTarget = scale; this._slowTime = seconds; }
  flash(color = '#ffffff', a = 0.6) { this.flashColor = color; this.flashA = Math.max(this.flashA, a); }

  /** realDt in seconds (NOT time-scaled). */
  update(realDt) {
    this.t += realDt;
    if (this._slowTime > 0) { this._slowTime -= realDt; if (this._slowTime <= 0) this._slowTarget = 1; }
    this.slow += (this._slowTarget - this.slow) * Math.min(1, realDt / this._slowEase);
    if (Math.abs(this.slow - 1) < 0.002 && this._slowTarget === 1) this.slow = 1;
    this.trauma = Math.max(0, this.trauma - realDt * 1.6);
    this.flashA = Math.max(0, this.flashA - realDt * 2.4);
    const s = this.reduceMotion ? 0 : this.trauma * this.trauma * this.shakeScale;
    this.ox = s * 14 * Math.sin(this.t * 71.3 + 1.7);
    this.oy = s * 14 * Math.sin(this.t * 83.1 + 4.2);
    this.rot = s * 0.03 * Math.sin(this.t * 57.9);
  }
}

/** Fixed-size ring buffer of past positions for neon trails. */
export class Trail {
  constructor(n = 14) { this.n = n; this.xs = new Float32Array(n); this.ys = new Float32Array(n); this.len = 0; this.head = 0; }
  push(x, y) {
    this.xs[this.head] = x; this.ys[this.head] = y;
    this.head = (this.head + 1) % this.n;
    if (this.len < this.n) this.len++;
  }
  /** i = 0 is newest. */
  at(i) { const k = (this.head - 1 - i + this.n * 2) % this.n; return [this.xs[k], this.ys[k]]; }
  clear() { this.len = 0; this.head = 0; }
}
