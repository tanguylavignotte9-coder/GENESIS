import { describe, expect, it } from 'vitest';
import { Simulation } from '../../../src/sim/core/simulation';
import { daysPerYear } from '../../../src/sim/core/time-params';
import { dataWithSize } from '../world/helpers';

/**
 * Long headless runs: populations must balance themselves over 100 years, on several seeds.
 * (Small map to keep the test around a minute; the full-size map is measured with `npm run sim`.)
 */
const SIZE = 384;
const YEARS = 100;
const STABLE_FROM_YEAR = 60;
const data = dataWithSize(SIZE);
const herbivores = data.fauna.species.flatMap((species, k) => (species.prey.length === 0 && species.huntRadius === 0 && !('meat' in species.diet) ? [k] : []));
const hunters = data.fauna.species.flatMap((species, k) => (species.prey.length > 0 ? [k] : []));

describe.each([5, 42])('ecosystem over %i… years (seed)', (seed) => {
  it(
    `seed ${seed}: no general extinction, no explosion, stable populations at the end`,
    () => {
      const simulation = new Simulation(seed, data);
      const start = simulation.fauna.countBySpecies();
      const startTotal = start.reduce((a, b) => a + b, 0);
      const yearTicks = data.time.ticksPerDay * daysPerYear(data.time);
      const totals: number[] = [];
      for (let y = 1; y <= YEARS; y++) {
        simulation.step(yearTicks);
        totals.push(simulation.fauna.countBySpecies().reduce((a, b) => a + b, 0));
      }
      const end = simulation.fauna.countBySpecies();
      for (const k of herbivores) expect(end[k], data.fauna.species[k]!.id).toBeGreaterThan(0);
      expect(hunters.some((k) => (end[k] ?? 0) > 0)).toBe(true);
      const endTotal = end.reduce((a, b) => a + b, 0);
      expect(endTotal).toBeGreaterThan(startTotal * 0.5);
      expect(endTotal).toBeLessThan(startTotal * 5);
      const late = totals.slice(STABLE_FROM_YEAR - 1);
      expect(Math.max(...late) / Math.min(...late)).toBeLessThan(1.5);
    },
    600_000,
  );
});
