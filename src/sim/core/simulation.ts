import { generateWorld, type World } from '../systems/world/world';
import { SimClock } from './clock';
import type { GameData } from './game-data';
import { Rng } from './rng';

/**
 * The simulated world: seed, random generator, clock and the generated map.
 * Creating a Simulation generates its world (deterministic for a given seed and data).
 */
export class Simulation {
  readonly seed: number;
  readonly data: GameData;
  readonly rng: Rng;
  readonly clock = new SimClock();
  readonly world: World;

  constructor(seed: number, data: GameData) {
    this.seed = seed;
    this.data = data;
    this.rng = new Rng(seed);
    this.world = generateWorld(data.worldgen, data.biomes, this.rng);
  }

  /** Advances the simulation by `ticks` steps. */
  step(ticks: number): void {
    for (let i = 0; i < ticks; i++) {
      this.clock.advance();
    }
  }
}
