import { NEIGHBOR_DX, NEIGHBOR_DY, ORTHOGONAL_COUNT } from './grid';
import { MinHeap } from './min-heap';
import type { HydrologyParams } from './params';

/** Surface water of a tile. */
export const Water = { None: 0, River: 1, Lake: 2 } as const;

export interface DrainageResult {
  /** Elevation with depressions filled (meters); equals the input outside basins. */
  filled: Float64Array;
  /** Downstream tile of each land tile, or -1 (ocean tiles and map-border outlets). */
  flowTo: Int32Array;
  /** Land tiles from the most downstream to the most upstream. */
  landOrder: Int32Array;
}

/**
 * "Priority-flood" depression filling: water rises from the ocean inland, so every land tile
 * gets a path that strictly descends (by at least `epsilon`) to the ocean. Basins get filled
 * up to their overflow point: they are where lakes may form.
 */
export function computeDrainage(elevation: Float32Array, ocean: Uint8Array, size: number, epsilon: number): DrainageResult {
  const count = size * size;
  const filled = new Float64Array(count);
  const flowTo = new Int32Array(count).fill(-1);
  const visited = new Uint8Array(count);
  const landOrder = new Int32Array(count);
  let landCount = 0;
  const heap = new MinHeap(count);

  for (let i = 0; i < count; i++) {
    const x = i % size;
    const y = (i - x) / size;
    const onBorder = x === 0 || y === 0 || x === size - 1 || y === size - 1;
    if (ocean[i] === 1 ? touchesLand(ocean, size, x, y) : onBorder) {
      filled[i] = elevation[i] ?? 0;
      visited[i] = 1;
      heap.push(i, filled[i] ?? 0);
    } else if (ocean[i] === 1) {
      filled[i] = elevation[i] ?? 0;
      visited[i] = 1;
    }
  }

  while (heap.size > 0) {
    const index = heap.pop();
    if (ocean[index] === 0) landOrder[landCount++] = index;
    const level = (filled[index] ?? 0) + epsilon;
    const x = index % size;
    const y = (index - x) / size;
    // Water only flows through the 4 sides of a tile (never diagonally): rivers go in steps.
    for (let n = 0; n < ORTHOGONAL_COUNT; n++) {
      const nx = x + (NEIGHBOR_DX[n] ?? 0);
      const ny = y + (NEIGHBOR_DY[n] ?? 0);
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const neighbor = ny * size + nx;
      if (visited[neighbor] === 1) continue;
      visited[neighbor] = 1;
      filled[neighbor] = Math.max(elevation[neighbor] ?? 0, level);
      flowTo[neighbor] = index;
      heap.push(neighbor, filled[neighbor] ?? 0);
    }
  }
  return { filled, flowTo, landOrder: landOrder.slice(0, landCount) };
}

function touchesLand(ocean: Uint8Array, size: number, x: number, y: number): boolean {
  for (let n = 0; n < ORTHOGONAL_COUNT; n++) {
    const nx = x + (NEIGHBOR_DX[n] ?? 0);
    const ny = y + (NEIGHBOR_DY[n] ?? 0);
    if (nx >= 0 && ny >= 0 && nx < size && ny < size && ocean[ny * size + nx] === 0) return true;
  }
  return false;
}

/** Sum of the rain fallen on each tile and on everything upstream of it. */
export function accumulateFlow(drainage: DrainageResult, rainfall: Float32Array): Float32Array {
  const flow = new Float32Array(rainfall.length);
  const { landOrder, flowTo } = drainage;
  for (let k = landOrder.length - 1; k >= 0; k--) {
    const index = landOrder[k] ?? 0;
    const total = (flow[index] ?? 0) + (rainfall[index] ?? 0);
    flow[index] = total;
    const down = flowTo[index] ?? -1;
    if (down >= 0) flow[down] = (flow[down] ?? 0) + total;
  }
  return flow;
}

/**
 * Lakes: connected filled basins deeper than `lakeMinDepthMeters` that receive enough water.
 * Rivers: land tiles (not lakes) whose accumulated flow reaches `riverMinFlow`.
 */
export function computeSurfaceWater(
  elevation: Float32Array,
  drainage: DrainageResult,
  flow: Float32Array,
  ocean: Uint8Array,
  size: number,
  params: HydrologyParams,
): { water: Uint8Array; lakeCount: number } {
  const water = new Uint8Array(size * size);
  const lakeCount = markLakes(elevation, drainage.filled, flow, size, params, water);
  for (let i = 0; i < water.length; i++) {
    if (ocean[i] === 0 && water[i] === Water.None && (flow[i] ?? 0) >= params.riverMinFlow) water[i] = Water.River;
  }
  return { water, lakeCount };
}

function markLakes(
  elevation: Float32Array,
  filled: Float64Array,
  flow: Float32Array,
  size: number,
  params: HydrologyParams,
  water: Uint8Array,
): number {
  const count = size * size;
  const inBasin = (i: number): boolean => (filled[i] ?? 0) - (elevation[i] ?? 0) > params.lakeMinDepthMeters;
  const seen = new Uint8Array(count);
  const component = new Int32Array(count);
  let lakes = 0;
  for (let start = 0; start < count; start++) {
    if (seen[start] === 1 || !inBasin(start)) continue;
    let length = 0;
    let maxFlow = 0;
    seen[start] = 1;
    component[length++] = start;
    for (let k = 0; k < length; k++) {
      const index = component[k] ?? 0;
      maxFlow = Math.max(maxFlow, flow[index] ?? 0);
      const x = index % size;
      const y = (index - x) / size;
      for (let n = 0; n < ORTHOGONAL_COUNT; n++) {
        const nx = x + (NEIGHBOR_DX[n] ?? 0);
        const ny = y + (NEIGHBOR_DY[n] ?? 0);
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const neighbor = ny * size + nx;
        if (seen[neighbor] === 0 && inBasin(neighbor)) {
          seen[neighbor] = 1;
          component[length++] = neighbor;
        }
      }
    }
    if (maxFlow < params.lakeMinInflow) continue;
    lakes++;
    for (let k = 0; k < length; k++) water[component[k] ?? 0] = Water.Lake;
  }
  return lakes;
}

/** A river's mouth: a river tile that flows into the ocean, a lake, or off the map. */
export function countRiverMouths(water: Uint8Array, flowTo: Int32Array): number {
  let mouths = 0;
  for (let i = 0; i < water.length; i++) {
    if (water[i] !== Water.River) continue;
    const down = flowTo[i] ?? -1;
    if (down < 0 || water[down] !== Water.River) mouths++;
  }
  return mouths;
}
