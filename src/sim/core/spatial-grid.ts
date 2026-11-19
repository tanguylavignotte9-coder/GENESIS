/**
 * Coarse grid of cells listing the bodies inside (animals, humans), to find neighbours
 * (predators, prey, herd) without scanning everybody. Lists keep a deterministic order.
 */
export class SpatialGrid {
  readonly cellsPerSide: number;
  private readonly cells: number[][];
  /** Cells that held someone since the last clear (only those are emptied). */
  private readonly touched: number[] = [];
  private readonly isTouched: Uint8Array;

  constructor(
    mapSize: number,
    readonly cellTiles: number,
  ) {
    this.cellsPerSide = Math.ceil(mapSize / cellTiles);
    this.cells = Array.from({ length: this.cellsPerSide * this.cellsPerSide }, () => []);
    this.isTouched = new Uint8Array(this.cellsPerSide * this.cellsPerSide);
  }

  cellOf(x: number, y: number): number {
    return Math.floor(y / this.cellTiles) * this.cellsPerSide + Math.floor(x / this.cellTiles);
  }

  insert(slot: number, cell: number): void {
    this.cells[cell]!.push(slot);
    if (this.isTouched[cell] === 0) {
      this.isTouched[cell] = 1;
      this.touched.push(cell);
    }
  }

  remove(slot: number, cell: number): void {
    const list = this.cells[cell]!;
    const at = list.indexOf(slot);
    if (at < 0) return;
    list[at] = list[list.length - 1]!;
    list.pop();
  }

  /** Empties every cell (before a full rebuild). */
  clear(): void {
    for (const cell of this.touched) {
      this.cells[cell]!.length = 0;
      this.isTouched[cell] = 0;
    }
    this.touched.length = 0;
  }

  /**
   * Copies into `out` the beings of the cells overlapping the square of half-side `radius` around
   * (x, y) and returns how many (at most out.length). No callback: for the hottest loops.
   */
  gather(x: number, y: number, radius: number, out: Int32Array): number {
    const c0 = Math.max(0, Math.floor((x - radius) / this.cellTiles));
    const c1 = Math.min(this.cellsPerSide - 1, Math.floor((x + radius) / this.cellTiles));
    const r0 = Math.max(0, Math.floor((y - radius) / this.cellTiles));
    const r1 = Math.min(this.cellsPerSide - 1, Math.floor((y + radius) / this.cellTiles));
    let n = 0;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const list = this.cells[r * this.cellsPerSide + c]!;
        for (let k = 0; k < list.length && n < out.length; k++) out[n++] = list[k]!;
      }
    }
    return n;
  }

  /** Calls `visit` for every animal in the cells overlapping the square of half-side `radius`. */
  forEachNear(x: number, y: number, radius: number, visit: (slot: number) => void): void {
    const c0 = Math.max(0, Math.floor((x - radius) / this.cellTiles));
    const c1 = Math.min(this.cellsPerSide - 1, Math.floor((x + radius) / this.cellTiles));
    const r0 = Math.max(0, Math.floor((y - radius) / this.cellTiles));
    const r1 = Math.min(this.cellsPerSide - 1, Math.floor((y + radius) / this.cellTiles));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const list = this.cells[r * this.cellsPerSide + c]!;
        for (let k = 0; k < list.length; k++) visit(list[k]!);
      }
    }
  }
}
