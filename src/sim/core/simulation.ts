import { FaunaSystem } from '../systems/fauna/fauna-system';
import { FloraSystem } from '../systems/flora/flora-system';
import { startAnomalyYear } from '../systems/world/anomalies';
import { ClimateState } from '../systems/world/climate-state';
import { generateWorld, type World } from '../systems/world/world';
import { dateAtTick, type GameDate } from './calendar';
import { SimClock } from './clock';
import type { GameData } from './game-data';
import { Journal } from './journal';
import { Rng } from './rng';
import { daysPerYear } from './time-params';

/**
 * The simulated world: seed, random generator, clock, generated map, climate of the moment
 * and causal journal. Creating a Simulation generates its world and starts year 1.
 */
export class Simulation {
  readonly seed: number;
  readonly data: GameData;
  readonly rng: Rng;
  readonly clock = new SimClock();
  readonly journal = new Journal();
  readonly world: World;
  readonly climate: ClimateState;
  readonly flora: FloraSystem;
  readonly fauna: FaunaSystem;
  private readonly ticksPerStep: number;
  /** Incremented each time the climate of the moment changes (once per game day). */
  climateVersion = 0;

  constructor(seed: number, data: GameData) {
    this.seed = seed;
    this.data = data;
    this.rng = new Rng(seed);
    this.world = generateWorld(data.worldgen, data.biomes, this.rng);
    const yearDays = daysPerYear(data.time);
    this.climate = new ClimateState(this.world, data.climate, yearDays);
    this.flora = new FloraSystem(this.world, this.climate, data.flora, yearDays, this.rng);
    this.fauna = new FaunaSystem(this.world, this.climate, this.flora, data.fauna, yearDays, data.time.ticksPerDay, this.rng);
    this.ticksPerStep = Math.max(1, Math.round(data.time.ticksPerDay / data.fauna.stepsPerDay));
    this.startDay(this.date);
  }

  get date(): GameDate {
    return dateAtTick(this.clock.tick, this.data.time);
  }

  /** Advances the simulation by `ticks` steps. Daily and yearly work happens on day boundaries. */
  step(ticks: number): void {
    const { ticksPerDay } = this.data.time;
    let remaining = ticks;
    while (remaining > 0) {
      // Jump straight to the next tick where something happens (an animal step or a new day).
      const tick = this.clock.tick;
      const toNext = Math.min(this.ticksPerStep - (tick % this.ticksPerStep), ticksPerDay - (tick % ticksPerDay), remaining);
      this.clock.advance(toNext);
      remaining -= toNext;
      if (this.clock.tick % ticksPerDay === 0) this.startDay(this.date);
      if (this.clock.tick % this.ticksPerStep === 0) this.fauna.runStep();
    }
  }

  /** Daily (and yearly) work, in a fixed order: climate, plants, animals. */
  private startDay(date: GameDate): void {
    const tick = this.clock.tick;
    if (date.dayOfYear === 0) {
      this.fauna.census.onYearEnd(this.climate.anomalies, this.journal, tick);
      startAnomalyYear(this.world, this.climate, this.data.climate.anomalies, this.rng, this.journal, tick);
      this.fauna.census.onYearStart(this.climate.anomalies);
    }
    this.climate.setDay(date.dayOfYear);
    this.climateVersion++;
    this.flora.dailyUpdate(date.absoluteDay);
    this.fauna.runDay(date.absoluteDay, date.dayOfYear, this.journal, tick);
  }
}
