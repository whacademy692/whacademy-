// Physics-lite: springs, impulses, drag, gravity, particles, shockwaves, lead aiming.
// "Arcade-realistic": semi-implicit Euler at a fixed step. dt passed in is already time-scaled by the loop.

export class Spring {
  constructor(x = 0, k = 90, c = 14) { this.x = x; this.v = 0; this.target = x; this.k = k; this.c = c; }
  /** Critically-damped-ish by default: c ~ 2*sqrt(k) would be critical (~19). 14 gives a little overshoot. */
  step(dt) {
    const a = this.k * (this.target - this.x) - this.c * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
  snap(x) { this.x = x; this.target = x; this.v = 0; }
  get settled() { return Math.abs(this.target - this.x) < 0.001 && Math.abs(this.v) < 0.01; }
}

export class Body {
  constructor(x = 0, y = 0) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.rot = 0; this.vr = 0;
    this.drag = 0.4; this.angDrag = 1.2; this.gravity = 0; this.mass = 1;
  }
  impulse(ix, iy, spin = 0) { this.vx += ix / this.mass; this.vy += iy / this.mass; this.vr += spin / this.mass; }
  step(dt) {
    this.vy += this.gravity * dt;
    const d = Math.max(0, 1 - this.drag * dt), ad = Math.max(0, 1 - this.angDrag * dt);
    this.vx *= d; this.vy *= d; this.vr *= ad;
    this.x += this.vx * dt; this.y += this.vy * dt; this.rot += this.vr * dt;
  }
}

/** Push bodies away from (cx,cy) with falloff. Used by explosions / shockwaves. Returns bodies hit. */
export function shockwave(bodies, cx, cy, strength, radius) {
  let hit = 0;
  for (const b of bodies) {
    const dx = b.x - cx, dy = b.y - cy, d2 = dx * dx + dy * dy;
    if (d2 > radius * radius) continue;
    const d = Math.sqrt(d2) || 0.0001, f = strength * (1 - d / radius);
    b.impulse((dx / d) * f, (dy / d) * f, (dx >= 0 ? 1 : -1) * f * 0.02);
    hit++;
  }
  return hit;
}

/**
 * Lead aiming: where to shoot a projectile of `speed` from (sx,sy) at a target moving with (tvx,tvy).
 * Returns { t, x, y, angle } or null if it can never be intercepted.
 */
export function leadIntercept(sx, sy, tx, ty, tvx, tvy, speed) {
  const rx = tx - sx, ry = ty - sy;
  const a = tvx * tvx + tvy * tvy - speed * speed;
  const b = 2 * (rx * tvx + ry * tvy);
  const c = rx * rx + ry * ry;
  let t;
  if (Math.abs(a) < 1e-9) { if (Math.abs(b) < 1e-9) return null; t = -c / b; }
  else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const s = Math.sqrt(disc), t1 = (-b - s) / (2 * a), t2 = (-b + s) / (2 * a);
    t = Math.min(t1 > 0 ? t1 : Infinity, t2 > 0 ? t2 : Infinity);
  }
  if (!isFinite(t) || t <= 0) return null;
  const x = tx + tvx * t, y = ty + tvy * t;
  return { t, x, y, angle: Math.atan2(y - sy, x - sx) };
}

/** Struct-of-arrays particle pool: no per-particle objects, no GC pressure. */
export class ParticlePool {
  constructor(max = 300) { this.resize(max); }
  resize(max) {
    this.max = max;
    this.x = new Float32Array(max); this.y = new Float32Array(max);
    this.vx = new Float32Array(max); this.vy = new Float32Array(max);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max); this.grav = new Float32Array(max);
    this.hue = new Float32Array(max);
    this.count = 0;
  }
  spawn(x, y, vx, vy, life, size, hue = 180, grav = 0) {
    if (this.count >= this.max) return -1;
    const i = this.count++;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.hue[i] = hue; this.grav[i] = grav;
    return i;
  }
  /** Radial burst; `rng` is injectable for tests. */
  burst(x, y, n, speed, life, size, hue, grav = 0, rng = Math.random) {
    for (let k = 0; k < n; k++) {
      const a = rng() * Math.PI * 2, s = speed * (0.35 + rng() * 0.65);
      if (this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + rng() * 0.4), size * (0.6 + rng() * 0.8), hue + (rng() - 0.5) * 30, grav) < 0) break;
    }
  }
  step(dt) {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {                     // swap-remove
        const l = --this.count;
        if (i !== l) this._copy(l, i);
        continue;
      }
      this.vy[i] += this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
      i++;
    }
  }
  _copy(from, to) {
    this.x[to] = this.x[from]; this.y[to] = this.y[from]; this.vx[to] = this.vx[from]; this.vy[to] = this.vy[from];
    this.life[to] = this.life[from]; this.maxLife[to] = this.maxLife[from]; this.size[to] = this.size[from];
    this.grav[to] = this.grav[from]; this.hue[to] = this.hue[from];
  }
  clear() { this.count = 0; }
}
