import type { World } from '../sim/systems/world/world';
import type { WorldSnapshot } from '../shared/messages';

/** Copies the world's arrays so they can be transferred to the display without losing the originals. */
export function snapshotWorld(world: World): { snapshot: WorldSnapshot; transfer: ArrayBuffer[] } {
  const snapshot: WorldSnapshot = {
    size: world.size,
    elevation: world.elevation.slice(),
    temperature: world.temperature.slice(),
    humidity: world.humidity.slice(),
    ocean: world.ocean.slice(),
    biome: world.biome.slice(),
    water: world.water.slice(),
    biomes: world.biomes,
    riverCount: world.riverCount,
    lakeCount: world.lakeCount,
  };
  const transfer = [snapshot.elevation, snapshot.temperature, snapshot.humidity, snapshot.ocean, snapshot.biome, snapshot.water].map(
    (array) => array.buffer as ArrayBuffer,
  );
  return { snapshot, transfer };
}
