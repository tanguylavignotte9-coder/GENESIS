import { SimClock } from './clock';
import { Rng } from './rng';
import type { GameData } from './game-data';

/**
 * The simulated world. At this stage it only holds the seed, the random
 * generator and the clock; systems (world, individuals…) come in later steps.
 */
export class Simulation {
  readonly seed: number;
  readonly data: GameData;
  readonly rng: Rng;
  readonly clock = new SimClock();

  constructor(seed: number, data: GameData) {
    this.seed = seed;
    this.data = data;
    this.rng = new Rng(seed);
  }

  /** Advances the simulation by `ticks` steps. */
  step(ticks: number): void {
    for (let i = 0; i < ticks; i++) {
      this.clock.advance();
    }
  }
}
