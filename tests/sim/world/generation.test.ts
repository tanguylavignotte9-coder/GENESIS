import { describe, expect, it } from 'vitest';
import { Rng } from '../../../src/sim/core/rng';
import { Water } from '../../../src/sim/systems/world/hydrology';
import { computeWorldStats } from '../../../src/sim/systems/world/stats';
import { generateWorld } from '../../../src/sim/systems/world/world';
import { dataWithSize, worldFor } from './helpers';

const SEEDS = [1, 42, 777, 2024, 31337];
const SIZE = 256;
const LARGE = 512;

describe('world generation', () => {
  it('is deterministic: same seed => same map, tile for tile', () => {
    const data = dataWithSize(SIZE);
    const a = generateWorld(data.worldgen, data.biomes, new Rng(42));
    const b = generateWorld(data.worldgen, data.biomes, new Rng(42));
    expect(b.elevation).toEqual(a.elevation);
    expect(b.temperature).toEqual(a.temperature);
    expect(b.humidity).toEqual(a.humidity);
    expect(b.biome).toEqual(a.biome);
    expect(b.water).toEqual(a.water);
    expect(b.riverCount).toBe(a.riverCount);
  });

  it('different seeds give different maps', () => {
    expect(worldFor(1, SIZE).elevation).not.toEqual(worldFor(2, SIZE).elevation);
  });

  it.each(SEEDS)('seed %i: realistic share of land and ocean', (seed) => {
    const world = worldFor(seed, SIZE);
    const stats = computeWorldStats(world, dataWithSize(SIZE).worldgen);
    expect(stats.landShare).toBeGreaterThan(0.2);
    expect(stats.landShare).toBeLessThan(0.5);
  });

  it.each(SEEDS)('seed %i: map borders are ocean', (seed) => {
    const world = worldFor(seed, SIZE);
    const last = world.size - 1;
    for (let k = 0; k < world.size; k++) {
      for (const index of [k, last * world.size + k, k * world.size, k * world.size + last]) {
        expect(world.ocean[index]).toBe(1);
      }
    }
  });

  it.each([42, 777])('seed %i: several continents and islands', (seed) => {
    const world = worldFor(seed, LARGE);
    const { landmasses } = computeWorldStats(world, dataWithSize(LARGE).worldgen);
    expect(landmasses.continents).toBeGreaterThanOrEqual(2);
    expect(landmasses.islands).toBeGreaterThanOrEqual(1);
  });

  it.each([42, 777])('seed %i: many biomes appear, including deserts, forests and ice', (seed) => {
    const world = worldFor(seed, LARGE);
    const shares = computeWorldStats(world, dataWithSize(LARGE).worldgen).biomeShares;
    const present = shares.filter((biome) => biome.share > 0).map((biome) => biome.id);
    expect(present.length).toBeGreaterThanOrEqual(11);
    expect(present).toEqual(expect.arrayContaining(['deep_ocean', 'ocean', 'desert', 'temperate_forest', 'tundra']));
  });

  it('every tile has a valid biome', () => {
    const world = worldFor(42, SIZE);
    for (const biome of world.biome) expect(biome).toBeLessThan(world.biomes.biomes.length);
  });
});

describe('rivers and lakes', () => {
  it.each([42, 777, 2024])('seed %i: has rivers and lakes', (seed) => {
    const world = worldFor(seed, LARGE);
    expect(world.riverCount).toBeGreaterThan(0);
    expect(world.lakeCount).toBeGreaterThan(0);
  });

  it.each([42, 777, 2024])('seed %i: rivers always flow downhill and end in the sea or a lake', (seed) => {
    const world = worldFor(seed, LARGE);
    let checked = 0;
    for (let start = 0; start < world.water.length; start++) {
      if (world.water[start] !== Water.River) continue;
      checked++;
      let tile = start;
      let steps = 0;
      while (world.water[tile] === Water.River) {
        const next = world.flowTo[tile] ?? -1;
        expect(next).toBeGreaterThanOrEqual(0);
        expect(world.elevation[next]).toBeLessThan(world.elevation[tile] ?? 0);
        tile = next;
        steps++;
        expect(steps).toBeLessThan(world.water.length);
      }
      expect(world.ocean[tile] === 1 || world.water[tile] === Water.Lake).toBe(true);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('rivers and lakes are never in the ocean', () => {
    const world = worldFor(42, LARGE);
    for (let i = 0; i < world.water.length; i++) {
      if (world.ocean[i] === 1) expect(world.water[i]).toBe(Water.None);
    }
  });

  it.each([42, 777])('seed %i: rivers are born in the uplands, in humid areas', (seed) => {
    const world = worldFor(seed, LARGE);
    const fedByRiver = new Uint8Array(world.water.length);
    for (let i = 0; i < world.water.length; i++) {
      const down = world.flowTo[i] ?? -1;
      if (world.water[i] === Water.River && down >= 0) fedByRiver[down] = 1;
    }
    const land = { altitude: [] as number[], humidity: [] as number[] };
    const sources = { altitude: [] as number[], humidity: [] as number[] };
    for (let i = 0; i < world.water.length; i++) {
      if (world.ocean[i] === 1) continue;
      const target = world.water[i] === Water.River && fedByRiver[i] === 0 ? [land, sources] : [land];
      for (const group of target) {
        group.altitude.push(world.elevation[i] ?? 0);
        group.humidity.push(world.humidity[i] ?? 0);
      }
    }
    expect(sources.altitude.length).toBeGreaterThan(0);
    expect(median(sources.altitude)).toBeGreaterThan(median(land.altitude));
    // Sources are not in dry lands (they sit in the rainy uplands, but humidity alone varies a lot).
    expect(median(sources.humidity)).toBeGreaterThan(0.85 * median(land.humidity));
  });

  it.each(SEEDS)('seed %i: rivers never flow diagonally (only through the 4 sides of a tile)', (seed) => {
    const world = worldFor(seed, SIZE);
    let rivers = 0;
    for (let i = 0; i < world.water.length; i++) {
      if (world.water[i] !== Water.River) continue;
      rivers++;
      const down = world.flowTo[i] ?? -1;
      if (down < 0) continue;
      const dx = Math.abs((down % world.size) - (i % world.size));
      const dy = Math.abs(Math.floor(down / world.size) - Math.floor(i / world.size));
      expect(dx + dy).toBe(1);
    }
    expect(rivers).toBeGreaterThan(0);
  });
});

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1] ?? 0;
}
