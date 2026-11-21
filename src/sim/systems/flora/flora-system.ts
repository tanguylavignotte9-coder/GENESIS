import type { Rng } from '../../core/rng';
import { Water } from '../world/hydrology';
import type { ClimateState } from '../world/climate-state';
import type { World } from '../world/world';
import { localDayOfYear, speciesFitness } from './fitness';
import { addEaten, AGE_MAX_DAYS, BYTE_MAX, EATEN_SCALE, FloraState } from './flora-state';
import type { FloraParams, PlantSpecies } from './params';

/** Fraction of its lifespan over which an old plant may die (after its maximum age). */
const OLD_AGE_SPREAD = 0.2;
/** A plant must be at least this healthy (0..1) to spread seeds. */
const MIN_HEALTH_TO_SEED = 0.3;
const KIND_TREE = 1;
const KIND_SHRUB = 2;
const NEIGHBOURS = 8;

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
  /** Per species: share of seedlings choked by thick grass, and lost under a closed canopy. */
  private grassCompetitionOf: Float32Array;
  private canopyShadeOf: Float32Array;
  /** 1 for tree species, 2 for shrubs (young woody plants can be browsed). */
  private kindOf: Uint8Array;
  /** 1 for species that may grow in a river bed (reeds…). */
  private inWaterOf: Uint8Array;
  private readonly around = { canopy: 0, same: 0 };

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
    this.grassCompetitionOf = new Float32Array(0);
    this.canopyShadeOf = new Float32Array(0);
    this.kindOf = new Uint8Array(0);
    this.inWaterOf = new Uint8Array(0);
    this.refreshParams();
    this.populate();
  }

  /** Recomputes what is derived from the parameters (after a live change in the variables workshop). */
  refreshParams(): void {
    const { params } = this;
    this.grassCoverOfBiome.set(this.world.biomes.biomes.map((biome) => params.grass.coverByBiome[biome.id] ?? 0));
    this.shadeOfSpecies = Float32Array.from(params.species, (species) => params.shadeByKind[species.kind]);
    this.grassCompetitionOf = Float32Array.from(params.species, (species) => params.establishment.grassCompetitionByKind[species.kind]);
    this.canopyShadeOf = Float32Array.from(params.species, (species) => params.establishment.canopyShadeByKind[species.kind] * (1 - (species.shadeTolerance ?? 0)));
    this.kindOf = Uint8Array.from(params.species, (species) => (species.kind === 'tree' ? KIND_TREE : species.kind === 'shrub' ? KIND_SHRUB : 0));
    this.inWaterOf = Uint8Array.from(params.species, (species) => (species.growsInWater === true ? 1 : 0));
  }

  /** A plant can only grow on dry land (rivers are fords, lakes are water). */
  isPlantable(index: number): boolean {
    return this.world.ocean[index] === 0 && this.world.water[index] !== Water.Lake;
  }

  /** Can species `code` (0-based) take root on this tile? Only aquatic or bank plants grow in a river bed. */
  canGrow(code: number, index: number): boolean {
    if (!this.isPlantable(index)) return false;
    return this.world.water[index] !== Water.River || this.inWaterOf[code] === 1;
  }

  /** Is there something to pick on this plant right now (berries, ears…)? */
  hasProduce(index: number): boolean {
    const produce = this.speciesAt(index)?.produce;
    return produce !== undefined && this.produceAvailable(index, produce.resource) >= 1;
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
    return Math.max(0, total - this.state.eaten[index]! / EATEN_SCALE);
  }

  /** Takes up to `amount` of a tile's produce; returns what was taken. */
  takeProduce(index: number, resource: string, amount: number): number {
    const taken = Math.min(amount, this.produceAvailable(index, resource));
    addEaten(this.state, index, taken);
    return taken;
  }

  /** Damages the plant of a tile by `share` of its health (branches broken off); never kills it outright. */
  harmPlant(index: number, share: number): void {
    const harm = Math.round(share * BYTE_MAX);
    this.state.health[index] = Math.max(1, this.state.health[index]! - harm);
  }

  /**
   * Felling (with an axe): takes up to `amount` of a tree's material (wood, branches), in proportion
   * to its size; once its wood is all taken, the tree is gone. Returns what was taken.
   */
  fellTree(index: number, resource: string, amount: number): number {
    const species = this.speciesAt(index);
    const material = species?.kind === 'tree' ? species.materials?.find((m) => m.resource === resource) : undefined;
    if (!material) return 0;
    const total = (material.amount * this.state.growth[index]!) / BYTE_MAX;
    const taken = Math.max(0, Math.min(amount, total - this.state.eaten[index]! / EATEN_SCALE));
    addEaten(this.state, index, taken);
    if (this.state.eaten[index]! / EATEN_SCALE >= total - 1e-6) this.state.clear(index);
    return taken;
  }

  /**
   * Grazing: takes up to `amount` of grass not buried under snow; returns what was taken. A young
   * tree or shrub on the tile has its shoots bitten off along with the grass.
   */
  takeGrass(index: number, amount: number): number {
    const reachable = this.state.grass[index]! * (1 - this.climate.snowAt(index));
    const taken = Math.min(amount, Math.floor(reachable));
    this.state.grass[index] = this.state.grass[index]! - taken;
    const k = this.state.species[index]!;
    if (taken > 0 && k !== 0 && this.kindOf[k - 1] !== 0) this.browse(index, taken);
    return taken;
  }

  /** Shoots of a young woody plant bitten off by a grazer: it loses health, and dies if it has none left. */
  private browse(index: number, grassEaten: number): void {
    const { browsing } = this.params;
    if (this.state.growth[index]! > browsing.maxGrowth * BYTE_MAX) return;
    const health = this.state.health[index]! - Math.round(browsing.damagePerGrassUnit * grassEaten * BYTE_MAX);
    if (health <= 0) this.state.clear(index);
    else this.state.health[index] = health;
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
      const code = this.state.species[index]! - 1;
      this.state.clear(index);
      // An old herb has dropped its seeds at its feet: one of them may take its place.
      if (tooOld && health > MIN_HEALTH_TO_SEED && species.kind === 'herb' && this.canGrow(code, index) && this.rng.nextFloat() < this.params.establishment.herbReseedChance * fitness * this.establishment(code, index)) {
        this.plant(index, code + 1, 0, this.params.seedlingGrowth, this.params.seedlingHealth);
      }
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
    const code = this.state.species[index]! - 1;
    for (let s = 0; s < seeds; s++) {
      const tx = x + this.rng.nextIntInclusive(-r, r);
      const ty = y + this.rng.nextIntInclusive(-r, r);
      if (tx < 0 || ty < 0 || tx >= this.size || ty >= this.size) continue;
      const target = ty * this.size + tx;
      if (this.state.species[target] !== 0 || !this.canGrow(code, target)) continue;
      if (this.rng.nextFloat() >= species.germinationChance * this.fitness(species, target) * this.establishment(code, target)) continue;
      this.plant(target, this.state.species[index]!, 0, this.params.seedlingGrowth, this.params.seedlingHealth);
    }
  }

  /**
   * Chance that a seedling of species `code` takes root on an empty tile, 0..1: thick grass chokes
   * young woody plants; a closed canopy of grown trees around keeps light-hungry plants from coming up.
   */
  establishment(code: number, index: number): number {
    const grass = this.state.grass[index]! / this.params.grass.maxAmount;
    let chance = 1 - this.grassCompetitionOf[code]! * Math.min(1, grass);
    this.lookAround(index, code);
    chance *= 1 - this.canopyShadeOf[code]! * this.around.canopy;
    chance *= 1 - this.params.establishment.sameSpeciesCrowding * this.around.same;
    return Math.max(0, chance);
  }

  /** Around a tile: share of the 8 neighbours holding a grown tree, and holding a plant of species `code`. */
  private lookAround(index: number, code: number): void {
    const size = this.size;
    const x = index % size;
    const y = (index - x) / size;
    const grown = this.params.establishment.canopyGrowth * BYTE_MAX;
    let trees = 0;
    let same = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const n = ny * size + nx;
        const k = this.state.species[n]!;
        if (k === 0) continue;
        if (k === code + 1) same++;
        if (this.kindOf[k - 1] === KIND_TREE && this.state.growth[n]! >= grown) trees++;
      }
    }
    this.around.canopy = trees / NEIGHBOURS;
    this.around.same = same / NEIGHBOURS;
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
          weights[k] = this.canGrow(k, i) ? species[k]!.abundance * this.fitness(species[k]!, i) : 0;
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
