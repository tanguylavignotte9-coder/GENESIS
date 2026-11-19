import { describe, expect, it } from 'vitest';
import { Glide, SimPace, type GlidePoint } from '../../src/renderer/life/glide';
import { VIEW } from '../../src/renderer/view-settings';

const point = (): GlidePoint => ({ x: 0, y: 0, gait: 0, headingX: 1, headingY: 0 });
const WALK = 1;

describe('smooth movement on screen', () => {
  it('a walker moves along a curve over the duration of a step, then stands at the new position', () => {
    const glide = new Glide(4);
    glide.set(0, 10, 10, 0, 0, 0, 0, 1000, 1);
    glide.set(0, 11, 10, 1, 0, WALK, 1000, 1000, 1);
    const halfway = glide.at(0, 1500, point());
    expect(halfway.x).toBeGreaterThan(10.2);
    expect(halfway.x).toBeLessThan(11);
    expect(halfway.gait).toBe(WALK);
    const done = glide.at(0, 2100, point());
    expect(done.x).toBe(11);
    expect(done.y).toBe(10);
  });

  it('starts the next curve from where the sprite is drawn (no jump back) and keeps its heading', () => {
    const glide = new Glide(4);
    glide.set(0, 0, 0, 0, 0, 0, 0, 1000, 1);
    glide.set(0, 1, 0, 1, 0, WALK, 1000, 1000, 1);
    const before = glide.at(0, 1500, point()).x;
    glide.set(0, 2, 0, 1, 0, WALK, 1500, 1000, 1);
    expect(glide.at(0, 1500, point()).x).toBeCloseTo(before);
    // Moving right, then a turn downward: the heading follows the velocity.
    expect(glide.at(0, 1750, point()).headingX).toBe(1);
    glide.set(0, 2, 1, 0, 1, WALK, 2500, 1000, 1);
    expect(glide.at(0, 2600, point()).headingY).toBe(1);
  });

  it('a turn is drawn as a curve, not as a corner', () => {
    const glide = new Glide(4);
    glide.set(0, 0, 0, 0, 0, 0, 0, 1000, 1);
    glide.set(0, 1, 0, 1, 0, WALK, 0, 1000, 1);
    glide.set(0, 1, 1, 0, 1, WALK, 1000, 1000, 1);
    // Halfway through the turn, the sprite is neither on the straight line x = 1 nor on y = 0.
    const mid = glide.at(0, 1500, point());
    expect(mid.x).toBeGreaterThan(1);
    expect(mid.y).toBeGreaterThan(0);
    expect(mid.y).toBeLessThan(1);
  });

  it('places directly at very high speed and on long jumps', () => {
    const glide = new Glide(4);
    glide.set(0, 0, 0, 0, 0, 0, 0, 1000, 1);
    glide.set(0, 1, 0, 1, 0, WALK, 1000, VIEW.glideMinStepMs / 2, 1);
    expect(glide.at(0, 1000, point()).x).toBe(1);
    glide.set(0, 1 + VIEW.glideMaxTiles + 1, 0, 1, 0, WALK, 2000, 1000, 1);
    expect(glide.at(0, 2000, point()).x).toBe(1 + VIEW.glideMaxTiles + 1);
  });

  it('measures the real pace of the simulation from the reported game time', () => {
    const pace = new SimPace();
    pace.observe(0, 0, false);
    pace.observe(100, 1000, false);
    expect(pace.msFor(50)).toBeCloseTo(500);
    pace.observe(100, 2000, true);
    expect(pace.msFor(50)).toBe(VIEW.glideMaxStepMs);
  });
});
