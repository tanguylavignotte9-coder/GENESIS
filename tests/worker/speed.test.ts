import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/core/simulation';
import { saveWorld } from '../../src/sim/core/save/save';
import { Workshop } from '../../src/sim/core/workshop';
import { sampleHistory } from '../../src/sim/history';
import { describeGroups } from '../../src/sim/systems/groups/describe';
import { describeIdeas } from '../../src/sim/systems/ideas/describe';
import { describeKnowledgeTree } from '../../src/sim/systems/ideas/knowledge-tree';
import { describeBrain } from '../../src/sim/systems/individuals/brain-describe';
import { describeAnimalBrain } from '../../src/sim/systems/fauna/brain-trace';
import { recentBattles } from '../../src/sim/systems/conflict/describe';
import { inspect, snapshotFauna, snapshotFlora } from '../../src/worker/life-snapshots';
import { describePerson, snapshotHumanStats, snapshotHumans, snapshotRoster } from '../../src/worker/human-snapshots';
import { describeBuilding, snapshotBuildings } from '../../src/worker/building-snapshots';
import { dataWithSize } from '../sim/world/helpers';

const SIZE = 160;
const data = dataWithSize(SIZE);
const { ticksPerDay, ticksPerRealSecond, speeds } = data.time;
/** Same pace as the simulation thread's loop (src/worker/sim.worker.ts). */
const LOOP_SECONDS = 0.05;
const TICKS_PER_CHUNK = 50;
const DAYS = 3;

/** Everything the simulation thread reads to send to the display (it must change nothing). */
function publish(simulation: Simulation): void {
  snapshotFlora(simulation);
  snapshotFauna(simulation);
  snapshotHumans(simulation);
  snapshotRoster(simulation);
  snapshotBuildings(simulation);
  snapshotHumanStats(simulation, 0);
  describeGroups(simulation.groups);
  describeIdeas(simulation.ideas);
  recentBattles(simulation.conflict, ticksPerDay / 24, 48);
  sampleHistory(simulation);
  // Every sheet (someone working a discovery out reads needs and surroundings) and the knowledge tree.
  for (let p = 0; p < simulation.humans.people.count; p++) describePerson(simulation, 1, p);
  describeKnowledgeTree(simulation.ideas, -1, [], []);
  describeBuilding(simulation, 1, 0);
  inspect(simulation, 1, simulation.humans.camps[0]!.center, simulation.fauna.store.uid[0]!);
  describeBrain(simulation.humans, 0, data.time, 'printemps');
  describeAnimalBrain(simulation.fauna, simulation.fauna.store.uid[0]!, () => '');
}

/**
 * Runs `DAYS` days as the simulation thread does: at each loop, the ticks owed at the current speed
 * (in chunks), then everything sent to the display; `speedAt` gives the speed for the tick reached.
 */
function run(speedAt: (tick: number) => number, publishEvery: number): Uint8Array {
  const simulation = new Simulation(5, data);
  const workshop = new Workshop();
  workshop.attach(simulation);
  // The watched brain is traced, as when the spectator opens it.
  simulation.humans.watch.person = 0;
  simulation.fauna.watch.watch(simulation.fauna.store.uid[0]!);
  const end = DAYS * ticksPerDay;
  let pending = 0;
  let loops = 0;
  while (simulation.clock.tick < end) {
    pending += LOOP_SECONDS * ticksPerRealSecond * speedAt(simulation.clock.tick);
    const wanted = Math.min(Math.floor(pending), end - simulation.clock.tick);
    let done = 0;
    while (done < wanted) {
      const ticks = Math.min(TICKS_PER_CHUNK, wanted - done);
      simulation.step(ticks);
      done += ticks;
    }
    pending -= wanted;
    if (loops++ % publishEvery === 0) publish(simulation);
  }
  return saveWorld(simulation, workshop.state()).body;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

describe('speed is only a display pace', () => {
  it('after the same number of days, the world is identical byte for byte at x1, x5, x25 and x500, even when the speed changes on the way', () => {
    const fastest = speeds[speeds.length - 1]!;
    const reference = run(() => fastest, 1);
    // At x1 a loop is a fraction of a tick: the ticks owed are carried over, the same as in the game.
    const mixed = run((tick) => {
      const hour = Math.floor(tick / (ticksPerDay / 24));
      if (hour < 2) return 1;
      if (hour < 6) return 5;
      if (hour < 14) return 25;
      if (hour < 30) return fastest;
      if (hour < 31) return 1;
      return hour % 2 === 0 ? 25 : fastest;
    }, 1);
    expect(sameBytes(mixed, reference)).toBe(true);
    for (const speed of [5, 25]) expect(sameBytes(run(() => speed, 7), reference)).toBe(true);
  }, 600_000);
});
