import { Water } from './hydrology';
import { countLandmasses, type Landmasses } from './landmasses';
import type { WorldgenParams } from './params';
import type { World } from './world';

export interface BiomeShare {
  id: string;
  name: string;
  /** Share of all map tiles, 0..1. */
  share: number;
}

export interface WorldStats {
  landShare: number;
  biomeShares: BiomeShare[];
  riverCount: number;
  riverTiles: number;
  lakeCount: number;
  landmasses: Landmasses;
}

export function computeWorldStats(world: World, params: WorldgenParams): WorldStats {
  const counts = new Array<number>(world.biomes.biomes.length).fill(0);
  let land = 0;
  let riverTiles = 0;
  for (let i = 0; i < world.biome.length; i++) {
    const b = world.biome[i] ?? 0;
    counts[b] = (counts[b] ?? 0) + 1;
    if (world.ocean[i] === 0) land++;
    if (world.water[i] === Water.River) riverTiles++;
  }
  const total = world.biome.length;
  return {
    landShare: land / total,
    biomeShares: world.biomes.biomes.map((biome, index) => ({
      id: biome.id,
      name: biome.name,
      share: (counts[index] ?? 0) / total,
    })),
    riverCount: world.riverCount,
    riverTiles,
    lakeCount: world.lakeCount,
    landmasses: countLandmasses(world.ocean, world.size, params.landmassMinTiles, params.continentMinShare),
  };
}
