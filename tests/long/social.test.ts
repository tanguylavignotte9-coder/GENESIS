import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/sim/core/game-data';
import { Simulation } from '../../src/sim/core/simulation';
import { HUMAN_DEATH } from '../../src/sim/systems/individuals/individuals-system';
import { COUPLE_FORMED, FALLING_OUT, GREAT_FRIENDSHIP, MOURNING } from '../../src/sim/systems/individuals/social/milestones';
import { DeathCause } from '../../src/sim/systems/individuals/people';
import { REASONS } from '../../src/sim/systems/individuals/social/params';

const QUARREL = REASONS.indexOf('quarrel');

const HOURS = 24;
const YEAR_DAYS = 40;

interface Story {
  simulation: Simulation;
  /** Children who starved while a parent stood close with food in hand. */
  starvedNextToParentFood: number;
}

/** Two years, hour by hour, watching the children who starve. */
function twoYears(seed: number): Story {
  const data = loadGameData();
  const simulation = new Simulation(seed, data);
  const { people } = simulation.humans;
  const alive = Uint8Array.from(people.alive);
  let starvedNextToParentFood = 0;
  for (let h = 0; h < 2 * YEAR_DAYS * HOURS; h++) {
    simulation.step(data.time.ticksPerDay / HOURS);
    for (let p = 0; p < people.count; p++) {
      if (alive[p] === 0 || people.alive[p] === 1) continue;
      alive[p] = 0;
      if (people.deathCause[p] !== DeathCause.Hunger) continue;
      for (const parent of [people.mother[p]!, people.father[p]!]) {
        if (parent < 0 || people.alive[parent] !== 1) continue;
        const near = people.distance(parent, p) <= 2.5;
        if (near && simulation.production.carriedFood(parent) > data.social.sharing.foodUnitsPerGift && people.hunger[parent]! < data.social.sharing.keepHunger) starvedNextToParentFood++;
      }
    }
  }
  return { simulation, starvedNextToParentFood };
}

describe('social life over two years (full map)', () => {
  it('stories are explained by their causes, grief follows deaths, and worlds differ', () => {
    const summaries: string[] = [];
    let friendships = 0;
    let fallingOuts = 0;
    let quarrels = 0;
    for (const seed of [42, 7, 123, 5, 9, 31]) {
      const { simulation, starvedNextToParentFood } = twoYears(seed);
      // Absurd: a child starving next to a parent with food to spare.
      expect(starvedNextToParentFood).toBe(0);
      const events = simulation.journal.all();
      const deaths = new Map(events.filter((e) => e.type === HUMAN_DEATH).map((e) => [e.id, e]));
      for (const mourning of events.filter((e) => e.type === MOURNING)) {
        // Every grief has its death as cause, and comes after it (one learns of a death after it happens).
        expect(mourning.causes.length).toBeGreaterThan(0);
        const death = deaths.get(mourning.causes[0]!);
        expect(death).toBeDefined();
        expect(mourning.tick).toBeGreaterThanOrEqual(death!.tick);
      }
      for (const couple of events.filter((e) => e.type === COUPLE_FORMED)) expect(couple.actors).toHaveLength(2);
      const count = (type: string): number => events.filter((e) => e.type === type).length;
      friendships += count(GREAT_FRIENDSHIP);
      fallingOuts += count(FALLING_OUT);
      // Quarrels kept in the relations count too: a full falling-out is rare in two years.
      const state = simulation.humans.social.state;
      for (let r = 0; r < state.reasonCode.length; r++) if (state.reasonCode[r] === QUARREL) quarrels++;
      summaries.push(`${simulation.humans.people.living}:${count(MOURNING)}:${count(GREAT_FRIENDSHIP)}:${count(FALLING_OUT)}:${count(COUPLE_FORMED)}`);
    }
    // Friendships and quarrels both happen somewhere, and no two worlds tell the same story.
    expect(friendships).toBeGreaterThan(0);
    expect(fallingOuts + quarrels).toBeGreaterThan(0);
    expect(new Set(summaries).size).toBeGreaterThan(3);
  });
});
