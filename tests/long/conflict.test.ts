import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/sim/core/game-data';
import { Simulation } from '../../src/sim/core/simulation';
import { daysPerYear } from '../../src/sim/core/time-params';
import { CONFLICT_EVENTS } from '../../src/sim/systems/conflict/texts';
import { HUMAN_DEATH } from '../../src/sim/systems/individuals/individuals-system';
import { DeathCause } from '../../src/sim/systems/individuals/people';

/**
 * Violence over decades, on the full map: quarrels turn to blows now and then, but violence does not
 * take everyone; every killing names its killer, every battle, raid and war has its causes in the
 * journal; nobody stays in a war party forever.
 */
const data = loadGameData();
const YEARS = 30;

describe('violence over decades', () => {
  it('brawls happen, violence stays a part of the deaths, every act of war is told with its causes', () => {
    let brawls = 0;
    for (const seed of [42, 7, 123]) {
      const simulation = new Simulation(seed, data);
      for (let y = 0; y < YEARS && simulation.humans.people.living > 0; y++) simulation.step(daysPerYear(data.time) * data.time.ticksPerDay);
      const { journal, conflict, humans } = simulation;
      brawls += conflict.counts.brawls;
      const deaths = journal.all().filter((event) => event.type === HUMAN_DEATH);
      const violent = deaths.filter((event) => Number(event.details['cause']) === DeathCause.Violence);
      for (const event of violent) expect(event.details['killer']).toBeDefined();
      // Violence is a part of life, never most of it.
      expect(violent.length).toBeLessThanOrEqual(Math.max(3, deaths.length / 2));
      for (const event of journal.all().filter((e) => [CONFLICT_EVENTS.raid, CONFLICT_EVENTS.war, CONFLICT_EVENTS.battle, CONFLICT_EVENTS.peace, CONFLICT_EVENTS.conquest].includes(e.type as never))) {
        expect(event.causes.length, event.text).toBeGreaterThan(0);
      }
      // Nobody is still called to a war party that ended.
      for (let p = 0; p < humans.people.count; p++) {
        const id = conflict.mission[p]!;
        if (id >= 0) expect(conflict.expeditions[id]!.state).toBeLessThan(3);
      }
    }
    expect(brawls).toBeGreaterThan(0);
  });
});
