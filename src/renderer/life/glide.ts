import { VIEW } from '../view-settings';

/** Interpolated position of a being at a given moment. */
export interface GlidePoint {
  x: number;
  y: number;
  /** 0 standing, 1 walking, 2 running (the gait the simulation reports). */
  gait: number;
  /** Direction the being looks at: last direction of travel (unit vector, screen axes). */
  headingX: number;
  headingY: number;
}

const INITIAL_SLOTS = 256;
/** Below this speed (tiles per hour) the heading is kept as it was (technical). */
const TURN_MIN_SPEED = 0.05;

/**
 * Smooth movement on screen. The simulation gives, at each of its steps, the free position of a
 * being and its velocity. The sprite follows a cubic (Hermite) curve from where it is drawn to the
 * new position, over the real duration of one step: the curve starts with the velocity it was
 * drawn with and ends with the new one, so paths are rounded and speeds change without jerks.
 * At very high speeds (steps shorter than a few frames) or after long jumps, it is simply placed.
 */
export class Glide {
  private fromX = new Float32Array(0);
  private fromY = new Float32Array(0);
  /** Tangents of the curve (tiles over its whole duration). */
  private fromMX = new Float32Array(0);
  private fromMY = new Float32Array(0);
  private toX = new Float32Array(0);
  private toY = new Float32Array(0);
  private toMX = new Float32Array(0);
  private toMY = new Float32Array(0);
  private start = new Float64Array(0);
  private duration = new Float32Array(0);
  private gait = new Uint8Array(0);
  private headingX = new Float32Array(0);
  private headingY = new Float32Array(0);
  private known = new Uint8Array(0);

  constructor(slots = INITIAL_SLOTS) {
    this.ensure(slots);
  }

  /** Forgets every being (new world). */
  clear(): void {
    this.known.fill(0);
  }

  forget(slot: number): void {
    if (slot < this.known.length) this.known[slot] = 0;
  }

  /**
   * The simulation says the being is at (x, y) with velocity (vx, vy) tiles per game hour, at
   * `now`. `stepMs` is the real duration of one step of this kind of being at the current pace and
   * `stepHours` its duration in game hours.
   */
  set(slot: number, x: number, y: number, vx: number, vy: number, gait: number, now: number, stepMs: number, stepHours: number): void {
    this.ensure(slot + 1);
    const speed = Math.hypot(vx, vy);
    if (speed > TURN_MIN_SPEED) {
      this.headingX[slot] = vx / speed;
      this.headingY[slot] = vy / speed;
    }
    this.gait[slot] = gait;
    if (this.known[slot] === 0) {
      this.place(slot, x, y, now);
      if (speed <= TURN_MIN_SPEED) {
        this.headingX[slot] = 1;
        this.headingY[slot] = 0;
      }
      return;
    }
    if (x === this.toX[slot] && y === this.toY[slot]) return;
    const shown = this.curve(slot, now, SCRATCH);
    const jump = Math.max(Math.abs(x - shown.x), Math.abs(y - shown.y));
    if (stepMs < VIEW.glideMinStepMs || jump > VIEW.glideMaxTiles) {
      this.place(slot, x, y, now);
      return;
    }
    const duration = Math.max(1, stepMs);
    // The new curve starts where and how the sprite moves now (its speed rescaled to the new duration).
    const scale = duration / this.duration[slot]!;
    this.fromX[slot] = shown.x;
    this.fromY[slot] = shown.y;
    this.fromMX[slot] = SCRATCH_SLOPE.x * scale;
    this.fromMY[slot] = SCRATCH_SLOPE.y * scale;
    this.toX[slot] = x;
    this.toY[slot] = y;
    this.toMX[slot] = vx * stepHours;
    this.toMY[slot] = vy * stepHours;
    this.start[slot] = now;
    this.duration[slot] = duration;
  }

  /** Where to draw the being at `now` (writes into and returns `out`). */
  at(slot: number, now: number, out: GlidePoint): GlidePoint {
    this.curve(slot, now, out);
    out.gait = this.gait[slot]!;
    out.headingX = this.headingX[slot]!;
    out.headingY = this.headingY[slot]!;
    return out;
  }

  /** Position on the current curve (and its slope in SCRATCH_SLOPE). */
  private curve(slot: number, now: number, out: { x: number; y: number }): { x: number; y: number } {
    const t = Math.min(1, Math.max(0, (now - this.start[slot]!) / this.duration[slot]!));
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    out.x = h00 * this.fromX[slot]! + h10 * this.fromMX[slot]! + h01 * this.toX[slot]! + h11 * this.toMX[slot]!;
    out.y = h00 * this.fromY[slot]! + h10 * this.fromMY[slot]! + h01 * this.toY[slot]! + h11 * this.toMY[slot]!;
    if (t >= 1) {
      // End of the curve: it waits there for the next step, which will go on at the speed it had.
      SCRATCH_SLOPE.x = this.toMX[slot]!;
      SCRATCH_SLOPE.y = this.toMY[slot]!;
      return out;
    }
    const d00 = 6 * t2 - 6 * t;
    const d10 = 3 * t2 - 4 * t + 1;
    const d01 = -6 * t2 + 6 * t;
    const d11 = 3 * t2 - 2 * t;
    SCRATCH_SLOPE.x = d00 * this.fromX[slot]! + d10 * this.fromMX[slot]! + d01 * this.toX[slot]! + d11 * this.toMX[slot]!;
    SCRATCH_SLOPE.y = d00 * this.fromY[slot]! + d10 * this.fromMY[slot]! + d01 * this.toY[slot]! + d11 * this.toMY[slot]!;
    return out;
  }

  private place(slot: number, x: number, y: number, now: number): void {
    this.known[slot] = 1;
    this.fromX[slot] = x;
    this.fromY[slot] = y;
    this.toX[slot] = x;
    this.toY[slot] = y;
    this.fromMX[slot] = 0;
    this.fromMY[slot] = 0;
    this.toMX[slot] = 0;
    this.toMY[slot] = 0;
    this.start[slot] = now;
    this.duration[slot] = 1;
  }

  private ensure(slots: number): void {
    if (slots <= this.known.length) return;
    const size = Math.max(slots, this.known.length * 2);
    const grow = <T extends Float32Array | Float64Array | Int8Array | Uint8Array>(old: T, make: (n: number) => T): T => {
      const next = make(size);
      next.set(old);
      return next;
    };
    this.fromX = grow(this.fromX, (n) => new Float32Array(n));
    this.fromY = grow(this.fromY, (n) => new Float32Array(n));
    this.fromMX = grow(this.fromMX, (n) => new Float32Array(n));
    this.fromMY = grow(this.fromMY, (n) => new Float32Array(n));
    this.toX = grow(this.toX, (n) => new Float32Array(n));
    this.toY = grow(this.toY, (n) => new Float32Array(n));
    this.toMX = grow(this.toMX, (n) => new Float32Array(n));
    this.toMY = grow(this.toMY, (n) => new Float32Array(n));
    this.start = grow(this.start, (n) => new Float64Array(n));
    this.duration = grow(this.duration, (n) => new Float32Array(n));
    this.gait = grow(this.gait, (n) => new Uint8Array(n));
    this.headingX = grow(this.headingX, (n) => new Float32Array(n));
    this.headingY = grow(this.headingY, (n) => new Float32Array(n));
    this.known = grow(this.known, (n) => new Uint8Array(n));
  }
}

const SCRATCH_SLOPE = { x: 0, y: 0 };
const SCRATCH = { x: 0, y: 0 };

/**
 * Real speed of the simulation, measured from the game clock the worker reports (it accounts for
 * pauses and for a computer that cannot keep up): how many real milliseconds one tick takes.
 */
export class SimPace {
  private lastTick = -1;
  private lastAt = 0;
  private msPerTick = Infinity;

  reset(): void {
    this.lastTick = -1;
    this.msPerTick = Infinity;
  }

  /** A new game time `tick` was reported at real time `now`. */
  observe(tick: number, now: number, paused: boolean): void {
    if (paused) {
      this.msPerTick = Infinity;
      this.lastTick = tick;
      this.lastAt = now;
      return;
    }
    if (this.lastTick >= 0 && tick > this.lastTick && now > this.lastAt) {
      const measured = (now - this.lastAt) / (tick - this.lastTick);
      this.msPerTick = Number.isFinite(this.msPerTick) ? this.msPerTick + (measured - this.msPerTick) * VIEW.paceSmoothing : measured;
    }
    if (tick !== this.lastTick) {
      this.lastTick = tick;
      this.lastAt = now;
    }
  }

  /** Real duration of `ticks` ticks at the current pace (capped when paused or unknown). */
  msFor(ticks: number): number {
    return Math.min(VIEW.glideMaxStepMs, ticks * this.msPerTick);
  }
}
