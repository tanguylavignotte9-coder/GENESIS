/** Measures of the simulation thread over the last seconds: computation time and speed really reached. */
const WINDOW_LOOPS = 60;
const MS_PER_SECOND = 1000;

interface Sample {
  realMs: number;
  computeMs: number;
  ticks: number;
}

export class PerfMeter {
  private samples: Sample[] = [];
  private lastMsPerDay = 0;

  reset(): void {
    this.samples = [];
    this.lastMsPerDay = 0;
  }

  add(realMs: number, computeMs: number, ticks: number): void {
    this.samples.push({ realMs, computeMs, ticks });
    if (this.samples.length > WINDOW_LOOPS) this.samples.shift();
  }

  /**
   * `budgetShare`: share of the real time the thread may spend computing. The budget used is 1 (100 %)
   * when the simulation uses all of it: beyond, the game slows down.
   */
  summary(ticksPerDay: number, ticksPerRealSecond: number, budgetShare: number): { msPerDay: number; busyShare: number; actualSpeed: number } {
    let real = 0;
    let compute = 0;
    let ticks = 0;
    for (const sample of this.samples) {
      real += sample.realMs;
      compute += sample.computeMs;
      ticks += sample.ticks;
    }
    // While paused, keep showing the last measured cost of a day.
    if (ticks > 0) this.lastMsPerDay = compute / (ticks / ticksPerDay);
    return {
      msPerDay: this.lastMsPerDay,
      busyShare: real > 0 ? Math.min(1, compute / (real * budgetShare)) : 0,
      actualSpeed: real > 0 ? ticks / ticksPerRealSecond / (real / MS_PER_SECOND) : 0,
    };
  }
}
