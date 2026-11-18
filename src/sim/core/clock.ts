/**
 * Simulation clock: counts discrete simulation steps ("ticks").
 * It knows nothing about real time; the worker decides when to advance it.
 */
export class SimClock {
  private ticks = 0;

  get tick(): number {
    return this.ticks;
  }

  advance(ticks = 1): void {
    this.ticks += ticks;
  }
}
