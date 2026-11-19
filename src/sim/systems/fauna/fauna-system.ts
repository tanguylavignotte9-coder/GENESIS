import type { Interactions } from '../../core/interactions';
import type { Journal } from '../../core/journal';
import type { Rng } from '../../core/rng';
import type { ClimateState } from '../world/climate-state';
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
import type { AnimalSpecies, FaunaParams } from './params';
import { SpatialGrid } from '../../core/spatial-grid';
import { personalSpot } from '../../core/motion';

const HOURS_PER_DAY = 24;
/** Initial animals are spread this far around the middle of their tile (tiles). */
const SPAWN_SPREAD = 0.4;
const SPOT = { x: 0, y: 0 };

export const DeathCause = { Age: 0, Starvation: 1, Thirst: 2, Cold: 3, Predation: 4, Hunted: 5 } as const;
export const DEATH_CAUSE_NAMES = ['vieillesse', 'faim', 'soif', 'froid', 'prédateurs', 'chasseurs'] as const;
const PERCENT = 100;

/**
 * Wild animals, each one simulated: needs, behaviour, herd, reproduction, ageing, death.
 * Every animal acts once per step (`stepsPerDay` steps a day) and thinks once every
 * `thinkEverySteps` steps, at its own phase.
 */
export class FaunaSystem {
  readonly store = new AnimalStore();
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
  /** Last year each migration (species:landmass:direction) was reported in the journal. */
  readonly migrationReports = new Map<string, number>();
  step = 0;
  /** Game hours between two steps of an animal. */
  readonly hoursPerStep: number;
  /** Ground an animal may walk on (no sea, no lake). */
  readonly walkableTile = (tile: number): boolean => this.world.ocean[tile] === 0 && this.world.water[tile] !== Water.Lake;
  /** Tick of the current step (for the interactions it starts). */
  tick = 0;
  /** canHuntHumans[species] = 1 for the species that may attack a lone human. */
  canHuntHumans: Uint8Array;
  /** Largest wariness distance toward humans among the species (0 = no species fears them). */
  maxHumanFleeTiles = 0;
  /** Wariness distance toward humans of each species. */
  humanFleeTiles = new Float64Array(0);
  /** Hunger and thirst gained per step, per species. */
  private hungerPerStep: Float64Array;
  private thirstPerStep: Float64Array;

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
    this.hungerPerStep = new Float64Array(0);
    this.thirstPerStep = new Float64Array(0);
    this.canHuntHumans = new Uint8Array(0);
    this.refreshParams();
    this.census = new Census(this);
    this.spawnAll();
    interactions.register(
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
    this.hungerPerStep = Float64Array.from(params.species, (species) => species.hungerPerDay / params.stepsPerDay);
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
    const { alive, hunger, thirst, species, uid } = store;
    const every = this.params.thinkEverySteps;
    const phase = this.step % every;
    scareGame(this);
    for (let slot = 0; slot < store.slots; slot++) {
      if (alive[slot] === 0) continue;
      const code = species[slot]!;
      hunger[slot] = Math.min(PERCENT, hunger[slot]! + this.hungerPerStep[code]!);
      thirst[slot] = Math.min(PERCENT, thirst[slot]! + this.thirstPerStep[code]!);
      if ((uid[slot]! + phase) % every === 0) think(this, slot);
      act(this, slot);
    }
    this.step++;
  }

  /** Daily life: needs and health, ageing, births and deaths, herds, fish regrowth, census. */
  runDay(absoluteDay: number, dayOfYear: number, journal: Journal, tick: number): void {
    this.fish.dailyUpdate(absoluteDay);
    this.carrion.rot(this.params.carrion.rotPerDay, this.params.carrion.minimumMeat);
    for (let slot = 0; slot < this.store.slots; slot++) {
      if (this.store.alive[slot] === 1) liveOneDay(this, slot);
    }
    maintainGroups(this, dayOfYear, journal, tick);
    this.census.onDay(absoluteDay, journal, tick);
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
    store.hunger[slot] = this.rng.nextFloat() * 30;
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
        const tile = this.pickHabitatTile(weightOf, maxWeight);
        if (tile < 0) return;
        const members = Math.min(target - placed, this.rng.nextIntInclusive(species.groupSize[0], species.groupSize[1]));
        const group = this.groups.add(code, -1);
        for (let m = 0; m < members; m++) {
          const age = this.rng.nextFloat() * species.maxAgeYears * 0.7 * this.daysPerYear;
          personalSpot(placed + m, tile, this.size, SPAWN_SPREAD, SPOT);
          const slot = this.spawn(code, SPOT.x, SPOT.y, group, age);
          if (m === 0) this.groups.leader[group] = slot;
        }
        placed += members;
      }
    });
  }

  private pickHabitatTile(weightOf: Float32Array, maxWeight: number): number {
    const tiles = this.size * this.size;
    const maxAttempts = 100000;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const tile = this.rng.nextIntInclusive(0, tiles - 1);
      const x = tile % this.size;
      if (!this.isWalkable(x, (tile - x) / this.size) || this.waterPath[tile]! < 0) continue;
      if (this.rng.nextFloat() * maxWeight < weightOf[this.world.biome[tile]!]!) return tile;
    }
    return -1;
  }
}
