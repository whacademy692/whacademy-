// Canvas 2D renderer: DPR-capped sizing, shake transform, cached glow sprites (no shadowBlur in the hot path).
// Nothing runs at import time, so the module loads in Node for tests (pass makeCanvas to stub).

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [o]
   * @param {number} [o.dprCap]
   * @param {(w:number,h:number)=>any} [o.makeCanvas]   offscreen canvas factory (tests / OffscreenCanvas)
   */
  constructor(canvas, { dprCap = 1.25, makeCanvas } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.dprCap = dprCap;
    this.dpr = 1;
    this.w = 0; this.h = 0;                   // CSS pixels: all game code draws in these units
    this.glowOn = true;
    this._make = makeCanvas || ((w, h) => {
      if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
      const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
    });
    this._sprites = new Map();
    this.stats = { spriteBuilds: 0, spriteHits: 0 };
  }

  setDprCap(cap) { if (cap !== this.dprCap) { this.dprCap = cap; if (this.w) this.resize(this.w, this.h); } }

  /** Size the backing store for the CSS box (w,h). Call on window resize / orientation change. */
  resize(cssW, cssH, devicePixelRatio = (typeof window !== 'undefined' && window.devicePixelRatio) || 1) {
    this.dpr = Math.max(1, Math.min(this.dprCap, devicePixelRatio));
    this.w = Math.max(1, Math.round(cssW)); this.h = Math.max(1, Math.round(cssH));
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    if (this.canvas.style) { this.canvas.style.width = this.w + 'px'; this.canvas.style.height = this.h + 'px'; }
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /** Start a frame: clear and apply the shake transform from Fx. */
  begin(fx) {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.fillStyle = '#05060f';
    c.fillRect(0, 0, this.w, this.h);
    if (fx && (fx.ox || fx.oy || fx.rot)) {
      c.translate(this.w / 2 + fx.ox, this.h / 2 + fx.oy);
      c.rotate(fx.rot);
      c.translate(-this.w / 2, -this.h / 2);
    }
  }
  end(fx) {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (fx && fx.flashA > 0.01) {
      c.globalAlpha = fx.flashA; c.fillStyle = fx.flashColor; c.fillRect(0, 0, this.w, this.h); c.globalAlpha = 1;
    }
  }

  /** Cached radial glow sprite for a colour at a (rounded) radius. */
  glowSprite(color, radius) {
    const r = Math.max(4, Math.ceil(radius / 4) * 4);
    const key = color + '|' + r;
    let s = this._sprites.get(key);
    if (s) { this.stats.spriteHits++; return s; }
    const size = r * 2;
    const cv = this._make(size, size);
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(r, r, 0, r, r, r);
    grd.addColorStop(0, color); grd.addColorStop(0.25, color + '99'); grd.addColorStop(1, color + '00');
    g.fillStyle = grd; g.fillRect(0, 0, size, size);
    s = { cv, r };
    this._sprites.set(key, s);
    this.stats.spriteBuilds++;
    return s;
  }

  /** Additive glow blob. Skipped on the Low preset (glow=false). */
  glow(x, y, radius, color = '#19e6c1', alpha = 1) {
    if (!this.glowOn) return;
    const s = this.glowSprite(color, radius), c = this.ctx, k = radius / s.r;
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = alpha;
    c.drawImage(s.cv, x - radius, y - radius, s.r * 2 * k, s.r * 2 * k);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  }

  /** Neon line: soft wide stroke under a crisp core. */
  neonLine(x1, y1, x2, y2, color, width = 2, alpha = 1) {
    const c = this.ctx;
    c.lineCap = 'round';
    if (this.glowOn) {
      c.globalAlpha = alpha * 0.25; c.strokeStyle = color; c.lineWidth = width * 4;
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    }
    c.globalAlpha = alpha; c.lineWidth = width;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.globalAlpha = 1;
  }

  clearSprites() { this._sprites.clear(); }
}
