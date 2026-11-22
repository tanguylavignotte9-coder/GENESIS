import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../../src/sim/core/game-data';
import { Simulation } from '../../../src/sim/core/simulation';
import { daysPerYear } from '../../../src/sim/core/time-params';
import { Sex, State } from '../../../src/sim/systems/fauna/animal-store';
import { think } from '../../../src/sim/systems/fauna/behavior';
import { Gait } from '../../../src/sim/core/motion';
import { dataWithSize } from '../world/helpers';

const SIZE = 256;
const data = dataWithSize(SIZE);
const yearTicks = data.time.ticksPerDay * daysPerYear(data.time);

function speciesCode(id: string): number {
  return data.fauna.species.findIndex((species) => species.id === id);
}

/** A mild, walkable tile with fresh water at hand. */
function waterSideTile(simulation: Simulation): { x: number; y: number } {
  const { fauna, climate } = simulation;
  for (let i = 0; i < SIZE * SIZE; i++) {
    const x = i % SIZE;
    const y = (i - x) / SIZE;
    if (climate.temperatureAt(i) < 10) continue;
    if (fauna.isWalkable(x, y) && fauna.waterPath[i]! >= 0 && fauna.isWalkable(x + 3, y)) return { x, y };
  }
  throw new Error('no tile');
}

describe('fauna data', () => {
  it('lists the expected species, with what they provide and which can be domesticated', () => {
    const { fauna } = loadGameData();
    const ids = fauna.species.map((species) => species.id);
    expect(ids).toEqual(expect.arrayContaining(['deer', 'aurochs', 'horse', 'goat', 'boar', 'rabbit', 'wolf', 'bear', 'lion']));
    const domesticable = fauna.species.filter((species) => species.domesticable).map((species) => species.id);
    expect(domesticable).toEqual(expect.arrayContaining(['aurochs', 'horse', 'goat', 'boar']));
    const provided = new Set(fauna.species.flatMap((species) => species.carcass.map((item) => item.resource)));
    for (const resource of ['meat', 'hide', 'bone', 'sinew', 'wool']) expect(provided).toContain(resource);
  });
});

describe('animals', () => {
  it('are individuals with species, age, sex, needs, health and position', () => {
    const simulation = new Simulation(4, data);
    const { store } = simulation.fauna;
    expect(store.living).toBeGreaterThan(100);
    for (let slot = 0; slot < store.slots; slot++) {
      if (store.alive[slot] === 0) continue;
      expect(simulation.fauna.isWalkable(store.x[slot]!, store.y[slot]!)).toBe(true);
      expect(store.health[slot]).toBeGreaterThan(0);
    }
  });

  it('are deterministic: same seed => same animals at the same places', () => {
    const run = () => {
      const simulation = new Simulation(8, data);
      simulation.step(yearTicks);
      const { store } = simulation.fauna;
      return Array.from({ length: store.slots }, (_, s) => `${store.alive[s]}:${store.species[s]}:${store.x[s]}:${store.y[s]}`).join('|');
    };
    expect(run()).toEqual(run());
  });

  it('flee a hunter that is hunting them', () => {
    const simulation = new Simulation(4, data);
    const { fauna } = simulation;
    const spot = waterSideTile(simulation);
    const herd = fauna.groups.add(speciesCode('deer'), -1);
    const deer = fauna.spawn(speciesCode('deer'), spot.x, spot.y, herd, 1000);
    fauna.groups.leader[herd] = deer;
    const pack = fauna.groups.add(speciesCode('wolf'), -1);
    const wolf = fauna.spawn(speciesCode('wolf'), spot.x + 3, spot.y, pack, 1000);
    fauna.groups.leader[pack] = wolf;
    fauna.store.state[wolf] = State.Hunt;
    // It charges: it is seen.
    fauna.store.gait[wolf] = Gait.Run;
    think(fauna, deer);
    expect(fauna.store.state[deer]).toBe(State.Flee);
    expect(fauna.store.targetX[deer]).toBeLessThan(spot.x);
  });

  it('go and drink when thirsty, eat when hungry', () => {
    const simulation = new Simulation(4, data);
    const { fauna } = simulation;
    const spot = waterSideTile(simulation);
    const herd = fauna.groups.add(speciesCode('horse'), -1);
    const horse = fauna.spawn(speciesCode('horse'), spot.x, spot.y, herd, 1000);
    fauna.groups.leader[herd] = horse;
    fauna.store.thirst[horse] = 90;
    think(fauna, horse);
    expect([State.Drink, State.SeekWater]).toContain(fauna.store.state[horse]);
    fauna.store.thirst[horse] = 0;
    fauna.store.hunger[horse] = 90;
    simulation.flora.state.grass[spot.y * SIZE + spot.x] = 100;
    think(fauna, horse);
    expect([State.Eat, State.Forage]).toContain(fauna.store.state[horse]);
  });

  it('are born, grow old and die', () => {
    const simulation = new Simulation(4, data);
    const firstUids = new Set<number>();
    const { store } = simulation.fauna;
    for (let s = 0; s < store.slots; s++) if (store.alive[s] === 1) firstUids.add(store.uid[s]!);
    simulation.step(2 * yearTicks);
    let newborns = 0;
    let survivors = 0;
    for (let s = 0; s < store.slots; s++) {
      if (store.alive[s] === 0) continue;
      if (firstUids.has(store.uid[s]!)) survivors++;
      else newborns++;
    }
    expect(newborns).toBeGreaterThan(0);
    expect(survivors).toBeLessThan(firstUids.size);
    const deaths = simulation.fauna.deaths.flat().reduce((a, b) => a + b, 0);
    expect(deaths).toBeGreaterThan(0);
  });

  it('have both sexes and live in herds and packs', () => {
    const simulation = new Simulation(4, data);
    const { store, groups } = simulation.fauna;
    let females = 0;
    let inHerd = 0;
    for (let s = 0; s < store.slots; s++) {
      if (store.alive[s] === 0) continue;
      if (store.sex[s] === Sex.Female) females++;
      if (groups.size[store.group[s]!]! > 1) inHerd++;
    }
    expect(females / store.living).toBeGreaterThan(0.3);
    expect(females / store.living).toBeLessThan(0.7);
    expect(inHerd / store.living).toBeGreaterThan(0.8);
  });

  it('fish renew in rivers, lakes and seas', () => {
    const simulation = new Simulation(4, data);
    const { fish } = simulation.fauna;
    let tile = -1;
    for (let i = 0; i < SIZE * SIZE; i++) if (fish.amount[i]! > 50) tile = i;
    const x = tile % SIZE;
    const y = (tile - x) / SIZE;
    const taken = fish.takeNear(x, y, 40);
    expect(taken).toBe(40);
    const after = fish.availableNear(x, y);
    for (let day = 0; day < data.fauna.fish.updateIntervalDays * 3; day++) fish.dailyUpdate(day);
    expect(fish.availableNear(x, y)).toBeGreaterThan(after);
  });
});
