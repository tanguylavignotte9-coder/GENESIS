import { describe, expect, it } from 'vitest';
import { isValidSeed, Rng } from '../../../src/sim/core/rng';

function draw(rng: Rng, count: number): number[] {
  return Array.from({ length: count }, () => rng.nextUint32());
}

describe('Rng (seeded generator)', () => {
  it('produces the same sequence for the same seed', () => {
    expect(draw(new Rng(42), 10_000)).toEqual(draw(new Rng(42), 10_000));
  });

  it('matches known values, so the algorithm never changes silently', () => {
    expect(draw(new Rng(42), 5)).toEqual([1028872839, 2516511472, 400437680, 853279530, 1920286840]);
    expect(draw(new Rng(0), 3)).toEqual([4205396811, 3543653536, 1222415357]);
  });

  it('produces different sequences for different seeds, even close ones', () => {
    expect(draw(new Rng(1), 10)).not.toEqual(draw(new Rng(2), 10));
  });

  it('returns floats in [0, 1)', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 10_000; i++) {
      const value = rng.nextFloat();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('rejects invalid seeds with a French message', () => {
    for (const seed of [-1, 1.5, 2 ** 32, Number.NaN]) {
      expect(isValidSeed(seed)).toBe(false);
      expect(() => new Rng(seed)).toThrow(/Graine invalide/);
    }
    expect(isValidSeed(0)).toBe(true);
    expect(isValidSeed(2 ** 32 - 1)).toBe(true);
  });
});
