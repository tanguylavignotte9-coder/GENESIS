import { NEIGHBOR_DX as SHARED_DX, NEIGHBOR_DY as SHARED_DY } from '../world/grid';
import { MinHeap } from '../world/min-heap';

/** Local copies of the neighbour offsets (hot loops). */
const NEIGHBOR_DX = Int8Array.from(SHARED_DX);
const NEIGHBOR_DY = Int8Array.from(SHARED_DY);
import type { Terrain } from './terrain';

/**
 * A* on the tile grid, with reusable buffers (no allocation per search except the result).
 * Weighted heuristic (≥ 1) trades a little path length for speed; the search gives up after
 * `maxNodes` expanded tiles and returns null.
 */
export class Pathfinder {
  private readonly g: Float32Array;
  private readonly came: Int32Array;
  private readonly stamp: Int32Array;
  private readonly closed: Int32Array;
  private readonly heap: MinHeap;
  private search = 0;

  constructor(
    private readonly size: number,
    private readonly terrain: Terrain,
    public maxNodes: number,
    public heuristicWeight: number,
  ) {
    const n = size * size;
    this.g = new Float32Array(n);
    this.came = new Int32Array(n);
    this.stamp = new Int32Array(n);
    this.closed = new Int32Array(n);
    this.heap = new MinHeap(n);
  }

  /** Tiles from the one after `start` to `goal` included, or null if unreachable within the budget. */
  find(start: number, goal: number): Int32Array | null {
    if (start === goal) return new Int32Array(0);
    if (!this.terrain.walkable(goal)) return null;
    const size = this.size;
    const id = ++this.search;
    const gx = goal % size;
    const gy = (goal - gx) / size;
    const heuristic = (index: number): number => {
      const x = index % size;
      const dx = Math.abs(x - gx);
      const dy = Math.abs((index - x) / size - gy);
      return (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)) * this.heuristicWeight;
    };
    this.heap.clear();
    this.g[start] = 0;
    this.stamp[start] = id;
    this.came[start] = -1;
    this.heap.push(start, heuristic(start));
    let expanded = 0;
    while (this.heap.size > 0) {
      const current = this.heap.pop();
      if (current === goal) return this.rebuild(start, goal);
      if (this.closed[current] === id) continue;
      this.closed[current] = id;
      if (++expanded > this.maxNodes) return null;
      const cx = current % size;
      const cy = (current - cx) / size;
      for (let n = 0; n < NEIGHBOR_DX.length; n++) {
        const nx = cx + NEIGHBOR_DX[n]!;
        const ny = cy + NEIGHBOR_DY[n]!;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const next = ny * size + nx;
        if (this.closed[next] === id || !this.terrain.walkable(next)) continue;
        const cost = this.g[current]! + this.terrain.stepCost(current, next, n >= 4);
        if (this.stamp[next] === id && cost >= this.g[next]!) continue;
        this.stamp[next] = id;
        this.g[next] = cost;
        this.came[next] = current;
        this.heap.push(next, cost + heuristic(next));
      }
    }
    return null;
  }

  private rebuild(start: number, goal: number): Int32Array {
    const reversed: number[] = [];
    for (let at = goal; at !== start && at >= 0; at = this.came[at]!) reversed.push(at);
    return Int32Array.from(reversed.reverse());
  }
}

/**
 * Draws an A* path (tiles from the one after `start` to the goal) in straight lines where the view
 * is clear: from each kept point, the farthest point of the path (within `lookahead` steps) that can
 * be reached in a straight line over ground no harder than both ends is kept, the tiles in between
 * are dropped. Elsewhere (around water, along a forest edge) the path keeps its turns, which the
 * walker rounds off. The last tile (the goal) is always kept.
 */
export function smoothPath(terrain: Terrain, size: number, start: number, path: Int32Array, lookahead: number): Int32Array {
  if (path.length <= 1) return path;
  const kept: number[] = [];
  let anchor = start;
  let at = -1;
  while (at < path.length - 1) {
    const ax = (anchor % size) + 0.5;
    const ay = Math.floor(anchor / size) + 0.5;
    const anchorSpeed = terrain.speedOn(anchor);
    let next = at + 1;
    for (let k = Math.min(path.length - 1, at + lookahead); k > at + 1; k--) {
      const tile = path[k]!;
      const minSpeed = Math.min(anchorSpeed, terrain.speedOn(tile));
      if (terrain.clearLine(ax, ay, (tile % size) + 0.5, Math.floor(tile / size) + 0.5, minSpeed)) {
        next = k;
        break;
      }
    }
    kept.push(path[next]!);
    anchor = path[next]!;
    at = next;
  }
  return Int32Array.from(kept);
}
