import type { Attack, AttackOutcome, Interactions } from '../../core/interactions';
import type { Journal } from '../../core/journal';
import type { Rng } from '../../core/rng';
import { SpatialGrid } from '../../core/spatial-grid';
import { fillTemplate } from '../../core/text';
import type { FaunaSystem } from '../fauna/fauna-system';
import type { FloraSystem } from '../flora/flora-system';
import type { ClimateState } from '../world/climate-state';
import { describeLocation } from '../world/places';
import type { WeatherState } from '../world/weather';
import type { World } from '../world/world';
import type { KnowledgeCatalog } from '../../core/knowledge';
import type { ProductionSystem } from '../production/production-system';
import type { WorkerView } from '../production/worker-view';
import { performAction, startAction } from './actions';
import { liveHours } from './body';
import { compileActions, rankActions, scoreAction, TOP_ACTIONS, type CompiledAction } from './brain';
import { Camp } from './camp';
import { considerMoving } from './camp-move';
import { createTribes } from './tribe';
import { DeathCause, People } from './people';
import { INPUTS, type Behavior, type HumanParams } from './params';
import { Pathfinder } from './pathfinding';
import { Terrain } from './terrain';

export const SETTLEMENT = 'humans.settlement';
export const HUMAN_DEATH = 'humans.death';
const FULL = 100;
const MINUTES_PER_HOUR = 60;
const CHILD_AGE = 14;
const EXPLORE_ATTEMPTS = 4;
/** Cell size of the grid that lets the others find people quickly (technical, not gameplay). */
const GRID_CELL_TILES = 16;
type WalkResult = 'moving' | 'arrived' | 'stuck';

/**
 * Humans (version 1): needs, body, spatial memory and a utility-AI brain that picks an action
 * among those of data/humans.json. Each person acts `stepsPerHour` times per hour and rethinks
 * its decision only when the action ends, when danger appears, or after `thinkEveryMinutes`.
 */
export class IndividualsSystem {
  readonly people: People;
  readonly camps: Camp[] = [];
  readonly terrain: Terrain;
  readonly actions: CompiledAction[];
  /** Plant resources people know to be edible (from the food value of the items). */
  readonly edibleResources = new Set<string>();
  readonly size: number;
  /** Where people are, rebuilt after each step: what the rest of the world perceives of them. */
  readonly grid: SpatialGrid;
  private readonly pathfinder: Pathfinder;
  private predatorCodes: Uint8Array;
  private readonly inputs = new Float64Array(INPUTS.length);
  private readonly scores: Float64Array;
  private readonly order: number[] = [];
  private thinkSteps: number;
  step = 0;
  hour = 0;
  private absoluteDay = 0;

  constructor(
    readonly world: World,
    readonly climate: ClimateState,
    readonly weather: WeatherState,
    readonly flora: FloraSystem,
    readonly fauna: FaunaSystem,
    readonly params: HumanParams,
    readonly knowledge: KnowledgeCatalog,
    readonly production: ProductionSystem,
    readonly rng: Rng,
    readonly journal: Journal,
    tick: number,
    interactions: Interactions,
  ) {
    this.size = world.size;
    this.terrain = new Terrain(world, flora, params.terrain);
    this.pathfinder = new Pathfinder(world.size, this.terrain, params.terrain.maxPathNodes, params.terrain.heuristicWeight);
    this.actions = [];
    this.predatorCodes = new Uint8Array(0);
    this.thinkSteps = 1;
    this.refreshParams();
    this.scores = new Float64Array(this.actions.length);
    const created = createTribes(this, rng);
    this.people = created.people;
    this.camps.push(...created.camps);
    for (const camp of this.camps) camp.computeWayHome(this.terrain);
    production.attachPeople(this.workerView());
    created.families.forEach((families, camp) => production.foundCamp(camp, this.camps[camp]!.center, families));
    for (let p = 0; p < this.people.count; p++) this.people.nextThink[p] = p % this.thinkSteps;
    this.grid = new SpatialGrid(world.size, GRID_CELL_TILES);
    this.rebuildGrid();
    interactions.register(
      'human',
      {
        forEachNear: (x, y, radius, visit) => this.grid.forEachNear(x, y, radius, visit),
        x: (person) => this.people.x[person]!,
        y: (person) => this.people.y[person]!,
        alive: (person) => this.people.alive[person] === 1,
      },
      { sufferAttack: (person, attack, journal) => this.sufferAttack(person, attack, journal) },
    );
    this.publishSettlements(journal, tick);
  }

  /** Recomputes what is derived from the parameters (after a live change in the variables workshop). */
  refreshParams(): void {
    const { params, production } = this;
    const compiled = compileActions(params, this.knowledge, {
      recipe: (id) => production.catalog.recipe(id)?.index ?? -1,
      item: (id) => production.catalog.itemIndex.get(id) ?? -1,
    });
    this.actions.splice(0, this.actions.length, ...compiled);
    this.edibleResources.clear();
    for (const item of production.catalog.items) if (item.food > 0) this.edibleResources.add(item.id);
    this.predatorCodes = Uint8Array.from(this.fauna.params.species, (species) => (params.danger.predators.includes(species.id) ? 1 : 0));
    this.thinkSteps = Math.max(1, Math.round((params.thinkEveryMinutes / MINUTES_PER_HOUR) * params.stepsPerHour));
    this.pathfinder.maxNodes = params.terrain.maxPathNodes;
    this.pathfinder.heuristicWeight = params.terrain.heuristicWeight;
  }

  private rebuildGrid(): void {
    const { people, grid } = this;
    grid.clear();
    for (let p = 0; p < people.count; p++) if (people.alive[p] === 1) grid.insert(p, grid.cellOf(people.x[p]!, people.y[p]!));
  }

  get stepHours(): number {
    return 1 / this.params.stepsPerHour;
  }

  tileOf(person: number): number {
    return this.people.y[person]! * this.size + this.people.x[person]!;
  }

  isSleeping(person: number): boolean {
    return this.people.working[person] === 1 && this.behavior(person) === 'sleep';
  }

  behavior(person: number): Behavior {
    return this.actions[this.people.action[person]!]!.def.behavior;
  }

  /** What production may read about people (never write). */
  private workerView(): WorkerView {
    const { people } = this;
    return {
      count: people.count,
      alive: (p) => people.alive[p] === 1,
      camp: (p) => people.camp[p]!,
      x: (p) => people.x[p]!,
      y: (p) => people.y[p]!,
      knowledge: (p) => people.knowledge[p]!,
      skill: (p, s) => people.skill(p, s),
      ageYears: (p) => people.ageYears[p]!,
      name: (p) => people.names[p]!,
      female: (p) => people.female[p] === 1,
      family: (p) => {
        const family: number[] = [];
        if (people.spouse[p]! >= 0) family.push(people.spouse[p]!);
        for (const parent of [people.mother[p]!, people.father[p]!]) if (parent >= 0) family.push(parent);
        const { first, last } = this.campMembers(people.camp[p]!);
        for (let q = first; q < last; q++) if (people.mother[q] === p || people.father[q] === p) family.push(q);
        return family;
      },
    };
  }

  /** Practice makes a skill grow (fast at first, slower near mastery) and counts toward the trade. */
  practise(person: number, skill: number, hours: number): void {
    const { people } = this;
    const at = person * people.skillCount + skill;
    const level = people.skills[at]!;
    people.skills[at] = Math.min(1, level + this.params.skillLearning.learnPerHour * hours * (1 - level));
    people.practice[at] = people.practice[at]! + hours;
  }

  /** Food found on a tile: remembered, and how far from the camp one has to go counts for moving. */
  foundFood(person: number, tile: number): void {
    this.remember(person, 'food', tile);
    const distance = this.forageTrip(person, tile);
    if (distance >= this.params.campMove.forageFarTiles) this.people.farFood[person] = tile;
  }

  /** Nothing to eat in sight: the search goes to `tile`, far from the camp. */
  searchedFar(person: number, tile: number): void {
    if (tile >= 0) this.forageTrip(person, tile);
  }

  /** Mean distance from the camp of the last trips for food (what makes one want to move the camp). */
  private forageTrip(person: number, tile: number): number {
    const { people } = this;
    const camp = this.camps[people.camp[person]!]!;
    const x = tile % this.size;
    const distance = camp.distanceTo(x, (tile - x) / this.size);
    const memory = this.params.campMove.memory;
    people.forageDistance[person] = people.forageDistance[person]! * (1 - memory) + distance * memory;
    return distance;
  }

  lightAt(person: number): number {
    return this.climate.daylightAt(this.tileOf(person), this.hour);
  }

  /** One step for every living person (index order: deterministic). */
  runStep(hour: number, absoluteDay: number, journal: Journal, tick: number): void {
    this.hour = hour;
    if (absoluteDay !== this.absoluteDay) {
      this.absoluteDay = absoluteDay;
      this.forgetOldPlaces();
      for (const camp of this.camps) considerMoving(this, camp, absoluteDay, tick);
    }
    const hours = this.stepHours;
    const { people } = this;
    for (let p = 0; p < people.count; p++) {
      if (people.alive[p] === 0) continue;
      const cause = liveHours(this, p, hours);
      if (cause !== DeathCause.None) {
        this.die(p, cause, journal, tick, null);
        continue;
      }
      if ((this.step + p) % this.params.stepsPerHour === 0) this.perceive(p);
      if (this.step >= people.nextThink[p]!) this.think(p);
      if (performAction(this, p, this.actions[people.action[p]!]!, hours)) people.nextThink[p] = this.step + 1;
    }
    this.rebuildGrid();
    this.step++;
  }

  /** Decision (utility AI): score every action, keep the 3 best for the character sheet, start the best possible one. */
  think(person: number): void {
    const { people, params } = this;
    this.computeInputs(person);
    const current = people.action[person]!;
    const traitOffset = person * people.traitCount;
    const age = people.ageYears[person]!;
    for (let k = 0; k < this.actions.length; k++) {
      const action = this.actions[k]!;
      if ((action.requiredBit !== 0 && (people.knowledge[person]! & action.requiredBit) === 0) || age < action.minAge) {
        this.scores[k] = 0;
        continue;
      }
      let score = scoreAction(action, this.inputs, people.traits, traitOffset);
      score *= 1 + params.decision.randomness * (this.rng.nextFloat() * 2 - 1);
      if (k === current) {
        score *= 1 + params.decision.keepCurrentBonus;
        if (people.working[person] === 1 && this.production.jobs[person]) score *= 1 + params.decision.keepWorkBonus;
      }
      this.scores[k] = score;
    }
    rankActions(this.scores, this.order);
    for (let t = 0; t < TOP_ACTIONS; t++) {
      people.topActions[person * TOP_ACTIONS + t] = this.order[t] ?? -1;
      people.topScores[person * TOP_ACTIONS + t] = this.scores[this.order[t] ?? 0] ?? 0;
    }
    people.nextThink[person] = this.step + this.thinkSteps;
    for (const k of this.order) {
      if (this.scores[k]! <= 0) break;
      if (k === current && people.target[person]! >= 0) return; // keep going, no need to recompute the way
      if (startAction(this, person, this.actions[k]!)) {
        people.action[person] = k;
        people.reasonValue[person] = this.inputs[this.actions[k]!.reasonInput]!;
        return;
      }
    }
  }

  private computeInputs(person: number): void {
    const { people, params, production } = this;
    const camp = this.camps[people.camp[person]!]!;
    const needs = production.needs(camp.id);
    const input = this.inputs;
    const light = this.lightAt(person);
    const distance = camp.distanceTo(people.x[person]!, people.y[person]!);
    let k = 0;
    input[k++] = people.hunger[person]! / FULL;
    input[k++] = people.thirst[person]! / FULL;
    input[k++] = people.fatigue[person]! / FULL;
    input[k++] = people.cold[person]! / FULL;
    input[k++] = people.danger[person]! / FULL;
    input[k++] = 1 - light;
    input[k++] = light;
    input[k++] = production.carriedFood(person) > 0 || production.stockFood(camp.id) > 0 ? 1 : 0;
    const goods = production.goodsLoad(person);
    input[k++] = goods;
    // Back at the camp with goods in hand, one puts them in the common stock.
    const stock = production.stockTile(camp.id);
    const nearStock = Math.max(Math.abs(people.x[person]! - (stock % this.size)), Math.abs(people.y[person]! - Math.floor(stock / this.size))) <= params.tribe.campRadius;
    input[k++] = production.carriesForWork(person) ? 0 : goods > 0 && nearStock ? Math.max(goods, params.decision.depositAtCamp) : goods;
    input[k++] = production.fuelAvailable(person) ? 1 : 0;
    input[k++] = production.fireLow(camp.id, person);
    input[k++] = production.fireLit(camp.id) ? 1 : 0;
    input[k++] = Math.min(1, distance / params.body.perceptionTiles / 2);
    const mate = this.nearestTribeMember(person);
    const gap = mate < 0 ? 0 : Math.max(Math.abs(people.x[mate]! - people.x[person]!), Math.abs(people.y[mate]! - people.y[person]!));
    input[k++] = Math.min(1, gap / (2 * params.danger.isolationTiles));
    const reserves = production.reserveNeeds(person);
    input[k++] = reserves.food;
    input[k++] = reserves.wood;
    input[k++] = needs.build;
    input[k++] = needs.craft;
    input[k++] = 1;
  }

  /** Every hour: predators in sight (danger) and whether the person is isolated. */
  private perceive(person: number): void {
    const { people, fauna, params } = this;
    const x = people.x[person]!;
    const y = people.y[person]!;
    const radius = params.danger.alertTiles;
    let threat = -1;
    let best = radius + 1;
    fauna.grid.forEachNear(x, y, radius, (slot) => {
      if (this.predatorCodes[fauna.store.species[slot]!] !== 1) return;
      const d = Math.max(Math.abs(fauna.store.x[slot]! - x), Math.abs(fauna.store.y[slot]! - y));
      if (d < best) {
        best = d;
        threat = slot;
      }
    });
    const wasSafe = people.threat[person]! < 0;
    people.threat[person] = threat;
    const mate = this.nearestTribeMember(person);
    const gap = mate < 0 ? Infinity : Math.max(Math.abs(people.x[mate]! - x), Math.abs(people.y[mate]! - y));
    people.isolated[person] = gap > params.danger.isolationTiles ? 1 : 0;
    if (threat >= 0) {
      // Alone, a predator is terrifying; among the others, it is only worrying.
      people.danger[person] = people.isolated[person] === 1 ? FULL : FULL * params.danger.groupFearShare;
      if (wasSafe) people.nextThink[person] = this.step;
    }
  }

  /**
   * A predator's blow (through the interaction mechanism): the person is wounded, terrified and
   * reconsiders at once (flee); if the wound is mortal, the body is left where the person fell.
   */
  private sufferAttack(person: number, attack: Attack, journal: Journal): AttackOutcome {
    const { people, params } = this;
    const x = people.x[person]!;
    const y = people.y[person]!;
    const outcome: AttackOutcome = { killed: false, remains: 0, x, y, eventId: -1 };
    if (people.alive[person] === 0) return outcome;
    people.health[person] = people.health[person]! - attack.damage;
    people.danger[person] = FULL;
    people.nextThink[person] = this.step;
    if (people.health[person]! > 0) return outcome;
    outcome.killed = true;
    outcome.remains = params.danger.corpseMeat;
    outcome.eventId = this.die(person, DeathCause.Predator, journal, attack.tick, attack);
    this.grid.remove(person, this.grid.cellOf(x, y));
    return outcome;
  }

  private die(person: number, cause: number, journal: Journal, tick: number, attack: Attack | null): number {
    const { people } = this;
    people.alive[person] = 0;
    people.deathCause[person] = cause;
    this.production.forgetPerson(person);
    const tile = this.tileOf(person);
    const x = people.x[person]!;
    const y = people.y[person]!;
    const place = describeLocation(this.world.landmasses, this.world.landmassNames, x, y, this.size);
    const texts = this.params.deathTexts;
    const template = cause === DeathCause.Hunger ? texts.hunger : cause === DeathCause.Thirst ? texts.thirst : cause === DeathCause.Cold ? texts.cold : texts.predator;
    const animal = attack?.attackerName ?? '';
    // A death by hunger, thirst or cold inside a hardship region is caused by that hardship.
    const anomaly = this.climate.anomalies[this.climate.anomalyIndex[tile]! - 1];
    const hardship = anomaly && this.climate.params.anomalies.types[anomaly.type]?.hardshipName !== undefined;
    const event = journal.publish({
      tick,
      type: HUMAN_DEATH,
      text: fillTemplate(template, { nom: people.names[person]!, e: people.female[person] ? 'e' : '', lieu: place, un_animal: `un ${animal}` }),
      place: { x, y, label: place },
      actors: attack ? [{ kind: 'human', id: person }, attack.attacker] : [{ kind: 'human', id: person }],
      causes: hardship && cause !== DeathCause.Predator ? [anomaly.startEventId] : [],
      details: { cause, person },
    });
    if (cause === DeathCause.Hunger) this.camps[people.camp[person]!]!.hungerDeaths.push({ day: this.absoluteDay, event });
    return event;
  }

  private publishSettlements(journal: Journal, tick: number): void {
    for (const camp of this.camps) {
      let members = 0;
      for (let p = 0; p < this.people.count; p++) if (this.people.camp[p] === camp.id) members++;
      const place = describeLocation(this.world.landmasses, this.world.landmassNames, camp.centerX, camp.centerY, this.size);
      camp.settledDay = 0;
      journal.publish({
        tick,
        type: SETTLEMENT,
        text: fillTemplate(this.params.settlementText, { personnes: String(members), lieu: place, batiments: this.production.describeBuildings(camp.id) }),
        place: { x: camp.centerX, y: camp.centerY, label: place },
        actors: [],
        causes: [],
        details: { camp: camp.id },
      });
    }
  }

  // ----- movement -------------------------------------------------------------------------

  /** Plans a path to a tile with A*. */
  goTo(person: number, tile: number): boolean {
    const here = this.tileOf(person);
    const path = here === tile ? new Int32Array(0) : this.pathfinder.find(here, tile);
    if (!path) return false;
    this.people.paths[person] = path;
    this.people.pathIndex[person] = 0;
    this.people.target[person] = tile;
    return true;
  }

  /** To a place of work: within the camp, by the known way home (no path search); elsewhere, with A*. */
  goToWork(person: number, tile: number): boolean {
    const camp = this.camps[this.people.camp[person]!]!;
    const x = tile % this.size;
    const near = camp.distanceTo(x, (tile - x) / this.size) <= this.params.tribe.campRadius + 1;
    if (near && camp.stepHome(this.tileOf(person)) >= 0) return this.goHome(person, tile);
    return this.goTo(person, tile);
  }

  /** Heads for a random spot `exploreTiles` away (a few tries to find a reachable one). */
  explore(person: number): boolean {
    const { people, params } = this;
    const r = params.body.exploreTiles;
    for (let attempt = 0; attempt < EXPLORE_ATTEMPTS; attempt++) {
      const x = people.x[person]! + this.rng.nextIntInclusive(-r, r);
      const y = people.y[person]! + this.rng.nextIntInclusive(-r, r);
      if (x < 0 || y < 0 || x >= this.size || y >= this.size) continue;
      const tile = y * this.size + x;
      if (this.terrain.walkable(tile) && this.goTo(person, tile)) return true;
    }
    return false;
  }

  /** Heads for a place of the camp, following the way home (or A* when outside the territory). */
  goHome(person: number, tile: number): boolean {
    const camp = this.camps[this.people.camp[person]!]!;
    if (camp.stepHome(this.tileOf(person)) < 0) return this.goTo(person, tile);
    this.people.paths[person] = null;
    this.people.target[person] = tile;
    return true;
  }

  /** Walks toward the target; calls `onSpot` once there. Returns true when the action is over. */
  arrived(person: number, hours: number, onSpot: () => boolean): boolean {
    if (this.tileOf(person) === this.people.target[person] || this.people.target[person] === -1) return onSpot();
    const result = this.walk(person, hours);
    if (result === 'stuck') return true;
    return result === 'arrived' ? onSpot() : false;
  }

  /** Moves along the path or the way home, at the speed allowed by terrain, weather and age. */
  walk(person: number, hours: number): WalkResult {
    const { people } = this;
    const target = people.target[person]!;
    people.working[person] = 0;
    people.moveProgress[person] = people.moveProgress[person]! + this.params.body.walkTilesPerHour * hours * this.speedFactor(person);
    while (people.moveProgress[person]! >= 1) {
      const here = this.tileOf(person);
      if (here === target) return 'arrived';
      const next = this.nextTile(person, here, target);
      if (next < 0 || !this.terrain.walkable(next)) return 'stuck';
      people.moveProgress[person] = people.moveProgress[person]! - 1;
      people.x[person] = next % this.size;
      people.y[person] = (next - (next % this.size)) / this.size;
    }
    return this.tileOf(person) === target ? 'arrived' : 'moving';
  }

  /** Follows the known path toward the nearest river or lake (for someone who does not know where water is). */
  walkToWater(person: number, hours: number): boolean {
    const { people } = this;
    people.moveProgress[person] = people.moveProgress[person]! + this.params.body.walkTilesPerHour * hours * this.speedFactor(person);
    while (people.moveProgress[person]! >= 1) {
      const next = this.fauna.waterPath[this.tileOf(person)]!;
      if (next < 0) return false;
      if (!this.terrain.walkable(next)) return true;
      people.moveProgress[person] = people.moveProgress[person]! - 1;
      people.x[person] = next % this.size;
      people.y[person] = (next - (next % this.size)) / this.size;
    }
    return true;
  }

  private nextTile(person: number, here: number, target: number): number {
    const { people } = this;
    const path = people.paths[person];
    if (path) {
      const index = people.pathIndex[person]!;
      people.pathIndex[person] = index + 1;
      return index < path.length ? path[index]! : -1;
    }
    const camp = this.camps[people.camp[person]!]!;
    const tx = target % this.size;
    const ty = (target - tx) / this.size;
    const x = people.x[person]!;
    const y = people.y[person]!;
    if (Math.max(Math.abs(tx - x), Math.abs(ty - y)) <= this.params.tribe.campRadius + 1) {
      const step = (y + Math.sign(ty - y)) * this.size + x + Math.sign(tx - x);
      if (this.terrain.walkable(step)) return step;
    }
    return camp.stepHome(here);
  }

  private speedFactor(person: number): number {
    const { people, params } = this;
    const tile = this.tileOf(person);
    let factor = this.terrain.speedOn(tile) * this.weather.typeAt(tile).movementFactor;
    if (people.ageYears[person]! < CHILD_AGE) factor *= params.body.childSpeedFactor;
    if (this.behavior(person) === 'flee') factor *= params.body.fleeSpeedFactor;
    return factor;
  }

  // ----- perception and memory ------------------------------------------------------------

  remember(person: number, kind: 'water' | 'food', tile: number): void {
    const { people } = this;
    const slots = kind === 'water' ? people.waterSlots : people.foodSlots;
    const tiles = kind === 'water' ? people.waterMemory : people.foodMemory;
    const days = kind === 'water' ? people.waterMemoryDay : people.foodMemoryDay;
    const base = person * slots;
    let free = -1;
    let oldest = base;
    for (let s = base; s < base + slots; s++) {
      if (tiles[s] === tile) {
        days[s] = this.absoluteDay;
        return;
      }
      if (tiles[s] === -1 && free < 0) free = s;
      if (days[s]! < days[oldest]!) oldest = s;
    }
    const slot = free >= 0 ? free : oldest;
    if (slot >= base + slots || slots === 0) return;
    tiles[slot] = tile;
    days[slot] = this.absoluteDay;
  }

  forget(person: number, kind: 'water' | 'food', tile: number): void {
    const { people } = this;
    const slots = kind === 'water' ? people.waterSlots : people.foodSlots;
    const tiles = kind === 'water' ? people.waterMemory : people.foodMemory;
    for (let s = person * slots; s < (person + 1) * slots; s++) if (tiles[s] === tile) tiles[s] = -1;
  }

  nearestMemory(person: number, kind: 'water' | 'food'): number {
    const { people } = this;
    const slots = kind === 'water' ? people.waterSlots : people.foodSlots;
    const tiles = kind === 'water' ? people.waterMemory : people.foodMemory;
    const x = people.x[person]!;
    const y = people.y[person]!;
    let best = -1;
    let bestDistance = Infinity;
    for (let s = person * slots; s < (person + 1) * slots; s++) {
      const tile = tiles[s]!;
      if (tile < 0) continue;
      const tx = tile % this.size;
      const d = Math.max(Math.abs(tx - x), Math.abs((tile - tx) / this.size - y));
      if (d < bestDistance) {
        bestDistance = d;
        best = tile;
      }
    }
    return best;
  }

  private forgetOldPlaces(): void {
    const { people, params } = this;
    const limit = this.absoluteDay - params.memory.forgetDays;
    for (let s = 0; s < people.waterMemory.length; s++) if (people.waterMemoryDay[s]! < limit) people.waterMemory[s] = -1;
    for (let s = 0; s < people.foodMemory.length; s++) if (people.foodMemoryDay[s]! < limit) people.foodMemory[s] = -1;
  }

  /** Nearest living member of the same tribe, or -1. */
  nearestTribeMember(person: number): number {
    const { people } = this;
    const camp = people.camp[person]!;
    const x = people.x[person]!;
    const y = people.y[person]!;
    let best = -1;
    let bestDistance = Infinity;
    const { first, last } = this.campMembers(camp);
    for (let other = first; other < last; other++) {
      if (other === person || people.alive[other] === 0) continue;
      const d = Math.max(Math.abs(people.x[other]! - x), Math.abs(people.y[other]! - y));
      if (d < bestDistance) {
        bestDistance = d;
        best = other;
      }
    }
    return best;
  }

  /** Tribe members are stored contiguously: [first, last) for a camp. */
  campMembers(camp: number): { first: number; last: number } {
    return this.campRanges[camp] ?? { first: 0, last: 0 };
  }

  readonly campRanges: { first: number; last: number }[] = [];
}
