import type { Journal } from '../../core/journal';
import type { Rng } from '../../core/rng';
import { fillTemplate } from '../../core/text';
import type { FaunaSystem } from '../fauna/fauna-system';
import type { FloraSystem } from '../flora/flora-system';
import type { ClimateState } from '../world/climate-state';
import { describeLocation } from '../world/places';
import type { WeatherState } from '../world/weather';
import type { World } from '../world/world';
import { performAction, startAction } from './actions';
import { liveHours } from './body';
import { compileActions, rankActions, scoreAction, TOP_ACTIONS, type CompiledAction } from './brain';
import { Camp } from './camp';
import { createTribes } from './tribe';
import { DeathCause, People } from './people';
import { INPUTS, type ActionId, type HumanParams } from './params';
import { Pathfinder } from './pathfinding';
import { Terrain } from './terrain';

export const SETTLEMENT = 'humans.settlement';
export const HUMAN_DEATH = 'humans.death';
const FULL = 100;
const MINUTES_PER_HOUR = 60;
const CHILD_AGE = 14;
const EXPLORE_ATTEMPTS = 4;
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
  readonly edibleValue: Map<string, number>;
  readonly size: number;
  private readonly pathfinder: Pathfinder;
  private readonly predatorCodes: Uint8Array;
  private readonly inputs = new Float64Array(INPUTS.length);
  private readonly scores: Float64Array;
  private readonly order: number[] = [];
  private readonly thinkSteps: number;
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
    private readonly rng: Rng,
    journal: Journal,
    tick: number,
  ) {
    this.size = world.size;
    this.terrain = new Terrain(world, flora, params.terrain);
    this.pathfinder = new Pathfinder(world.size, this.terrain, params.terrain.maxPathNodes, params.terrain.heuristicWeight);
    this.actions = compileActions(params);
    this.scores = new Float64Array(this.actions.length);
    this.edibleValue = new Map(Object.entries(params.edibleResources));
    this.predatorCodes = Uint8Array.from(fauna.params.species, (species) => (params.danger.predators.includes(species.id) ? 1 : 0));
    this.thinkSteps = Math.max(1, Math.round((params.thinkEveryMinutes / MINUTES_PER_HOUR) * params.stepsPerHour));
    const created = createTribes(this, rng);
    this.people = created.people;
    this.camps.push(...created.camps);
    for (const camp of this.camps) camp.computeWayHome(this.terrain);
    for (let p = 0; p < this.people.count; p++) this.people.nextThink[p] = p % this.thinkSteps;
    this.publishSettlements(journal, tick);
  }

  get stepHours(): number {
    return 1 / this.params.stepsPerHour;
  }

  tileOf(person: number): number {
    return this.people.y[person]! * this.size + this.people.x[person]!;
  }

  isSleeping(person: number): boolean {
    return this.people.working[person] === 1 && this.actionId(person) === 'sleep';
  }

  actionId(person: number): ActionId {
    return this.actions[this.people.action[person]!]!.def.id;
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
    }
    const hours = this.stepHours;
    for (const camp of this.camps) camp.fuel = Math.max(0, camp.fuel - hours);
    const { people } = this;
    for (let p = 0; p < people.count; p++) {
      if (people.alive[p] === 0) continue;
      const cause = liveHours(this, p, hours);
      if (cause !== DeathCause.None) {
        this.die(p, cause, journal, tick, -1);
        continue;
      }
      if ((this.step + p) % this.params.stepsPerHour === 0) this.perceive(p);
      if (this.predatorAttack(p, journal, tick)) continue;
      if (this.step >= people.nextThink[p]!) this.think(p);
      if (performAction(this, p, this.actionId(p), hours)) people.nextThink[p] = this.step + 1;
    }
    this.step++;
  }

  /** Decision (utility AI): score every action, keep the 3 best for the character sheet, start the best possible one. */
  think(person: number): void {
    const { people, params } = this;
    this.computeInputs(person);
    const current = people.action[person]!;
    const traitOffset = person * people.traitCount;
    for (let k = 0; k < this.actions.length; k++) {
      const action = this.actions[k]!;
      if (action.requiredBit !== 0 && (people.knowledge[person]! & action.requiredBit) === 0) {
        this.scores[k] = 0;
        continue;
      }
      let score = scoreAction(action, this.inputs, people.traits, traitOffset);
      score *= 1 + params.decision.randomness * (this.rng.nextFloat() * 2 - 1);
      if (k === current) score *= 1 + params.decision.keepCurrentBonus;
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
      if (startAction(this, person, this.actions[k]!.def.id)) {
        people.action[person] = k;
        people.reasonValue[person] = this.inputs[this.actions[k]!.reasonInput]!;
        return;
      }
    }
  }

  private computeInputs(person: number): void {
    const { people, params } = this;
    const camp = this.camps[people.camp[person]!]!;
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
    input[k++] = people.food[person]! > 0 ? 1 : 0;
    input[k++] = people.food[person]! / params.body.carryFood;
    input[k++] = people.branches[person]! > 0 ? 1 : 0;
    input[k++] = people.branches[person]! / params.body.carryBranches;
    input[k++] = 1 - camp.fuel / params.camp.maxFuelHours;
    input[k++] = camp.lit ? 1 : 0;
    input[k++] = Math.min(1, distance / params.body.perceptionTiles / 2);
    const mate = this.nearestTribeMember(person);
    const gap = mate < 0 ? 0 : Math.max(Math.abs(people.x[mate]! - people.x[person]!), Math.abs(people.y[mate]! - people.y[person]!));
    input[k++] = Math.min(1, gap / (2 * params.danger.isolationTiles));
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
   * A hungry predator nearby closes in on an isolated person and may attack.
   * (The animal's move and meal are written into the fauna's state.)
   */
  private predatorAttack(person: number, journal: Journal, tick: number): boolean {
    const { people, fauna, params } = this;
    const predator = people.threat[person]!;
    if (predator < 0 || people.isolated[person] === 0 || fauna.store.alive[predator] === 0) return false;
    if (fauna.store.hunger[predator]! < params.danger.predatorMinHunger) return false;
    const px = fauna.store.x[predator]!;
    const py = fauna.store.y[predator]!;
    const x = people.x[person]!;
    const y = people.y[person]!;
    if (Math.max(Math.abs(px - x), Math.abs(py - y)) > 1) {
      const nx = px + Math.sign(x - px);
      const ny = py + Math.sign(y - py);
      if (fauna.isWalkable(nx, ny)) fauna.place(predator, nx, ny);
      return false;
    }
    if (this.rng.nextFloat() >= params.danger.attackChancePerStep) return false;
    people.health[person] = people.health[person]! - params.danger.attackDamage;
    people.danger[person] = FULL;
    if (people.health[person]! > 0) return false;
    fauna.store.hunger[predator] = 0;
    fauna.carrion.add(this.tileOf(person), params.danger.corpseMeat);
    this.die(person, DeathCause.Predator, journal, tick, fauna.store.species[predator]!);
    return true;
  }

  private die(person: number, cause: number, journal: Journal, tick: number, animalSpecies: number): void {
    const { people } = this;
    people.alive[person] = 0;
    people.deathCause[person] = cause;
    const tile = this.tileOf(person);
    const x = people.x[person]!;
    const y = people.y[person]!;
    const place = describeLocation(this.world.landmasses, this.world.landmassNames, x, y, this.size);
    const texts = this.params.deathTexts;
    const template = cause === DeathCause.Hunger ? texts.hunger : cause === DeathCause.Thirst ? texts.thirst : cause === DeathCause.Cold ? texts.cold : texts.predator;
    const animal = this.fauna.params.species[animalSpecies]?.name.toLowerCase() ?? '';
    // A death by hunger, thirst or cold inside a hardship region is caused by that hardship.
    const anomaly = this.climate.anomalies[this.climate.anomalyIndex[tile]! - 1];
    const hardship = anomaly && this.climate.params.anomalies.types[anomaly.type]?.hardshipName !== undefined;
    journal.publish({
      tick,
      type: HUMAN_DEATH,
      text: fillTemplate(template, { nom: people.names[person]!, e: people.female[person] ? 'e' : '', lieu: place, un_animal: `un ${animal}` }),
      place: { x, y, label: place },
      actors: [{ kind: 'human', id: person }],
      causes: hardship && cause !== DeathCause.Predator ? [anomaly.startEventId] : [],
      details: { cause, person },
    });
  }

  private publishSettlements(journal: Journal, tick: number): void {
    for (const camp of this.camps) {
      let members = 0;
      for (let p = 0; p < this.people.count; p++) if (this.people.camp[p] === camp.id) members++;
      const place = describeLocation(this.world.landmasses, this.world.landmassNames, camp.fireX, camp.fireY, this.size);
      journal.publish({
        tick,
        type: SETTLEMENT,
        text: fillTemplate(this.params.settlementText, { personnes: String(members), lieu: place, huttes: String(camp.huts.length) }),
        place: { x: camp.fireX, y: camp.fireY, label: place },
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
    if (this.actionId(person) === 'flee') factor *= params.body.fleeSpeedFactor;
    return factor;
  }

  // ----- perception and memory ------------------------------------------------------------

  /** Best edible plant in sight (value / distance), or the nearest remembered one. */
  findFood(person: number): number {
    const { people, params } = this;
    const r = params.body.perceptionTiles;
    const x0 = people.x[person]!;
    const y0 = people.y[person]!;
    let best = -1;
    let bestScore = 0;
    for (let y = Math.max(0, y0 - r); y <= Math.min(this.size - 1, y0 + r); y++) {
      for (let x = Math.max(0, x0 - r); x <= Math.min(this.size - 1, x0 + r); x++) {
        const tile = y * this.size + x;
        const produce = this.flora.speciesAt(tile)?.produce;
        if (!produce) continue;
        const value = this.edibleValue.get(produce.resource) ?? 0;
        if (value <= 0) continue;
        const available = this.flora.produceAvailable(tile, produce.resource) * value;
        if (available <= 0) continue;
        const score = available / (1 + Math.max(Math.abs(x - x0), Math.abs(y - y0)));
        if (score > bestScore) {
          bestScore = score;
          best = tile;
        }
      }
    }
    return best >= 0 ? best : this.nearestMemory(person, 'food');
  }

  /** Nearest tree or shrub in sight that has branches. */
  findWood(person: number): number {
    const { people, params } = this;
    const r = params.body.perceptionTiles;
    const x0 = people.x[person]!;
    const y0 = people.y[person]!;
    let best = -1;
    let bestDistance = Infinity;
    for (let y = Math.max(0, y0 - r); y <= Math.min(this.size - 1, y0 + r); y++) {
      for (let x = Math.max(0, x0 - r); x <= Math.min(this.size - 1, x0 + r); x++) {
        const plant = this.flora.speciesAt(y * this.size + x);
        if (!plant || plant.kind === 'herb' || !plant.materials?.some((m) => m.resource === 'branches')) continue;
        const d = Math.max(Math.abs(x - x0), Math.abs(y - y0));
        if (d < bestDistance) {
          bestDistance = d;
          best = y * this.size + x;
        }
      }
    }
    return best;
  }

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
