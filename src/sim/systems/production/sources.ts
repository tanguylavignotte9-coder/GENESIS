import { BuildState } from './buildings';
import type { Recipe } from './catalog';
import type { ProductionSystem } from './production-system';
import { Water } from '../world/hydrology';
import type { TerrainSource } from './params';

/**
 * Where a harvest takes place (plants, trees, terrain, fish, a ripe field) and what it yields.
 * Every source is a real thing of the world: the plant's produce, the fish of the river.
 */

function chebyshev(sys: ProductionSystem, a: number, b: number): number {
  const size = sys.size;
  return Math.max(Math.abs((a % size) - (b % size)), Math.abs(Math.floor(a / size) - Math.floor(b / size)));
}

/** A wanted list as a mask over the items (null = anything the source gives). */
export function wantedMask(sys: ProductionSystem, wanted: readonly number[]): Uint8Array | null {
  if (wanted.length === 0) return null;
  const mask = new Uint8Array(sys.catalog.items.length);
  for (const item of wanted) mask[item] = 1;
  return mask;
}

function accepts(recipe: Recipe, mask: Uint8Array | null, item: number): boolean {
  return item >= 0 && recipe.yields[item] === 1 && (mask === null || mask[item] === 1);
}

/** The item a tile of a source gives, among those wanted (-1 if nothing there now). */
export function yieldAt(sys: ProductionSystem, recipe: Recipe, tile: number, wanted: readonly number[]): number {
  return yieldAtMask(sys, recipe, tile, wantedMask(sys, wanted));
}

function yieldAtMask(sys: ProductionSystem, recipe: Recipe, tile: number, mask: Uint8Array | null): number {
  switch (recipe.def.source?.kind) {
    case 'plantProduce': {
      const code = sys.flora.state.species[tile]!;
      if (code === 0) return -1;
      const item = sys.plantProduce[code - 1]!;
      return accepts(recipe, mask, item) && sys.flora.produceAvailable(tile, sys.catalog.items[item]!.id) >= 1 ? item : -1;
    }
    case 'plantBranches': {
      const code = sys.flora.state.species[tile]!;
      if (code === 0 || sys.plantBranches[code - 1] !== 1) return -1;
      const item = recipe.outputs[0]?.item ?? -1;
      return accepts(recipe, mask, item) ? item : -1;
    }
    case 'tree': {
      const plant = sys.flora.speciesAt(tile);
      if (plant?.kind !== 'tree') return -1;
      for (const material of plant.materials ?? []) {
        const item = sys.catalog.itemIndex.get(material.resource) ?? -1;
        if (accepts(recipe, mask, item)) return item;
      }
      return -1;
    }
    case 'terrain': {
      if (!walkable(sys, tile)) return -1;
      const sources = sys.params.terrainSources;
      for (let k = 0; k < sources.length; k++) {
        const item = sys.terrainItems[k]!;
        if (accepts(recipe, mask, item) && terrainGives(sys, tile, sources[k]!)) return item;
      }
      return -1;
    }
    case 'fish': {
      const item = recipe.outputs[0]?.item ?? -1;
      return accepts(recipe, mask, item) && walkable(sys, tile) && sys.fauna.fish.availableNear(tile % sys.size, Math.floor(tile / sys.size)) >= 1 ? item : -1;
    }
    case 'field': {
      const field = sys.buildings.find((b) => b.tile === tile && b.state === BuildState.Done && b.grain + b.straw > 0);
      if (!field) return -1;
      const straw = sys.catalog.itemIndex.get('straw');
      for (const output of recipe.outputs) {
        const left = output.item === straw ? field.straw : field.grain;
        if (left >= 1 && accepts(recipe, mask, output.item)) return output.item;
      }
      return -1;
    }
    default:
      return -1;
  }
}

/** What keeps is worth more to someone gathering for the camp (1 for what rots at once, up to 1 + preference). */
function keeping(sys: ProductionSystem, item: number): number {
  const life = sys.catalog.halfLife[item]!;
  const { keepingPreference, keepingDays } = sys.params.work;
  return 1 + keepingPreference * (life <= 0 ? 1 : Math.min(1, life / keepingDays));
}

function walkable(sys: ProductionSystem, tile: number): boolean {
  return sys.world.ocean[tile] === 0 && sys.world.water[tile] !== Water.Lake;
}

/** Does a terrain tile provide this material (river bed, lake shore, rocky biome, high ground)? */
export function terrainGives(sys: ProductionSystem, tile: number, source: TerrainSource): boolean {
  const { world } = sys;
  if (!walkable(sys, tile)) return false;
  if (source.river && world.water[tile] === Water.River) return true;
  if (world.elevation[tile]! >= source.minElevation) return true;
  if (source.biomes.length > 0 && source.biomes.some((id) => sys.biomeCode(id) === world.biome[tile])) return true;
  if (source.lakeShore) {
    const size = sys.size;
    const x = tile % size;
    const y = Math.floor(tile / size);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < size && ny < size && world.water[ny * size + nx] === Water.Lake) return true;
      }
    }
  }
  return false;
}

/**
 * The best place around the person for a harvest: much to take, not too far (food is worth its
 * nutrition). Searched within `radius` tiles; -1 if nothing.
 */
export function findSource(sys: ProductionSystem, person: number, recipe: Recipe, wanted: readonly number[], radius: number): number {
  return findSourceFrom(sys, sys.people.x(person), sys.people.y(person), sys.people.camp(person), recipe, wanted, radius, true);
}

/** Same search from any place (the camp's center, when custom weighs what can be made). */
export function findSourceFrom(sys: ProductionSystem, x0: number, y0: number, camp: number, recipe: Recipe, wanted: readonly number[], radius: number, seeOthers = false): number {
  const kind = recipe.def.source?.kind;
  if (kind === 'field') {
    let best = -1;
    let bestDistance = Infinity;
    for (const building of sys.campBuildings(camp)) {
      const d = chebyshev(sys, building.tile, y0 * sys.size + x0);
      if (d < bestDistance && yieldAtMask(sys, recipe, building.tile, wantedMask(sys, wanted)) >= 0) {
        best = building.tile;
        bestDistance = d;
      }
    }
    return best;
  }
  if (kind === 'livestock' || kind === 'wild' || kind === 'prey' || kind === undefined) return -1;
  const size = sys.size;
  const mask = wantedMask(sys, wanted);
  let best = -1;
  let bestScore = 0;
  for (let y = Math.max(0, y0 - radius); y <= Math.min(size - 1, y0 + radius); y++) {
    for (let x = Math.max(0, x0 - radius); x <= Math.min(size - 1, x0 + radius); x++) {
      const tile = y * size + x;
      const item = yieldAtMask(sys, recipe, tile, mask);
      if (item < 0) continue;
      let amount = 1;
      if (kind === 'plantProduce') {
        const resource = sys.catalog.items[item]!.id;
        amount = sys.flora.produceAvailable(tile, resource) * Math.max(0.2, sys.catalog.food[item]!) * keeping(sys, item);
        // A plant someone is already heading for is worth less: better pick another one.
        if (seeOthers) amount /= 1 + (sys.pickers.get(tile) ?? 0);
      } else if (kind === 'plantBranches') {
        // One spares the bushes that feed us, and the plants already stripped (so that they recover).
        const code = sys.flora.state.species[tile]!;
        if (sys.plantProduce[code - 1]! >= 0 && sys.catalog.food[sys.plantProduce[code - 1]!]! > 0) amount /= 1 + sys.params.work.spareFoodPlants;
        amount *= sys.flora.state.health[tile]! / 255;
      }
      const score = amount / (1 + Math.max(Math.abs(x - x0), Math.abs(y - y0)));
      if (score > bestScore) {
        bestScore = score;
        best = tile;
      }
    }
  }
  return best;
}

/**
 * Takes up to `units` of the item from the source tile; returns what was taken. Picking branches
 * hurts the plant a little, felling kills the tree, fishing empties the river.
 */
export function takeFromSource(sys: ProductionSystem, recipe: Recipe, tile: number, item: number, units: number): number {
  const kind = recipe.def.source?.kind;
  const resource = sys.catalog.items[item]!.id;
  switch (kind) {
    case 'plantProduce':
      return sys.flora.takeProduce(tile, resource, units);
    case 'plantBranches':
      sys.flora.harmPlant(tile, units * sys.params.work.branchHarmToPlant);
      return units;
    case 'tree':
      return sys.flora.fellTree(tile, resource, units);
    case 'terrain':
      return units;
    case 'fish':
      return sys.fauna.fish.takeNear(tile % sys.size, Math.floor(tile / sys.size), Math.floor(units + sys.rng.nextFloat()));
    case 'field': {
      const field = sys.buildings.find((b) => b.tile === tile && b.state === BuildState.Done);
      if (!field) return 0;
      const isStraw = item === sys.catalog.itemIndex.get('straw');
      const left = isStraw ? field.straw : field.grain;
      const taken = Math.min(units, left);
      if (isStraw) field.straw -= taken;
      else field.grain -= taken;
      return taken;
    }
    default:
      return 0;
  }
}
