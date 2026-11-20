import type { Landmass, LandmassMap } from './landmasses';
import { Water } from './hydrology';
import type { World } from './world';

/**
 * Where things happen. A place that a people has named (in its own language, see core/toponyms)
 * is called by its name: "les monts Karak", "la vallée de la Tamu", "le pays de Soro", "l'île de
 * Mena". Elsewhere, a description built from the geography ("le sud du grand continent").
 */

/** Below this distance from the center (as a share of the half-extent), a point is "in the center". */
const CENTER_SHARE = 0.35;

const DIRECTIONS = ['est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest', 'nord', 'nord-est'] as const;
type Direction = (typeof DIRECTIONS)[number];

/** Compass direction of (dx, dy); y grows toward the south. Null near the center. */
export function directionOf(dx: number, dy: number): Direction | null {
  if (Math.hypot(dx, dy) < CENTER_SHARE) return null;
  const octant = Math.round((Math.atan2(dy, dx) / (2 * Math.PI)) * DIRECTIONS.length);
  return DIRECTIONS[(octant + DIRECTIONS.length) % DIRECTIONS.length] ?? null;
}

/** "le nord", "l'est", "le centre" */
function withArticle(direction: Direction | null): string {
  if (direction === null) return 'le centre';
  return direction.startsWith('e') || direction.startsWith('o') ? `l'${direction}` : `le ${direction}`;
}

/** "de" + label with French contractions: du, d'une, de l'… */
export function ofPlace(label: string): string {
  if (label.startsWith('le ')) return `du ${label.slice(3)}`;
  if (label.startsWith('les ')) return `des ${label.slice(4)}`;
  if (label.startsWith('une ')) return `d'${label}`;
  return `de ${label}`;
}

/** Name of each landmass, e.g. "le grand continent", "le continent de l'ouest", "une île du nord-est". */
export function nameLandmasses(map: LandmassMap, size: number): string[] {
  const continents = map.list.filter((mass) => mass.isContinent);
  const half = size / 2;
  const regionOf = (mass: Landmass): string => withArticle(directionOf((mass.centroidX - half) / half, (mass.centroidY - half) / half));
  const continentRegions = continents.map(regionOf);
  return map.list.map((mass) => {
    const region = regionOf(mass);
    if (!mass.isContinent) return `une île ${ofPlace(region)}`;
    if (mass.id === 0 && continents.length > 1) return 'le grand continent';
    if (continents.length === 1) return 'le continent';
    const unique = continentRegions.filter((other) => other === region).length === 1;
    return unique ? `le continent ${ofPlace(region)}` : `un continent ${ofPlace(region)}`;
  });
}

/** Octant of a point on its landmass (8 = its center): the "regions" peoples name. */
export function regionOctant(mass: Landmass, x: number, y: number): number {
  const halfWidth = Math.max(1, (mass.maxX - mass.minX) / 2);
  const halfHeight = Math.max(1, (mass.maxY - mass.minY) / 2);
  const direction = directionOf((x - mass.centroidX) / halfWidth, (y - mass.centroidY) / halfHeight);
  return direction === null ? DIRECTIONS.length : DIRECTIONS.indexOf(direction);
}

/** Keys of the places of the toponyms register (core/toponyms). */
export const placeKeys = {
  region: (landmass: number, octant: number): string => `r:${landmass}:${octant}`,
  mountains: (landmass: number, octant: number): string => `m:${landmass}:${octant}`,
  island: (landmass: number): string => `i:${landmass}`,
  river: (mouth: number): string => `v:${mouth}`,
};

/** Tiles around a point where a river is looked for (a place "in the valley"). */
const RIVER_TILES = 2;
/** Longest river followed down to its mouth (technical bound). */
const MAX_RIVER_STEPS = 2000;

/** The last river tile downstream of a river tile: it names the whole river (tributaries included). */
export function riverMouth(world: World, tile: number): number {
  let at = tile;
  for (let k = 0; k < MAX_RIVER_STEPS; k++) {
    const next = world.flowTo[at]!;
    if (next < 0 || world.water[next] !== Water.River) return at;
    at = next;
  }
  return at;
}

/** A river tile within reach of (x, y), or -1. */
export function riverNear(world: World, x: number, y: number, reach = RIVER_TILES): number {
  const size = world.size;
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size && world.water[ny * size + nx] === Water.River) return ny * size + nx;
    }
  }
  return -1;
}

const MOUNTAIN_BIOME = 'mountain';

/** Where a tile lies: its name given by a people if it has one, else its place on its landmass. */
export function describeLocation(world: World, x: number, y: number): string {
  const size = world.size;
  const map = world.landmasses;
  const id = map.idOf[y * size + x] ?? -1;
  const mass = map.list[id];
  const name = world.landmassNames[id];
  if (!mass || name === undefined) return 'la haute mer';
  const toponyms = world.toponyms;
  const octant = mass.isContinent ? regionOctant(mass, x, y) : 0;
  if (toponyms.names.size > 0) {
    if (world.biomes.biomes[world.biome[y * size + x]!]?.id === MOUNTAIN_BIOME) {
      const mountains = toponyms.get(placeKeys.mountains(id, octant));
      if (mountains) return `les monts ${mountains.name}`;
    }
    const river = riverNear(world, x, y);
    const valley = river >= 0 ? toponyms.get(placeKeys.river(riverMouth(world, river))) : undefined;
    if (valley) return `la vallée de la ${valley.name}`;
    const region = mass.isContinent ? toponyms.get(placeKeys.region(id, octant)) : toponyms.get(placeKeys.island(id));
    if (region) return mass.isContinent ? `le pays de ${region.name}` : `l'île de ${region.name}`;
  }
  return describeGeography(map, world.landmassNames, x, y, size);
}

/** "le sud du grand continent", or just "une île du nord" for islands. */
export function describeGeography(map: LandmassMap, names: readonly string[], x: number, y: number, size: number): string {
  const id = map.idOf[y * size + x] ?? -1;
  const mass = map.list[id];
  const name = names[id];
  if (!mass || name === undefined) return 'la haute mer';
  if (!mass.isContinent) return name;
  const halfWidth = Math.max(1, (mass.maxX - mass.minX) / 2);
  const halfHeight = Math.max(1, (mass.maxY - mass.minY) / 2);
  const part = withArticle(directionOf((x - mass.centroidX) / halfWidth, (y - mass.centroidY) / halfHeight));
  return `${part} ${ofPlace(name)}`;
}
