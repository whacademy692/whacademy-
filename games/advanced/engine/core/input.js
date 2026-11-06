// Input: keyboard / pointer -> game intents. No tilt (removed from the plan). Pure helpers are exported for tests.
// Intents: {type:'lane', index:0..3} | {type:'left'} | {type:'right'} | {type:'power', name} | {type:'ability', slot} | {type:'pause'} | {type:'confirm'}

const KEY_LANE = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 };
const KEY_POWER = { f: 'fifty', t: 'freeze', h: 'heal', s: 'skip' };

/** Keyboard -> intent. Arrow keys and A/D steer; 1-4 select a lane/option; Q/E are ability slots. */
export function keyToIntent(key, { steerWithAD = false } = {}) {
  const k = String(key).toLowerCase();
  if (k === 'arrowleft') return { type: 'left' };
  if (k === 'arrowright') return { type: 'right' };
  if (k === ' ' || k === 'enter') return { type: 'confirm' };
  if (k === 'escape' || k === 'p') return { type: 'pause' };
  if (k === 'q') return { type: 'ability', slot: 0 };
  if (k === 'e') return { type: 'ability', slot: 1 };
  if (steerWithAD && k === 'a') return { type: 'left' };
  if (steerWithAD && k === 'd') return { type: 'right' };
  if (Object.hasOwn(KEY_LANE, k) && /^[1-4]$/.test(k)) return { type: 'lane', index: KEY_LANE[k] };
  if (!steerWithAD && Object.hasOwn(KEY_LANE, k)) return { type: 'lane', index: KEY_LANE[k] };
  if (Object.hasOwn(KEY_POWER, k)) return { type: 'power', name: KEY_POWER[k] };
  return null;
}

/**
 * Pointer gesture -> intent.
 * down/up = {x,y,t}. width = canvas CSS width. mode 'halves' (left/right half = one lane step),
 * 'targets' (host hit-tests), swipe optional.
 */
export function classifyPointer(down, up, { width, swipe = true, swipePx = 40, swipeMs = 450, tapPx = 14, vertical = false } = {}) {
  const dx = up.x - down.x, dy = up.y - down.y, dt = up.t - down.t;
  if (vertical && dy <= -swipePx && Math.abs(dy) > Math.abs(dx) * 1.5 && dt <= swipeMs) return { kind: 'swipe', intent: { type: 'forward' } };   // swipe up = drive forward
  if (swipe && Math.abs(dx) >= swipePx && Math.abs(dx) > Math.abs(dy) * 1.5 && dt <= swipeMs) {
    return { kind: 'swipe', intent: { type: dx < 0 ? 'left' : 'right' } };
  }
  if (Math.hypot(dx, dy) <= tapPx) {
    return { kind: 'tap', x: up.x, y: up.y, half: up.x < width / 2 ? { type: 'left' } : { type: 'right' } };
  }
  return { kind: 'none' };
}

export class Input {
  /**
   * @param {HTMLElement} el   element that receives pointer events (the canvas)
   * @param {(intent:object)=>void} onIntent
   * @param {object} [o]
   * @param {()=>number} [o.width]
   * @param {(x:number,y:number)=>object|null} [o.hitTest]   in 'targets' style: tap on an option/drone -> intent
   * @param {boolean} [o.halves]  tap left/right half = lane step (Racer)
   */
  constructor(el, onIntent, o = {}) {
    this.el = el; this.onIntent = onIntent; this.o = { halves: true, swipe: true, ...o };
    this.enabled = true;
    this.haptics = true;
    this._down = null;
    this._onDown = (e) => { this._down = { x: e.offsetX ?? e.clientX, y: e.offsetY ?? e.clientY, t: performance.now() }; };
    this._onUp = (e) => {
      if (!this._down || !this.enabled) return;
      const up = { x: e.offsetX ?? e.clientX, y: e.offsetY ?? e.clientY, t: performance.now() };
      const r = classifyPointer(this._down, up, { width: this.o.width ? this.o.width() : el.clientWidth, swipe: this.o.swipe, vertical: !!this.o.vertical });
      this._down = null;
      if (r.kind === 'swipe') this.emit(r.intent);
      else if (r.kind === 'tap') {
        const hit = this.o.hitTest ? this.o.hitTest(r.x, r.y) : null;
        if (hit) this.emit(hit); else if (this.o.halves) this.emit(r.half);
      }
    };
    this._onKey = (e) => {
      if (!this.enabled || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target && e.target.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
      const it = keyToIntent(e.key, { steerWithAD: !!this.o.steerWithAD });
      if (it) { e.preventDefault(); this.emit(it); }
    };
    el.addEventListener('pointerdown', this._onDown);
    el.addEventListener('pointerup', this._onUp);
    el.addEventListener('pointercancel', () => { this._down = null; });
    if (typeof window !== 'undefined') window.addEventListener('keydown', this._onKey);
  }
  emit(intent) { this.onIntent(intent); }
  vibrate(pattern) {
    if (this.haptics && typeof navigator !== 'undefined' && navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* ignore */ } }
  }
  destroy() {
    this.el.removeEventListener('pointerdown', this._onDown);
    this.el.removeEventListener('pointerup', this._onUp);
    if (typeof window !== 'undefined') window.removeEventListener('keydown', this._onKey);
  }
}
