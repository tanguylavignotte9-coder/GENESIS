import { NEIGHBOR_DX, NEIGHBOR_DY } from '../world/grid';
import { Water } from '../world/hydrology';
import type { World } from '../world/world';

/**
 * For each land tile: the next tile on a path over land toward the nearest river or lake
 * (within `maxDistance`), or -1. Water tiles point to themselves. Computed once per world.
 */
export function pathToFreshWater(world: World, maxDistance: number): Int32Array {
  const size = world.size;
  const nearest = new Int32Array(size * size).fill(-1);
  const distance = new Uint16Array(size * size).fill(0xffff);
  const queue = new Int32Array(size * size);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < nearest.length; i++) {
    if (world.water[i] !== Water.None) {
      nearest[i] = i;
      distance[i] = 0;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const index = queue[head++]!;
    const next = distance[index]! + 1;
    if (next > maxDistance) continue;
    const x = index % size;
    const y = (index - x) / size;
    for (let n = 0; n < NEIGHBOR_DX.length; n++) {
      const nx = x + NEIGHBOR_DX[n]!;
      const ny = y + NEIGHBOR_DY[n]!;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const j = ny * size + nx;
      if (world.ocean[j] === 1 || distance[j]! <= next) continue;
      distance[j] = next;
      nearest[j] = index;
      queue[tail++] = j;
    }
  }
  return nearest;
}

/** True if an animal standing on (x, y) can drink: on a river, or next to a river or lake. */
export function canDrink(world: World, x: number, y: number): boolean {
  const size = world.size;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size && world.water[ny * size + nx] !== Water.None) return true;
    }
  }
  return false;
}
