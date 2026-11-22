import { describe, expect, it } from 'vitest';
import { Simulation } from '../../../src/sim/core/simulation';
import { daysPerYear } from '../../../src/sim/core/time-params';
import { Sex, State } from '../../../src/sim/systems/fauna/animal-store';
import { act, think, vigilanceRadius } from '../../../src/sim/systems/fauna/behavior';
import { basalPerDay, condition, metabolismStep, nurse } from '../../../src/sim/systems/fauna/energy';
import { attackChance } from '../../../src/sim/systems/fauna/hunting';
import { canConceive } from '../../../src/sim/systems/fauna/life';
import { dataWithSize } from '../world/helpers';

const SIZE = 256;
const data = dataWithSize(SIZE);
const code = (id: string): number => data.fauna.species.findIndex((s) => s.id === id);

/** A world emptied of animals (only the ones a test places). */
function emptyWorld(seed = 3): Simulation {
  const sim = new Simulation(seed, data);
  for (let slot = 0; slot < sim.fauna.store.slots; slot++) if (sim.fauna.store.alive[slot] === 1) sim.fauna.kill(slot, 0);
  sim.fauna.carrion.tiles.length = 0;
  sim.fauna.carrion.meat.length = 0;
  return sim;
}

/** A walkable spot on open ground, far from the edges. */
function openSpot(sim: Simulation): { x: number; y: number } {
  for (let y = 80; y < SIZE - 40; y += 3) {
    for (let x = 40; x < SIZE - 40; x += 3) {
      let ok = true;
      for (let d = -12; d <= 12 && ok; d += 3) ok = sim.fauna.isWalkable(x + d, y) && sim.fauna.isWalkable(x, y + d);
      if (ok && sim.fauna.refugeOfBiome[sim.world.biome[y * SIZE + x]!] === 0) return { x: x + 0.5, y: y + 0.5 };
    }
  }
  throw new Error('no open spot');
}

function adult(sim: Simulation, id: string, x: number, y: number, group = -1): number {
  const fauna = sim.fauna;
  const g = group >= 0 ? group : fauna.groups.add(code(id), -1);
  const slot = fauna.spawn(code(id), x, y, g, 4 * fauna.daysPerYear + 1);
  if (fauna.groups.leader[g]! < 0) fauna.groups.leader[g] = slot;
  return slot;
}

describe('the energy budget (v1.4)', () => {
  it('metabolism grows as the mass to the power 0.75: a body ten times heavier spends 5.6 times more', () => {
    const sim = emptyWorld();
    expect(basalPerDay(sim.fauna, 400) / basalPerDay(sim.fauna, 40)).toBeCloseTo(Math.pow(10, 0.75), 5);
  });

  it('a bigger animal fasts longer: its reserves grow as its mass, its needs slower', () => {
    const sim = emptyWorld();
    const spot = openSpot(sim);
    const days = (id: string): number => {
      const slot = adult(sim, id, spot.x, spot.y);
      const store = sim.fauna.store;
      return store.maxReserve[slot]! / (store.basalStep[slot]! * data.fauna.stepsPerDay);
    };
    expect(days('rabbit')).toBeLessThan(days('deer'));
    expect(days('deer')).toBeLessThan(days('aurochs'));
  });

  it('without food, the reserves melt step by step; hunger rises; the stomach empties into the reserves', () => {
    const sim = emptyWorld();
    const spot = openSpot(sim);
    const deer = adult(sim, 'deer', spot.x, spot.y);
    const { store } = sim.fauna;
    store.energy[deer] = store.maxReserve[deer]! * 0.5;
    store.gut[deer] = 10;
    const before = store.energy[deer]! + store.gut[deer]!;
    for (let k = 0; k < 24; k++) metabolismStep(sim.fauna, deer, 0.1);
    expect(store.gut[deer]).toBeLessThan(10);
    expect(store.energy[deer]! + store.gut[deer]!).toBeLessThan(before);
    expect(store.hunger[deer]).toBeGreaterThan(40);
  });

  it('a hungry wolf eats at most one big meal from a carcass: the rest is left for its pack and scavengers', () => {
    const sim = emptyWorld();
    const spot = openSpot(sim);
    const wolf = adult(sim, 'wolf', spot.x, spot.y);
    const { store } = sim.fauna;
    store.energy[wolf] = store.maxReserve[wolf]! * 0.2;
    const tile = Math.floor(spot.y) * SIZE + Math.floor(spot.x);
    sim.fauna.carrion.add(tile, 200);
    store.state[wolf] = State.Eat;
    for (let k = 0; k < 24; k++) act(sim.fauna, wolf);
    const eatenKg = 200 - sim.fauna.carrion.at(tile);
    expect(eatenKg * data.fauna.energy.foodEnergy.meat).toBeLessThanOrEqual(store.mealSize[wolf]! + 1e-3);
    expect(eatenKg).toBeGreaterThan(1);
    expect(sim.fauna.carrion.at(tile)).toBeGreaterThan(150);
  });

  it('a nursing mother pays for her young’s milk; a starving mother has none left', () => {
    const sim = emptyWorld();
    const spot = openSpot(sim);
    const mother = adult(sim, 'deer', spot.x, spot.y);
    const { store } = sim.fauna;
    const young = sim.fauna.spawn(code('deer'), spot.x, spot.y, store.group[mother]!, 1);
    store.mother[young] = mother;
    store.motherUid[young] = store.uid[mother]!;
    store.energy[young] = 0;
    store.energy[mother] = store.maxReserve[mother]!;
    nurse(sim.fauna, young, data.fauna.species[code('deer')]!);
    expect(store.energy[young]).toBeGreaterThan(0);
    expect(store.energy[mother]).toBeLessThan(store.maxReserve[mother]!);
    store.energy[young] = 0;
    store.energy[mother] = store.maxReserve[mother]! * data.fauna.energy.nursingMinCondition * 0.9;
    nurse(sim.fauna, young, data.fauna.species[code('deer')]!);
    expect(store.energy[young]).toBe(0);
  });

  it('a thin female does not conceive; the same one in good condition may', () => {
    const sim = emptyWorld();
    const spot = openSpot(sim);
    const doe = adult(sim, 'deer', spot.x, spot.y);
    const stag = adult(sim, 'deer', spot.x + 1, spot.y, sim.fauna.store.group[doe]!);
    const { store } = sim.fauna;
    store.sex[doe] = Sex.Female;
    store.sex[stag] = Sex.Male;
    sim.climate.setDay(data.fauna.species[code('deer')]!.breedingDays[0]);
    store.energy[doe] = store.maxReserve[doe]! * (data.fauna.energy.breedingMinCondition - 0.1);
    expect(canConceive(sim.fauna, doe)).toBe(false);
    store.energy[doe] = store.maxReserve[doe]!;
    expect(condition(sim.fauna, doe)).toBe(1);
    expect(canConceive(sim.fauna, doe)).toBe(true);
  });
});

describe('hunting (v1.4)', () => {
  it('most attacks fail; a weak prey, a bigger group (up to a cap) and surprise make them succeed more', () => {
    const sim = emptyWorld();
    const spot = openSpot(sim);
    const fauna = sim.fauna;
    const wolf = adult(sim, 'wolf', spot.x, spot.y);
    const species = data.fauna.species[code('wolf')]!;
    const deer = adult(sim, 'deer', spot.x + 1, spot.y);
    const fawn = sim.fauna.spawn(code('deer'), spot.x + 1, spot.y + 1, fauna.store.group[deer]!, 2);
    const aurochs = adult(sim, 'aurochs', spot.x + 2, spot.y);
    const alone = attackChance(fauna, wolf, species, deer, 1, false);
    expect(alone).toBeLessThan(0.5);
    expect(attackChance(fauna, wolf, species, fawn, 1, false)).toBeGreaterThan(alone);
    expect(attackChance(fauna, wolf, species, deer, 1, true)).toBeGreaterThan(alone);
    expect(attackChance(fauna, wolf, species, deer, 3, false)).toBeGreaterThan(alone);
    expect(attackChance(fauna, wolf, species, aurochs, 1, false)).toBeLessThan(alone);
    // The group's strength is only counted up to its cap.
    const cap = species.huntGroupCap;
    expect(attackChance(fauna, wolf, species, aurochs, cap, false)).toBeGreaterThan(attackChance(fauna, wolf, species, aurochs, cap - 1, false));
  });

  it('a hunter chooses the prey worth the effort: a weak one rather than a nearer one in its prime', () => {
    const sim = emptyWorld();
    const spot = openSpot(sim);
    const fauna = sim.fauna;
    const wolf = adult(sim, 'wolf', spot.x, spot.y);
    const prime = adult(sim, 'deer', spot.x + 4, spot.y);
    const fawn = sim.fauna.spawn(code('deer'), spot.x - 7, spot.y, fauna.groups.add(code('deer'), -1), 0.3 * fauna.daysPerYear);
    fauna.store.energy[wolf] = fauna.store.maxReserve[wolf]! * 0.3;
    fauna.store.hunger[wolf] = 70;
    fauna.store.thirst[wolf] = 0;
    think(fauna, wolf);
    expect(fauna.store.state[wolf]).toBe(State.Hunt);
    expect(fauna.store.targetAnimal[wolf]).toBe(fawn);
    void prime;
  });

  it('a well fed hunter does not hunt', () => {
    const sim = emptyWorld();
    const spot = openSpot(sim);
    const wolf = adult(sim, 'wolf', spot.x, spot.y);
    adult(sim, 'deer', spot.x + 3, spot.y);
    sim.fauna.store.hunger[wolf] = data.fauna.needs.huntAbove - 5;
    sim.fauna.store.thirst[wolf] = 0;
    think(sim.fauna, wolf);
    expect(sim.fauna.store.state[wolf]).not.toBe(State.Hunt);
  });

  it('a herd sees a hunter sooner than a lone animal; thick cover hides it', () => {
    const sim = emptyWorld();
    const spot = openSpot(sim);
    const fauna = sim.fauna;
    const deer = data.fauna.species[code('deer')]!;
    const lone = adult(sim, 'deer', spot.x, spot.y);
    const herd = fauna.groups.add(code('deer'), -1);
    const first = adult(sim, 'deer', spot.x + 6, spot.y, herd);
    for (let k = 0; k < 7; k++) adult(sim, 'deer', spot.x + 6, spot.y + 1, herd);
    fauna.groups.size[herd] = 8;
    expect(vigilanceRadius(fauna, first, deer)).toBeGreaterThan(vigilanceRadius(fauna, lone, deer));
    const covered = fauna.coverOfBiome[sim.world.biome[fauna.store.y[lone]! * SIZE + fauna.store.x[lone]!]!]!;
    expect(vigilanceRadius(fauna, lone, deer)).toBeCloseTo(deer.fleeRadius * (1 - data.fauna.vigilance.coverShare * covered), 5);
  });
});

describe('the ecosystem alone is deterministic', () => {
  it('same seed => same animals, reserves and hunts after a year', () => {
    const run = (): string => {
      const sim = new Simulation(11, data);
      sim.runEcosystemOnly(daysPerYear(data.time));
      const { store } = sim.fauna;
      let out = `${sim.fauna.huntStats.attempts.join(',')}|${sim.fauna.huntStats.kills.join(',')}`;
      for (let s = 0; s < store.slots; s++) if (store.alive[s] === 1) out += `|${store.species[s]}:${store.x[s]}:${store.y[s]}:${store.energy[s]!.toFixed(3)}`;
      return out;
    };
    expect(run()).toBe(run());
  });
});
