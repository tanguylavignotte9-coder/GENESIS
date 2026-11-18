import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/sim/core/game-data';
import { Simulation } from '../../src/sim/core/simulation';
import { DeathCause } from '../../src/sim/systems/individuals/people';
import { BUILDING_DONE, FIRST_ITEM } from '../../src/sim/systems/production/events';

const HOURS = 24;

/** Runs two years hour by hour; for each death by hunger, notes the food the person and the stock had. */
function twoYears(seed: number, known: readonly string[] = []): { simulation: Simulation; starvedNextToFood: number; starved: number } {
  const copy = loadGameData();
  for (const item of copy.knowledge.knowledge) if (known.includes(item.id)) item.startsKnown = true;
  const simulation = new Simulation(seed, copy);
  const { people } = simulation.humans;
  const alive = Uint8Array.from(people.alive);
  let starvedNextToFood = 0;
  let starved = 0;
  for (let h = 0; h < 2 * 40 * HOURS; h++) {
    simulation.step(copy.time.ticksPerDay / HOURS);
    for (let p = 0; p < people.count; p++) {
      if (alive[p] === 0 || people.alive[p] === 1) continue;
      alive[p] = 0;
      if (people.deathCause[p] !== DeathCause.Hunger) continue;
      starved++;
      // Absurd: starving with food in hand, or while the common stock holds a day of food for the dead.
      if (simulation.production.carriedFood(p) > 1 || simulation.production.stockFood(people.camp[p]!) > simulation.production.body.dailyFood) starvedNextToFood++;
    }
  }
  return { simulation, starvedNextToFood, starved };
}

describe('production over two years (full map)', () => {
  it('nobody starves next to food, and outcomes differ from one world to another', () => {
    const survivors: number[] = [];
    for (const seed of [42, 7, 123, 5]) {
      const { simulation, starvedNextToFood } = twoYears(seed);
      expect(starvedNextToFood).toBe(0);
      survivors.push(simulation.humans.people.living);
      // The tribe keeps a fire and shelters, and built something itself.
      expect(simulation.production.fireOf(0)).not.toBeNull();
      expect(simulation.journal.all().some((event) => event.type === BUILDING_DONE)).toBe(true);
    }
    expect(new Set(survivors).size).toBeGreaterThan(1);
    expect(Math.min(...survivors)).toBeGreaterThan(0);
  });

  it('a tribe that knows hunting makes its tools, hunts, butchers and dresses hides', () => {
    const { simulation, starvedNextToFood } = twoYears(42, ['stone_knapping', 'hunting', 'hide_working']);
    expect(starvedNextToFood).toBe(0);
    const firsts = simulation.journal
      .all()
      .filter((event) => event.type === FIRST_ITEM)
      .map((event) => String(event.details['item']));
    for (const item of ['stone_knife', 'spear', 'leather']) expect(firsts).toContain(item);
    expect(simulation.fauna.deaths.reduce((sum, causes) => sum + causes[5]!, 0)).toBeGreaterThan(0);
  });
});
