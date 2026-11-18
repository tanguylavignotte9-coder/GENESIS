import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/sim/core/game-data';
import { Simulation } from '../../src/sim/core/simulation';
import { daysPerYear } from '../../src/sim/core/time-params';

const data = loadGameData();

describe.each([42, 7, 123])('the starting tribe (seed %i, full map)', (seed) => {
  it('survives two years: most people are still alive', () => {
    const simulation = new Simulation(seed, data);
    simulation.step(2 * daysPerYear(data.time) * data.time.ticksPerDay);
    const { people } = simulation.humans;
    expect(people.living).toBeGreaterThanOrEqual(people.count * 0.6);
  });
});

describe('performance', () => {
  it('a game day with 1 000 humans, the fauna and the flora fits in the x500 budget', () => {
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
    // At x500 a game day lasts 960 ms of real time.
    expect(msPerDay).toBeLessThan(960);
  });
});
