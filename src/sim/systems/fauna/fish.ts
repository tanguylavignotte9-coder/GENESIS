import { Water } from '../world/hydrology';
import type { World } from '../world/world';
import type { FaunaParams } from './params';

/** Fish are not individuals (yet): each water tile holds a stock that renews. */
export class FishStock {
  readonly amount: Uint8Array;
  private readonly capacity: Float32Array;

  constructor(
    private readonly world: World,
    private readonly params: FaunaParams['fish'],
  ) {
    const count = world.size * world.size;
    this.amount = new Uint8Array(count);
    this.capacity = new Float32Array(count);
    const share = params.capacityByWater;
    for (let i = 0; i < count; i++) {
      const water = world.water[i];
      let capacity = 0;
      if (water === Water.River) capacity = share.river;
      else if (water === Water.Lake) capacity = share.lake;
      else if (world.ocean[i] === 1) capacity = world.elevation[i]! > -params.coastMaxDepthMeters ? share.coast : share.openSea;
      this.capacity[i] = capacity * params.maxAmount;
      this.amount[i] = Math.round(this.capacity[i]!);
    }
  }

  /** Regrowth, one tile in `updateIntervalDays` per day. */
  dailyUpdate(absoluteDay: number): void {
    const interval = this.params.updateIntervalDays;
    const gain = this.params.regrowthPerDay * interval;
    for (let i = absoluteDay % interval; i < this.amount.length; i += interval) {
      const capacity = this.capacity[i]!;
      if (capacity > 0) this.amount[i] = Math.round(Math.min(capacity, this.amount[i]! + gain));
    }
  }

  /** Fish reachable from a land tile (the tile itself if it is a river, and its neighbours). */
  availableNear(x: number, y: number): number {
    let total = 0;
    this.forEachNear(x, y, (i) => (total += this.amount[i]!));
    return total;
  }

  takeNear(x: number, y: number, wanted: number): number {
    let taken = 0;
    this.forEachNear(x, y, (i) => {
      const take = Math.min(wanted - taken, this.amount[i]!);
      this.amount[i] = this.amount[i]! - take;
      taken += take;
    });
    return taken;
  }

  private forEachNear(x: number, y: number, visit: (index: number) => void): void {
    const size = this.world.size;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < size && ny < size && this.capacity[ny * size + nx]! > 0) visit(ny * size + nx);
      }
    }
  }
}
