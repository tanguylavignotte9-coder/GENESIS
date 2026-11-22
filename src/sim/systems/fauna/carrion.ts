/**
 * Carcasses left by hunters: meat lying on a tile, eaten by meat eaters until it is gone or rotten.
 * Few at a time, kept as a small list.
 */
export class Carrion {
  /** Tile index and meat of each carcass. */
  readonly tiles: number[] = [];
  readonly meat: number[] = [];

  add(tile: number, meat: number): void {
    const at = this.tiles.indexOf(tile);
    if (at >= 0) this.meat[at] = this.meat[at]! + meat;
    else {
      this.tiles.push(tile);
      this.meat.push(meat);
    }
  }

  at(tile: number): number {
    const at = this.tiles.indexOf(tile);
    return at < 0 ? 0 : this.meat[at]!;
  }

  take(tile: number, wanted: number): number {
    const at = this.tiles.indexOf(tile);
    if (at < 0) return 0;
    const taken = Math.min(wanted, this.meat[at]!);
    this.meat[at] = this.meat[at]! - taken;
    if (this.meat[at]! <= 0) this.removeAt(at);
    return taken;
  }

  /** Nearest carcass tile within `radius` (Chebyshev) of (x, y), or -1. */
  nearest(x: number, y: number, radius: number, size: number): number {
    let best = -1;
    let bestDistance = radius + 1;
    for (const tile of this.tiles) {
      const tx = tile % size;
      const distance = Math.max(Math.abs(tx - x), Math.abs((tile - tx) / size - y));
      if (distance < bestDistance) {
        best = tile;
        bestDistance = distance;
      }
    }
    return best;
  }

  /** One day of rotting: each carcass keeps `kept(tile)` of its meat (by the warmth of its place); scraps disappear. */
  rot(kept: (tile: number) => number, minimum: number): void {
    for (let at = this.tiles.length - 1; at >= 0; at--) {
      this.meat[at] = this.meat[at]! * kept(this.tiles[at]!);
      if (this.meat[at]! < minimum) this.removeAt(at);
    }
  }

  private removeAt(at: number): void {
    this.tiles.splice(at, 1);
    this.meat.splice(at, 1);
  }
}
