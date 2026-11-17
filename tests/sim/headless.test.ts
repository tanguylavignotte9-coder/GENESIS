import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/sim/core/game-data';
import { ticksPerYear } from '../../src/sim/core/time-params';
import { runHeadless } from '../../src/sim/headless';

describe('headless simulation', () => {
  const data = loadGameData();

  it('is deterministic: same seed => same result', () => {
    expect(runHeadless(42, 2, data)).toEqual(runHeadless(42, 2, data));
  });

  it('different seeds give different results', () => {
    expect(runHeadless(1, 1, data).randomFingerprint).not.toEqual(runHeadless(2, 1, data).randomFingerprint);
  });

  it('advances the clock by exactly the requested number of years', () => {
    const report = runHeadless(42, 3, data);
    expect(report.finalTick).toBe(3 * ticksPerYear(data.time));
    expect(report.ticks).toBe(report.finalTick);
  });
});
