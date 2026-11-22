import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/core/simulation';
import { daysPerYear } from '../../src/sim/core/time-params';
import { dataWithSize } from '../sim/world/helpers';

/**
 * Long headless runs: populations must balance themselves over 100 years, on several seeds (v1.4:
 * no absurdity, not an imposed result: cycles are allowed).
 * On the real map size: territories and prey thresholds are absolute numbers, so a small map would
 * not hold enough game for the predators.
 */
const SIZE = 1024;
const YEARS = 100;
const data = dataWithSize(SIZE);
const herbivores = data.fauna.species.flatMap((species, k) => (species.prey.length === 0 && species.huntRadius === 0 && !('meat' in species.diet) ? [k] : []));
/** Meat eaters: hunters (wolves, lions) and scavengers (bears). */
const hunters = data.fauna.species.flatMap((species, k) => ('meat' in species.diet ? [k] : []));

describe.each([42, 7])('ecosystem over %i… years (seed)', (seed) => {
  it(
    `seed ${seed}: no general extinction, no explosion, far less predators than prey`,
    () => {
      const simulation = new Simulation(seed, data);
      const start = simulation.fauna.countBySpecies();
      const startTotal = start.reduce((a, b) => a + b, 0);
      const yearTicks = data.time.ticksPerDay * daysPerYear(data.time);
      for (let y = 1; y <= YEARS; y++) {
        simulation.step(yearTicks);
      }
      const end = simulation.fauna.countBySpecies();
      // No general collapse nor explosion of the herbivores; most species still live.
      const aliveHerbivores = herbivores.filter((k) => (end[k] ?? 0) > 0).length;
      expect(aliveHerbivores).toBeGreaterThanOrEqual(herbivores.length - 2);
      expect(hunters.some((k) => (end[k] ?? 0) > 0)).toBe(true);
      const endTotal = end.reduce((a, b) => a + b, 0);
      expect(endTotal).toBeGreaterThan(startTotal * 0.3);
      expect(endTotal).toBeLessThan(startTotal * 5);
      // Far less predator than prey biomass (energy is lost from one level to the next).
      const { store } = simulation.fauna;
      let predators = 0;
      let prey = 0;
      for (let slot = 0; slot < store.slots; slot++) {
        if (store.alive[slot] !== 1) continue;
        if (data.fauna.species[store.species[slot]!]!.prey.length > 0) predators += store.mass[slot]!;
        else if (herbivores.includes(store.species[slot]!)) prey += store.mass[slot]!;
      }
      expect(predators * 10).toBeLessThan(prey);
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
