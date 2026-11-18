import type { Rng } from '../../core/rng';
import { Water } from '../world/hydrology';
import type { ClimateState } from '../world/climate-state';
import type { World } from '../world/world';
import { localDayOfYear, speciesFitness } from './fitness';
import { AGE_MAX_DAYS, BYTE_MAX, FloraState } from './flora-state';
import type { FloraParams, PlantSpecies } from './params';

/** Fraction of its lifespan over which an old plant may die (after its maximum age). */
const OLD_AGE_SPREAD = 0.2;
/** A plant must be at least this healthy (0..1) to spread seeds. */
const MIN_HEALTH_TO_SEED = 0.3;

/**
 * Wild plants: one individual per land tile at most, plus a grass cover per tile.
 * Each tile is updated once every `updateIntervalDays` days (spread over the days), never daily.
 */
export class FloraSystem {
  readonly state: FloraState;
  private readonly size: number;
  private readonly grassCoverOfBiome: Float32Array;
  private readonly initialCoverOfBiome: Float32Array;
  private shadeOfSpecies: Float32Array;

  constructor(
    private readonly world: World,
    private readonly climate: ClimateState,
    readonly params: FloraParams,
    private readonly daysPerYear: number,
    private readonly rng: Rng,
  ) {
    this.size = world.size;
    this.state = new FloraState(world.size * world.size);
    const biomeIds = world.biomes.biomes.map((biome) => biome.id);
    this.grassCoverOfBiome = Float32Array.from(biomeIds, (id) => params.grass.coverByBiome[id] ?? 0);
    this.initialCoverOfBiome = Float32Array.from(biomeIds, (id) => params.initialCoverByBiome[id] ?? 0);
    this.shadeOfSpecies = new Float32Array(0);
    this.refreshParams();
    this.populate();
  }

  /** Recomputes what is derived from the parameters (after a live change in the variables workshop). */
  refreshParams(): void {
    const { params } = this;
    this.grassCoverOfBiome.set(this.world.biomes.biomes.map((biome) => params.grass.coverByBiome[biome.id] ?? 0));
    this.shadeOfSpecies = Float32Array.from(params.species, (species) => params.shadeByKind[species.kind]);
  }

  /** A plant can only grow on dry land (rivers are fords, lakes are water). */
  isPlantable(index: number): boolean {
    return this.world.ocean[index] === 0 && this.world.water[index] !== Water.Lake;
  }

  speciesAt(index: number): PlantSpecies | undefined {
    const k = this.state.species[index]!;
    return k === 0 ? undefined : this.params.species[k - 1];
  }

  /** Updates the tiles whose turn it is (1 in `updateIntervalDays`), for the given absolute day. */
  dailyUpdate(absoluteDay: number): void {
    const interval = this.params.updateIntervalDays;
    const count = this.size * this.size;
    for (let i = absoluteDay % interval; i < count; i += interval) {
      if (!this.isPlantable(i)) continue;
      if (this.state.species[i] !== 0) this.updatePlant(i, interval);
      this.updateGrass(i, interval);
    }
  }

  /** Produce (berries, roots…) available on a tile right now, for a resource id. */
  produceAvailable(index: number, resource: string): number {
    const species = this.speciesAt(index);
    const produce = species?.produce;
    if (!species || !produce || produce.resource !== resource) return 0;
    if (this.state.ageDays[index]! < species.maturityYears * this.daysPerYear) return 0;
    const day = this.localDay(index);
    if (day < produce.fromDay || day >= produce.toDay) return 0;
    const total = (produce.amount * this.state.health[index]!) / BYTE_MAX;
    return Math.max(0, total - this.state.eaten[index]!);
  }

  /** Takes up to `amount` of a tile's produce; returns what was taken. */
  takeProduce(index: number, resource: string, amount: number): number {
    const taken = Math.min(amount, this.produceAvailable(index, resource));
    this.state.eaten[index] = Math.min(BYTE_MAX, this.state.eaten[index]! + Math.ceil(taken));
    return taken;
  }

  /** Damages the plant of a tile by `share` of its health (branches broken off); never kills it outright. */
  harmPlant(index: number, share: number): void {
    const harm = Math.round(share * BYTE_MAX);
    this.state.health[index] = Math.max(1, this.state.health[index]! - harm);
  }

  /** Grazing: takes up to `amount` of grass not buried under snow; returns what was taken. */
  takeGrass(index: number, amount: number): number {
    const reachable = this.state.grass[index]! * (1 - this.climate.snowAt(index));
    const taken = Math.min(amount, Math.floor(reachable));
    this.state.grass[index] = this.state.grass[index]! - taken;
    return taken;
  }

  grassReachable(index: number): number {
    return this.state.grass[index]! * (1 - this.climate.snowAt(index));
  }

  /** Number of living plants (all species). */
  countLiving(): number {
    let count = 0;
    for (const k of this.state.species) if (k !== 0) count++;
    return count;
  }

  /** Number of living plants of each species. */
  countBySpecies(): number[] {
    const counts = new Array<number>(this.params.species.length).fill(0);
    for (const k of this.state.species) if (k !== 0) counts[k - 1]!++;
    return counts;
  }

  private localDay(index: number): number {
    const northern = index < (this.size * this.size) / 2;
    return localDayOfYear(this.climate.dayOfYear, northern, this.daysPerYear);
  }

  private fitness(species: PlantSpecies, index: number): number {
    return speciesFitness(species, this.world.temperature[index]!, this.world.humidity[index]!, this.params);
  }

  private grassCapacity(index: number): number {
    const k = this.state.species[index]!;
    const shade = k === 0 ? 1 : this.shadeOfSpecies[k - 1]!;
    return this.params.grass.maxAmount * this.grassCoverOfBiome[this.world.biome[index]!]! * shade;
  }

  private updateGrass(index: number, days: number): void {
    const { grass } = this.params;
    const capacity = this.grassCapacity(index);
    let amount = this.state.grass[index]!;
    if (this.climate.temperatureAt(index) > grass.minGrowthCelsius) {
      amount += grass.growthPerDay * days * Math.min(1, this.climate.humidityAt(index) / grass.idealHumidity);
    }
    this.state.grass[index] = Math.round(Math.min(amount, capacity));
  }

  private updatePlant(index: number, days: number): void {
    const species = this.params.species[this.state.species[index]! - 1]!;
    const { health: rules } = this.params;
    const temperature = this.climate.temperatureAt(index);
    const humidity = this.climate.humidityAt(index);
    const fitness = this.fitness(species, index);

    let damage = (1 - fitness) * rules.misfitDamagePerDay * days;
    if (temperature < species.frostCelsius) damage += (species.frostCelsius - temperature) * rules.frostDamagePerDegreeDay * days;
    if (humidity < species.droughtHumidity) {
      damage += ((species.droughtHumidity - humidity) / Math.max(species.droughtHumidity, 0.01)) * rules.droughtDamagePerDay * days;
    }
    let health = this.state.health[index]! / BYTE_MAX - damage;
    if (damage === 0) health += rules.regenPerDay * days;
    const age = this.state.ageDays[index]! + days;
    const maxAgeDays = species.maxAgeYears * this.daysPerYear;
    const tooOld = age > maxAgeDays && this.rng.nextFloat() < days / (OLD_AGE_SPREAD * maxAgeDays);
    if (health <= 0 || tooOld) {
      this.state.clear(index);
      return;
    }
    health = Math.min(1, health);
    this.state.health[index] = Math.round(health * BYTE_MAX);
    this.state.ageDays[index] = Math.min(AGE_MAX_DAYS, age);
    if (temperature > this.params.growthMinCelsius) {
      const gain = (days / (species.growthYears * this.daysPerYear)) * fitness * health * BYTE_MAX;
      this.state.growth[index] = Math.min(BYTE_MAX, Math.round(this.state.growth[index]! + gain));
    }
    const produce = species.produce;
    if (produce) {
      const day = this.localDay(index);
      if (day < produce.fromDay || day >= produce.toDay) this.state.eaten[index] = 0;
    }
    if (age >= species.maturityYears * this.daysPerYear && health > MIN_HEALTH_TO_SEED) {
      this.spreadSeeds(index, species, (species.seedsPerYear * days * health) / this.daysPerYear);
    }
  }

  /** Germination: seeds land on nearby empty tiles and sprout if the climate suits the species. */
  private spreadSeeds(index: number, species: PlantSpecies, expected: number): void {
    let seeds = Math.floor(expected);
    if (this.rng.nextFloat() < expected - seeds) seeds++;
    const x = index % this.size;
    const y = (index - x) / this.size;
    const r = species.seedRadius;
    for (let s = 0; s < seeds; s++) {
      const tx = x + this.rng.nextIntInclusive(-r, r);
      const ty = y + this.rng.nextIntInclusive(-r, r);
      if (tx < 0 || ty < 0 || tx >= this.size || ty >= this.size) continue;
      const target = ty * this.size + tx;
      if (!this.isPlantable(target) || this.state.species[target] !== 0) continue;
      if (this.rng.nextFloat() >= species.germinationChance * this.fitness(species, target)) continue;
      this.plant(target, this.state.species[index]!, 0, this.params.seedlingGrowth, this.params.seedlingHealth);
    }
  }

  private plant(index: number, speciesCode: number, ageDays: number, growth: number, health: number): void {
    this.state.species[index] = speciesCode;
    this.state.ageDays[index] = Math.min(AGE_MAX_DAYS, Math.round(ageDays));
    this.state.growth[index] = Math.round(growth * BYTE_MAX);
    this.state.health[index] = Math.round(health * BYTE_MAX);
    this.state.eaten[index] = 0;
  }

  /** Initial vegetation: biome-dependent cover, species drawn by abundance × climate fitness. */
  private populate(): void {
    const species = this.params.species;
    const weights = new Float64Array(species.length);
    const count = this.size * this.size;
    for (let i = 0; i < count; i++) {
      if (!this.isPlantable(i)) continue;
      if (this.rng.nextFloat() < this.initialCoverOfBiome[this.world.biome[i]!]!) {
        let total = 0;
        for (let k = 0; k < species.length; k++) {
          weights[k] = species[k]!.abundance * this.fitness(species[k]!, i);
          total += weights[k]!;
        }
        if (total > 0) this.plantRandom(i, weights, total);
      }
      this.state.grass[i] = Math.round(this.grassCapacity(i));
    }
  }

  private plantRandom(index: number, weights: Float64Array, total: number): void {
    let roll = this.rng.nextFloat() * total;
    let k = 0;
    while (k < weights.length - 1 && roll >= weights[k]!) roll -= weights[k++]!;
    const species = this.params.species[k]!;
    const ageDays = this.rng.nextFloat() * species.maxAgeYears * this.daysPerYear * 0.7;
    const growth = Math.min(1, ageDays / (species.growthYears * this.daysPerYear));
    this.plant(index, k + 1, ageDays, growth, 1);
  }
}
