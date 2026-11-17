import { loadGameData, type GameData } from '../../../src/sim/core/game-data';
import { Rng } from '../../../src/sim/core/rng';
import { generateWorld, type World } from '../../../src/sim/systems/world/world';

/** Real game data with a smaller map, to keep tests fast. */
export function dataWithSize(size: number): GameData {
  const data = loadGameData();
  return { ...data, worldgen: { ...data.worldgen, size } };
}

const cache = new Map<string, World>();

/** Generates (once) the world for a seed and a map size. */
export function worldFor(seed: number, size: number): World {
  const key = `${seed}:${size}`;
  let world = cache.get(key);
  if (!world) {
    const data = dataWithSize(size);
    world = generateWorld(data.worldgen, data.biomes, new Rng(seed));
    cache.set(key, world);
  }
  return world;
}
