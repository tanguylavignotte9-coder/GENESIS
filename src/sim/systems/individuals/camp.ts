import { NEIGHBOR_DX as SHARED_DX, NEIGHBOR_DY as SHARED_DY } from '../world/grid';
import { MinHeap } from '../world/min-heap';

/** Local copies of the neighbour offsets (hot loops). */
const NEIGHBOR_DX = Int8Array.from(SHARED_DX);
const NEIGHBOR_DY = Int8Array.from(SHARED_DY);
import type { Terrain } from './terrain';

export interface Hut {
  tile: number;
  /** People sleeping here (by family). */
  residents: number[];
}

/**
 * A tribe's camp: a campfire with its fuel, huts, and the way home from anywhere around
 * (a "flow field": for each nearby tile, the next tile toward the fire).
 * Structures are kept here until the buildings system arrives (step 6).
 */
export class Camp {
  /** Hours of fire left (0 = out). */
  fuel: number;
  readonly huts: Hut[] = [];
  readonly fireX: number;
  readonly fireY: number;
  private readonly radius: number;
  private readonly side: number;
  /** Next tile toward the fire, for each tile of the square area around the camp (-1 = unknown). */
  private readonly next: Int32Array;

  constructor(
    readonly id: number,
    readonly fireTile: number,
    private readonly size: number,
    homeRadius: number,
    fuel: number,
  ) {
    this.fuel = fuel;
    this.fireX = fireTile % size;
    this.fireY = (fireTile - this.fireX) / size;
    this.radius = homeRadius;
    this.side = 2 * homeRadius + 1;
    this.next = new Int32Array(this.side * this.side).fill(-1);
  }

  get lit(): boolean {
    return this.fuel > 0;
  }

  /** Dijkstra from the fire over the walkable tiles of the area. */
  computeWayHome(terrain: Terrain): void {
    const cost = new Float32Array(this.side * this.side).fill(Infinity);
    const heap = new MinHeap(this.side * this.side);
    const local = this.local(this.fireTile);
    cost[local] = 0;
    this.next[local] = this.fireTile;
    heap.push(local, 0);
    while (heap.size > 0) {
      const at = heap.pop();
      const lx = at % this.side;
      const ly = (at - lx) / this.side;
      const tile = this.global(lx, ly);
      for (let n = 0; n < NEIGHBOR_DX.length; n++) {
        const nlx = lx + NEIGHBOR_DX[n]!;
        const nly = ly + NEIGHBOR_DY[n]!;
        if (nlx < 0 || nly < 0 || nlx >= this.side || nly >= this.side) continue;
        const neighbor = this.global(nlx, nly);
        if (neighbor < 0 || !terrain.walkable(neighbor)) continue;
        const total = cost[at]! + terrain.stepCost(neighbor, tile, n >= 4);
        const nl = nly * this.side + nlx;
        if (total >= cost[nl]!) continue;
        cost[nl] = total;
        this.next[nl] = tile;
        heap.push(nl, total);
      }
    }
  }

  /** Next tile on the way to the fire from `tile`, or -1 if `tile` is outside the known territory. */
  stepHome(tile: number): number {
    const local = this.local(tile);
    return local < 0 ? -1 : this.next[local]!;
  }

  distanceTo(x: number, y: number): number {
    return Math.max(Math.abs(x - this.fireX), Math.abs(y - this.fireY));
  }

  private local(tile: number): number {
    const x = tile % this.size;
    const y = (tile - x) / this.size;
    const lx = x - this.fireX + this.radius;
    const ly = y - this.fireY + this.radius;
    return lx < 0 || ly < 0 || lx >= this.side || ly >= this.side ? -1 : ly * this.side + lx;
  }

  private global(lx: number, ly: number): number {
    const x = lx + this.fireX - this.radius;
    const y = ly + this.fireY - this.radius;
    return x < 0 || y < 0 || x >= this.size || y >= this.size ? -1 : y * this.size + x;
  }
}
