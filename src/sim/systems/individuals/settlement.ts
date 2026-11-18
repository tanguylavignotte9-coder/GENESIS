import type { Rng } from '../../core/rng';
import type { FloraSystem } from '../flora/flora-system';
import type { FaunaSystem } from '../fauna/fauna-system';
import type { World } from '../world/world';
import type { HumanParams } from './params';
import type { Terrain } from './terrain';

export interface Site {
  tile: number;
  score: number;
}

/** Steps along the path to water: is fresh water within `max` tiles of walking? */
function waterDistance(fauna: FaunaSystem, tile: number, max: number): number {
  let at = tile;
  for (let d = 0; d <= max; d++) {
    const next = fauna.waterPath[at]!;
    if (next < 0) return Infinity;
    if (next === at || fauna.world.water[next] !== 0) return d;
    at = next;
  }
  return Infinity;
}

/** Number of plants around `tile` that give something edible. */
function foodPlantsAround(world: World, flora: FloraSystem, tile: number, radius: number, edible: ReadonlySet<string>): number {
  const size = world.size;
  const x0 = tile % size;
  const y0 = (tile - x0) / size;
  let count = 0;
  for (let y = Math.max(0, y0 - radius); y <= Math.min(size - 1, y0 + radius); y++) {
    for (let x = Math.max(0, x0 - radius); x <= Math.min(size - 1, x0 + radius); x++) {
      const produce = flora.speciesAt(y * size + x)?.produce;
      if (produce && edible.has(produce.resource)) count++;
    }
  }
  return count;
}

/**
 * Credible places for a camp: fresh water close by, temperate climate, edible plants around.
 * Candidates are drawn with the seeded generator; the best ones win, kept apart from each other.
 */
export function chooseSites(
  world: World,
  flora: FloraSystem,
  fauna: FaunaSystem,
  terrain: Terrain,
  params: HumanParams,
  edible: ReadonlySet<string>,
  count: number,
  rng: Rng,
): Site[] {
  const { site } = params;
  const size = world.size;
  const candidates: Site[] = [];
  for (let k = 0; k < site.candidates; k++) {
    const tile = rng.nextIntInclusive(0, size * size - 1);
    if (!terrain.walkable(tile)) continue;
    const temperature = world.temperature[tile]!;
    if (temperature < site.minCelsius || temperature > site.maxCelsius) continue;
    const water = waterDistance(fauna, tile, site.waterMaxTiles);
    if (water === Infinity) continue;
    const food = foodPlantsAround(world, flora, tile, site.foodRadius, edible);
    if (food < site.minFoodPlants) continue;
    candidates.push({ tile, score: food - water * 2 });
  }
  candidates.sort((a, b) => b.score - a.score || a.tile - b.tile);
  const chosen: Site[] = [];
  const spacing = params.tribe.campSpacingTiles;
  for (const candidate of candidates) {
    if (chosen.length >= count) break;
    const cx = candidate.tile % size;
    const cy = (candidate.tile - cx) / size;
    const tooClose = chosen.some((other) => {
      const ox = other.tile % size;
      return Math.max(Math.abs(ox - cx), Math.abs((other.tile - ox) / size - cy)) < spacing;
    });
    if (!tooClose) chosen.push(candidate);
  }
  return chosen;
}
