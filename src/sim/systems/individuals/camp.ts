import { NEIGHBOR_DX as SHARED_DX, NEIGHBOR_DY as SHARED_DY } from '../world/grid';
import { MinHeap } from '../world/min-heap';
import type { Terrain } from './terrain';

/** Local copies of the neighbour offsets (hot loops). */
const NEIGHBOR_DX = Int8Array.from(SHARED_DX);
const NEIGHBOR_DY = Int8Array.from(SHARED_DY);

/**
 * A tribe's home: the heart of the camp (where the fire is or will be) and the way home from
 * anywhere around (a "flow field": for each nearby tile, the next tile toward the center).
 * Fire, huts and stock are buildings of the production system.
 */
export class Camp {
  center: number;
  centerX: number;
  centerY: number;
  /** Day of the last move (or of the settlement). */
  settledDay = 0;
  /** Journal event of the last move (-1 = none). */
  movedEvent = -1;
  /** Recent deaths by hunger of members (day and journal event): what pushes the adults to leave. */
  readonly hungerDeaths: { day: number; event: number }[] = [];
  private readonly radius: number;
  private readonly side: number;
  /** Next tile toward the center, for each tile of the square area around the camp (-1 = unknown). */
  private readonly next: Int32Array;

  constructor(
    readonly id: number,
    center: number,
    private readonly size: number,
    homeRadius: number,
  ) {
    this.center = center;
    this.centerX = center % size;
    this.centerY = (center - this.centerX) / size;
    this.radius = homeRadius;
    this.side = 2 * homeRadius + 1;
    this.next = new Int32Array(this.side * this.side).fill(-1);
  }

  /** The camp moves to a new place: new center, new way home. */
  relocate(center: number, terrain: Terrain): void {
    this.center = center;
    this.centerX = center % this.size;
    this.centerY = (center - this.centerX) / this.size;
    this.next.fill(-1);
    this.computeWayHome(terrain);
  }

  /** Dijkstra from the center over the walkable tiles of the area. */
  computeWayHome(terrain: Terrain): void {
    const cost = new Float32Array(this.side * this.side).fill(Infinity);
    const heap = new MinHeap(this.side * this.side);
    const local = this.local(this.center);
    cost[local] = 0;
    this.next[local] = this.center;
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

  /** Next tile on the way to the center from `tile`, or -1 if `tile` is outside the known territory. */
  stepHome(tile: number): number {
    const local = this.local(tile);
    return local < 0 ? -1 : this.next[local]!;
  }

  distanceTo(x: number, y: number): number {
    return Math.max(Math.abs(x - this.centerX), Math.abs(y - this.centerY));
  }

  private local(tile: number): number {
    const x = tile % this.size;
    const y = (tile - x) / this.size;
    const lx = x - this.centerX + this.radius;
    const ly = y - this.centerY + this.radius;
    return lx < 0 || ly < 0 || lx >= this.side || ly >= this.side ? -1 : ly * this.side + lx;
  }

  private global(lx: number, ly: number): number {
    const x = lx + this.centerX - this.radius;
    const y = ly + this.centerY - this.radius;
    return x < 0 || y < 0 || x >= this.size || y >= this.size ? -1 : y * this.size + x;
  }
}
