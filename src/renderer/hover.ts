import type { ClimateState } from '../sim/systems/world/climate-state';
import type { Inspection, LifeTables, WorldSnapshot } from '../shared/messages';
import { animalLines, tileLifeLines } from './hud/life-lines';
import { describeTile } from './hud/tooltip';
import type { AnimalLayer } from './life/animal-layer';
import type { SimClient } from './sim-client';
import { VIEW } from './view-settings';

export interface HoverTarget {
  tile: number;
  /** Uid of the animal under the cursor, or -1. */
  animalUid: number;
}

/**
 * What is under the mouse, and its details: asks the simulation (asynchronously) for the plant,
 * grass, fish or animal, and builds the tooltip lines from the latest answer.
 */
export class Hover {
  private requestId = 0;
  private lastRequestAt = 0;
  private lastKey = '';
  private inspection: Inspection | null = null;

  constructor(
    private readonly sim: SimClient,
    private readonly animals: AnimalLayer,
  ) {}

  receive(inspection: Inspection): void {
    if (inspection.requestId === this.requestId) this.inspection = inspection;
  }

  reset(): void {
    this.inspection = null;
    this.lastKey = '';
  }

  /** The target under a point (tile coordinates), given the current zoom. */
  targetAt(world: WorldSnapshot, tileX: number, tileY: number, pixelsPerTile: number): HoverTarget | null {
    const x = Math.floor(tileX);
    const y = Math.floor(tileY);
    if (x < 0 || y < 0 || x >= world.size || y >= world.size) return null;
    let animalUid = -1;
    const fauna = this.animals.snapshot;
    if (fauna && pixelsPerTile >= VIEW.animalMinPixelsPerTile) {
      const k = this.animals.pick(tileX, tileY, VIEW.animalPickTiles);
      if (k >= 0) animalUid = fauna.uid[k]!;
    }
    return { tile: y * world.size + x, animalUid };
  }

  lines(world: WorldSnapshot, climate: ClimateState | null, life: LifeTables, daysPerYear: number, target: HoverTarget, now: number): string[] {
    const key = `${target.tile}:${target.animalUid}`;
    if (key !== this.lastKey || now - this.lastRequestAt > VIEW.inspectEveryMs) {
      if (key !== this.lastKey) this.inspection = null;
      this.lastKey = key;
      this.lastRequestAt = now;
      this.sim.inspect(++this.requestId, target.tile, target.animalUid);
    }
    const inspection = this.inspection;
    if (target.animalUid >= 0 && inspection?.animal) return animalLines(inspection.animal, life, daysPerYear);
    const x = target.tile % world.size;
    const lines = describeTile(world, climate, x, (target.tile - x) / world.size);
    if (inspection && inspection.tile === target.tile) lines.splice(lines.length - 1, 0, ...tileLifeLines(inspection, life, daysPerYear));
    return lines;
  }
}
