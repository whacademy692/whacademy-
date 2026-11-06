// Traffic cars: they only cost speed (and cosmetic coins), NEVER a heart. Pure logic, injectable rng.
// Car depth z: 1 = far (horizon), 0 = the player's row. They move toward the player with the world speed.

export const TRAFFIC_Z_START = 1;
export const HIT_Z = 0.06;            // |z| within this range counts as being "in" the player's row
export const TRAFFIC_SPEED = 0.55;    // depth units per second at world speed 1

export class Traffic {
  constructor({ rng = Math.random, lanes = 4 } = {}) {
    this.rng = rng; this.lanes = lanes;
    this.cars = [];
    this.timer = 1.5;
    this.hits = 0;
  }
  clear() { this.cars.length = 0; this.timer = 1.5; }

  /**
   * @param {number} dt         scaled seconds (world time)
   * @param {number} speed      world speed multiplier (rank speed + boost)
   * @param {number} interval   seconds between spawns (0 disables)
   * @param {number} playerLane lane index the car currently occupies (rounded from the spring)
   * @param {number[]} [avoidLanes] lanes with a gate right now: not blocked completely
   * @returns {{hit:boolean, passed:number}}
   */
  step(dt, speed, interval, playerLane) {
    let hit = false, passed = 0;
    if (interval > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = interval * (0.7 + this.rng() * 0.6);
        // never wall off every lane: at most one car per spawn, never the same lane twice in a row near the horizon
        const last = this.cars.length ? this.cars[this.cars.length - 1] : null;
        let lane = Math.floor(this.rng() * this.lanes);
        if (last && last.z > 0.8 && last.lane === lane) lane = (lane + 1 + Math.floor(this.rng() * (this.lanes - 1))) % this.lanes;
        this.cars.push({ lane, z: TRAFFIC_Z_START, hit: false, hue: Math.floor(this.rng() * 360) });
      }
    }
    for (const c of this.cars) {
      const before = c.z;
      c.z -= TRAFFIC_SPEED * speed * dt;
      if (!c.hit && c.lane === playerLane && c.z < HIT_Z && before >= -HIT_Z) { c.hit = true; hit = true; this.hits++; }
      if (before >= 0 && c.z < 0 && !c.hit) passed++;
    }
    this.cars = this.cars.filter((c) => c.z > -0.25);
    return { hit, passed };
  }
}
