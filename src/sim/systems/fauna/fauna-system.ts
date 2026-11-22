import { herdKey, liveDomesticDay, publishDomesticDeaths, publishEscapes, publishReleases } from './domestic';
import type { Interactions } from '../../core/interactions';
import type { Journal } from '../../core/journal';
import type { Rng } from '../../core/rng';
import type { ClimateState } from '../world/climate-state';
import { AnimalWatch, noteAnimalState, traceAnimal } from './brain-trace';
import { Water } from '../world/hydrology';
import type { World } from '../world/world';
import type { FloraSystem } from '../flora/flora-system';
import { AnimalStore, Sex, State } from './animal-store';
import { act, think } from './behavior';
import { Carrion } from './carrion';
import { Census } from './census';
import { FishStock } from './fish';
import { buildDiets, type Diet } from './food';
import { onAttackDone } from './human-prey';
import { sufferHunt } from './hunted';
import { scareGame } from './human-fear';
import { pathToFreshWater } from './fresh-water';
import { maintainGroups } from './group-life';
import { GroupStore } from './groups';
import { liveOneDay } from './life';
import { metabolismStep, refreshBody } from './energy';
import { spreadSickness } from './sickness';
import type { AnimalSpecies, FaunaParams } from './params';
import { SpatialGrid } from '../../core/spatial-grid';
import { personalSpot } from '../../core/motion';

const HOURS_PER_DAY = 24;
/** Initial animals are spread this far around the middle of their tile (tiles). */
const SPAWN_SPREAD = 0.4;
const SPOT = { x: 0, y: 0 };

export const DeathCause = { Age: 0, Starvation: 1, Thirst: 2, Cold: 3, Predation: 4, Hunted: 5, Disease: 6, Injury: 7 } as const;
export const DEATH_CAUSE_NAMES = ['vieillesse', 'faim', 'soif', 'froid', 'prédateurs', 'chasseurs', 'maladie', 'blessures'] as const;
const PERCENT = 100;

/**
 * Wild animals, each one simulated: needs, behaviour, herd, reproduction, ageing, death.
 * Every animal acts once per step (`stepsPerDay` steps a day) and thinks once every
 * `thinkEverySteps` steps, at its own phase.
 */
export class FaunaSystem {
  readonly store = new AnimalStore();
  /** Visual brain: the animal the spectator watches (never saved). */
  watch = new AnimalWatch();
  readonly groups = new GroupStore();
  readonly grid: SpatialGrid;
  /** Same grid, holding only hunters: prey look for danger here (few animals, fast). */
  readonly hunterGrid: SpatialGrid;
  /** isHunter[species] = 1 for species that hunt. */
  readonly isHunter: Uint8Array;
  readonly fish: FishStock;
  readonly carrion = new Carrion();
  readonly census: Census;
  /** Next tile on the way to the nearest river or lake, for each land tile (-1 if too far). */
  readonly waterPath: Int32Array;
  /** hunts[hunter * n + prey] = 1 if the hunter species eats the prey species. */
  readonly hunts: Uint8Array;
  readonly diets: Diet[];
  /** Cumulated deaths per species and cause: deaths[species][cause]. */
  readonly deaths: number[][];
  readonly size: number;
  /** Herd of each camp's domestic animals of a species (key: `herdKey(camp, species)`). */
  readonly domesticGroups = new Map<number, number>();
  /** Escapes and deaths of domestic animals of the day, told in the journal at the end of the day. */
  readonly escapes: { slot: number; camp: number; species: number; why: string; cause: number }[] = [];
  readonly domesticDeaths = new Map<number, number[]>();
  /** Animals of a camp gone back to the wild because their camp is no more (camp × 256 + species → count), told at the end of the day. */
  readonly domesticReleases = new Map<number, number>();
  /** What became of the domestic animals since the world began (for the reports): deaths by cause, escapes, back to the wild. */
  readonly domesticTally = { deaths: DEATH_CAUSE_NAMES.map(() => 0), escaped: 0, released: 0 };
  /** Who keeps each camp's animals, as said in the journal (« de la tribu des Tamuki »), kept up to date by the groups. */
  readonly keeperNames: string[] = [];
  /** Last year each migration (species:landmass:direction) was reported in the journal. */
  readonly migrationReports = new Map<string, number>();
  step = 0;
  /** Absolute day of the last daily update. */
  day = 0;
  /** Game hours between two steps of an animal. */
  readonly hoursPerStep: number;
  /** Ground an animal may walk on (no sea, no lake). */
  walkableTile!: (tile: number) => boolean;
  /** Tick of the current step (for the interactions it starts). */
  tick = 0;
  /** canHuntHumans[species] = 1 for the species that may attack a lone human. */
  canHuntHumans: Uint8Array;
  /** Largest wariness distance toward humans among the species (0 = no species fears them). */
  maxHumanFleeTiles = 0;
  /** Wariness distance toward humans of each species. */
  humanFleeTiles = new Float64Array(0);
  /** Thirst gained per step, per species. */
  private thirstPerStep: Float64Array;
  /** Share of the stomach digested in one step. */
  private digestShare = 0;
  /** Per biome: cover that hides a stalking hunter, and refuge terrain where prey escape more often. */
  coverOfBiome = new Float32Array(0);
  /** habitatLiking[species × biomes + biome]: how much the species likes to feed there (its habitat, 1 for its best land). */
  habitatLiking = new Float32Array(0);
  biomeCount = 0;
  refugeOfBiome = new Float32Array(0);
  /** Attacks of animal hunters since the world began, and those that killed, per hunter species. */
  readonly huntStats: { attempts: number[]; kills: number[] };

  constructor(
    readonly world: World,
    readonly climate: ClimateState,
    readonly flora: FloraSystem,
    readonly params: FaunaParams,
    readonly daysPerYear: number,
    readonly ticksPerDay: number,
    readonly rng: Rng,
    readonly interactions: Interactions,
  ) {
    this.size = world.size;
    this.hoursPerStep = HOURS_PER_DAY / params.stepsPerDay;
    this.grid = new SpatialGrid(world.size, params.gridCellTiles);
    this.hunterGrid = new SpatialGrid(world.size, params.gridCellTiles);
    this.isHunter = Uint8Array.from(params.species, (species) => (species.prey.length > 0 ? 1 : 0));
    this.fish = new FishStock(world, params.fish);
    this.waterPath = pathToFreshWater(world, params.behavior.waterSearchTiles);
    const n = params.species.length;
    this.hunts = new Uint8Array(n * n);
    params.species.forEach((hunter, h) => {
      for (const preyId of hunter.prey) this.hunts[h * n + params.species.findIndex((s) => s.id === preyId)] = 1;
    });
    this.deaths = params.species.map(() => DEATH_CAUSE_NAMES.map(() => 0));
    this.diets = buildDiets(params);
    this.thirstPerStep = new Float64Array(0);
    this.huntStats = { attempts: params.species.map(() => 0), kills: params.species.map(() => 0) };
    this.canHuntHumans = new Uint8Array(0);
    this.refreshParams();
    this.census = new Census(this);
    this.spawnAll();
    this.bindCallbacks();
  }

  /** Saving: callbacks are rebuilt after loading. */
  transientKeys(): readonly string[] {
    return ['walkableTile', 'watch'];
  }

  afterLoad(): void {
    this.watch = new AnimalWatch();
    this.bindCallbacks();
  }

  /** Callbacks handed to the movement code and to the interactions (rebuilt after loading a save). */
  private bindCallbacks(): void {
    this.walkableTile = (tile: number): boolean => this.world.ocean[tile] === 0 && this.world.water[tile] !== Water.Lake;
    this.interactions.register(
      'animal',
      {
        forEachNear: (x, y, radius, visit) => this.grid.forEachNear(x, y, radius, visit),
        forEachAlive: (visit) => {
          for (let slot = 0; slot < this.store.slots; slot++) if (this.store.alive[slot] === 1) visit(slot);
        },
        x: (slot) => this.store.px[slot]!,
        y: (slot) => this.store.py[slot]!,
        alive: (slot) => this.store.alive[slot] === 1,
        hunting: (slot) => this.store.state[slot] === State.Hunt,
      },
      {
        attackDone: (slot, attack, outcome) => onAttackDone(this, slot, attack, outcome),
        sufferAttack: (slot, attack) => sufferHunt(this, slot, attack),
      },
    );
  }

  /** Recomputes what is derived from the parameters (after a live change in the variables workshop). */
  refreshParams(): void {
    const { params } = this;
    this.diets.splice(0, this.diets.length, ...buildDiets(params));
    this.digestShare = 1 - Math.pow(1 - params.energy.digestPerHour, this.hoursPerStep);
    const biomes = this.world.biomes.biomes;
    this.coverOfBiome = Float32Array.from(biomes, (biome) => params.hunting.coverByBiome[biome.id] ?? 0);
    this.refugeOfBiome = Float32Array.from(biomes, (biome) => params.hunting.refugeByBiome[biome.id] ?? 0);
    this.biomeCount = biomes.length;
    this.habitatLiking = new Float32Array(params.species.length * biomes.length);
    params.species.forEach((species, code) => {
      const best = Math.max(0, ...Object.values(species.habitat));
      biomes.forEach((biome, b) => {
        const share = best > 0 ? (species.habitat[biome.id] ?? 0) / best : 1;
        this.habitatLiking[code * biomes.length + b] = Math.max(params.behavior.outsideHabitatShare, share);
      });
    });
    this.thirstPerStep = Float64Array.from(params.species, (species) => species.thirstPerDay / params.stepsPerDay);
    this.humanFleeTiles = Float64Array.from(params.species, (species) => species.humanFleeTiles);
    this.maxHumanFleeTiles = Math.max(0, ...this.humanFleeTiles);
    this.canHuntHumans = Uint8Array.from(params.species, (species) => (params.humanPrey.hunters.includes(species.id) ? 1 : 0));
  }

  speciesOf(slot: number): AnimalSpecies {
    return this.params.species[this.store.species[slot]!]!;
  }

  isWalkable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return false;
    const i = y * this.size + x;
    return this.world.ocean[i] === 0 && this.world.water[i] !== Water.Lake;
  }

  /** One step for every living animal (in slot order: deterministic). */
  runStep(tick: number): void {
    this.tick = tick;
    const { store } = this;
    const { alive, thirst, species, uid } = store;
    const digest = this.digestShare;
    const every = this.params.thinkEverySteps;
    const phase = this.step % every;
    scareGame(this);
    for (let slot = 0; slot < store.slots; slot++) {
      if (alive[slot] === 0) continue;
      const code = species[slot]!;
      metabolismStep(this, slot, digest);
      thirst[slot] = Math.min(PERCENT, thirst[slot]! + this.thirstPerStep[code]!);
      if ((uid[slot]! + phase) % every === 0) {
        think(this, slot);
        if (uid[slot] === this.watch.uid) traceAnimal(this, slot);
      }
      act(this, slot);
      if (uid[slot] === this.watch.uid) noteAnimalState(this, slot);
    }
    this.step++;
  }

  /** Daily life: needs and health, ageing, births and deaths, herds, fish regrowth, census. */
  runDay(absoluteDay: number, dayOfYear: number, journal: Journal, tick: number): void {
    this.fish.dailyUpdate(absoluteDay);
    this.day = absoluteDay;
    const rot = this.params.carrion;
    // Meat rots faster in the heat, hardly at all in the frost.
    this.carrion.rot((tile) => {
      const factor = Math.min(rot.maxFactor, Math.max(rot.minFactor, Math.pow(2, (this.climate.temperatureAt(tile) - rot.referenceCelsius) / rot.doublingCelsius)));
      return Math.pow(0.5, factor / rot.halfLifeDays);
    }, rot.minimumMeat);
    spreadSickness(this);
    for (let slot = 0; slot < this.store.slots; slot++) {
      if (this.store.alive[slot] !== 1) continue;
      if (this.store.ownerCamp[slot]! >= 0) liveDomesticDay(this, slot);
      liveOneDay(this, slot);
    }
    publishEscapes(this, journal, tick);
    publishDomesticDeaths(this, journal, tick, this.params.domestic.causeNames);
    publishReleases(this, journal, tick);
    maintainGroups(this, dayOfYear, journal, tick);
    this.census.onDay(absoluteDay, journal, tick);
  }

  /** « de la tribu des Tamuki » (« du camp » before the camp's people are named). */
  keeperName(camp: number): string {
    return this.keeperNames[camp] || this.params.domestic.texts.unknownKeeper;
  }

  /** Puts an animal at a free position (decimal tiles), keeping its tile and the spatial grid up to date. */
  place(slot: number, fx: number, fy: number): void {
    const { store } = this;
    const x = Math.max(0, Math.min(this.size - 1, Math.floor(fx)));
    const y = Math.max(0, Math.min(this.size - 1, Math.floor(fy)));
    store.px[slot] = fx;
    store.py[slot] = fy;
    store.x[slot] = x;
    store.y[slot] = y;
    const cell = this.grid.cellOf(x, y);
    if (cell !== store.cell[slot]) {
      this.grid.remove(slot, store.cell[slot]!);
      this.grid.insert(slot, cell);
      if (this.isHunter[store.species[slot]!] === 1) {
        this.hunterGrid.remove(slot, store.cell[slot]!);
        this.hunterGrid.insert(slot, cell);
      }
      store.cell[slot] = cell;
    }
  }

  /** Creates an animal (newborn or initial population) at a free position (decimal tiles). */
  spawn(species: number, fx: number, fy: number, group: number, ageDays: number): number {
    const { store } = this;
    const slot = store.add();
    store.species[slot] = species;
    store.sex[slot] = this.rng.nextFloat() < 0.5 ? Sex.Female : Sex.Male;
    store.ageDays[slot] = ageDays;
    refreshBody(this, slot, this.params.species[species]!);
    const startMin = this.params.energy.startConditionMin;
    store.energy[slot] = store.maxReserve[slot]! * (startMin + (1 - startMin) * this.rng.nextFloat());
    store.gut[slot] = 0;
    store.hunger[slot] = PERCENT * (1 - store.energy[slot]! / Math.max(1e-6, store.maxReserve[slot]!));
    store.thirst[slot] = this.rng.nextFloat() * 30;
    store.health[slot] = PERCENT;
    store.wariness[slot] = 1 + this.params.humanFear.warinessSpread * (this.rng.nextFloat() * 2 - 1);
    store.group[slot] = group;
    const x = Math.floor(fx);
    const y = Math.floor(fy);
    store.px[slot] = fx;
    store.py[slot] = fy;
    store.x[slot] = x;
    store.y[slot] = y;
    store.targetX[slot] = fx;
    store.targetY[slot] = fy;
    store.cell[slot] = this.grid.cellOf(x, y);
    this.grid.insert(slot, store.cell[slot]!);
    if (this.isHunter[species] === 1) this.hunterGrid.insert(slot, store.cell[slot]!);
    this.groups.size[group] = this.groups.size[group]! + 1;
    return slot;
  }

  kill(slot: number, cause: number): void {
    const { store } = this;
    if (store.alive[slot] === 0) return;
    this.deaths[store.species[slot]!]![cause]!++;
    // A domestic animal's death (a slaughter too) is told at the end of the day, with its herd's.
    if (store.ownerCamp[slot]! >= 0) {
      this.domesticTally.deaths[cause] = this.domesticTally.deaths[cause]! + 1;
      const key = herdKey(store.ownerCamp[slot]!, store.species[slot]!);
      const counts = this.domesticDeaths.get(key) ?? DEATH_CAUSE_NAMES.map(() => 0);
      counts[cause] = counts[cause]! + 1;
      this.domesticDeaths.set(key, counts);
      store.ownerCamp[slot] = -1;
    }
    this.grid.remove(slot, store.cell[slot]!);
    if (this.isHunter[store.species[slot]!] === 1) this.hunterGrid.remove(slot, store.cell[slot]!);
    const group = store.group[slot]!;
    this.groups.size[group] = this.groups.size[group]! - 1;
    store.remove(slot);
  }

  /** Meat left on the ground by others (what a hunter could not carry): food for scavengers. */
  leaveRemains(tile: number, meat: number): void {
    if (meat > 0) this.carrion.add(tile, meat);
  }

  /** Living animals per species. */
  /** Meat left on a tile by another system (spoilt meat thrown away by people): the scavengers' share. */
  leaveCarrion(tile: number, meat: number): void {
    this.carrion.add(tile, meat);
  }

  countBySpecies(): number[] {
    const counts = new Array<number>(this.params.species.length).fill(0);
    for (let slot = 0; slot < this.store.slots; slot++) if (this.store.alive[slot] === 1) counts[this.store.species[slot]!]!++;
    return counts;
  }

  /** Initial populations: groups placed at random on tiles of their habitat. */
  private spawnAll(): void {
    const tiles = this.size * this.size;
    this.params.species.forEach((species, code) => {
      const weightOf = Float32Array.from(this.world.biomes.biomes, (biome) => species.habitat[biome.id] ?? 0);
      const maxWeight = Math.max(...weightOf);
      if (maxWeight <= 0) return;
      let habitat = 0;
      for (let i = 0; i < tiles; i++) if (this.world.ocean[i] === 0) habitat += weightOf[this.world.biome[i]!]!;
      const target = Math.round((habitat / 1000) * species.populationPer1000Tiles);
      let placed = 0;
      while (placed < target) {
        const members = Math.min(target - placed, this.rng.nextIntInclusive(species.groupSize[0], species.groupSize[1]));
        const site = this.pickHabitatTile(weightOf, maxWeight, code, members);
        if (site.tile < 0) return;
        const group = this.groups.add(code, -1);
        for (let m = 0; m < members; m++) {
          const age = this.rng.nextFloat() * species.maxAgeYears * 0.7 * this.daysPerYear;
          personalSpot(placed + m, site.tile, this.size, SPAWN_SPREAD, SPOT);
          const slot = this.spawn(code, SPOT.x, SPOT.y, group, age);
          if (m === 0) this.groups.leader[group] = slot;
        }
        if (site.range > 0) {
          this.groups.denX[group] = site.tile % this.size;
          this.groups.denY[group] = Math.floor(site.tile / this.size);
          this.groups.range[group] = site.range;
        }
        placed += members;
      }
    });
  }

  /**
   * A tile of the species' habitat. A territorial hunter settles only where the land around, within
   * its largest territory, holds the game its group needs, and outside the land of the groups already
   * there (the herds are placed first): predators live where their prey is. When no such place is
   * left, fewer of them are born with the world. Returns the tile and the territory radius (0 if none).
   */
  private pickHabitatTile(weightOf: Float32Array, maxWeight: number, code: number, members: number): { tile: number; range: number } {
    const tiles = this.size * this.size;
    const species = this.params.species[code]!;
    const territorial = species.territoryMaxTiles > 0;
    const maxAttempts = territorial ? this.params.behavior.spawnSiteAttempts : 100000;
    const need = members * species.massKg * this.params.territory.preyKgPerPredatorKg;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const tile = this.rng.nextIntInclusive(0, tiles - 1);
      const x = tile % this.size;
      const y = (tile - x) / this.size;
      if (!this.isWalkable(x, y) || this.waterPath[tile]! < 0) continue;
      if (this.rng.nextFloat() * maxWeight >= weightOf[this.world.biome[tile]!]!) continue;
      if (!territorial) return { tile, range: 0 };
      if (this.insideTerritory(code, x, y)) continue;
      // The smallest radius around holding the game the group needs.
      const range = this.radiusHolding(code, x, y, need, species.territoryMinTiles, species.territoryMaxTiles);
      if (range > 0) return { tile, range };
    }
    return { tile: -1, range: 0 };
  }

  /** Smallest radius (between the bounds) within which the prey weigh at least `need` kg, or 0. */
  private radiusHolding(hunter: number, x: number, y: number, need: number, min: number, max: number): number {
    for (let r = Math.max(1, min); r <= max; r += Math.max(1, Math.round(min / 2))) {
      if (this.preyMassWithin(hunter, x, y, r) >= need) return r;
    }
    return 0;
  }

  /** Whether (x, y) lies on the land of a group of this species. */
  private insideTerritory(code: number, x: number, y: number): boolean {
    const { groups } = this;
    for (let group = 0; group < groups.count; group++) {
      if (groups.species[group] !== code || groups.denX[group]! < 0) continue;
      const dx = groups.denX[group]! - x;
      const dy = groups.denY[group]! - y;
      if (dx * dx + dy * dy < groups.range[group]! * groups.range[group]!) return true;
    }
    return false;
  }

  /** Mass (kg) of the wild prey of the hunter species within `radius` tiles: what a group perceives of its game. */
  preyMassWithin(hunter: number, x: number, y: number, radius: number): number {
    const { store } = this;
    const n = this.params.species.length;
    const r2 = radius * radius;
    let mass = 0;
    this.grid.forEachNear(x, y, radius, (other) => {
      if (this.hunts[hunter * n + store.species[other]!] !== 1 || store.ownerCamp[other]! >= 0) return;
      const dx = store.x[other]! - x;
      const dy = store.y[other]! - y;
      if (dx * dx + dy * dy <= r2) mass += store.mass[other]!;
    });
    return mass;
  }
}
