import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/sim/core/game-data';
import { Simulation } from '../../src/sim/core/simulation';
import { HUMAN_DEATH } from '../../src/sim/systems/individuals/individuals-system';
import { DeathCause } from '../../src/sim/systems/individuals/people';
import { BIRTH } from '../../src/sim/systems/individuals/life/birth';
import { EPIDEMIC_END, EPIDEMIC_START } from '../../src/sim/systems/individuals/life/disease';
import { ADOPTION } from '../../src/sim/systems/individuals/life/orphans';

const YEARS = 25;
const YEAR_DAYS = 40;

interface Story {
  simulation: Simulation;
  /** Births by a mother dead, or too young or too old to have children. */
  impossibleBirths: number;
  /** Children who starved while their guardian stood close with food to spare. */
  starvedNextToGuardianFood: number;
}

/** Many years, day by day, watching births and the children who starve. */
function live(seed: number): Story {
  const data = loadGameData();
  const simulation = new Simulation(seed, data);
  const { people, life } = simulation.humans;
  const [minAge, , , maxAge] = data.life.fertility.femaleAges;
  let seen = simulation.journal.size;
  let impossibleBirths = 0;
  let starvedNextToGuardianFood = 0;
  for (let day = 0; day < YEARS * YEAR_DAYS && people.living > 0; day++) {
    const guardians = Int32Array.from(life.state.guardian.subarray(0, people.count));
    simulation.step(data.time.ticksPerDay);
    for (const event of simulation.journal.since(seen)) {
      if (event.type === BIRTH) {
        const mother = Number(event.details['mother']);
        const age = people.ageYears[mother]!;
        if (age < minAge || age > maxAge + 1) impossibleBirths++;
      }
      if (event.type === HUMAN_DEATH && event.details['cause'] === DeathCause.Hunger) {
        const child = Number(event.details['person']);
        const guardian = guardians[child] ?? -1;
        if (guardian < 0 || people.alive[guardian] !== 1 || people.ageYears[child]! >= data.life.stages.adultAge) continue;
        const near = people.distance(guardian, child) <= 2.5;
        if (near && simulation.production.carriedFood(guardian) > data.social.sharing.foodUnitsPerGift && people.hunger[guardian]! < data.social.sharing.keepHunger) starvedNextToGuardianFood++;
      }
    }
    seen = simulation.journal.size;
  }
  return { simulation, impossibleBirths, starvedNextToGuardianFood };
}

describe(`life cycle over ${YEARS} years (full map)`, () => {
  it('births, diseases, deaths and orphans make sense, have their causes, and worlds differ', () => {
    const outcomes: string[] = [];
    let births = 0;
    for (const seed of [42, 7, 123]) {
      const { simulation, impossibleBirths, starvedNextToGuardianFood } = live(seed);
      expect(impossibleBirths).toBe(0);
      // Absurd: a child starving next to the adult who cares for it, food in hand.
      expect(starvedNextToGuardianFood).toBe(0);
      const events = simulation.journal.all();
      const { people, life } = simulation.humans;
      births += life.births;
      for (let p = 0; p < people.count; p++) {
        if (people.alive[p] === 1) continue;
        // Nobody dies of old age young.
        if (people.deathCause[p] === DeathCause.OldAge) expect(people.ageYears[p]).toBeGreaterThanOrEqual(life.params.oldAge.fromAge);
        if (people.deathCause[p] === DeathCause.Childbirth) expect(people.female[p]).toBe(1);
      }
      for (const death of events.filter((e) => e.type === HUMAN_DEATH && e.details['cause'] === DeathCause.Disease)) {
        expect(life.params.diseases.some((disease) => death.text.includes(disease.name))).toBe(true);
      }
      const starts = new Set(events.filter((e) => e.type === EPIDEMIC_START).map((e) => e.id));
      for (const end of events.filter((e) => e.type === EPIDEMIC_END)) expect(starts.has(end.causes[0]!)).toBe(true);
      for (const adoption of events.filter((e) => e.type === ADOPTION)) {
        // A child is taken in because someone died.
        expect(adoption.causes.some((cause) => events[cause]?.type === HUMAN_DEATH)).toBe(true);
      }
      outcomes.push(`${people.living}:${life.births}:${life.epidemicCount}:${life.famineCount}`);
    }
    // Children are born somewhere, and the worlds tell different stories.
    expect(births).toBeGreaterThan(0);
    expect(new Set(outcomes).size).toBe(outcomes.length);
  });
});
