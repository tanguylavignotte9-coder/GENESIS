import { canDrink } from '../fauna/fresh-water';
import type { JobKind } from '../production/jobs';
import type { CompiledAction } from './brain';
import type { IndividualsSystem } from './individuals-system';
import { CONVERSATIONS, type ConversationKind } from './social/params';

const FULL = 100;
const SATISFIED = 5;
/** A sleeper wakes up once rested and the day has come. */
const DAWN_LIGHT = 0.3;

/** Work behaviours are carried out by the production system (recipes, stocks, sites). */
const JOBS: Partial<Record<CompiledAction['def']['behavior'], JobKind>> = {
  harvest: 'harvest',
  deposit: 'deposit',
  tend_fire: 'fuel',
  build: 'build',
  craft: 'craft',
};

/** Chooses the target of an action and the way there. False if the action is impossible now. */
export function startAction(sys: IndividualsSystem, person: number, action: CompiledAction): boolean {
  const { people } = sys;
  // An attempt that fails leaves the current way and work as they were.
  const working = people.working[person]!;
  const path = people.paths[person] ?? null;
  const pathIndex = people.pathIndex[person]!;
  const target = people.target[person]!;
  people.working[person] = 0;
  people.paths[person] = null;
  people.target[person] = -1;
  const talkWith = sys.social.state.talkWith[person]!;
  sys.social.state.talkWith[person] = -1;
  const job = JOBS[action.def.behavior];
  const started = job ? startJob(sys, person, action, job) : startOther(sys, person, action);
  if (!started) {
    sys.social.state.talkWith[person] = talkWith;
    people.working[person] = working;
    people.paths[person] = path;
    people.pathIndex[person] = pathIndex;
    people.target[person] = target;
  } else if (!job) sys.production.endJob(person);
  return started;
}

function startOther(sys: IndividualsSystem, person: number, action: CompiledAction): boolean {
  const { people, production } = sys;
  const camp = sys.camps[people.camp[person]!]!;
  const here = sys.tileOf(person);
  switch (action.def.behavior) {
    case 'drink': {
      if (canDrink(sys.world, people.x[person]!, people.y[person]!)) return true;
      const remembered = sys.nearestMemory(person, 'water');
      return remembered >= 0 ? sys.goTo(person, remembered) : sys.fauna.waterPath[here]! >= 0;
    }
    case 'eat': {
      if (production.carriedFood(person) > 0) return true;
      const campId = people.camp[person]!;
      return production.stockFood(campId) > 0 && sys.goHome(person, production.stockTile(campId));
    }
    case 'warm_up':
      return production.fireLit(camp.id) && sys.goHome(person, production.fireTile(camp.id));
    case 'sleep': {
      const bed = production.bed(person).tile;
      return sys.goHome(person, bed >= 0 ? bed : production.fireTile(camp.id));
    }
    case 'return_camp':
      return sys.goHome(person, camp.center);
    case 'flee':
      // Fleeing means running back to the others; once at the camp there is nowhere safer to go.
      if (camp.distanceTo(people.x[person]!, people.y[person]!) <= sys.params.tribe.campRadius) return false;
      return people.threat[person]! >= 0 && sys.goHome(person, camp.center);
    case 'stay_with_group': {
      const mate = sys.nearestTribeMember(person);
      return mate >= 0 && sys.goTo(person, sys.tileOf(mate));
    }
    case 'converse': {
      const partner = sys.social.partnerFor(person, action.def.conversation ?? 'chat');
      return partner >= 0 && meet(sys, person, partner, action.def.conversation ?? 'chat');
    }
    case 'give': {
      const receiver = sys.social.giftTarget(person);
      return receiver >= 0 && meet(sys, person, receiver, null);
    }
    case 'carried':
      return sys.life.carrier(person) >= 0;
    case 'follow_guardian': {
      const guardian = sys.life.state.guardian[person]!;
      return sys.life.alive(guardian) && guardian !== person && sys.goTo(person, sys.tileOf(guardian));
    }
    default:
      return true;
  }
}

/** Heads for someone to talk to (or give to). */
function meet(sys: IndividualsSystem, person: number, other: number, kind: string | null): boolean {
  const social = sys.social.state;
  social.talkWith[person] = other;
  social.talkKind[person] = kind === null ? -1 : CONVERSATIONS.indexOf(kind as ConversationKind);
  social.talkHours[person] = 0;
  social.talkDone[person] = 0;
  if (distance(sys, person, other) <= 1) {
    sys.people.target[person] = sys.tileOf(person);
    return true;
  }
  return sys.goTo(person, sys.tileOf(other));
}

function distance(sys: IndividualsSystem, a: number, b: number): number {
  const { people } = sys;
  return Math.max(Math.abs(people.x[a]! - people.x[b]!), Math.abs(people.y[a]! - people.y[b]!));
}

/**
 * Walks up to the other (who may move: the way is planned again when reached), then talks or
 * gives. Returns true when it is over (done, or the other gone, asleep or out of reach).
 */
function meeting(sys: IndividualsSystem, person: number, hours: number, gift: boolean): boolean {
  const { people, social } = sys;
  const state = social.state;
  const other = state.talkWith[person]!;
  if (other < 0 || people.alive[other] !== 1 || sys.isSleeping(other)) return true;
  if (distance(sys, person, other) > 1) {
    people.working[person] = 0;
    if (distance(sys, person, other) > social.params.reachTiles * 2) return true;
    const reached = sys.tileOf(person) === people.target[person] || sys.walk(person, hours) !== 'moving';
    return reached && !sys.goTo(person, sys.tileOf(other));
  }
  people.working[person] = 1;
  if (state.talkDone[person] === 0) {
    state.talkDone[person] = 1;
    if (gift) {
      social.give(person, other);
      return true;
    }
    social.talk(person, other, CONVERSATIONS[state.talkKind[person]!] ?? 'chat');
  }
  state.talkHours[person] = state.talkHours[person]! + hours;
  return state.talkHours[person]! >= social.params.conversation.durationHours;
}

/** Asks the production system for a job, then heads for its first place (for food, memory and exploration help). */
function startJob(sys: IndividualsSystem, person: number, action: CompiledAction, kind: JobKind): boolean {
  const { people, production, params } = sys;
  const lookingForFood = kind === 'harvest' && action.items.some((item) => production.catalog.food[item]! > 0);
  // A child looks only around itself and does not go off exploring.
  const child = sys.life.isChild(person);
  const fallback = lookingForFood ? sys.nearestMemory(person, 'food') : -1;
  const perception = child ? sys.life.params.childhood.searchTiles : params.body.perceptionTiles;
  const tile = production.startJob(person, { kind, recipes: action.recipes, items: action.items, fallback, perception });
  if (tile < 0) {
    // Nothing edible in sight or in memory: go and look further away (no job yet). Having to
    // search far is what tells that the land around the camp is exhausted.
    if (!lookingForFood || child || !sys.explore(person)) return false;
    production.endJob(person);
    sys.searchedFar(person, people.target[person]!);
    return true;
  }
  if (tile === sys.tileOf(person)) {
    people.target[person] = tile;
    return true;
  }
  return sys.goToWork(person, tile);
}

/** One step of the current action. Returns true when the action is over (done or failed). */
export function performAction(sys: IndividualsSystem, person: number, action: CompiledAction, hours: number): boolean {
  const { people, params, production } = sys;
  const body = params.body;
  const behavior = action.def.behavior;
  if (JOBS[behavior]) return sys.arrived(person, hours, () => work(sys, person, hours));
  switch (behavior) {
    case 'drink':
      if (!canDrink(sys.world, people.x[person]!, people.y[person]!)) {
        if (people.paths[person]) return sys.walk(person, hours) === 'stuck';
        return !sys.walkToWater(person, hours);
      }
      people.working[person] = 1;
      sys.remember(person, 'water', sys.tileOf(person));
      people.thirst[person] = Math.max(0, people.thirst[person]! - body.drinkPerHour * hours);
      return people.thirst[person]! < SATISFIED;
    case 'eat':
      return sys.arrived(person, hours, () => {
        people.working[person] = 1;
        const wanted = Math.min(body.eatUnitsPerHour * hours, people.hunger[person]! / body.hungerPerFoodUnit);
        const fromStock = production.carriedFood(person) <= 0;
        const eaten = production.eat(person, wanted, fromStock);
        people.hunger[person] = Math.max(0, people.hunger[person]! - eaten * body.hungerPerFoodUnit);
        return eaten <= 0 || people.hunger[person]! < SATISFIED;
      });
    case 'warm_up':
      return sys.arrived(person, hours, () => {
        people.working[person] = 1;
        return people.cold[person]! < SATISFIED || !production.fireLit(people.camp[person]!);
      });
    case 'sleep':
      return sys.arrived(person, hours, () => {
        people.working[person] = 1;
        people.fatigue[person] = Math.max(0, people.fatigue[person]! - params.needs.restPerHour * hours);
        return people.fatigue[person]! < SATISFIED && sys.lightAt(person) > DAWN_LIGHT;
      });
    case 'return_camp':
    case 'flee':
    case 'stay_with_group':
      return sys.arrived(person, hours, () => true);
    case 'converse':
      return meeting(sys, person, hours, false);
    case 'give':
      return meeting(sys, person, hours, true);
    case 'carried':
      return beCarried(sys, person, hours);
    case 'follow_guardian':
      return sys.arrived(person, hours, () => true);
    case 'play':
      people.working[person] = 1;
      sys.life.play(person, hours);
      return false;
    default:
      people.working[person] = 1;
      return false;
  }
}

/**
 * A small child in arms goes where its carrier goes, naps, and is fed: at the breast if its mother
 * (or nurse) has milk, otherwise from what the carrier holds or from the camp's stock; it drinks
 * when its carrier drinks. Over when nobody carries it any more.
 */
function beCarried(sys: IndividualsSystem, person: number, hours: number): boolean {
  const { people, production, life, params } = sys;
  const carrier = life.carrier(person);
  if (carrier < 0) return true;
  people.x[person] = people.x[carrier]!;
  people.y[person] = people.y[carrier]!;
  people.working[person] = 1;
  people.fatigue[person] = Math.max(0, people.fatigue[person]! - params.needs.restPerHour * hours);
  people.thirst[person] = Math.min(people.thirst[person]!, people.thirst[carrier]!);
  if (people.hunger[person]! < life.params.infancy.feedAboveHunger || life.nurse(person) >= 0) return false;
  const wanted = Math.min(params.body.eatUnitsPerHour * hours, people.hunger[person]! / params.body.hungerPerFoodUnit);
  let eaten = 0;
  if (production.carriedFood(carrier) > 0) eaten = production.giveFood(carrier, person, wanted) > 0 ? production.eat(person, wanted, false) : 0;
  else {
    const camp = people.camp[person]!;
    const stock = production.stockTile(camp);
    const near = Math.max(Math.abs(people.x[person]! - (stock % sys.size)), Math.abs(people.y[person]! - Math.floor(stock / sys.size))) <= params.tribe.campRadius;
    if (near && production.stockFood(camp) > 0) eaten = production.eat(person, wanted, true);
  }
  people.hunger[person] = Math.max(0, people.hunger[person]! - eaten * params.body.hungerPerFoodUnit);
  return false;
}

/** On the job's tile: one step of work by the production system, then where to go next. */
function work(sys: IndividualsSystem, person: number, hours: number): boolean {
  const { people, production } = sys;
  people.working[person] = 1;
  const result = production.workAt(person, hours);
  if (result.skill >= 0) sys.practise(person, result.skill, result.hours);
  if (result.foodTile >= 0) sys.foundFood(person, result.foodTile);
  if (result.emptyTile >= 0) sys.forget(person, 'food', result.emptyTile);
  switch (result.status) {
    case 'working':
      return false;
    case 'move':
      if (sys.goToWork(person, result.tile)) return false;
      production.endJob(person);
      return true;
    default:
      return true;
  }
}

export { FULL };
