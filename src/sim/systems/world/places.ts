import type { Landmass, LandmassMap } from './landmasses';

/**
 * Descriptive French place names, built from the geography ("le sud du grand continent").
 * Real names will come from cultures and languages later; these only locate events.
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

/** Where a tile lies on its landmass: "le sud du grand continent", or just "une île du nord" for islands. */
export function describeLocation(map: LandmassMap, names: readonly string[], x: number, y: number, size: number): string {
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
