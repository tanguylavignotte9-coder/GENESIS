import { NEIGHBOR_DX, NEIGHBOR_DY, ORTHOGONAL_COUNT } from './grid';

/** A connected piece of land (4-connected; lakes count as land). */
export interface Landmass {
  id: number;
  tiles: number;
  centroidX: number;
  centroidY: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** True if it holds at least `continentMinShare` of all land. */
  isContinent: boolean;
}

export interface LandmassMap {
  /** Landmass id of each tile, -1 for ocean. */
  idOf: Int32Array;
  /** Landmasses sorted from largest to smallest; `list[k].id === k`. */
  list: Landmass[];
}

export interface Landmasses {
  continents: number;
  islands: number;
}

/** Labels every land tile with its landmass. Deterministic: largest first, ties by first tile. */
export function labelLandmasses(ocean: Uint8Array, size: number, continentMinShare: number): LandmassMap {
  const raw = new Int32Array(ocean.length).fill(-1);
  const queue = new Int32Array(ocean.length);
  const found: Omit<Landmass, 'id' | 'isContinent'>[] = [];
  for (let start = 0; start < ocean.length; start++) {
    if (ocean[start] === 1 || raw[start] !== -1) continue;
    const label = found.length;
    const stats = { tiles: 0, centroidX: 0, centroidY: 0, minX: size, minY: size, maxX: 0, maxY: 0 };
    let head = 0;
    let tail = 0;
    raw[start] = label;
    queue[tail++] = start;
    while (head < tail) {
      const index = queue[head++] ?? 0;
      const x = index % size;
      const y = (index - x) / size;
      stats.tiles++;
      stats.centroidX += x;
      stats.centroidY += y;
      stats.minX = Math.min(stats.minX, x);
      stats.minY = Math.min(stats.minY, y);
      stats.maxX = Math.max(stats.maxX, x);
      stats.maxY = Math.max(stats.maxY, y);
      for (let n = 0; n < ORTHOGONAL_COUNT; n++) {
        const nx = x + (NEIGHBOR_DX[n] ?? 0);
        const ny = y + (NEIGHBOR_DY[n] ?? 0);
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const neighbor = ny * size + nx;
        if (ocean[neighbor] === 0 && raw[neighbor] === -1) {
          raw[neighbor] = label;
          queue[tail++] = neighbor;
        }
      }
    }
    stats.centroidX /= stats.tiles;
    stats.centroidY /= stats.tiles;
    found.push(stats);
  }

  const totalLand = found.reduce((sum, mass) => sum + mass.tiles, 0);
  const order = found.map((_, index) => index).sort((a, b) => (found[b]?.tiles ?? 0) - (found[a]?.tiles ?? 0) || a - b);
  const newId = new Int32Array(found.length);
  order.forEach((oldId, rank) => (newId[oldId] = rank));
  const idOf = raw.map((label) => (label < 0 ? -1 : (newId[label] ?? -1)));
  const list = order.map((oldId, rank) => {
    const mass = found[oldId]!;
    return { ...mass, id: rank, isContinent: mass.tiles >= continentMinShare * totalLand };
  });
  return { idOf, list };
}

/** Counts continents and islands, ignoring land masses below `minTiles`. */
export function countLandmasses(map: LandmassMap, minTiles: number): Landmasses {
  let continents = 0;
  let islands = 0;
  for (const mass of map.list) {
    if (mass.tiles < minTiles) continue;
    if (mass.isContinent) continents++;
    else islands++;
  }
  return { continents, islands };
}
