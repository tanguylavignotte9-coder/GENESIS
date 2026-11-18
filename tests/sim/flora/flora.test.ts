import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../../src/sim/core/game-data';
import { Simulation } from '../../../src/sim/core/simulation';
import { daysPerYear } from '../../../src/sim/core/time-params';
import { speciesFitness } from '../../../src/sim/systems/flora/fitness';
import { dataWithSize } from '../world/helpers';

const SIZE = 192;
const data = dataWithSize(SIZE);
const year = (simulation: Simulation): number => data.time.ticksPerDay * daysPerYear(simulation.data.time);

describe('flora data', () => {
  it('plants provide every plant resource of eras 0 and 1', () => {
    const { flora } = loadGameData();
    const provided = new Set(flora.species.flatMap((plant) => [...(plant.materials ?? []).map((m) => m.resource), ...(plant.produce ? [plant.produce.resource] : [])]));
    for (const resource of ['wood', 'branches', 'berries', 'roots', 'plant_fiber', 'wild_cereals', 'flax']) expect(provided).toContain(resource);
  });

  it('fitness is 1 inside the comfortable range and falls to 0 far outside', () => {
    const oak = data.flora.species.find((plant) => plant.id === 'oak')!;
    expect(speciesFitness(oak, 12, 0.6, data.flora)).toBe(1);
    expect(speciesFitness(oak, -20, 0.6, data.flora)).toBe(0);
    expect(speciesFitness(oak, 12, 0.1, data.flora)).toBe(0);
  });
});

describe('plants', () => {
  it('the map starts with vegetation adapted to the biomes (no tree in the ocean)', () => {
    const simulation = new Simulation(3, data);
    const { world, flora } = simulation;
    let plants = 0;
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (flora.state.species[i] === 0) continue;
      plants++;
      expect(world.ocean[i]).toBe(0);
    }
    expect(plants).toBeGreaterThan(1000);
  });

  it('are deterministic: same seed => same plants after a few years', () => {
    const run = () => {
      const simulation = new Simulation(11, data);
      simulation.step(3 * year(simulation));
      return Array.from(simulation.flora.state.species);
    };
    expect(run()).toEqual(run());
  });

  it('are only updated every few days, a different share of the tiles each day', () => {
    const simulation = new Simulation(3, data);
    const before = Uint16Array.from(simulation.flora.state.ageDays);
    simulation.flora.dailyUpdate(1);
    const interval = data.flora.updateIntervalDays;
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (i % interval !== 1 % interval) expect(simulation.flora.state.ageDays[i]).toBe(before[i]);
    }
  });

  it('germinate, grow, age and die: a cleared forest grows back', () => {
    const simulation = new Simulation(3, data);
    const { flora } = simulation;
    // Clear a square of land, then let seeds from around it fall in.
    let cleared = 0;
    const x0 = SIZE / 2 - 12;
    const y0 = SIZE / 2 - 12;
    const square: number[] = [];
    for (let y = y0; y < y0 + 24; y++) {
      for (let x = x0; x < x0 + 24; x++) {
        const i = y * SIZE + x;
        if (!flora.isPlantable(i)) continue;
        square.push(i);
        if (flora.state.species[i] !== 0) cleared++;
        flora.state.clear(i);
      }
    }
    expect(cleared).toBeGreaterThan(0);
    simulation.step(10 * year(simulation));
    const regrown = square.filter((i) => flora.state.species[i] !== 0).length;
    expect(regrown).toBeGreaterThan(cleared / 4);
  });

  it('a drought every year kills plants', () => {
    const droughtOnly = {
      ...data,
      climate: {
        ...data.climate,
        anomalies: {
          ...data.climate.anomalies,
          chancePerRoll: 1,
          tilesPerRoll: 50,
          minLandmassTiles: 50,
          radiusMin: 0.5,
          radiusMax: 0.5,
          types: data.climate.anomalies.types.filter((type) => type.id === 'drought').map((type) => ({ ...type, humidityFactor: 0.05 })),
        },
      },
    };
    const normal = new Simulation(3, data);
    const dry = new Simulation(3, droughtOnly);
    normal.step(4 * year(normal));
    dry.step(4 * year(dry));
    const count = (simulation: Simulation) => simulation.flora.countBySpecies().reduce((a, b) => a + b, 0);
    expect(count(dry)).toBeLessThan(count(normal) * 0.8);
  });

  it('produce follows the seasons: berries in summer, none in winter', () => {
    const simulation = new Simulation(3, data);
    const { flora, climate } = simulation;
    const bramble = data.flora.species.findIndex((plant) => plant.id === 'bramble') + 1;
    let tile = -1;
    for (let i = 0; i < (SIZE * SIZE) / 2; i++) {
      if (flora.state.species[i] === bramble && flora.state.ageDays[i]! > 100) {
        tile = i;
        break;
      }
    }
    expect(tile).toBeGreaterThanOrEqual(0);
    flora.state.health[tile] = 255;
    climate.setDay(18); // northern summer
    expect(flora.produceAvailable(tile, 'berries')).toBeGreaterThan(0);
    climate.setDay(35); // northern winter
    expect(flora.produceAvailable(tile, 'berries')).toBe(0);
  });

  it('grass is grazed and grows back', () => {
    const simulation = new Simulation(3, data);
    const { flora } = simulation;
    simulation.climate.setDay(15);
    let tile = -1;
    for (let i = 0; i < SIZE * SIZE; i++) if (flora.state.grass[i]! > 50 && simulation.climate.temperatureAt(i) > 12) tile = i;
    const eaten = flora.takeGrass(tile, 40);
    expect(eaten).toBe(40);
    const after = flora.state.grass[tile]!;
    for (let day = 0; day < data.flora.updateIntervalDays * 2; day++) flora.dailyUpdate(day);
    expect(flora.state.grass[tile]).toBeGreaterThan(after);
  });
});
