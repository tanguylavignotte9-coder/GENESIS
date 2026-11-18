import type { FloraSystem } from '../flora/flora-system';
import { Water } from '../world/hydrology';
import type { World } from '../world/world';
import type { HumanParams } from './params';

const METERS_PER_100 = 100;

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
