import { describe, expect, it } from 'vitest';
import { advance, distance, personalSpot, ringSpot, separation, speedOf, steer, type MotionArrays, type SteerGoal } from '../../../src/sim/core/motion';

function bodies(n: number): MotionArrays {
  return { px: new Float32Array(n), py: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n), gait: new Uint8Array(n) };
}

const goal = (x: number, y: number, arrive = true): SteerGoal => ({ x, y, speed: 4, accel: 12, arrive, pushX: 0, pushY: 0 });
const open = (): boolean => true;
const HOURS = 0.25;

describe('natural movement (core)', () => {
  it('starts gradually, cruises, then brakes and stops on its point', () => {
    const m = bodies(1);
    m.px[0] = 0.5;
    m.py[0] = 0.5;
    steer(m, 0, goal(20.5, 0.5), HOURS);
    expect(speedOf(m, 0)).toBeLessThan(4);
    const speeds: number[] = [];
    for (let k = 0; k < 40; k++) {
      steer(m, 0, goal(20.5, 0.5), HOURS);
      advance(m, 0, HOURS, 64, open);
      speeds.push(speedOf(m, 0));
    }
    expect(Math.max(...speeds)).toBeCloseTo(4);
    expect(m.px[0]).toBeCloseTo(20.5, 1);
    expect(speedOf(m, 0)).toBeLessThan(0.5);
  });

  it('turns progressively: the velocity never jumps to a new direction in one step', () => {
    const m = bodies(1);
    m.px[0] = 10;
    m.py[0] = 10;
    m.vx[0] = 4;
    steer(m, 0, goal(10, 30, false), HOURS);
    // Wanted: straight down. After one step it still goes mostly right.
    expect(m.vx[0]).toBeGreaterThan(1);
    expect(m.vy[0]).toBeGreaterThan(0);
  });

  it('never enters forbidden ground: it slides along the edge or stops', () => {
    const m = bodies(1);
    m.px[0] = 4.5;
    m.py[0] = 4.5;
    m.vx[0] = 4;
    m.vy[0] = 4;
    // Water from column 6 on.
    const dry = (tile: number): boolean => tile % 64 < 6;
    for (let k = 0; k < 8; k++) advance(m, 0, HOURS, 64, dry);
    expect(m.px[0]).toBeLessThan(6);
    expect(m.py[0]).toBeGreaterThan(5);
    expect(m.vx[0]).toBe(0);
  });

  it('pushes two beings apart softly when they are too close, more when closer', () => {
    const m = bodies(3);
    m.px.set([10, 10.2, 10.4]);
    m.py.set([10, 10, 10]);
    const out = { x: 0, y: 0 };
    const near = Int32Array.from([0, 1, 2]);
    separation(m, 0, 0.5, 2, near, 3, null, out);
    expect(out.x).toBeLessThan(0);
    const far = { x: 0, y: 0 };
    m.px[1] = 10.45;
    separation(m, 0, 0.5, 2, near, 3, null, far);
    expect(Math.abs(far.x)).toBeLessThan(Math.abs(out.x));
    // Ignored neighbours do not push.
    const none = { x: 0, y: 0 };
    separation(m, 0, 0.5, 2, near, 3, Uint8Array.from([0, 1, 1]), none);
    expect(none.x).toBe(0);
  });

  it('hands out distinct places on a tile and around a fire', () => {
    const spots: { x: number; y: number }[] = [];
    for (let slot = 0; slot < 20; slot++) {
      const out = { x: 0, y: 0 };
      personalSpot(slot, 5 * 64 + 5, 64, 0.32, out);
      expect(Math.floor(out.x)).toBe(5);
      expect(Math.floor(out.y)).toBe(5);
      spots.push(out);
    }
    for (let a = 0; a < 16; a++) for (let b = a + 1; b < 16; b++) expect(distance(spots[a]!.x, spots[a]!.y, spots[b]!.x, spots[b]!.y)).toBeGreaterThan(0.1);
    const ring: { x: number; y: number }[] = [];
    for (let slot = 0; slot < 16; slot++) {
      const out = { x: 0, y: 0 };
      ringSpot(slot, 5 * 64 + 5, 64, 1.2, 0.3, out);
      expect(distance(out.x, out.y, 5.5, 5.5)).toBeCloseTo(1.2);
      ring.push(out);
    }
    for (let a = 0; a < 16; a++) for (let b = a + 1; b < 16; b++) expect(distance(ring[a]!.x, ring[a]!.y, ring[b]!.x, ring[b]!.y)).toBeGreaterThan(0.4);
  });
});
