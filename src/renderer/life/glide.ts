import { VIEW } from '../view-settings';

/** Interpolated position of a being at a given moment. */
export interface GlidePoint {
  x: number;
  y: number;
  /** True while the being is gliding from one tile to the next (walking animation). */
  moving: boolean;
  /** Last horizontal direction of travel: -1 left, 1 right. */
  facing: number;
}

const INITIAL_SLOTS = 256;

/**
 * Smooth movement on screen. The simulation moves beings tile by tile; when a being's tile
 * changes, its sprite glides from where it is drawn to the new tile over the time its previous
 * step took (at most one simulation step at the current speed), so a regular walker moves without
 * stopping. At very high speeds (steps shorter than a few frames) or after long jumps, it snaps.
 */
export class Glide {
  private fromX = new Float32Array(0);
  private fromY = new Float32Array(0);
  private toX = new Float32Array(0);
  private toY = new Float32Array(0);
  private start = new Float64Array(0);
  private duration = new Float32Array(0);
  private lastChange = new Float64Array(0);
  private facing = new Int8Array(0);
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
   * The simulation says the being is on (x, y) — sprite coordinates of its tile — at `now`.
   * `stepMs` is the real duration of one simulation step of this kind of being at the current speed.
   */
  set(slot: number, x: number, y: number, now: number, stepMs: number): void {
    this.ensure(slot + 1);
    if (this.known[slot] === 0) {
      this.place(slot, x, y, now);
      this.lastChange[slot] = now - stepMs;
      return;
    }
    if (x === this.toX[slot] && y === this.toY[slot]) return;
    const shown = this.at(slot, now, SCRATCH);
    const jump = Math.max(Math.abs(x - shown.x), Math.abs(y - shown.y));
    if (x !== this.toX[slot]) this.facing[slot] = x < this.toX[slot]! ? -1 : 1;
    const since = now - this.lastChange[slot]!;
    this.lastChange[slot] = now;
    if (stepMs < VIEW.glideMinStepMs || jump > VIEW.glideMaxTiles) {
      this.place(slot, x, y, now);
      return;
    }
    this.fromX[slot] = shown.x;
    this.fromY[slot] = shown.y;
    this.toX[slot] = x;
    this.toY[slot] = y;
    this.start[slot] = now;
    this.duration[slot] = Math.max(1, Math.min(since, stepMs));
  }

  /** Where to draw the being at `now` (writes into and returns `out`). */
  at(slot: number, now: number, out: GlidePoint): GlidePoint {
    const t = Math.min(1, (now - this.start[slot]!) / this.duration[slot]!);
    out.x = this.fromX[slot]! + (this.toX[slot]! - this.fromX[slot]!) * t;
    out.y = this.fromY[slot]! + (this.toY[slot]! - this.fromY[slot]!) * t;
    out.moving = t < 1;
    out.facing = this.facing[slot] || 1;
    return out;
  }

  private place(slot: number, x: number, y: number, now: number): void {
    this.known[slot] = 1;
    this.fromX[slot] = x;
    this.fromY[slot] = y;
    this.toX[slot] = x;
    this.toY[slot] = y;
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
    this.toX = grow(this.toX, (n) => new Float32Array(n));
    this.toY = grow(this.toY, (n) => new Float32Array(n));
    this.start = grow(this.start, (n) => new Float64Array(n));
    this.duration = grow(this.duration, (n) => new Float32Array(n));
    this.lastChange = grow(this.lastChange, (n) => new Float64Array(n));
    this.facing = grow(this.facing, (n) => new Int8Array(n));
    this.known = grow(this.known, (n) => new Uint8Array(n));
  }
}

const SCRATCH: GlidePoint = { x: 0, y: 0, moving: false, facing: 1 };

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
