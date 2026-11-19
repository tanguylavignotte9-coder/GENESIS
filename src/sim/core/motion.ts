/**
 * Natural movement, shared by humans and animals (step 7.5). A being has a free position (decimal
 * tile coordinates: the tile under its feet is the integer part), a velocity in tiles per hour and
 * a gait. Each step it steers toward a goal point: it accelerates, brakes before arriving and turns
 * progressively (the change of velocity per step is limited), and is gently pushed away by the
 * others (no hard collisions). The grid only tells what ground is under its feet.
 *
 * Determinism: only + − × ÷ and Math.sqrt (correctly rounded by IEEE 754 on every platform) are
 * used; no trigonometry. Directions come from a fixed table of unit vectors.
 */

export const Gait = { Still: 0, Walk: 1, Run: 2 } as const;
export type GaitCode = (typeof Gait)[keyof typeof Gait];

/** The movement columns of a store of beings (people or animals). */
export interface MotionArrays {
  /** Free position, in tiles (x = 12.5: middle of column 12). */
  px: Float32Array;
  py: Float32Array;
  /** Velocity, in tiles per game hour. */
  vx: Float32Array;
  vy: Float32Array;
  gait: Uint8Array;
}

/** 16 unit vectors, every 22.5° (literal values: no trigonometry at run time). */
const C1 = 0.9238795325112867;
const S1 = 0.3826834323650898;
const H = Math.SQRT1_2;
export const DIRECTIONS_X = Float64Array.from([1, C1, H, S1, 0, -S1, -H, -C1, -1, -C1, -H, -S1, 0, S1, H, C1]);
export const DIRECTIONS_Y = Float64Array.from([0, S1, H, C1, 1, C1, H, S1, 0, -S1, -H, -C1, -1, -C1, -H, -S1]);
export const DIRECTION_COUNT = 16;

/** Below this speed (tiles per hour) a being is standing still (technical). */
const STILL_SPEED = 0.05;
/** Longest sub-move checked against the ground at once, in tiles (no jumping over a stream). */
const MAX_SUBMOVE_TILES = 0.9;
const EPSILON = 1e-6;

export function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

export interface SteerGoal {
  x: number;
  y: number;
  /** Cruising speed wanted, tiles per hour. */
  speed: number;
  /** Largest change of velocity per hour (acceleration, braking and turning). */
  accel: number;
  /** True for the end of the trip: the being brakes so as to stop on the point. */
  arrive: boolean;
  /** Extra wanted velocity (avoidance of the others, walking beside someone), tiles per hour. */
  pushX: number;
  pushY: number;
}

/**
 * Updates the velocity of being `i` toward a goal: the wanted velocity points at the goal (slower
 * when arriving), plus the push; the velocity changes toward it by at most `accel × hours`.
 */
export function steer(m: MotionArrays, i: number, goal: SteerGoal, hours: number): void {
  const dx = goal.x - m.px[i]!;
  const dy = goal.y - m.py[i]!;
  const d = Math.sqrt(dx * dx + dy * dy);
  let wantX = goal.pushX;
  let wantY = goal.pushY;
  if (d > EPSILON) {
    let speed = goal.speed;
    // Braking: never faster than what lets one stop on the point, nor than what reaches it this step.
    if (goal.arrive) speed = Math.min(speed, Math.sqrt(2 * goal.accel * d), d / hours);
    wantX += (dx / d) * speed;
    wantY += (dy / d) * speed;
  }
  let changeX = wantX - m.vx[i]!;
  let changeY = wantY - m.vy[i]!;
  const change = Math.sqrt(changeX * changeX + changeY * changeY);
  const most = goal.accel * hours;
  if (change > most) {
    changeX *= most / change;
    changeY *= most / change;
  }
  m.vx[i] = m.vx[i]! + changeX;
  m.vy[i] = m.vy[i]! + changeY;
}

/** Speed of being `i`, tiles per hour. */
export function speedOf(m: MotionArrays, i: number): number {
  const vx = m.vx[i]!;
  const vy = m.vy[i]!;
  return Math.sqrt(vx * vx + vy * vy);
}

export function stop(m: MotionArrays, i: number): void {
  m.vx[i] = 0;
  m.vy[i] = 0;
  m.gait[i] = Gait.Still;
}

/**
 * Moves being `i` by its velocity over `hours`, in short sub-moves that never enter forbidden
 * ground (water): blocked on one axis, it slides along the other; blocked on both, it stops.
 * Returns the distance actually travelled (tiles).
 */
export function advance(m: MotionArrays, i: number, hours: number, mapSize: number, walkable: (tile: number) => boolean): number {
  let x = m.px[i]!;
  let y = m.py[i]!;
  const startX = x;
  const startY = y;
  const totalX = m.vx[i]! * hours;
  const totalY = m.vy[i]! * hours;
  const length = Math.sqrt(totalX * totalX + totalY * totalY);
  const parts = Math.max(1, Math.ceil(length / MAX_SUBMOVE_TILES));
  const stepX = totalX / parts;
  const stepY = totalY / parts;
  for (let k = 0; k < parts; k++) {
    if (isFree(x + stepX, y + stepY, mapSize, walkable)) {
      x += stepX;
      y += stepY;
    } else if (stepX !== 0 && isFree(x + stepX, y, mapSize, walkable)) {
      x += stepX;
      m.vy[i] = 0;
    } else if (stepY !== 0 && isFree(x, y + stepY, mapSize, walkable)) {
      y += stepY;
      m.vx[i] = 0;
    } else {
      m.vx[i] = 0;
      m.vy[i] = 0;
      break;
    }
  }
  m.px[i] = x;
  m.py[i] = y;
  return distance(x, y, startX, startY);
}

function isFree(fx: number, fy: number, mapSize: number, walkable: (tile: number) => boolean): boolean {
  if (fx < 0 || fy < 0 || fx >= mapSize || fy >= mapSize) return false;
  return walkable(Math.floor(fy) * mapSize + Math.floor(fx));
}

/** Gait shown for a being moving at its current velocity (`running` when it sprints). */
export function updateGait(m: MotionArrays, i: number, running: boolean): void {
  m.gait[i] = speedOf(m, i) < STILL_SPEED ? Gait.Still : running ? Gait.Run : Gait.Walk;
}

/**
 * Soft avoidance: the sum of pushes away from the neighbours closer than `space` tiles (stronger
 * the closer), in tiles per hour (scaled by `strength`). `near` holds `count` candidates (from a
 * spatial grid); those marked in `ignore` (if given) do not count. Two beings on the very same
 * point are told apart by their index.
 */
export function separation(
  m: MotionArrays,
  i: number,
  space: number,
  strength: number,
  near: Int32Array,
  count: number,
  ignore: Uint8Array | null,
  out: { x: number; y: number },
): void {
  out.x = 0;
  out.y = 0;
  const x = m.px[i]!;
  const y = m.py[i]!;
  for (let n = 0; n < count; n++) {
    const other = near[n]!;
    if (other === i || (ignore !== null && ignore[other] === 1)) continue;
    const dx = x - m.px[other]!;
    const dy = y - m.py[other]!;
    if (dx > space || dx < -space || dy > space || dy < -space) continue;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d >= space) continue;
    const weight = (strength * (space - d)) / space;
    if (d < EPSILON) {
      const k = (i > other ? i : other) % DIRECTION_COUNT;
      const sign = i > other ? 1 : -1;
      out.x += DIRECTIONS_X[k]! * weight * sign;
      out.y += DIRECTIONS_Y[k]! * weight * sign;
      continue;
    }
    out.x += (dx / d) * weight;
    out.y += (dy / d) * weight;
  }
}

/** Order in which the places of a spot are handed out: each new one as far as possible from the taken ones. */
const SLOT_ORDER = [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15];
/** Places per ring, and how much smaller each inner ring is. */
export const SLOTS_PER_RING = SLOT_ORDER.length;
const INNER_RING_SHARE = 0.5;

/**
 * Place number `slot` on a tile (several people at one work site, stock or bed never stand on one
 * point): 16 places on a ring of radius `maxOffset` around the tile's middle, then 16 on an inner
 * ring, set between the first ones, then the middle.
 */
export function personalSpot(slot: number, tile: number, mapSize: number, maxOffset: number, out: { x: number; y: number }): void {
  const tx = tile % mapSize;
  const ty = (tile - tx) / mapSize;
  const ring = Math.floor(slot / SLOTS_PER_RING);
  const k = (SLOT_ORDER[slot % SLOTS_PER_RING]! + ring) % DIRECTION_COUNT;
  const radius = ring === 0 ? maxOffset : ring === 1 ? maxOffset * INNER_RING_SHARE : 0;
  out.x = tx + 0.5 + DIRECTIONS_X[k]! * radius;
  out.y = ty + 0.5 + DIRECTIONS_Y[k]! * radius;
}

/** Place number `slot` in a circle of radius `radius` around the middle of a tile (around a fire); further rings beyond 16. */
export function ringSpot(slot: number, tile: number, mapSize: number, radius: number, spread: number, out: { x: number; y: number }): void {
  const tx = tile % mapSize;
  const ty = (tile - tx) / mapSize;
  const ring = Math.floor(slot / SLOTS_PER_RING);
  const k = (SLOT_ORDER[slot % SLOTS_PER_RING]! + ring) % DIRECTION_COUNT;
  const r = radius + spread * ring;
  out.x = tx + 0.5 + DIRECTIONS_X[k]! * r;
  out.y = ty + 0.5 + DIRECTIONS_Y[k]! * r;
}
