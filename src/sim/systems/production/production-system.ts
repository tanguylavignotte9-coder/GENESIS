import type { Interactions } from '../../core/interactions';
import type { Journal } from '../../core/journal';
import type { KnowledgeCatalog } from '../../core/knowledge';
import type { Rng } from '../../core/rng';
import type { ResourceCatalog } from '../../core/resources';
import type { FaunaSystem } from '../fauna/fauna-system';
import type { FloraSystem } from '../flora/flora-system';
import type { ClimateState } from '../world/climate-state';
import { Water } from '../world/hydrology';
import type { World } from '../world/world';
import { BuildState, newBuilding, type Building } from './buildings';
import { CampState, type CampNeeds } from './camps';
import { Catalog, type BuildingType } from './catalog';
import { publishBuildingDone } from './events';
import { campOwner, Inventory, type RemarkableItem } from './inventory';
import { depositable, leaveUnfinished, releaseClaim, releaseExpected, Stage, startJob, workAt, type Job, type JobSpec, type WorkResult } from './jobs';
import { listNames, withIndefinite } from './events';
import type { BuildingCatalog, ItemCatalog, ProductionParams, RecipeBook } from './params';
import { computeNeeds } from './plans';
import { spoil, spoilFactor } from './spoilage';
import type { WorkerView } from './worker-view';

/** Everything the production system is built from. */
export interface ProductionData {
  knowledge: KnowledgeCatalog;
  /** What plants and animals provide (raw goods, not "made" by anyone). */
  resources: ResourceCatalog;
  items: ItemCatalog;
  recipes: RecipeBook;
  buildings: BuildingCatalog;
  params: ProductionParams;
}

/** What production needs to know of the human body (owned by data/humans.json). */
export interface BodyFacts {
  carryCapacity: number;
  /** Food units a person eats in a day. */
  dailyFood: number;
  /** Distance at which a person sees plants and animals. */
  perceptionTiles: number;
  skillIds: readonly string[];
}

const HOURS_PER_DAY = 24;

/** 0 (enough) .. 1 (nothing) for a reserve. */
function shortfall(have: number, reserve: number): number {
  return reserve > 0 ? Math.min(1, Math.max(0, 1 - have / reserve)) : 0;
}

interface CampView {
  version: number;
  list: Building[];
  fire: Building | null;
  /** Tile of the first storage building (-1 = none: the stock is a heap by the fire). */
  store: number;
  capacity: number;
  spoilFactor: number;
}

/** "huttes", "feux de camp" (first word only: « abris sommaires » would need more grammar). */
function pluralize(name: string): string {
  const [first = '', ...rest] = name.split(' ');
  const plural = /[sxz]$/.test(first) ? first : /(eu|au)$/.test(first) ? `${first}x` : `${first}s`;
  return [plural, ...rest].join(' ');
}

/**
 * Work and production: objects in piles (carried or in the camp's common stock), buildings and
 * construction sites, recipes really performed by people (harvest, craft, build), spoiling food,
 * and the collective needs of each camp as custom sees them.
 */
export class ProductionSystem {
  catalog: Catalog;
  readonly buildings: Building[] = [];
  readonly camps: CampState[] = [];
  /** What each person carries. */
  carried: Inventory[] = [];
  /** Current job of each person (null = none). */
  jobs: (Job | null)[] = [];
  /** Building id where each person sleeps (-1 = in the open, by the fire). */
  bedOf = new Int32Array(0);
  /** Remarkable objects (none yet: the structure is ready). */
  readonly remarkable: RemarkableItem[] = [];
  people!: WorkerView;
  tick = 0;
  hour = 0;
  private biomeCodes: Map<string, number>;

  constructor(
    readonly world: World,
    readonly climate: ClimateState,
    readonly flora: FloraSystem,
    readonly fauna: FaunaSystem,
    readonly data: ProductionData,
    readonly body: BodyFacts,
    readonly rng: Rng,
    readonly interactions: Interactions,
    readonly journal: Journal,
  ) {
    this.catalog = this.buildCatalog();
    this.biomeCodes = new Map(world.biomes.biomes.map((biome, k) => [biome.id, k]));
  }

  get params(): ProductionParams {
    return this.data.params;
  }

  get size(): number {
    return this.world.size;
  }

  /** Recomputes the tables after a live change in the variables workshop. */
  refreshParams(body: BodyFacts): void {
    Object.assign(this.body, body);
    this.catalog = this.buildCatalog();
    for (const camp of this.camps) camp.needsHour = -1;
  }

  private buildCatalog(): Catalog {
    const { knowledge, items, recipes, buildings } = this.data;
    const catalog = new Catalog(knowledge, items, recipes, buildings, this.body.skillIds, this.fauna.params.species.map((species) => species.id));
    const item = (id: string | undefined): number => (id === undefined ? -1 : (catalog.itemIndex.get(id) ?? -1));
    const plants = this.flora.params.species;
    this.plantProduce = Int16Array.from(plants, (species) => item(species.produce?.resource));
    this.plantBranches = Uint8Array.from(plants, (species) => (species.kind !== 'herb' && species.materials?.some((m) => m.resource === 'branches') ? 1 : 0));
    this.terrainItems = Int16Array.from(this.data.params.terrainSources, (source) => item(source.item));
    return catalog;
  }

  /** Per plant species (flora code - 1): item of its seasonal produce (-1 none), whether it gives branches. */
  plantProduce = new Int16Array(0);
  plantBranches = new Uint8Array(0);
  /** Item of each terrain source (same order as params.terrainSources). */
  terrainItems = new Int16Array(0);

  /** A raw good of nature (berries, meat…), as opposed to a made object. */
  isResource(item: number): boolean {
    const id = this.catalog.items[item]!.id;
    return this.data.resources.resources.some((resource) => resource.id === id);
  }

  biomeCode(id: string): number {
    return this.biomeCodes.get(id) ?? -1;
  }

  /** The people whose objects, beds and jobs this system keeps. */
  attachPeople(view: WorkerView): void {
    this.people = view;
    this.carried = Array.from({ length: view.count }, () => new Inventory());
    this.jobs = new Array<Job | null>(view.count).fill(null);
    this.bedOf = new Int32Array(view.count).fill(-1);
  }

  // ----- camps -----------------------------------------------------------------------------

  /** A camp settles at `center` with its starting buildings; families share a shelter while there is room. */
  foundCamp(camp: number, center: number, families: number[][]): void {
    this.camps[camp] = new CampState(camp, center, this.catalog.items.length);
    for (const start of this.params.startingBuildings) {
      const type = this.catalog.building(start.building);
      if (!type) continue;
      for (let k = 0; k < start.count; k++) {
        const tile = this.siteTile(camp, type);
        if (tile < 0) break;
        const building = this.addBuilding(type, camp, tile, BuildState.Done);
        building.fuel = type.def.fuelMaxHours;
      }
    }
    const shelters = this.campBuildings(camp).filter((b) => this.typeOf(b).def.sleeps > 0);
    let at = 0;
    for (const family of families) {
      while (at < shelters.length && shelters[at]!.residents.length > 0 && shelters[at]!.residents.length + family.length > this.typeOf(shelters[at]!).def.sleeps) at++;
      const home = shelters[at];
      if (!home) break;
      for (const person of family) {
        if (home.residents.length >= this.typeOf(home).def.sleeps) break;
        home.residents.push(person);
        this.bedOf[person] = home.id;
      }
    }
  }

  /**
   * The camp moves: the buildings left behind are abandoned (no one sleeps there any more), the
   * common stock goes with the people as far as they can carry it, the rest is left behind.
   */
  relocateCamp(camp: number, center: number, movers: number, cause: number): void {
    const state = this.camps[camp]!;
    state.settleEvent = cause;
    this.buildingsChanged();
    for (const building of this.campBuildings(camp)) {
      if (building.state === BuildState.Abandoned) continue;
      building.state = BuildState.Abandoned;
      building.fuel = 0;
      for (const person of building.residents) this.bedOf[person] = -1;
      building.residents = [];
    }
    let room = movers * this.body.carryCapacity;
    const piles = [...state.stock.piles].sort((a, b) => this.keepRank(a.item) - this.keepRank(b.item) || a.item - b.item);
    const kept = new Inventory();
    for (const pile of piles) {
      const qty = Math.min(pile.qty, room / this.catalog.bulk[pile.item]!);
      if (qty <= 0) continue;
      kept.put(pile.item, qty, pile.quality, pile.owner);
      room -= qty * this.catalog.bulk[pile.item]!;
    }
    state.stock = kept;
    state.unfinished.length = 0;
    state.center = center;
    state.needsHour = -1;
    state.pending.fill(0);
  }

  /** What is taken first when the camp moves: tools and clothes, then food that keeps, then the rest. */
  private keepRank(item: number): number {
    const def = this.catalog.items[item]!;
    if (def.category === 'tool' || def.category === 'clothing') return 0;
    if (def.food > 0) return def.halfLifeDays === 0 ? 1 : 1 + 1 / def.halfLifeDays;
    return 3;
  }

  /** "un feu de camp et 6 huttes" (the camp's buildings, for the journal). */
  describeBuildings(camp: number): string {
    const counts = new Map<number, number>();
    for (const building of this.campBuildings(camp)) if (building.state === BuildState.Done) counts.set(building.type, (counts.get(building.type) ?? 0) + 1);
    const parts = [...counts.entries()].map(([type, count]) => {
      const def = this.catalog.buildings[type]!.def;
      return count === 1 ? withIndefinite(def.name, def.feminine) : `${count} ${pluralize(def.name.toLowerCase())}`;
    });
    return parts.length > 0 ? listNames(parts) : 'aucun abri';
  }

  /** The camp's buildings (all states). Do not modify the returned list. */
  campBuildings(camp: number): readonly Building[] {
    return this.campView(camp).list;
  }

  /** What is derived from a camp's buildings, recomputed only when a building changes. */
  private campView(camp: number): CampView {
    let view = this.views[camp];
    if (!view || view.version !== this.buildingsVersion) {
      const list = this.buildings.filter((building) => building.camp === camp);
      let fire: Building | null = null;
      let capacity = 0;
      let weighted = 0;
      let store = -1;
      for (const building of list) {
        if (building.state !== BuildState.Done) continue;
        const def = this.typeOf(building).def;
        if (def.function === 'fire' && !fire) fire = building;
        if (def.storage > 0) {
          capacity += def.storage;
          weighted += def.storage * def.spoilFactor;
          if (store < 0) store = building.tile;
        }
      }
      view = { version: this.buildingsVersion, list, fire, store, capacity, spoilFactor: capacity > 0 ? weighted / capacity : 1 };
      this.views[camp] = view;
    }
    return view;
  }

  /** Bumped whenever a building appears or changes state. */
  private buildingsVersion = 0;
  private readonly views: CampView[] = [];

  /** A building appeared, was finished or abandoned. */
  buildingsChanged(): void {
    this.buildingsVersion++;
  }

  typeOf(building: Building): BuildingType {
    return this.catalog.buildings[building.type]!;
  }

  /** The camp's working campfire (built), or null. */
  fireOf(camp: number): Building | null {
    return this.campView(camp).fire;
  }

  /** Where the fire is (or will be): the heart of the camp. */
  fireTile(camp: number): number {
    return this.fireOf(camp)?.tile ?? this.camps[camp]!.center;
  }

  fireLit(camp: number): boolean {
    return (this.fireOf(camp)?.fuel ?? 0) > 0;
  }

  /**
   * 0 (full) .. 1 (out or no fire), counting the wood others are already bringing (not one's own:
   * the one who goes for wood keeps going).
   */
  fireLow(camp: number, person = -1): number {
    const fire = this.fireOf(camp);
    if (!fire) return 0;
    const max = this.typeOf(fire).def.fuelMaxHours;
    const others = this.camps[camp]!.pendingFire - (this.jobs[person]?.expectedFire ?? 0);
    return max > 0 ? Math.max(0, 1 - (fire.fuel + others) / max) : 1;
  }

  /** The camp's food and firewood shortfalls as one person sees them (others' harvests count, not one's own). */
  reserveNeeds(person: number): { food: number; wood: number } {
    const needs = this.needs(this.people.camp(person));
    const job = this.jobs[person];
    return { food: shortfall(needs.foodHave - (job?.expectedFood ?? 0), needs.foodReserve), wood: shortfall(needs.woodHave - (job?.expectedFuel ?? 0), needs.woodReserve) };
  }

  /** Where the common stock lies: in a storage building, else in a heap by the fire. */
  stockTile(camp: number): number {
    const store = this.campView(camp).store;
    return store >= 0 ? store : this.fireTile(camp);
  }

  /** Protected storage room of a camp and its mean spoil factor. */
  storageOf(camp: number): { capacity: number; spoilFactor: number } {
    const view = this.campView(camp);
    return { capacity: view.capacity, spoilFactor: view.spoilFactor };
  }

  /** Is a tile within the camp's grounds (for depositing and crafting)? */
  atCamp(camp: number, tile: number): boolean {
    const center = this.fireTile(camp);
    const size = this.size;
    return Math.max(Math.abs((tile % size) - (center % size)), Math.abs(Math.floor(tile / size) - Math.floor(center / size))) <= this.params.work.campTiles;
  }

  /** Collective needs of a camp (recomputed at most once per game hour). */
  needs(camp: number): CampNeeds {
    const state = this.camps[camp]!;
    const hour = Math.floor(this.tick / this.ticksPerHour);
    if (state.needsHour !== hour) {
      state.needsHour = hour;
      computeNeeds(this, state);
    }
    return state.needs;
  }

  ticksPerHour = 1;

  // ----- people's objects ------------------------------------------------------------------

  /** Load a person can carry (a basket helps). */
  carryCapacity(person: number): number {
    let bonus = 0;
    for (const pile of this.carried[person]!.piles) bonus = Math.max(bonus, this.catalog.items[pile.item]!.carryBonus);
    return this.body.carryCapacity + bonus;
  }

  /** Share of the load already taken (0..1). */
  load(person: number): number {
    return Math.min(1, this.carried[person]!.bulk(this.catalog.bulk) / this.carryCapacity(person));
  }

  /** Share of the load taken by goods for the camp (not what one wears or carries with). */
  goodsLoad(person: number): number {
    let bulk = 0;
    for (const pile of this.carried[person]!.piles) if (depositable(this, pile.item)) bulk += pile.qty * this.catalog.bulk[pile.item]!;
    return Math.min(1, bulk / this.carryCapacity(person));
  }

  /** Carrying goods for a job under way (inputs to craft, materials to deliver, wood for the fire). */
  carriesForWork(person: number): boolean {
    const job = this.jobs[person];
    return job !== null && job !== undefined && job.kind !== 'harvest' && job.kind !== 'deposit' && job.stage !== Stage.Fetch;
  }

  room(person: number): number {
    return Math.max(0, this.carryCapacity(person) - this.carried[person]!.bulk(this.catalog.bulk));
  }

  carriedFood(person: number): number {
    return this.carried[person]!.food(this.catalog.food);
  }

  /** Food value in the common stock of a camp. */
  stockFood(camp: number): number {
    return this.camps[camp]!.stock.food(this.catalog.food);
  }

  /** Does the person have (or the stock hold) something to feed the fire? */
  fuelAvailable(person: number): boolean {
    return this.hasFuel(this.carried[person]!) || this.hasFuel(this.camps[this.people.camp(person)]!.stock);
  }

  private hasFuel(inventory: Inventory): boolean {
    for (const pile of inventory.piles) if (this.catalog.fuel[pile.item]! > 0 && this.catalog.items[pile.item]!.category === 'material') return true;
    return false;
  }

  /** Warmth of the best clothing worn (degrees). */
  clothingWarmth(person: number): number {
    let best = 0;
    for (const pile of this.carried[person]!.piles) {
      const warmth = this.catalog.items[pile.item]!.warmthCelsius;
      if (warmth > 0 && pile.qty >= 1 - 1e-9) best = Math.max(best, warmth * (0.5 + 0.5 * pile.quality));
    }
    return best;
  }

  /** Warmth felt from a lit fire of the camp nearby. */
  fireWarmthAt(camp: number, x: number, y: number): number {
    const fire = this.fireOf(camp);
    if (!fire || fire.fuel <= 0) return 0;
    const def = this.typeOf(fire).def;
    const size = this.size;
    const d = Math.max(Math.abs(x - (fire.tile % size)), Math.abs(y - Math.floor(fire.tile / size)));
    return d <= def.warmthTiles ? def.warmthCelsius : 0;
  }

  /** Tile of the person's bed and the shelter's warmth (-1 / 0 when sleeping in the open). */
  bed(person: number): { tile: number; warmth: number } {
    const building = this.buildings[this.bedOf[person]!];
    if (!building || building.state !== BuildState.Done) return { tile: -1, warmth: 0 };
    return { tile: building.tile, warmth: this.typeOf(building).def.warmthCelsius };
  }

  /**
   * Eats up to `units` of food value, the food that spoils first first: from what the person
   * carries, or from the common stock. Returns the food value eaten.
   */
  eat(person: number, units: number, fromStock: boolean): number {
    const inventory = fromStock ? this.camps[this.people.camp(person)]!.stock : this.carried[person]!;
    let eaten = 0;
    while (eaten < units - 1e-9) {
      let best = -1;
      let bestLife = Infinity;
      for (let k = 0; k < inventory.piles.length; k++) {
        const pile = inventory.piles[k]!;
        const food = this.catalog.food[pile.item]!;
        if (food <= 0) continue;
        const life = this.catalog.halfLife[pile.item]! || Number.MAX_VALUE;
        if (life < bestLife) {
          bestLife = life;
          best = k;
        }
      }
      if (best < 0) break;
      const pile = inventory.piles[best]!;
      const food = this.catalog.food[pile.item]!;
      const taken = inventory.take(pile.item, (units - eaten) / food);
      eaten += taken.qty * food;
    }
    return eaten;
  }

  /**
   * A gift of food: up to `units` of food value pass from what `from` carries to `to` (what spoils
   * first goes first). Returns the food value given.
   */
  giveFood(from: number, to: number, units: number): number {
    const source = this.carried[from]!;
    const target = this.carried[to]!;
    let given = 0;
    while (given < units - 1e-9) {
      let best = -1;
      let bestLife = Infinity;
      for (let k = 0; k < source.piles.length; k++) {
        const pile = source.piles[k]!;
        if (this.catalog.food[pile.item]! <= 0) continue;
        const life = this.catalog.halfLife[pile.item]! || Number.MAX_VALUE;
        if (life < bestLife) {
          bestLife = life;
          best = k;
        }
      }
      if (best < 0) break;
      const item = source.piles[best]!.item;
      const food = this.catalog.food[item]!;
      const taken = source.take(item, (units - given) / food);
      target.put(item, taken.qty, taken.quality, to);
      given += taken.qty * food;
    }
    return given;
  }

  /** A tool the person carries twice or more (one could be given away), or -1. */
  spareItem(person: number): number {
    for (const pile of this.carried[person]!.piles) {
      if (this.catalog.items[pile.item]!.category === 'tool' && this.carried[person]!.count(pile.item) >= 2 - 1e-9) return pile.item;
    }
    return -1;
  }

  hasItem(person: number, item: number): boolean {
    return this.carried[person]!.count(item) >= 1 - 1e-9;
  }

  /** A gift of one object; returns 1 if it changed hands. */
  giveItem(from: number, to: number, item: number): number {
    const taken = this.carried[from]!.take(item, 1);
    if (taken.qty <= 0) return 0;
    this.carried[to]!.put(item, taken.qty, taken.quality, to);
    return 1;
  }

  /** Common stock of a camp. */
  stockOf(camp: number): Inventory {
    return this.camps[camp]!.stock;
  }

  // ----- jobs ------------------------------------------------------------------------------

  /** Starts a job; returns the first tile to go to, or -1 if there is nothing to do. */
  startJob(person: number, spec: JobSpec): number {
    return startJob(this, person, spec);
  }

  /** One step of work once on the job's tile. */
  workAt(person: number, hours: number): WorkResult {
    return workAt(this, person, hours);
  }

  /** Is the person out hunting game (what the animals see of her)? */
  isHunting(person: number): boolean {
    const recipe = this.jobs[person]?.recipe;
    return recipe !== null && recipe !== undefined && recipe.prey.length > 0;
  }

  /** Drops the person's job (the brain chose something else). */
  endJob(person: number): void {
    const job = this.jobs[person];
    if (job && job.pending >= 0) this.camps[this.people.camp(person)]!.pending[job.pending]! -= job.pendingQty;
    if (job) {
      releaseClaim(this, job);
      releaseExpected(this, person, job);
      leaveUnfinished(this, person, job);
    }
    this.jobs[person] = null;
  }

  /** Room taken in a stock by what must be kept from animals and weather (food). */
  foodBulk(inventory: Inventory): number {
    let bulk = 0;
    for (const pile of inventory.piles) if (this.catalog.food[pile.item]! > 0) bulk += pile.qty * this.catalog.bulk[pile.item]!;
    return bulk;
  }

  // ----- time ------------------------------------------------------------------------------

  /** Every human step: fires burn. */
  runStep(hours: number, tick: number): void {
    this.tick = tick;
    for (const building of this.buildings) if (building.fuel > 0) building.fuel = Math.max(0, building.fuel - hours);
  }

  /** Every day: food spoils (faster when warm, slower in a cache), sown fields grow. */
  dailyUpdate(): void {
    const { params, catalog } = this;
    const spoilage = params.spoilage;
    for (let person = 0; person < this.carried.length; person++) {
      const inventory = this.carried[person]!;
      if (inventory.isEmpty) continue;
      const tile = this.people.y(person) * this.size + this.people.x(person);
      spoil(inventory, 1, spoilFactor(this.climate.temperatureAt(tile), spoilage), catalog.halfLife, params.stock.minQuantity);
    }
    for (const camp of this.camps) {
      if (!camp || camp.stock.isEmpty) continue;
      const { capacity, spoilFactor: storeFactor } = this.storageOf(camp.id);
      const bulk = this.foodBulk(camp.stock);
      const sheltered = bulk > 0 ? Math.min(1, capacity / bulk) : 1;
      const container = sheltered * storeFactor + (1 - sheltered) * params.stock.openPileSpoilFactor;
      const weather = spoilFactor(this.climate.temperatureAt(this.stockTile(camp.id)), spoilage);
      spoil(camp.stock, 1, weather * container, catalog.halfLife, params.stock.minQuantity);
    }
    for (const building of this.buildings) {
      if (building.state !== BuildState.Done || building.sown <= 0) continue;
      if (this.climate.temperatureAt(building.tile) >= params.crop.minCelsius) building.growth += 1;
      if (building.growth >= params.crop.growthDays) {
        building.grain += building.sown * params.crop.grainPerSeed;
        building.straw += building.sown * params.crop.strawPerSeed;
        building.sown = 0;
        building.growth = 0;
      }
    }
  }

  // ----- buildings -------------------------------------------------------------------------

  addBuilding(type: BuildingType, camp: number, tile: number, state: (typeof BuildState)[keyof typeof BuildState]): Building {
    const building = newBuilding(this.buildings.length, type, camp, tile, state);
    this.buildings.push(building);
    this.buildingsChanged();
    return building;
  }

  /** A site is finished: the building works, its builders are written in the journal. */
  completeBuilding(building: Building): void {
    building.state = BuildState.Done;
    this.buildingsChanged();
    const type = this.typeOf(building);
    building.fuel = type.def.fuelMaxHours;
    if (type.def.sleeps > 0) this.settle(building);
    this.camps[building.camp]!.needsHour = -1;
    publishBuildingDone(this, building);
  }

  /** New shelter: the people without a bed move in, the main builder's family first. */
  private settle(building: Building): void {
    const sleeps = this.typeOf(building).def.sleeps;
    const first = building.builders[0];
    const family = first === undefined ? [] : [first, ...this.people.family(first)];
    const candidates = [...family];
    for (let person = 0; person < this.people.count; person++) candidates.push(person);
    for (const person of candidates) {
      if (building.residents.length >= sleeps) break;
      if (!this.people.alive(person) || this.people.camp(person) !== building.camp || this.bedOf[person]! >= 0) continue;
      building.residents.push(person);
      this.bedOf[person] = building.id;
    }
  }

  /** A dead person's bed is freed. */
  forgetPerson(person: number): void {
    const building = this.buildings[this.bedOf[person]!];
    if (building) building.residents = building.residents.filter((resident) => resident !== person);
    this.bedOf[person] = -1;
    this.endJob(person);
  }

  /**
   * Where a new building goes: the fire at the heart of the camp, the others on free dry land in a
   * ring around it (a field needs land without a plant). -1 if no room.
   */
  siteTile(camp: number, type: BuildingType): number {
    const center = this.camps[camp]!.center;
    const size = this.size;
    const cx = center % size;
    const cy = Math.floor(center / size);
    const free = (tile: number): boolean =>
      this.world.ocean[tile] === 0 &&
      this.world.water[tile] === Water.None &&
      !this.buildings.some((b) => b.tile === tile && b.state !== BuildState.Abandoned) &&
      // A field needs bare land; nobody builds in a tree.
      (type.def.function === 'field' ? this.flora.speciesAt(tile) === undefined : this.flora.speciesAt(tile)?.kind !== 'tree');
    if (type.def.function === 'fire' && free(center)) return center;
    const { buildRingMin, buildRingMax } = this.params.work;
    const start = type.def.function === 'fire' ? 1 : buildRingMin;
    for (let ring = start; ring <= buildRingMax; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring || (dx + dy) % 2 !== 0) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= size || y >= size) continue;
          if (free(y * size + x)) return y * size + x;
        }
      }
    }
    return -1;
  }

  get ticksPerDay(): number {
    return this.ticksPerHour * HOURS_PER_DAY;
  }

  /** Puts an object in the common stock; a first of its kind for the tribe is remembered. */
  storeInCamp(camp: number, item: number, qty: number, quality: number): void {
    this.camps[camp]!.stock.put(item, qty, quality, campOwner(camp));
  }
}
