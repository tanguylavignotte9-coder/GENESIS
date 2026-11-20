import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/sim/core/game-data';
import { Simulation } from '../../src/sim/core/simulation';
import { daysPerYear } from '../../src/sim/core/time-params';
import { Family } from '../../src/sim/systems/ideas/idea';
import { IDEA_EVENTS } from '../../src/sim/systems/ideas/texts';

/**
 * Ideas over decades, on the full map: discoveries happen (not the same everywhere), each has its
 * founder and its cause in the journal, nobody knows something without its prerequisites, names
 * stay unique, and every person carries a language and a culture.
 */
const data = loadGameData();
const YEARS = 40;

describe('ideas over decades', () => {
  it('discoveries with their causes, knowledge consistent with prerequisites, and worlds that differ', () => {
    const outcomes: string[] = [];
    for (const seed of [42, 7, 123]) {
      const simulation = new Simulation(seed, data);
      for (let y = 0; y < YEARS && simulation.humans.people.living > 0; y++) simulation.step(daysPerYear(data.time) * data.time.ticksPerDay);
      const { ideas, journal, humans } = simulation;
      const people = humans.people;
      const catalog = data.knowledge.knowledge;
      for (const event of journal.all().filter((e) => e.type === IDEA_EVENTS.discovery)) {
        expect(event.actors.length).toBeGreaterThan(0);
        expect(event.text).toMatch(/découvre/);
      }
      for (let p = 0; p < people.count; p++) {
        if (people.alive[p] === 0) continue;
        expect(ideas.holdings.motherTongue(p)).toBeGreaterThanOrEqual(0);
        expect(ideas.holdings.culture[p]).toBeGreaterThanOrEqual(0);
        catalog.forEach((item, k) => {
          if (!ideas.holdings.knows(p, k)) return;
          for (const id of item.requires) expect(ideas.holdings.knows(p, catalog.findIndex((other) => other.id === id)), `${item.id} sans ${id}`).toBe(true);
        });
      }
      expect(new Set(people.names.slice(0, people.count)).size).toBe(people.count);
      const discovered = ideas.ideas.filter((idea) => idea.family === Family.Knowledge && idea.founder >= 0).map((idea) => catalog[idea.knowledge]!.id);
      outcomes.push(discovered.sort().join(','));
    }
    expect(outcomes.some((line) => line.length > 0)).toBe(true);
    expect(new Set(outcomes).size).toBeGreaterThan(1);
  }, 1_500_000);
});
