import { startAnomalyYear } from '../systems/world/anomalies';
import { ClimateState } from '../systems/world/climate-state';
import { buildSeasonRows, updateDailyClimate, type SeasonRows } from '../systems/world/seasons';
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
  private readonly seasonRows: SeasonRows;
  /** Incremented each time the climate of the moment changes (once per game day). */
  climateVersion = 0;

  constructor(seed: number, data: GameData) {
    this.seed = seed;
    this.data = data;
    this.rng = new Rng(seed);
    this.world = generateWorld(data.worldgen, data.biomes, this.rng);
    this.climate = new ClimateState(this.world.size * this.world.size);
    this.seasonRows = buildSeasonRows(this.world.size, data.climate);
    this.startDay(this.date);
  }

  get date(): GameDate {
    return dateAtTick(this.clock.tick, this.data.time);
  }

  /** Advances the simulation by `ticks` steps. Daily and yearly work happens on day boundaries. */
  step(ticks: number): void {
    const { ticksPerDay } = this.data.time;
    for (let i = 0; i < ticks; i++) {
      this.clock.advance();
      if (this.clock.tick % ticksPerDay === 0) this.startDay(this.date);
    }
  }

  private startDay(date: GameDate): void {
    if (date.dayOfYear === 0) {
      startAnomalyYear(this.world, this.climate, this.data.climate.anomalies, this.rng, this.journal, this.clock.tick);
    }
    updateDailyClimate(this.world, this.climate, this.seasonRows, this.data.climate, date.dayOfYear, daysPerYear(this.data.time));
    this.climateVersion++;
  }
}
