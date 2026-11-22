import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/sim/core/game-data';
import { Simulation } from '../../src/sim/core/simulation';
import { daysPerYear } from '../../src/sim/core/time-params';
import { machineReferenceMs } from './support/calibration';

const data = loadGameData();

describe.each([42, 7, 123])('the starting tribe (seed %i, full map)', (seed) => {
  it('survives two years: most people are still alive', () => {
    const simulation = new Simulation(seed, data);
    simulation.step(2 * daysPerYear(data.time) * data.time.ticksPerDay);
    const { people } = simulation.humans;
    expect(people.living).toBeGreaterThanOrEqual(people.count * 0.6);
  });
});

/**
 * Budget of a game day with 1 000 humans, relative to the speed of the machine: a multiple of the
 * reference computation of tests/long/support/calibration.ts. Calibrated on 22 nov. 2026: the
 * reference took 50 to 52 ms on Claude Code's server, where the x500 budget (960 ms per game day)
 * is about 18.5 references; a game day with 1 000 humans then took 15 references.
 */
const BUDGET_IN_REFERENCES = 18.5;

describe('performance', () => {
  it('a game day with 1 000 humans, the fauna and the flora fits in the x500 budget (relative to this machine)', () => {
    const before = machineReferenceMs();
    const humans = {
      ...data.humans,
      tribe: { ...data.humans.tribe, count: Math.ceil(1000 / data.humans.tribe.size), campSpacingTiles: 12 },
      site: { ...data.humans.site, candidates: 60000, minFoodPlants: 10 },
    };
    const simulation = new Simulation(42, { ...data, humans });
    simulation.step(data.time.ticksPerDay);
    const started = performance.now();
    simulation.step(3 * data.time.ticksPerDay);
    const msPerDay = (performance.now() - started) / 3;
    // The machine may be disturbed before or after: its least disturbed measure is kept.
    const reference = Math.min(before, machineReferenceMs());
    expect(msPerDay / reference, `${Math.round(msPerDay)} ms par jour, référence ${reference.toFixed(1)} ms`).toBeLessThan(BUDGET_IN_REFERENCES);
  });
});
