import { describe, expect, it } from 'vitest';
import { Simulation } from '../../../src/sim/core/simulation';
import { holdTerritories } from '../../../src/sim/systems/fauna/territory';
import { dataWithSize } from '../world/helpers';

const SIZE = 256;

function world(seed: number): Simulation {
  return new Simulation(seed, dataWithSize(SIZE));
}

/** The groups of a species that hold a den: den, radius and size. */
function dens(sim: Simulation, id: string): { group: number; x: number; y: number; range: number; size: number }[] {
  const { groups } = sim.fauna;
  const code = sim.data.fauna.species.findIndex((s) => s.id === id);
  const out: { group: number; x: number; y: number; range: number; size: number }[] = [];
  for (let group = 0; group < groups.count; group++) {
    if (groups.species[group] === code && groups.size[group]! > 0 && groups.denX[group]! >= 0) {
      out.push({ group, x: groups.denX[group]!, y: groups.denY[group]!, range: groups.range[group]!, size: groups.size[group]! });
    }
  }
  return out;
}

describe('territories of the social hunters (v1.4)', () => {
  it('each starting pack lives where its land holds the game it needs, outside the land of the others', () => {
    for (const seed of [1, 2, 3]) {
      const sim = world(seed);
      const wolf = sim.data.fauna.species.find((s) => s.id === 'wolf')!;
      const code = sim.data.fauna.species.indexOf(wolf);
      const list = dens(sim, 'wolf');
      expect(list.length).toBeGreaterThan(0);
      for (const pack of list) {
        expect(pack.range).toBeGreaterThanOrEqual(wolf.territoryMinTiles);
        expect(pack.range).toBeLessThanOrEqual(wolf.territoryMaxTiles);
        const need = pack.size * wolf.massKg * sim.data.fauna.territory.preyKgPerPredatorKg;
        expect(sim.fauna.preyMassWithin(code, pack.x, pack.y, pack.range)).toBeGreaterThanOrEqual(need);
      }
      for (let i = 0; i < list.length; i++) {
        for (let j = 0; j < i; j++) expect(Math.hypot(list[i]!.x - list[j]!.x, list[i]!.y - list[j]!.y)).toBeGreaterThanOrEqual(list[j]!.range - 1);
      }
    }
  });

  it('a territory grows where game is scarce and shrinks where it abounds', () => {
    const sim = world(4);
    const { fauna } = sim;
    const wolf = sim.data.fauna.species.find((s) => s.id === 'wolf')!;
    const pack = dens(sim, 'wolf')[0]!;
    // Game abounds around a wide territory: it shrinks.
    const aurochs = sim.data.fauna.species.findIndex((s) => s.id === 'aurochs');
    const herd = fauna.groups.add(aurochs, -1);
    for (let k = 0; k < 80; k++) fauna.spawn(aurochs, pack.x + 0.5 + (k % 9) - 4, pack.y + 0.5 + Math.floor(k / 9) - 4, herd, 3 * fauna.daysPerYear);
    fauna.groups.range[pack.group] = wolf.territoryMaxTiles - 5;
    holdTerritories(fauna);
    expect(fauna.groups.range[pack.group]!).toBeLessThan(wolf.territoryMaxTiles - 5);
    // All the game around is gone: the pack must range further…
    for (let slot = 0; slot < fauna.store.slots; slot++) {
      if (fauna.store.alive[slot] === 1 && fauna.isHunter[fauna.store.species[slot]!] !== 1) fauna.kill(slot, 0);
    }
    fauna.groups.range[pack.group] = wolf.territoryMinTiles + 5;
    for (let day = 0; day < 3; day++) holdTerritories(fauna);
    expect(fauna.groups.range[pack.group]!).toBeGreaterThan(wolf.territoryMinTiles + 5);
    // …and, at its widest still empty, it leaves its land to roam.
    for (let day = 0; day < 60 && fauna.groups.denX[pack.group]! >= 0; day++) holdTerritories(fauna);
    expect(fauna.groups.denX[pack.group]).toBe(-1);
  });

  it('two packs too close dispute the place: the weaker moves its den away and raises no young this season', () => {
    const sim = world(5);
    const { fauna } = sim;
    const a = dens(sim, 'wolf')[0]!;
    // A smaller pack settles right next to it.
    const code = sim.data.fauna.species.findIndex((s) => s.id === 'wolf');
    const group = fauna.groups.add(code, -1);
    for (let k = 0; k < 2; k++) {
      const slot = fauna.spawn(code, a.x + 2.5, a.y + 0.5, group, 3 * fauna.daysPerYear);
      if (k === 0) fauna.groups.leader[group] = slot;
    }
    fauna.groups.denX[group] = a.x + 2;
    fauna.groups.denY[group] = a.y;
    fauna.groups.range[group] = a.range;
    const b = { group };
    holdTerritories(fauna);
    const weaker = fauna.groups.contested[a.group] === 1 ? a.group : b.group;
    expect(fauna.groups.contested[weaker]).toBe(1);
    const stronger = weaker === a.group ? b.group : a.group;
    const d = Math.hypot(fauna.groups.denX[weaker]! - fauna.groups.denX[stronger]!, fauna.groups.denY[weaker]! - fauna.groups.denY[stronger]!);
    expect(d).toBeGreaterThan(fauna.groups.range[stronger]!);
  });

  it('same seed, same packs (deterministic)', () => {
    expect(dens(world(9), 'wolf')).toEqual(dens(world(9), 'wolf'));
  });
});
