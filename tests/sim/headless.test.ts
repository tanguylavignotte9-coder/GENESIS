import { describe, expect, it } from 'vitest';
import { ticksPerYear } from '../../src/sim/core/time-params';
import { runHeadless } from '../../src/sim/headless';
import { dataWithSize } from './world/helpers';

describe('headless simulation', () => {
  const data = dataWithSize(128);

  it('is deterministic: same seed => same result', () => {
    expect(runHeadless(42, 2, data)).toEqual(runHeadless(42, 2, data));
  });

  it('different seeds give different results', () => {
    expect(runHeadless(1, 1, data).randomFingerprint).not.toEqual(runHeadless(2, 1, data).randomFingerprint);
  });

  it('generates the world and advances the clock by exactly the requested number of years', () => {
    const report = runHeadless(42, 3, data);
    expect(report.worldSize).toBe(128);
    expect(report.finalTick).toBe(3 * ticksPerYear(data.time));
    expect(report.ticks).toBe(report.finalTick);
  });
});
