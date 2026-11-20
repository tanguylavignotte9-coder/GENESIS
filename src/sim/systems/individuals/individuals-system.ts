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
import { moveCamp } from './camp-move';
import type { GroupView } from './group-view';
import { createTribes } from './tribe';
import { DeathCause, People } from './people';
import { INPUTS, type Behavior, type HumanParams } from './params';
import { Pathfinder, smoothPath } from './pathfinding';
import { advance, distance, personalSpot, ringSpot, separation, speedOf, steer, stop, updateGait, type SteerGoal } from '../../core/motion';
import { Terrain } from './terrain';
import { SocialLife } from './social/social-life';
import type { SocialParams } from './social/params';
import { LifeCycle } from './life/life-cycle';
import type { LifeParams } from './life/params';
import { diseaseDeathInfo, weakenedInfo } from './life/disease';
import { inheritTraits } from './life/birth';
import type { NameGenerator } from './names';
import { SOCIAL_INPUTS } from './social/inputs';
import type { TimeParams } from '../../core/time-params';

export const SETTLEMENT = 'humans.settlement';
export const HUMAN_DEATH = 'humans.death';
const FULL = 100;
const MINUTES_PER_HOUR = 60;
/** What the journal says of each death cause (index = DeathCause). */
const DEATH_TEXT_KEYS = ['hunger', 'hunger', 'thirst', 'cold', 'predator', 'oldAge', 'disease', 'childbirth'] as const;
const EXPLORE_ATTEMPTS = 4;
const MARSH_BIOME = 'marsh';
/** Cell size of the grid that lets the others find people quickly (technical, not gameplay). */
const GRID_CELL_TILES = 16;
type WalkResult = 'moving' | 'arrived' | 'stuck';
/** Below this distance in a step, the person did not move (technical). */
const BLOCKED_TILES = 0.005;
/** Tiles of the way home looked at ahead, and of the way to water (technical). */
const HOME_LOOKAHEAD = 4;
const WATER_LOOKAHEAD = 3;
/** Speed (tiles per hour) above which someone is walking, not standing. */
const WALKING_SPEED = 0.5;
/** Two walkers go "the same way" when their headings are this close (cosine). */
const SAME_WAY = 0.7;
/** A following child keeps this share of its distance to the side of its guardian. */
const FOLLOW_SIDE_SHARE = 0.6;
/** A child this many times its following distance from its standing guardian is by her side. */
const FOLLOW_STAND_FACTOR = 1.6;
/** One stops a little short of the person one walks up to. */
const APPROACH_STOP_SHARE = 0.8;
const HALF = 0.5;
const METERS_PER_100 = 100;
const EPSILON = 1e-6;
/** Places looked at around one spot (technical: three rings of 16). */
const SPOT_SLOTS = 48;
const NEAR_BUFFER = 256;

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
  /** Relations, emotions, memories, conversations, news and ambitions (step 7). */
  readonly social: SocialLife;
  /** Birth, childhood, ageing, diseases, orphans and inheritance (step 8). */
  readonly life: LifeCycle;
  private readonly names: NameGenerator;
  /** People of the starting tribes (the others were born in the world). */
  readonly startingCount: number;
  private readonly pathfinder: Pathfinder;
  private predatorCodes: Uint8Array;
  private readonly inputs = new Float64Array(INPUTS.length);
  private readonly scores: Float64Array;
  private readonly order: number[] = [];
  private thinkSteps: number;
  private readonly spot = { x: 0, y: 0 };
  private readonly takenSlots = new Uint8Array(SPOT_SLOTS);
  /** Neighbours looked at for avoidance, and those that do not count (technical buffers). */
  private readonly near = new Int32Array(NEAR_BUFFER);
  private noAvoid = new Uint8Array(0);
  private readonly push = { x: 0, y: 0 };
  private readonly way = { x: 0, y: 0, final: true };
  private readonly goal: SteerGoal = { x: 0, y: 0, speed: 0, accel: 0, arrive: true, pushX: 0, pushY: 0 };
  /** Biome index of marshes (slow going), -1 if none. */
  private readonly marshBiome: number;
  /** Ground a person may walk on. */
  walkableTile!: (tile: number) => boolean;
  /** The groups system (step 9): duties, inheritance rules, political ambitions. */
  groups: GroupView | null = null;
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
    socialParams: SocialParams,
    lifeParams: LifeParams,
    time: TimeParams,
    readonly knowledge: KnowledgeCatalog,
    readonly production: ProductionSystem,
    readonly rng: Rng,
    readonly journal: Journal,
    tick: number,
    readonly interactions: Interactions,
  ) {
    this.size = world.size;
    this.marshBiome = world.biomes.biomes.findIndex((biome) => biome.id === MARSH_BIOME);
    this.terrain = new Terrain(world, flora, params.terrain);
    this.pathfinder = new Pathfinder(world.size, this.terrain, params.terrain.maxPathNodes, params.terrain.heuristicWeight);
    this.actions = [];
    this.predatorCodes = new Uint8Array(0);
    this.thinkSteps = 1;
    this.refreshParams();
    this.scores = new Float64Array(this.actions.length);
    const created = createTribes(this, rng);
    this.people = created.people;
    this.startingCount = created.people.count;
    this.names = created.names;
    this.camps.push(...created.camps);
    for (const camp of this.camps) camp.computeWayHome(this.terrain);
    production.attachPeople(this.workerView());
    created.families.forEach((families, camp) => production.foundCamp(camp, this.camps[camp]!.center, families));
    for (let p = 0; p < this.people.count; p++) this.people.nextThink[p] = p % this.thinkSteps;
    this.grid = new SpatialGrid(world.size, GRID_CELL_TILES);
    this.rebuildGrid();
    this.life = new LifeCycle(this, lifeParams, time, rng, journal, this.names);
    this.social = new SocialLife(this, socialParams, time, rng, journal);
    this.bindCallbacks();
    this.publishSettlements(journal, tick);
  }

  /** Saving: callbacks are rebuilt after loading. */
  transientKeys(): readonly string[] {
    return ['walkableTile'];
  }

  afterLoad(): void {
    this.bindCallbacks();
    this.production.reattachPeople(this.workerView());
  }

  /** Callbacks handed to the movement code and to the interactions (rebuilt after loading a save). */
  private bindCallbacks(): void {
    this.walkableTile = (tile: number): boolean => this.terrain.walkable(tile);
    this.interactions.register(
      'human',
      {
        forEachNear: (x, y, radius, visit) => this.grid.forEachNear(x, y, radius, visit),
        forEachAlive: (visit) => {
          for (let p = 0; p < this.people.count; p++) if (this.people.alive[p] === 1) visit(p);
        },
        x: (person) => this.people.px[person]!,
        y: (person) => this.people.py[person]!,
        alive: (person) => this.people.alive[person] === 1,
        hunting: (person) => this.production.isHunting(person),
      },
      { sufferAttack: (person, attack, journal) => this.sufferAttack(person, attack, journal) },
    );
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
    const life = (): LifeCycle => this.life;
    return {
      get count() {
        return people.count;
      },
      alive: (p) => people.alive[p] === 1,
      camp: (p) => people.camp[p]!,
      x: (p) => people.x[p]!,
      y: (p) => people.y[p]!,
      px: (p) => people.px[p]!,
      py: (p) => people.py[p]!,
      knowledge: (p) => people.knowledge[p]!,
      skill: (p, s) => people.skill(p, s),
      ageYears: (p) => people.ageYears[p]!,
      vigor: (p) => {
        const share = life().params.aging.workEffect;
        return 1 - share + share * life().vigor(p);
      },
      name: (p) => people.names[p]!,
      female: (p) => people.female[p] === 1,
      family: (p) => {
        const family: number[] = [];
        if (people.spouse[p]! >= 0) family.push(people.spouse[p]!);
        for (const parent of [people.mother[p]!, people.father[p]!]) if (parent >= 0) family.push(parent);
        for (const q of this.campMembers(people.camp[p]!)) if (people.mother[q] === p || people.father[q] === p) family.push(q);
        return family;
      },
    };
  }

  /**
   * Practice makes a skill grow (fast at first, slower near mastery) and counts toward the trade;
   * a child watching (`practice` false) learns without it counting as practice.
   */
  practise(person: number, skill: number, hours: number, practice = true): void {
    const { people } = this;
    const at = person * people.skillCount + skill;
    const level = people.skills[at]!;
    people.skills[at] = Math.min(1, level + this.params.skillLearning.learnPerHour * hours * (1 - level));
    if (!practice) return;
    people.practice[at] = people.practice[at]! + hours;
    this.life.state.lastSkill[person] = skill;
    this.life.state.lastSkillStep[person] = this.step;
  }

  /** Food found on a tile: remembered, and how far from the camp one has to go counts for moving. */
  foundFood(person: number, tile: number): void {
    this.remember(person, 'food', tile);
    const distance = this.forageTrip(person, tile);
    this.social.onFoodFound(person, tile, distance);
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
    this.social.tick = tick;
    if (absoluteDay !== this.absoluteDay) {
      this.absoluteDay = absoluteDay;
      this.social.newDay(absoluteDay);
      this.life.newDay(absoluteDay, tick);
      this.forgetOldPlaces();
    }
    const hours = this.stepHours;
    const { people } = this;
    for (let p = 0; p < people.count; p++) {
      if (people.alive[p] === 0) continue;
      const cause = liveHours(this, p, hours);
      if (cause !== DeathCause.None) {
        this.die(p, cause, tick);
        continue;
      }
      if ((this.step + p) % this.params.stepsPerHour === 0) {
        this.perceive(p);
        this.social.liveHour(p, this.isSleeping(p));
        this.life.liveHour(p);
      }
      if (this.step >= people.nextThink[p]!) this.think(p);
      if (performAction(this, p, this.actions[people.action[p]!]!, hours)) people.nextThink[p] = this.step + 1;
      this.stopIdle(p);
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
    const wantedSkill = this.social.skillAmbition(person);
    for (let k = 0; k < this.actions.length; k++) {
      const action = this.actions[k]!;
      if ((action.requiredBit !== 0 && (people.knowledge[person]! & action.requiredBit) === 0) || age < action.minAge) {
        this.scores[k] = 0;
        continue;
      }
      let score = scoreAction(action, this.inputs, people.traits, traitOffset);
      if (wantedSkill >= 0 && action.skills.includes(wantedSkill)) score *= 1 + this.social.params.ambitions.skillBonus;
      score *= 1 + params.decision.randomness * (this.rng.nextFloat() * 2 - 1);
      if (k === current) {
        score *= 1 + params.decision.keepCurrentBonus;
        if (this.production.jobs[person]) score *= 1 + params.decision.keepWorkBonus;
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
    const nearStock = people.distanceToTile(person, stock, this.size) <= params.tribe.campRadius;
    input[k++] = production.carriesForWork(person) ? 0 : goods > 0 && nearStock ? Math.max(goods, params.decision.depositAtCamp) : goods;
    input[k++] = production.fuelAvailable(person) ? 1 : 0;
    input[k++] = production.fireLow(camp.id, person);
    input[k++] = production.fireLit(camp.id) ? 1 : 0;
    input[k++] = Math.min(1, distance / params.body.perceptionTiles / 2);
    const mate = this.nearestTribeMember(person);
    const gap = mate < 0 ? 0 : people.distance(mate, person);
    input[k++] = Math.min(1, gap / (2 * params.danger.isolationTiles));
    const reserves = production.reserveNeeds(person);
    // The duty one's leaders gave (if one obeys) weighs on the camp's needs one answers.
    const groups = this.groups;
    input[k++] = groups ? Math.min(1, reserves.food * groups.dutyFactor(person, 0)) : reserves.food;
    input[k++] = groups ? Math.min(1, reserves.wood * groups.dutyFactor(person, 1)) : reserves.wood;
    input[k++] = groups ? Math.min(1, needs.build * groups.dutyFactor(person, 2)) : needs.build;
    input[k++] = groups ? Math.min(1, needs.craft * groups.dutyFactor(person, 3)) : needs.craft;
    input[k++] = 1;
    this.social.fillInputs(person, input, k);
    this.life.fillInputs(person, input, k + SOCIAL_INPUTS.length);
  }

  /** Every hour: predators in sight (danger) and whether the person is isolated. */
  private perceive(person: number): void {
    const { people, fauna, params } = this;
    const x = people.px[person]!;
    const y = people.py[person]!;
    const radius = params.danger.alertTiles;
    let threat = -1;
    let best = radius;
    fauna.grid.forEachNear(x, y, radius, (slot) => {
      if (this.predatorCodes[fauna.store.species[slot]!] !== 1) return;
      const d = distance(fauna.store.px[slot]!, fauna.store.py[slot]!, x, y);
      if (d <= best) {
        best = d;
        threat = slot;
      }
    });
    const wasSafe = people.threat[person]! < 0;
    people.threat[person] = threat;
    if (wasSafe && threat >= 0) this.social.onThreat(person, fauna.store.x[threat]!, fauna.store.y[threat]!);
    const mate = this.nearestTribeMember(person);
    const gap = mate < 0 ? Infinity : people.distance(mate, person);
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
    if (people.health[person]! > 0) {
      this.social.onAttacked(person);
      return outcome;
    }
    outcome.killed = true;
    outcome.remains = params.danger.corpseMeat;
    outcome.eventId = this.die(person, DeathCause.Predator, attack.tick, { attack });
    this.grid.remove(person, this.grid.cellOf(x, y));
    return outcome;
  }

  /**
   * A death, told in the journal with its causes (the hard year, the epidemic, the birth, the loss
   * of a guardian…); then the others learn it, objects are inherited and orphans wait for a home.
   */
  die(person: number, cause: number, tick: number, info: { attack?: Attack; causes?: number[]; vars?: Record<string, string> } = {}): number {
    const { people } = this;
    const tile = this.tileOf(person);
    const x = people.x[person]!;
    const y = people.y[person]!;
    const place = describeLocation(this.world.landmasses, this.world.landmassNames, x, y, this.size);
    const template = this.params.deathTexts[DEATH_TEXT_KEYS[cause] ?? 'hunger'];
    const animal = info.attack?.attackerName ?? '';
    const causes = [...(info.causes ?? [])];
    const vars: Record<string, string> = { age: String(Math.floor(people.ageYears[person]!)), aggravation: '', ...info.vars };
    const needs = cause === DeathCause.Hunger || cause === DeathCause.Thirst || cause === DeathCause.Cold;
    // A death by hunger, thirst or cold inside a hardship region is caused by that hardship.
    const hardship = this.life.hardshipAt(tile);
    if (needs && hardship >= 0) causes.push(hardship);
    // A child left without anyone to care for it dies of that loss as much as of hunger.
    if (needs) causes.push(...this.life.orphanCauses(person));
    if (cause === DeathCause.Disease) {
      const disease = diseaseDeathInfo(this.life, person);
      causes.push(...disease.causes);
      Object.assign(vars, disease.vars);
    } else if (cause !== DeathCause.Hunger) {
      // Weakened by hunger or cold, one falls more easily to a predator, thirst or the cold: the journal says so.
      const weakened = weakenedInfo(this.life, person);
      causes.push(...weakened.causes);
      if (!vars['aggravation']) vars['aggravation'] = weakened.text;
    }
    people.alive[person] = 0;
    people.deathCause[person] = cause;
    this.production.forgetPerson(person);
    const members = this.campPeople[people.camp[person]!];
    if (members) {
      const at = members.indexOf(person);
      if (at >= 0) members.splice(at, 1);
    }
    const event = this.journal.publish({
      tick,
      type: HUMAN_DEATH,
      text: fillTemplate(template, { nom: people.names[person]!, e: people.female[person] ? 'e' : '', lieu: place, un_animal: `un ${animal}`, ...vars }),
      place: { x, y, label: place },
      actors: info.attack ? [{ kind: 'human', id: person }, info.attack.attacker] : [{ kind: 'human', id: person }],
      causes: [...new Set(causes)].filter((id) => id >= 0 && this.journal.get(id) !== undefined),
      details: { cause, person },
    });
    if (cause === DeathCause.Hunger) this.camps[people.camp[person]!]!.hungerDeaths.push({ day: this.absoluteDay, event });
    this.social.onDeath(person, cause, event);
    this.life.onDeath(person, cause, event);
    return event;
  }

  /**
   * A baby is born to `mother` (and `father`): a new person at the end of the arrays, next to its
   * mother, with traits from both parents, the knowledge of the camp, and a name of its own.
   */
  bear(mother: number, father: number, female: boolean): number {
    const { people } = this;
    const child = people.add();
    this.social.grow();
    this.life.state.ensure(people.capacity);
    this.production.addPerson();
    const camp = people.camp[mother]!;
    people.names[child] = this.names.next();
    people.female[child] = female ? 1 : 0;
    people.ageYears[child] = 0;
    people.mother[child] = mother;
    people.father[child] = father;
    people.camp[child] = camp;
    // What the tribe knows is known from childhood (teaching comes with the ideas, step 10).
    people.knowledge[child] = people.knowledge[mother]! | (father >= 0 ? people.knowledge[father]! : 0);
    inheritTraits(this.life, child, mother, father);
    people.health[child] = this.life.params.birth.newbornHealth;
    this.setPosition(child, people.px[mother]!, people.py[mother]!);
    people.nextThink[child] = this.step;
    const state = this.life.state;
    state.birthDay[child] = this.absoluteDay;
    state.guardian[child] = mother;
    this.campPeople[camp]!.push(child);
    this.production.shareBed(child, mother);
    this.grid.insert(child, this.grid.cellOf(people.x[child]!, people.y[child]!));
    return child;
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

  // ----- movement (natural: free positions, smoothed paths, steering; core/motion) -------

  /** Puts a person at a free position (decimal tiles), keeping the tile under her feet. */
  setPosition(person: number, fx: number, fy: number): void {
    const { people } = this;
    people.px[person] = fx;
    people.py[person] = fy;
    people.x[person] = Math.max(0, Math.min(this.size - 1, Math.floor(fx)));
    people.y[person] = Math.max(0, Math.min(this.size - 1, Math.floor(fy)));
  }

  /**
   * Where the person will stand at `tile`: a place of her own on the tile (several people at a work
   * site, the stock or a bed never stack on one point); with `aroundFire`, a place in the circle around
   * the camp's fire (to warm up, to sleep in the open, to gather at the camp).
   */
  private setGoal(person: number, tile: number, aroundFire = false): void {
    const { people } = this;
    const movement = this.params.movement;
    const spot = this.spot;
    const fire = aroundFire && tile === this.production.fireTile(people.camp[person]!);
    // The places already taken there by the others of the camp.
    const taken = this.takenSlots.fill(0);
    for (const other of this.campMembers(people.camp[person]!)) {
      if (other !== person && people.target[other] === tile && people.spotSlot[other]! < taken.length) taken[people.spotSlot[other]!] = 1;
    }
    // The first free place that is not on water.
    let slot = 0;
    let found = false;
    for (; slot < taken.length && !found; slot++) {
      if (taken[slot] === 1) continue;
      if (fire) ringSpot(slot, tile, this.size, movement.fireRingTiles, movement.fireRingSpread, spot);
      else personalSpot(slot, tile, this.size, movement.spotOffsetTiles, spot);
      const inside = spot.x >= 0 && spot.y >= 0 && spot.x < this.size && spot.y < this.size;
      found = inside && this.terrain.walkable(Math.floor(spot.y) * this.size + Math.floor(spot.x));
    }
    if (!found) {
      slot = taken.length;
      spot.x = (tile % this.size) + 0.5;
      spot.y = Math.floor(tile / this.size) + 0.5;
    } else slot--;
    people.spotSlot[person] = slot;
    people.goalX[person] = spot.x;
    people.goalY[person] = spot.y;
    people.settled[person] = 0;
    people.blocked[person] = 0;
  }

  /** The action takes place on a tile already reached (or very near): the person only takes her place there. */
  stayAt(person: number, tile: number, aroundFire = false): void {
    this.people.paths[person] = null;
    this.people.target[person] = tile;
    this.setGoal(person, tile, aroundFire);
  }

  /** Plans a path to a tile with A*, then draws it in straight lines where the view is clear. */
  goTo(person: number, tile: number, aroundFire = false): boolean {
    const here = this.tileOf(person);
    const raw = here === tile ? new Int32Array(0) : this.pathfinder.find(here, tile);
    if (!raw) return false;
    this.people.paths[person] = smoothPath(this.terrain, this.size, here, raw, this.params.movement.smoothLookaheadTiles);
    this.people.pathIndex[person] = 0;
    this.people.target[person] = tile;
    this.setGoal(person, tile, aroundFire);
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

  /**
   * Heads for a place of the camp, following the way home (or A* when outside the territory);
   * `aroundFire`: to a place in the circle around the fire.
   */
  goHome(person: number, tile: number, aroundFire = false): boolean {
    const camp = this.camps[this.people.camp[person]!]!;
    if (camp.stepHome(this.tileOf(person)) < 0) return this.goTo(person, tile, aroundFire);
    this.stayAt(person, tile, aroundFire);
    return true;
  }

  /** Walks toward the target; calls `onSpot` once there. Returns true when the action is over. */
  arrived(person: number, hours: number, onSpot: () => boolean): boolean {
    const { people } = this;
    if (people.target[person] === -1 || people.settled[person] === 1) return onSpot();
    const result = this.walk(person, hours);
    if (result === 'stuck') return true;
    return result === 'arrived' ? onSpot() : false;
  }

  /** One step along the path (or the way home) toward the person's spot at the target. */
  walk(person: number, hours: number): WalkResult {
    const { people } = this;
    people.working[person] = 0;
    if (people.settled[person] === 1) return 'arrived';
    const way = this.waypoint(person);
    if (!way) return this.giveUp(person);
    const moved = this.moveStep(person, way.x, way.y, way.final, hours);
    if (way.final && people.distanceTo(person, way.x, way.y) <= this.params.movement.arriveTiles) {
      this.setPosition(person, way.x, way.y);
      stop(people, person);
      people.settled[person] = 1;
      return 'arrived';
    }
    if (moved < BLOCKED_TILES) {
      people.blocked[person] = people.blocked[person]! + 1;
      if (people.blocked[person]! >= this.params.movement.stuckSteps) return this.giveUp(person);
    } else people.blocked[person] = 0;
    return 'moving';
  }

  private giveUp(person: number): WalkResult {
    stop(this.people, person);
    this.people.blocked[person] = 0;
    return 'stuck';
  }

  /**
   * The next point to walk to: the next corner of the smoothed path (one turns before reaching it,
   * which rounds the corners), or along the camp's way home as far as the view is clear, or the
   * person's own spot at the end.
   */
  private waypoint(person: number): { x: number; y: number; final: boolean } | null {
    const { people } = this;
    const way = this.way;
    const target = people.target[person]!;
    way.final = true;
    way.x = people.goalX[person]!;
    way.y = people.goalY[person]!;
    const path = people.paths[person];
    if (path) {
      let index = people.pathIndex[person]!;
      while (index < path.length - 1) {
        const tile = path[index]!;
        const cx = (tile % this.size) + 0.5;
        const cy = Math.floor(tile / this.size) + 0.5;
        if (people.distanceTo(person, cx, cy) > this.params.movement.cornerTiles) {
          way.x = cx;
          way.y = cy;
          way.final = false;
          break;
        }
        index++;
      }
      people.pathIndex[person] = index;
      return way;
    }
    const here = this.tileOf(person);
    const tx = target % this.size;
    const ty = (target - tx) / this.size;
    if (Math.max(Math.abs(tx - people.x[person]!), Math.abs(ty - people.y[person]!)) <= this.params.tribe.campRadius + 1) return way;
    const camp = this.camps[people.camp[person]!]!;
    let next = camp.stepHome(here);
    if (next < 0) return null;
    // Looks a few tiles ahead on the way home and walks straight there while the view is clear.
    const minSpeed = this.terrain.speedOn(here);
    for (let k = 0; k < HOME_LOOKAHEAD; k++) {
      const further = camp.stepHome(next);
      if (further < 0 || further === next) break;
      const fx = (further % this.size) + 0.5;
      const fy = Math.floor(further / this.size) + 0.5;
      if (!this.terrain.clearLine(people.px[person]!, people.py[person]!, fx, fy, Math.min(minSpeed, this.terrain.speedOn(further)))) break;
      next = further;
    }
    way.x = (next % this.size) + 0.5;
    way.y = Math.floor(next / this.size) + 0.5;
    way.final = false;
    return way;
  }

  /**
   * One step of steering toward (tx, ty): speed of the moment (terrain, weather, age, fatigue,
   * load, running), soft avoidance of the others, walking beside one's companion. Returns the
   * distance travelled.
   */
  moveStep(person: number, tx: number, ty: number, arrive: boolean, hours: number): number {
    const { people, params } = this;
    if (this.noAvoid.length < people.capacity) this.noAvoid = new Uint8Array(people.capacity);
    const movement = params.movement;
    const running = this.isRunning(person);
    const push = this.push;
    const count = this.grid.gather(people.px[person]!, people.py[person]!, movement.personalSpaceTiles, this.near);
    // Children in arms move with their carrier: they are not in the way.
    for (let n = 0; n < count; n++) {
      const other = this.near[n]!;
      this.noAvoid[other] = people.alive[other] === 0 || this.life.carrier(other) >= 0 ? 1 : 0;
    }
    separation(people, person, movement.personalSpaceTiles, movement.avoidTilesPerHour, this.near, count, this.noAvoid, push);
    // Near one's own place, the others no longer push: everyone has a spot of their own to reach.
    if (arrive) {
      const near = people.distanceTo(person, tx, ty) / movement.personalSpaceTiles - 1;
      if (near < 1) {
        const keep = Math.max(0, near);
        push.x *= keep;
        push.y *= keep;
      }
    }
    this.besideCompanion(person, push);
    const goal = this.goal;
    goal.x = tx;
    goal.y = ty;
    goal.speed = params.body.walkTilesPerHour * this.speedFactor(person, running, tx, ty);
    goal.accel = movement.accelTilesPerHour2 * (running ? 2 : 1);
    goal.arrive = arrive;
    goal.pushX = push.x;
    goal.pushY = push.y;
    steer(people, person, goal, hours);
    const moved = advance(people, person, hours, this.size, this.walkableTile);
    this.setPosition(person, people.px[person]!, people.py[person]!);
    updateGait(people, person, running);
    people.lastWalk[person] = this.step;
    return moved;
  }

  /**
   * Couples walk side by side: when one's companion walks the same way close by, a gentle pull
   * toward the place at their side (each keeps to one side).
   */
  private besideCompanion(person: number, push: { x: number; y: number }): void {
    const { people } = this;
    const movement = this.params.movement;
    const mate = people.spouse[person]!;
    if (mate < 0 || people.alive[mate] === 0 || movement.companionTiles <= 0) return;
    const d = people.distance(person, mate);
    if (d > movement.companionTiles || d < EPSILON) return;
    const mateSpeed = speedOf(people, mate);
    const ownSpeed = speedOf(people, person);
    if (mateSpeed < WALKING_SPEED || ownSpeed < WALKING_SPEED) return;
    const hx = people.vx[mate]! / mateSpeed;
    const hy = people.vy[mate]! / mateSpeed;
    // Same way: the two headings point nearly together.
    if ((people.vx[person]! / ownSpeed) * hx + (people.vy[person]! / ownSpeed) * hy < SAME_WAY) return;
    const side = person < mate ? 1 : -1;
    const sx = people.px[mate]! - hy * side * movement.besideTiles;
    const sy = people.py[mate]! + hx * side * movement.besideTiles;
    const dx = sx - people.px[person]!;
    const dy = sy - people.py[person]!;
    const gap = Math.sqrt(dx * dx + dy * dy);
    if (gap < EPSILON) return;
    const pull = Math.min(movement.companionPullTiles, gap * movement.companionPullTiles);
    push.x += (dx / gap) * pull;
    push.y += (dy / gap) * pull;
  }

  /**
   * A child follows its guardian: far away, by a path; in sight, a little behind and to the side,
   * keeping pace. Over when the guardian stops and the child is at its side.
   */
  follow(person: number, leader: number, hours: number): boolean {
    const { people } = this;
    const movement = this.params.movement;
    const d = people.distance(person, leader);
    if (d > movement.followNearTiles) {
      if (people.paths[person] === null || people.settled[person] === 1) {
        if (!this.goTo(person, this.tileOf(leader))) return true;
      }
      return this.walk(person, hours) === 'stuck';
    }
    people.paths[person] = null;
    people.working[person] = 0;
    const speed = speedOf(people, leader);
    const behind = movement.followBehindTiles;
    if (speed < WALKING_SPEED) {
      // The guardian stands: the child comes to her side and stays there.
      if (d <= behind * FOLLOW_STAND_FACTOR) {
        stop(people, person);
        return true;
      }
      const share = (d - behind) / d;
      this.moveStep(person, people.px[person]! + (people.px[leader]! - people.px[person]!) * share, people.py[person]! + (people.py[leader]! - people.py[person]!) * share, true, hours);
      return false;
    }
    // She walks: a little behind her and to one side, at her pace.
    const hx = people.vx[leader]! / speed;
    const hy = people.vy[leader]! / speed;
    const side = person % 2 === 0 ? 1 : -1;
    const sx = people.px[leader]! - hx * behind - hy * side * behind * FOLLOW_SIDE_SHARE;
    const sy = people.py[leader]! - hy * behind + hx * side * behind * FOLLOW_SIDE_SHARE;
    this.moveStep(person, sx, sy, true, hours);
    return false;
  }

  /** Walks up to another person until `gap` tiles from her (a conversation, a gift). True when there. */
  approach(person: number, other: number, gap: number, hours: number): boolean {
    const { people } = this;
    const d = people.distance(person, other);
    if (d <= gap) {
      stop(people, person);
      return true;
    }
    const share = (d - gap * APPROACH_STOP_SHARE) / d;
    this.moveStep(person, people.px[person]! + (people.px[other]! - people.px[person]!) * share, people.py[person]! + (people.py[other]! - people.py[person]!) * share, true, hours);
    return people.distance(person, other) <= gap;
  }

  /** Follows the known path toward the nearest river or lake (for someone who does not know where water is). */
  walkToWater(person: number, hours: number): boolean {
    let at = this.tileOf(person);
    if (this.fauna.waterPath[at]! < 0) return false;
    for (let k = 0; k < WATER_LOOKAHEAD; k++) {
      const next = this.fauna.waterPath[at]!;
      if (next < 0 || !this.terrain.walkable(next)) break;
      at = next;
    }
    this.people.working[person] = 0;
    this.moveStep(person, (at % this.size) + 0.5, Math.floor(at / this.size) + 0.5, false, hours);
    return true;
  }

  /** Running: fleeing a danger, or chasing game. */
  isRunning(person: number): boolean {
    return this.behavior(person) === 'flee' || this.production.isHunting(person);
  }

  /** Speed factor of the moment: ground, snow, slope, weather, strength, fatigue, load, running. */
  private speedFactor(person: number, running: boolean, tx: number, ty: number): number {
    const { people, params } = this;
    const movement = params.movement;
    const tile = this.tileOf(person);
    let factor = this.terrain.speedOn(tile) * this.weather.typeAt(tile).movementFactor;
    if (this.world.biome[tile] === this.marshBiome) factor *= movement.marshSpeed;
    factor *= 1 - movement.snowSlowdown * this.climate.snowAt(tile);
    // Slope: the tile one step ahead, toward the point walked to.
    const d = people.distanceTo(person, tx, ty);
    if (d > EPSILON) {
      const ax = Math.floor(people.px[person]! + (tx - people.px[person]!) / d);
      const ay = Math.floor(people.py[person]! + (ty - people.py[person]!) / d);
      if (ax >= 0 && ay >= 0 && ax < this.size && ay < this.size) {
        const climb = Math.abs(this.terrain.elevation(ay * this.size + ax) - this.terrain.elevation(tile));
        factor /= 1 + (movement.slopeSlowdownPer100m * climb) / METERS_PER_100;
      }
    }
    factor *= this.life.vigor(person);
    const tired = people.fatigue[person]! / FULL;
    if (tired > HALF) factor *= 1 - (movement.fatigueSlowdown * (tired - HALF)) / HALF;
    factor *= 1 - movement.loadSlowdown * this.production.loadShare(person);
    if (running) factor *= params.body.fleeSpeedFactor;
    return factor;
  }

  /** Who did not walk this step slows down to a stop (no gliding while working on the spot). */
  private stopIdle(person: number): void {
    const { people } = this;
    if (people.lastWalk[person] !== this.step && (people.vx[person] !== 0 || people.vy[person] !== 0)) stop(people, person);
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
    let best = -1;
    let bestDistance = Infinity;
    for (let s = person * slots; s < (person + 1) * slots; s++) {
      const tile = tiles[s]!;
      if (tile < 0) continue;
      const d = people.distanceToTile(person, tile, this.size);
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
    let best = -1;
    let bestDistance = Infinity;
    for (const other of this.campMembers(camp)) {
      if (other === person) continue;
      const d = people.distance(other, person);
      if (d < bestDistance) {
        bestDistance = d;
        best = other;
      }
    }
    return best;
  }

  /** The groups system takes over the decisions of the tribes (step 9). */
  attachGroups(view: GroupView): void {
    this.groups = view;
  }

  /**
   * The tribe's leaders decided to move the camp (groups system): the journal tells it with
   * `text`, then the people and the common stock go.
   */
  moveCampTo(campId: number, destination: number, tick: number, text: string, causes: readonly number[], actors: readonly number[]): number {
    return moveCamp(this, this.camps[campId]!, destination, this.absoluteDay, tick, text, causes, actors);
  }

  /**
   * A new camp at `center` for `members` (a group that leaves its tribe): they belong to it from now
   * on and walk there; it starts without buildings. Returns the new camp's id.
   */
  foundCamp(center: number, members: readonly number[], cause: number): number {
    const id = this.camps.length;
    const camp = new Camp(id, center, this.size, this.params.camp.homeRadiusTiles);
    camp.computeWayHome(this.terrain);
    camp.settledDay = this.absoluteDay;
    camp.movedEvent = cause;
    this.camps.push(camp);
    this.campPeople.push([]);
    this.production.openCamp(id, center, cause);
    for (const person of members) this.joinCamp(person, id);
    return id;
  }

  /** The person now belongs to another camp (and leaves what they were doing). */
  joinCamp(person: number, campId: number): void {
    const { people } = this;
    const from = people.camp[person]!;
    if (from === campId) return;
    const members = this.campPeople[from];
    if (members) {
      const at = members.indexOf(person);
      if (at >= 0) members.splice(at, 1);
    }
    this.campPeople[campId]!.push(person);
    people.camp[person] = campId;
    people.forageDistance[person] = 0;
    people.farFood[person] = -1;
    people.target[person] = -1;
    people.paths[person] = null;
    people.nextThink[person] = this.step;
    this.production.leaveCamp(person);
  }

  /** Living members of a camp (in the order they joined it). */
  campMembers(camp: number): readonly number[] {
    return this.campPeople[camp] ?? [];
  }

  /** Living members of each camp. */
  readonly campPeople: number[][] = [];
}
