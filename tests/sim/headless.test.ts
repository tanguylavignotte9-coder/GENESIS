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

  it('lists the abnormal years of the period, identical for identical seeds', () => {
    const climate = { ...data.climate, anomalies: { ...data.climate.anomalies, chancePerRoll: 0.5, tilesPerRoll: 1000, minLandmassTiles: 200 } };
    const report = runHeadless(42, 5, { ...data, climate });
    expect(report.anomalies.lines.length).toBeGreaterThan(0);
    expect(report.anomalies.lines[0]).toMatch(/^Jour 1 · Printemps · An \d+ — /);
    expect(report.anomalies.countsByType.reduce((sum, type) => sum + type.count, 0)).toBe(report.anomalies.lines.length);
    expect(runHeadless(42, 5, { ...data, climate }).anomalies).toEqual(report.anomalies);
  });

  it('generates the world and advances the clock by exactly the requested number of years', () => {
    const report = runHeadless(42, 3, data);
    expect(report.worldSize).toBe(128);
    expect(report.finalTick).toBe(3 * ticksPerYear(data.time));
    expect(report.ticks).toBe(report.finalTick);
  });
});
