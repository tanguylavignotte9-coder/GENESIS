import { NEIGHBOR_DX, NEIGHBOR_DY, ORTHOGONAL_COUNT } from './grid';

export interface Landmasses {
  continents: number;
  islands: number;
}

/**
 * Counts connected land masses (4-connected, lakes included as land).
 * Masses below `minTiles` are ignored; those holding at least `continentMinShare` of all land are continents.
 */
export function countLandmasses(ocean: Uint8Array, size: number, minTiles: number, continentMinShare: number): Landmasses {
  const sizes = landmassSizes(ocean, size);
  const totalLand = sizes.reduce((sum, value) => sum + value, 0);
  let continents = 0;
  let islands = 0;
  for (const tiles of sizes) {
    if (tiles < minTiles) continue;
    if (tiles >= continentMinShare * totalLand) continents++;
    else islands++;
  }
  return { continents, islands };
}

function landmassSizes(ocean: Uint8Array, size: number): number[] {
  const seen = new Uint8Array(ocean.length);
  const queue = new Int32Array(ocean.length);
  const sizes: number[] = [];
  for (let start = 0; start < ocean.length; start++) {
    if (ocean[start] === 1 || seen[start] === 1) continue;
    let head = 0;
    let tail = 0;
    seen[start] = 1;
    queue[tail++] = start;
    while (head < tail) {
      const index = queue[head++] ?? 0;
      const x = index % size;
      const y = (index - x) / size;
      for (let n = 0; n < ORTHOGONAL_COUNT; n++) {
        const nx = x + (NEIGHBOR_DX[n] ?? 0);
        const ny = y + (NEIGHBOR_DY[n] ?? 0);
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const neighbor = ny * size + nx;
        if (ocean[neighbor] === 0 && seen[neighbor] === 0) {
          seen[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
    }
    sizes.push(tail);
  }
  return sizes;
}
