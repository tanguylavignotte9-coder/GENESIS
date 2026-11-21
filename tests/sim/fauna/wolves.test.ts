import { describe, expect, it } from 'vitest';
import { Simulation } from '../../../src/sim/core/simulation';
import { holdTerritories } from '../../../src/sim/systems/fauna/territory';
import { dataWithSize } from '../world/helpers';

const SIZE = 256;

function world(seed: number): Simulation {
  return new Simulation(seed, dataWithSize(SIZE));
}

/** The packs of a species: leader slot and position of each pack's members. */
function packs(sim: Simulation, id: string): { group: number; x: number; y: number }[] {
  const fauna = sim.fauna;
  const code = sim.data.fauna.species.findIndex((s) => s.id === id);
  const out = new Map<number, { group: number; x: number; y: number }>();
  for (let slot = 0; slot < fauna.store.slots; slot++) {
    if (fauna.store.alive[slot] !== 1 || fauna.store.species[slot] !== code) continue;
    const group = fauna.store.group[slot]!;
    if (!out.has(group)) out.set(group, { group, x: fauna.store.x[slot]!, y: fauna.store.y[slot]! });
  }
  return [...out.values()];
}

describe('wolves at the birth of the world (where their game lives)', () => {
  it('each starting pack lives among enough game to raise its young, never on another pack’s land', () => {
    for (const seed of [1, 2, 3]) {
      const sim = world(seed);
      const wolf = sim.data.fauna.species.find((s) => s.id === 'wolf')!;
      const code = sim.data.fauna.species.indexOf(wolf);
      const list = packs(sim, 'wolf');
      expect(list.length).toBeGreaterThan(0);
      for (const pack of list) expect(sim.fauna.preyWithin(code, pack.x, pack.y, wolf.preyCheckRadius, wolf.breedingMinPrey)).toBeGreaterThanOrEqual(wolf.breedingMinPrey);
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const d = Math.hypot(list[i]!.x - list[j]!.x, list[i]!.y - list[j]!.y);
          expect(d).toBeGreaterThan(wolf.territoryTiles - 2);
        }
      }
    }
  });

  it('a hungry pack whose land is empty of game settles where its leader found game', () => {
    const sim = world(4);
    const fauna = sim.fauna;
    const wolf = sim.data.fauna.species.find((s) => s.id === 'wolf')!;
    const pack = packs(sim, 'wolf')[0]!;
    const leader = fauna.groups.leader[pack.group]!;
    holdTerritories(fauna);
    // The den is moved far away, onto land with no game; the leader stands among game and is hungry.
    let empty = -1;
    for (let i = 0; i < SIZE * SIZE && empty < 0; i += 97) {
      const x = i % SIZE;
      const y = Math.floor(i / SIZE);
      if (fauna.isWalkable(x, y) && fauna.preyWithin(sim.data.fauna.species.indexOf(wolf), x, y, wolf.preyCheckRadius, 1) === 0 && Math.hypot(x - pack.x, y - pack.y) > wolf.territoryTiles * 2) empty = i;
    }
    expect(empty).toBeGreaterThanOrEqual(0);
    fauna.groups.denX[pack.group] = empty % SIZE;
    fauna.groups.denY[pack.group] = Math.floor(empty / SIZE);
    fauna.store.hunger[leader] = 80;
    holdTerritories(fauna);
    expect(fauna.groups.denX[pack.group]).toBe(fauna.store.x[leader]);
    expect(fauna.groups.denY[pack.group]).toBe(fauna.store.y[leader]);
  });

  it('same seed, same packs (deterministic)', () => {
    expect(packs(world(9), 'wolf')).toEqual(packs(world(9), 'wolf'));
  });
});
