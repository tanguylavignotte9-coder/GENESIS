import type { FloraSystem } from '../flora/flora-system';
import { Water } from '../world/hydrology';
import type { World } from '../world/world';
import type { HumanParams } from './params';

const METERS_PER_100 = 100;
/** Distance between two checks of a straight line (technical). */
const LINE_SAMPLE_TILES = 0.4;

/** Walking costs for humans: open ground 1, forests and fords cost more, slopes add, water blocks. */
export class Terrain {
  constructor(
    private readonly world: World,
    private readonly flora: FloraSystem,
    private readonly params: HumanParams['terrain'],
  ) {}

  walkable(index: number): boolean {
    return this.world.ocean[index] === 0 && this.world.water[index] !== Water.Lake;
  }

  /** Cost of stepping from `from` onto `to` (both walkable, neighbours). */
  stepCost(from: number, to: number, diagonal: boolean): number {
    let cost = diagonal ? Math.SQRT2 : 1;
    const plant = this.flora.speciesAt(to);
    if (plant?.kind === 'tree') cost *= this.params.forestCost;
    else if (plant?.kind === 'shrub') cost *= this.params.shrubCost;
    if (this.world.water[to] === Water.River) cost *= this.params.riverCost;
    const climb = Math.abs(Math.max(0, this.world.elevation[to]!) - Math.max(0, this.world.elevation[from]!));
    return cost + (climb / METERS_PER_100) * this.params.slopeCostPer100m;
  }

  /** Elevation of a tile above the sea (m). */
  elevation(index: number): number {
    return Math.max(0, this.world.elevation[index]!);
  }

  /**
   * Can one walk in a straight line from (ax, ay) to (bx, by) (decimal tiles) without going into
   * water nor through ground slower than `minSpeed`? Sampled every 0.4 tile (the path is drawn
   * straight only where the view is clear and the going no harder).
   */
  clearLine(ax: number, ay: number, bx: number, by: number, minSpeed: number): boolean {
    const size = this.world.size;
    const dx = bx - ax;
    const dy = by - ay;
    const samples = Math.ceil(Math.sqrt(dx * dx + dy * dy) / LINE_SAMPLE_TILES);
    let last = -1;
    for (let k = 1; k < samples; k++) {
      const tile = Math.floor(ay + (dy * k) / samples) * size + Math.floor(ax + (dx * k) / samples);
      if (tile === last) continue;
      last = tile;
      if (!this.walkable(tile) || this.speedOn(tile) < minSpeed - 1e-9) return false;
    }
    return true;
  }

  /** Speed factor of walking on a tile (1 = open flat ground). */
  speedOn(index: number): number {
    let cost = 1;
    const plant = this.flora.speciesAt(index);
    if (plant?.kind === 'tree') cost *= this.params.forestCost;
    else if (plant?.kind === 'shrub') cost *= this.params.shrubCost;
    if (this.world.water[index] === Water.River) cost *= this.params.riverCost;
    return 1 / cost;
  }
}
