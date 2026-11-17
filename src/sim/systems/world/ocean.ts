import { ORTHOGONAL_COUNT, NEIGHBOR_DX, NEIGHBOR_DY } from './grid';

/**
 * Ocean = tiles under the sea level (elevation < 0) connected to the map border.
 * Tiles under the sea level but enclosed by land are NOT ocean: they are basins (possible lakes).
 */
export function computeOceanMask(elevation: Float32Array, size: number): Uint8Array {
  const ocean = new Uint8Array(size * size);
  const queue = new Int32Array(size * size);
  let head = 0;
  let tail = 0;
  const visit = (index: number): void => {
    if (ocean[index] === 0 && (elevation[index] ?? 0) < 0) {
      ocean[index] = 1;
      queue[tail++] = index;
    }
  };
  for (let i = 0; i < size; i++) {
    visit(i);
    visit((size - 1) * size + i);
    visit(i * size);
    visit(i * size + size - 1);
  }
  while (head < tail) {
    const index = queue[head++] ?? 0;
    const x = index % size;
    const y = (index - x) / size;
    for (let n = 0; n < ORTHOGONAL_COUNT; n++) {
      const nx = x + (NEIGHBOR_DX[n] ?? 0);
      const ny = y + (NEIGHBOR_DY[n] ?? 0);
      if (nx >= 0 && ny >= 0 && nx < size && ny < size) visit(ny * size + nx);
    }
  }
  return ocean;
}

/** Distance (in tiles, 8-connected) to the nearest ocean tile, capped at `maxDistance` + 1. */
export function distanceToOcean(ocean: Uint8Array, size: number, maxDistance: number): Uint8Array {
  const far = maxDistance + 1;
  const distance = new Uint8Array(size * size).fill(far);
  const queue = new Int32Array(size * size);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < ocean.length; i++) {
    if (ocean[i] === 1) {
      distance[i] = 0;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const index = queue[head++] ?? 0;
    const next = (distance[index] ?? far) + 1;
    if (next > maxDistance) continue;
    const x = index % size;
    const y = (index - x) / size;
    for (let n = 0; n < NEIGHBOR_DX.length; n++) {
      const nx = x + (NEIGHBOR_DX[n] ?? 0);
      const ny = y + (NEIGHBOR_DY[n] ?? 0);
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const neighbor = ny * size + nx;
      if ((distance[neighbor] ?? 0) > next) {
        distance[neighbor] = next;
        queue[tail++] = neighbor;
      }
    }
  }
  return distance;
}
