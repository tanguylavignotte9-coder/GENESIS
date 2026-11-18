import { describe, expect, it } from 'vitest';
import { Glide, SimPace, type GlidePoint } from '../../src/renderer/life/glide';
import { VIEW } from '../../src/renderer/view-settings';

const point = (): GlidePoint => ({ x: 0, y: 0, moving: false, facing: 1 });

describe('smooth movement on screen', () => {
  it('a walker glides from tile to tile over the duration of a step, then stands', () => {
    const glide = new Glide(4);
    glide.set(0, 10, 10, 0, 1000);
    glide.set(0, 11, 10, 1000, 1000);
    const halfway = glide.at(0, 1500, point());
    expect(halfway.x).toBeCloseTo(10.5);
    expect(halfway.moving).toBe(true);
    const done = glide.at(0, 2100, point());
    expect(done.x).toBe(11);
    expect(done.moving).toBe(false);
  });

  it('starts the next glide from where the sprite is drawn (no jump back)', () => {
    const glide = new Glide(4);
    glide.set(0, 0, 0, 0, 1000);
    glide.set(0, 1, 0, 1000, 1000);
    glide.set(0, 2, 0, 1500, 1000);
    expect(glide.at(0, 1500, point()).x).toBeCloseTo(0.5);
    expect(glide.at(0, 1750, point()).facing).toBe(1);
  });

  it('snaps at very high speed and on long jumps', () => {
    const glide = new Glide(4);
    glide.set(0, 0, 0, 0, 1000);
    glide.set(0, 1, 0, 1000, VIEW.glideMinStepMs / 2);
    expect(glide.at(0, 1000, point()).x).toBe(1);
    glide.set(0, 1 + VIEW.glideMaxTiles + 1, 0, 2000, 1000);
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
