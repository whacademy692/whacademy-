import test from 'node:test';
import assert from 'node:assert/strict';
import { GameLoop } from '../engine/core/loop.js';
import { PerfManager, QUALITY } from '../engine/core/perf.js';
import { Spring, Body, ParticlePool, shockwave, leadIntercept } from '../engine/core/physics.js';
import { Fx, Trail } from '../engine/core/fx.js';
import { keyToIntent, classifyPointer } from '../engine/core/input.js';
import { RECIPES, Sfx } from '../engine/core/audio.js';
import { Renderer } from '../engine/core/renderer.js';

test('loop: fixed 60 Hz updates regardless of frame rate', () => {
  for (const fps of [30, 60, 144]) {
    let ups = 0;
    const loop = new GameLoop({ update: () => ups++, render: () => {} });
    const dt = 1000 / fps;
    for (let i = 0; i <= fps * 2; i++) loop.frame(i * dt);   // 2 simulated seconds
    assert.ok(Math.abs(ups - 120) <= 2, `fps ${fps}: ${ups} updates`);
  }
});

test('loop: time-scale shrinks dt, spiral of death is capped', () => {
  const dts = [];
  const loop = new GameLoop({ update: (dt) => dts.push(dt), render: () => {} });
  loop.timeScale = 0.35;
  loop.frame(0); loop.frame(1000 / 60);
  assert.ok(Math.abs(dts[0] - (1 / 60) * 0.35) < 1e-9);
  const big = new GameLoop({ update: () => {}, render: () => {} });
  big.frame(0); big.frame(60000);                            // tab slept for a minute
  assert.ok(big.updates <= 16);
});

test('loop: pause stops updates, 30 fps fallback halves renders only', () => {
  const loop = new GameLoop({ update: () => {}, render: () => {} });
  loop.frame(0); loop.frame(17); loop.pause(); loop.frame(34); loop.frame(51);
  assert.equal(loop.updates, 1);
  const l2 = new GameLoop({ update: () => {}, render: () => {} });
  l2.renderEvery = 2;
  for (let i = 0; i <= 120; i++) l2.frame(i * (1000 / 60));
  assert.ok(l2.updates >= 118);
  assert.ok(Math.abs(l2.renders - 60) <= 2);
});

function feed(p, ms, seconds) { for (let t = 0; t < seconds; t += ms / 1000) p.frame(ms); }

test('perf: steady 60 fps stays put on medium; slow frames walk down the ladder', () => {
  const changes = [];
  const p = new PerfManager({ level: 2, onChange: (c) => changes.push(c.reason + ':' + c.level) });
  feed(p, 16.7, 5);
  assert.deepEqual(changes, []);
  feed(p, 30, 3);                                            // ~33 fps
  assert.equal(p.level, 1);
  feed(p, 30, 3);
  assert.equal(p.level, 0);
  assert.ok(p.fps < 40);
});

test('perf: very slow at low enables the 30 fps fallback, recovery turns it off', () => {
  const p = new PerfManager({ level: 0 });
  feed(p, 45, 5);
  assert.equal(p.fallback30, true);
  feed(p, 14, 30);
  assert.equal(p.fallback30, false);
});

test('perf: climbs back with headroom but not onto a level that already failed', () => {
  const p = new PerfManager({ level: 2 });
  feed(p, 28, 2.5);                                          // ~36 fps: fail high -> medium
  assert.equal(p.level, 1);
  feed(p, 10, 60);                                           // lots of headroom
  assert.equal(p.level, 1);                                  // high is locked out after failing
  const q = new PerfManager({ level: 0 });
  feed(q, 10, 40);
  assert.ok(q.level >= 1);
});

test('perf: manual mode does not auto-change; presets are ordered', () => {
  const p = new PerfManager({ auto: false, level: 2 });
  feed(p, 50, 6);
  assert.equal(p.level, 2);
  p.setLevel(0);
  assert.equal(p.preset.name, 'low');
  assert.ok(QUALITY[0].particles < QUALITY[1].particles && QUALITY[1].particles < QUALITY[2].particles);
});

test('physics: spring settles on target with a little overshoot', () => {
  const s = new Spring(0); s.target = 100;
  let max = 0;
  for (let i = 0; i < 180; i++) { s.step(1 / 60); max = Math.max(max, s.x); }
  assert.ok(Math.abs(s.x - 100) < 0.5);
  assert.ok(max >= 100 && max < 112);
});

test('physics: body impulse, drag and spin', () => {
  const b = new Body(); b.impulse(100, 0, 8);
  for (let i = 0; i < 60; i++) b.step(1 / 60);
  assert.ok(b.x > 0 && b.rot > 0);
  assert.ok(b.vx < 100);
});

test('physics: shockwave pushes outward with falloff, ignores far bodies', () => {
  const near = new Body(10, 0), mid = new Body(60, 0), far = new Body(500, 0);
  const n = shockwave([near, mid, far], 0, 0, 100, 100);
  assert.equal(n, 2);
  assert.ok(near.vx > mid.vx && mid.vx > 0);
  assert.equal(far.vx, 0);
});

test('physics: lead aiming intercepts a moving target', () => {
  const r = leadIntercept(0, 0, 100, 0, 0, 50, 200);
  assert.ok(r);
  // projectile position at t equals target position at t
  const px = Math.cos(r.angle) * 200 * r.t, py = Math.sin(r.angle) * 200 * r.t;
  assert.ok(Math.abs(px - r.x) < 1e-6 && Math.abs(py - r.y) < 1e-6);
  assert.equal(leadIntercept(0, 0, 100, 0, 500, 0, 100), null);   // target outruns the shot
});

test('particles: spawn, age out, swap-remove, respect the budget', () => {
  const p = new ParticlePool(50);
  let s = 5; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  p.burst(0, 0, 80, 100, 0.5, 3, 180, 0, rnd);
  assert.equal(p.count, 50);
  for (let i = 0; i < 60; i++) p.step(1 / 60);
  assert.equal(p.count, 0);
  p.resize(10);
  assert.equal(p.max, 10);
});

test('fx: shake decays, reduce-motion kills it, slow-mo eases and returns to 1', () => {
  const fx = new Fx(); fx.shake(1); fx.update(0.016);
  assert.ok(Math.abs(fx.ox) + Math.abs(fx.oy) > 0);
  for (let i = 0; i < 120; i++) fx.update(0.016);
  assert.equal(fx.trauma, 0);
  const rm = new Fx({ reduceMotion: true }); rm.shake(1); rm.update(0.016);
  assert.equal(rm.ox, 0);
  const sm = new Fx(); sm.slowmo(0.2, 0.5);
  for (let i = 0; i < 20; i++) sm.update(0.016);
  assert.ok(sm.slow < 0.4);
  for (let i = 0; i < 120; i++) sm.update(0.016);
  assert.equal(sm.slow, 1);
});

test('trail: ring buffer keeps newest first', () => {
  const t = new Trail(3);
  for (let i = 1; i <= 5; i++) t.push(i, i * 10);
  assert.equal(t.len, 3);
  assert.deepEqual(t.at(0), [5, 50]);
  assert.deepEqual(t.at(2), [3, 30]);
});

test('input: keyboard map', () => {
  assert.deepEqual(keyToIntent('1'), { type: 'lane', index: 0 });
  assert.deepEqual(keyToIntent('4'), { type: 'lane', index: 3 });
  assert.deepEqual(keyToIntent('b'), { type: 'lane', index: 1 });
  assert.deepEqual(keyToIntent('ArrowLeft'), { type: 'left' });
  assert.deepEqual(keyToIntent('a', { steerWithAD: true }), { type: 'left' });
  assert.deepEqual(keyToIntent('d', { steerWithAD: true }), { type: 'right' });
  assert.deepEqual(keyToIntent('q'), { type: 'ability', slot: 0 });
  assert.deepEqual(keyToIntent('f'), { type: 'power', name: 'fifty' });
  assert.equal(keyToIntent('constructor'), null);
  assert.equal(keyToIntent('Shift'), null);
});

test('input: tap vs swipe classification', () => {
  const o = { width: 400 };
  assert.deepEqual(classifyPointer({ x: 50, y: 300, t: 0 }, { x: 52, y: 301, t: 80 }, o).half, { type: 'left' });
  assert.deepEqual(classifyPointer({ x: 350, y: 300, t: 0 }, { x: 351, y: 300, t: 80 }, o).half, { type: 'right' });
  assert.deepEqual(classifyPointer({ x: 200, y: 300, t: 0 }, { x: 120, y: 305, t: 150 }, o).intent, { type: 'left' });
  assert.equal(classifyPointer({ x: 200, y: 300, t: 0 }, { x: 120, y: 305, t: 1500 }, o).kind, 'none');   // too slow
  assert.equal(classifyPointer({ x: 200, y: 300, t: 0 }, { x: 200, y: 200, t: 100 }, o).kind, 'none');    // vertical
  assert.equal(classifyPointer({ x: 200, y: 300, t: 0 }, { x: 120, y: 305, t: 150 }, { ...o, swipe: false }).kind, 'none');
});

test('audio: every recipe is well-formed; Sfx is a safe no-op without a context', () => {
  for (const [name, rec] of Object.entries(RECIPES)) {
    assert.ok(rec.length > 0, name);
    for (const v of rec) {
      assert.ok(v.dur > 0 && v.gain > 0 && v.f > 0 && v.at >= 0, name);
      assert.ok(['sine', 'square', 'sawtooth', 'triangle', 'noise'].includes(v.type), name);
    }
  }
  const s = new Sfx();
  assert.equal(s.play('correct'), false);
  s.unlock();                                                // no window in Node: must not throw
});

function fakeCanvas() {
  const calls = [];
  const ctx = new Proxy({}, { get: (_, k) => (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => calls.push(k)), set: () => true });
  return { width: 0, height: 0, style: {}, getContext: () => ctx };
}
test('renderer: DPR is capped, glow sprites are cached', () => {
  const r = new Renderer(fakeCanvas(), { dprCap: 1.25, makeCanvas: () => fakeCanvas() });
  r.resize(400, 800, 3);
  assert.equal(r.dpr, 1.25);
  assert.equal(r.canvas.width, 500);
  r.setDprCap(1);
  assert.equal(r.canvas.width, 400);
  for (let i = 0; i < 50; i++) r.glow(10, 10, 20, '#19e6c1');
  assert.equal(r.stats.spriteBuilds, 1);
  assert.equal(r.stats.spriteHits, 49);
  r.glowOn = false;
  const before = r.stats.spriteHits;
  r.glow(10, 10, 20, '#19e6c1');
  assert.equal(r.stats.spriteHits, before);                  // Low preset: skipped entirely
});
