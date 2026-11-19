import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/core/simulation';
import { daysPerYear } from '../../src/sim/core/time-params';
import { dataWithSize } from '../sim/world/helpers';

/**
 * Long headless runs: populations must balance themselves over 100 years, on several seeds.
 * On the real map size: territories and prey thresholds are absolute numbers, so a small map would
 * not hold enough game for the predators.
 */
const SIZE = 1024;
const YEARS = 100;
const STABLE_FROM_YEAR = 60;
const data = dataWithSize(SIZE);
const herbivores = data.fauna.species.flatMap((species, k) => (species.prey.length === 0 && species.huntRadius === 0 && !('meat' in species.diet) ? [k] : []));
/** Meat eaters: hunters (wolves, lions) and scavengers (bears). */
const hunters = data.fauna.species.flatMap((species, k) => ('meat' in species.diet ? [k] : []));

describe.each([42, 7])('ecosystem over %i… years (seed)', (seed) => {
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
      // The landscape stays varied: trees have not taken every tile, the wild herbs (roots, cereals,
      // fibres) and berry shrubs still grow.
      const plants = simulation.flora.countBySpecies();
      const alive = (resource: string): number =>
        data.flora.species.reduce((sum, species, k) => sum + (species.produce?.resource === resource ? plants[k]! : 0), 0);
      for (const resource of ['roots', 'wild_cereals', 'plant_fiber', 'berries', 'flax']) expect(alive(resource), resource).toBeGreaterThan(1000);
      const trees = data.flora.species.reduce((sum, species, k) => sum + (species.kind === 'tree' ? plants[k]! : 0), 0);
      expect(trees / plants.reduce((a, b) => a + b, 0)).toBeLessThan(0.7);
    },
    1_500_000,
  );
});
