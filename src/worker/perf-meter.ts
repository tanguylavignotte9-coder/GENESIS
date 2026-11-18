/** Measures of the simulation thread over the last seconds: computation time and speed really reached. */
const WINDOW_LOOPS = 60;

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

  summary(ticksPerDay: number, ticksPerRealSecond: number): { msPerDay: number; busyShare: number; actualSpeed: number } {
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
      busyShare: real > 0 ? compute / real : 0,
      actualSpeed: real > 0 ? ticks / ticksPerRealSecond / (real / 1000) : 0,
    };
  }
}
