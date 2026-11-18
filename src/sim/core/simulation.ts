import { FaunaSystem } from '../systems/fauna/fauna-system';
import { FloraSystem } from '../systems/flora/flora-system';
import { IndividualsSystem } from '../systems/individuals/individuals-system';
import { ProductionSystem, type BodyFacts } from '../systems/production/production-system';
import { WeatherState } from '../systems/world/weather';
import { startAnomalyYear } from '../systems/world/anomalies';
import { ClimateState } from '../systems/world/climate-state';
import { generateWorld, type World } from '../systems/world/world';
import { dateAtTick, type GameDate } from './calendar';
import { SimClock } from './clock';
import type { GameData } from './game-data';
import { Interactions } from './interactions';
import { Journal } from './journal';
import { Rng } from './rng';
import { daysPerYear } from './time-params';
import { setAt, type PathSegment } from './variables';
import type { DataKey } from './game-data';

const HOURS_PER_DAY = 24;

/** What the production system needs to know of the human body. */
function bodyFacts(data: GameData): BodyFacts {
  const { body, needs } = data.humans;
  return {
    carryCapacity: body.carryCapacity,
    dailyFood: (needs.hungerPerHour * HOURS_PER_DAY) / body.hungerPerFoodUnit,
    perceptionTiles: body.perceptionTiles,
    skillIds: data.humans.skills.map((skill) => skill.id),
  };
}

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
  /** How beings of different systems see and act on each other (predators and humans…). */
  readonly interactions = new Interactions(this.journal);
  readonly world: World;
  readonly climate: ClimateState;
  readonly flora: FloraSystem;
  readonly fauna: FaunaSystem;
  readonly weather: WeatherState;
  readonly production: ProductionSystem;
  readonly humans: IndividualsSystem;
  private readonly ticksPerStep: number;
  private readonly ticksPerHumanStep: number;
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
    this.fauna = new FaunaSystem(this.world, this.climate, this.flora, data.fauna, yearDays, data.time.ticksPerDay, this.rng, this.interactions);
    this.weather = new WeatherState(this.world.size, data.weather);
    this.ticksPerStep = Math.max(1, Math.round(data.time.ticksPerDay / data.fauna.stepsPerDay));
    this.ticksPerHumanStep = Math.max(1, Math.round(data.time.ticksPerDay / HOURS_PER_DAY / data.humans.stepsPerHour));
    this.startDay(this.date);
    this.production = new ProductionSystem(
      this.world,
      this.climate,
      this.flora,
      this.fauna,
      { knowledge: data.knowledge, resources: data.resources, items: data.items, recipes: data.recipes, buildings: data.buildings, params: data.production },
      bodyFacts(data),
      this.rng,
      this.interactions,
      this.journal,
    );
    this.production.ticksPerHour = data.time.ticksPerDay / HOURS_PER_DAY;
    this.humans = new IndividualsSystem(
      this.world,
      this.climate,
      this.weather,
      this.flora,
      this.fauna,
      data.humans,
      data.knowledge,
      this.production,
      this.rng,
      this.journal,
      this.clock.tick,
      this.interactions,
    );
  }

  /**
   * Applies changes of "live" variables (already validated by the variables workshop) to the data
   * the systems read, then lets each system recompute what it derived from them.
   */
  applyLiveChanges(changes: readonly { dataKey: DataKey; path: readonly PathSegment[]; value: unknown }[]): void {
    for (const change of changes) setAt(this.data[change.dataKey], change.path, change.value);
    this.climate.refreshParams();
    this.flora.refreshParams();
    this.fauna.refreshParams();
    this.production.refreshParams(bodyFacts(this.data));
    this.humans.refreshParams();
  }

  /** Hour of the day, 0..24 (fractional). */
  get hour(): number {
    const { ticksPerDay } = this.data.time;
    return ((this.clock.tick % ticksPerDay) / ticksPerDay) * HOURS_PER_DAY;
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
      const toNext = Math.min(
        this.ticksPerStep - (tick % this.ticksPerStep),
        this.ticksPerHumanStep - (tick % this.ticksPerHumanStep),
        ticksPerDay - (tick % ticksPerDay),
        remaining,
      );
      this.clock.advance(toNext);
      remaining -= toNext;
      const now = this.clock.tick;
      if (now % ticksPerDay === 0) this.startDay(this.date);
      if (now % this.ticksPerStep === 0) this.fauna.runStep(now);
      if (now % this.ticksPerHumanStep === 0) {
        this.production.runStep(1 / this.data.humans.stepsPerHour, now);
        this.humans.runStep(this.hour, Math.floor(now / ticksPerDay), this.journal, now);
      }
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
    this.weather.newDay(this.climate, this.rng);
    this.climateVersion++;
    this.flora.dailyUpdate(date.absoluteDay);
    this.fauna.runDay(date.absoluteDay, date.dayOfYear, this.journal, tick);
    // The production system is created after the first day starts (it needs the world's life).
    if (this.production) this.production.dailyUpdate();
  }
}
