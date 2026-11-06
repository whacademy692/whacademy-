// Performance manager: measures frame time and walks a quality ladder (Low / Medium / High),
// with a 30 fps render fallback when even Low cannot keep up. Pure logic, fed with frame times.

export const QUALITY = [
  { name: 'low',    dpr: 1,    particles: 60,  glow: false, trails: false, roadSegs: 40, stars: 30,  shake: 0.6 },
  { name: 'medium', dpr: 1.25, particles: 160, glow: true,  trails: false, roadSegs: 60, stars: 60,  shake: 1 },
  { name: 'high',   dpr: 1.75, particles: 360, glow: true,  trails: true,  roadSegs: 90, stars: 110, shake: 1 },
];

export class PerfManager {
  /**
   * @param {object} o
   * @param {boolean} [o.auto]   walk the ladder automatically
   * @param {number} [o.level]   start level index (default: medium)
   * @param {(info:{level:number,preset:object,fallback30:boolean,reason:string})=>void} [o.onChange]
   */
  constructor({ auto = true, level = 1, onChange, windowSec = 1 } = {}) {
    this.auto = auto;
    this.level = Math.max(0, Math.min(QUALITY.length - 1, level));
    this.onChange = onChange || (() => {});
    this.windowSec = windowSec;
    this.fallback30 = false;
    this.fps = 60;
    this.avgMs = 16.7;
    this._t = 0; this._n = 0; this._sum = 0; this._worst = 0;
    this._bad = 0; this._good = 0; this._veryBad = 0;
    this._cool = 0;                          // seconds before another upgrade is allowed
    this._lockedAbove = QUALITY.length;      // never climb back to a level that already failed
    this.windows = 0;
  }

  get preset() { return QUALITY[this.level]; }

  setAuto(on) { this.auto = !!on; this._bad = this._good = this._veryBad = 0; }
  setLevel(i, reason = 'manual') {
    i = Math.max(0, Math.min(QUALITY.length - 1, i));
    if (i === this.level) return;
    this.level = i;
    this._bad = this._good = this._veryBad = 0;
    this.onChange({ level: i, preset: QUALITY[i], fallback30: this.fallback30, reason });
  }
  setFallback30(on, reason) {
    if (this.fallback30 === on) return;
    this.fallback30 = on;
    this.onChange({ level: this.level, preset: this.preset, fallback30: on, reason });
  }

  /** Feed one frame's real duration in milliseconds. */
  frame(dtMs) {
    if (dtMs <= 0 || dtMs > 1000) return;     // ignore pauses / tab switches
    this._t += dtMs / 1000; this._n++; this._sum += dtMs; this._worst = Math.max(this._worst, dtMs);
    if (this._cool > 0) this._cool -= dtMs / 1000;
    if (this._t < this.windowSec) return;
    this.avgMs = this._sum / this._n;
    this.fps = 1000 / this.avgMs;
    this._t = 0; this._n = 0; this._sum = 0; this._worst = 0;
    this.windows++;
    if (!this.auto) return;
    this._evaluate();
  }

  _evaluate() {
    // When the 30 fps fallback is on, frames are ~33 ms by design; judge against that.
    const budget = this.fallback30 ? 1000 / 30 : 1000 / 60;
    const bad = this.avgMs > budget * 1.35;           // < ~44 fps (or < 22 fps in fallback)
    const veryBad = this.avgMs > budget * 1.9;
    const good = this.avgMs < budget * 0.85;
    this._bad = bad ? this._bad + 1 : 0;
    this._veryBad = veryBad ? this._veryBad + 1 : 0;
    this._good = good ? this._good + 1 : 0;

    if (this._bad >= 2 || this._veryBad >= 1) {
      if (this.level > 0) {
        this._lockedAbove = Math.min(this._lockedAbove, this.level);   // this level failed; don't retry it
        this._cool = 20;
        this.setLevel(this.level - 1, 'slow');
      } else if (!this.fallback30 && this._bad >= 3) {
        this.setFallback30(true, 'slow-at-low');
      }
      return;
    }
    if (this._good >= 6 && this._cool <= 0 && this.level < QUALITY.length - 1 && this.level + 1 < this._lockedAbove) {
      if (this.fallback30) { this.setFallback30(false, 'recovered'); this._good = 0; return; }
      this.setLevel(this.level + 1, 'headroom');
    }
  }
}
