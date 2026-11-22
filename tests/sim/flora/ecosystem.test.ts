import { describe, expect, it } from 'vitest';
import { Simulation } from '../../../src/sim/core/simulation';
import { Sex } from '../../../src/sim/systems/fauna/animal-store';
import { canConceive } from '../../../src/sim/systems/fauna/life';
import { spreadSickness } from '../../../src/sim/systems/fauna/sickness';
import { dataWithSize } from '../world/helpers';

const SIZE = 192;
const data = dataWithSize(SIZE);
const BYTE_MAX = 255;

/** A land tile with land all around (for plants and animals). */
function inland(simulation: Simulation): number {
  const { world, flora, climate } = simulation;
  for (let i = SIZE * 20 + 20; i < SIZE * SIZE - SIZE * 20; i++) {
    let ok = climate.snowAt(i) === 0;
    for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2 && ok; dx++) ok = flora.isPlantable(i + dy * SIZE + dx) && world.ocean[i + dy * SIZE + dx] === 0;
    if (ok) return i;
  }
  throw new Error('no inland tile');
}

const code = (id: string): number => data.flora.species.findIndex((species) => species.id === id);

describe('where plants take root', () => {
  it('a tree seedling is choked by thick grass; on bare ground it comes up', () => {
    const simulation = new Simulation(3, data);
    const { flora } = simulation;
    const tile = inland(simulation);
    for (let d = -1; d <= 1; d++) for (let e = -1; e <= 1; e++) flora.state.clear(tile + d * SIZE + e);
    flora.state.grass[tile] = data.flora.grass.maxAmount;
    const inGrass = flora.establishment(code('oak'), tile);
    flora.state.grass[tile] = 0;
    const bare = flora.establishment(code('oak'), tile);
    expect(bare).toBe(1);
    expect(inGrass).toBeLessThan(0.2);
    // A wild herb minds the grass much less.
    flora.state.grass[tile] = data.flora.grass.maxAmount;
    expect(flora.establishment(code('wild_wheat'), tile)).toBeGreaterThan(0.7);
  });

  it('light-hungry herbs hardly come up under a closed canopy of grown trees', () => {
    const simulation = new Simulation(3, data);
    const { flora } = simulation;
    const tile = inland(simulation);
    flora.state.grass[tile] = 0;
    for (let d = -1; d <= 1; d++) for (let e = -1; e <= 1; e++) flora.state.clear(tile + d * SIZE + e);
    const open = flora.establishment(code('wild_carrot'), tile);
    for (let d = -1; d <= 1; d++)
      for (let e = -1; e <= 1; e++) {
        if (d === 0 && e === 0) continue;
        const n = tile + d * SIZE + e;
        flora.state.species[n] = code('birch') + 1;
        flora.state.growth[n] = BYTE_MAX;
        flora.state.health[n] = BYTE_MAX;
      }
    const shaded = flora.establishment(code('wild_carrot'), tile);
    expect(open).toBe(1);
    expect(shaded).toBeLessThan(0.25);
    // A young tree minds the shade much less than a herb; an undergrowth plant (nettle) too.
    expect(flora.establishment(code('oak'), tile)).toBeGreaterThan(0.6);
    expect(flora.establishment(code('nettle'), tile)).toBeGreaterThan(shaded * 2);
    // Among its own kind, a birch seedling meets the pests of its species: it comes up less.
    expect(flora.establishment(code('birch'), tile)).toBeLessThan(flora.establishment(code('oak'), tile) / 2);
  });

  it('grazers bite off the shoots of a young tree, not the bark of a grown one', () => {
    const simulation = new Simulation(3, data);
    const { flora } = simulation;
    const tile = inland(simulation);
    flora.state.species[tile] = code('birch') + 1;
    flora.state.growth[tile] = 10;
    flora.state.health[tile] = BYTE_MAX;
    flora.state.grass[tile] = 100;
    flora.takeGrass(tile, 10);
    expect(flora.state.health[tile]).toBeLessThan(BYTE_MAX);
    flora.state.growth[tile] = BYTE_MAX;
    flora.state.health[tile] = BYTE_MAX;
    flora.state.grass[tile] = 100;
    flora.takeGrass(tile, 10);
    expect(flora.state.health[tile]).toBe(BYTE_MAX);
  });
});

describe('animal life', () => {
  it('a mother raising her young does not conceive again before the interval is over', () => {
    const simulation = new Simulation(3, data);
    const { fauna } = simulation;
    const { store } = fauna;
    const species = fauna.params.species.findIndex((s) => s.id === 'bear');
    const tile = inland(simulation);
    const group = fauna.groups.add(species, -1);
    const mother = fauna.spawn(species, (tile % SIZE) + 0.5, Math.floor(tile / SIZE) + 0.5, group, 3000);
    const male = fauna.spawn(species, (tile % SIZE) + 1.5, Math.floor(tile / SIZE) + 0.5, group, 3000);
    store.sex[mother] = Sex.Female;
    store.sex[male] = Sex.Male;
    store.energy[mother] = store.maxReserve[mother]!;
    store.health[mother] = 100;
    const bear = fauna.params.species[species]!;
    // During the mating season, a female without young may conceive…
    simulation.climate.setDay(bear.breedingDays[0]);
    fauna.day = 1000;
    const free = canConceive(fauna, mother);
    store.lastBirthDay[mother] = fauna.day - 1;
    expect(canConceive(fauna, mother)).toBe(false);
    store.lastBirthDay[mother] = fauna.day - bear.birthIntervalDays;
    expect(canConceive(fauna, mother)).toBe(free);
  });

  it('a disease passes between close animals of a species, not to others nor far away, and leaves them immune', () => {
    const simulation = new Simulation(3, { ...data, fauna: { ...data.fauna, sickness: { ...data.fauna.sickness, transmitPerDay: 1, outbreakPerDay: 0 } } });
    const { fauna } = simulation;
    const { store } = fauna;
    for (let slot = 0; slot < store.slots; slot++) if (store.alive[slot] === 1) fauna.kill(slot, 0);
    const deer = fauna.params.species.findIndex((s) => s.id === 'deer');
    const goat = fauna.params.species.findIndex((s) => s.id === 'goat');
    const tile = inland(simulation);
    const x = (tile % SIZE) + 0.5;
    const y = Math.floor(tile / SIZE) + 0.5;
    const herd = fauna.groups.add(deer, -1);
    const sick = fauna.spawn(deer, x, y, herd, 500);
    const close = fauna.spawn(deer, x + 1, y, herd, 500);
    const far = fauna.spawn(deer, x + 15, y, herd, 500);
    const other = fauna.spawn(goat, x, y + 1, fauna.groups.add(goat, -1), 500);
    store.sickDays[sick] = 3;
    spreadSickness(fauna);
    expect(store.sickDays[close]).toBeGreaterThan(0);
    expect(store.sickDays[far]).toBe(0);
    expect(store.sickDays[other]).toBe(0);
    for (let day = 0; day < data.fauna.sickness.sickDays + 2; day++) spreadSickness(fauna);
    expect(store.sickDays[sick]).toBe(0);
    expect(store.immuneDays[sick]).toBeGreaterThan(0);
  });
});
