import { canDrink } from '../fauna/fresh-water';
import type { JobKind } from '../production/jobs';
import type { CompiledAction } from './brain';
import type { IndividualsSystem } from './individuals-system';

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
  const job = JOBS[action.def.behavior];
  const started = job ? startJob(sys, person, action, job) : startOther(sys, person, action);
  if (!started) {
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
    default:
      return true;
  }
}

/** Asks the production system for a job, then heads for its first place (for food, memory and exploration help). */
function startJob(sys: IndividualsSystem, person: number, action: CompiledAction, kind: JobKind): boolean {
  const { people, production, params } = sys;
  const lookingForFood = kind === 'harvest' && action.items.some((item) => production.catalog.food[item]! > 0);
  const fallback = lookingForFood ? sys.nearestMemory(person, 'food') : -1;
  const tile = production.startJob(person, { kind, recipes: action.recipes, items: action.items, fallback, perception: params.body.perceptionTiles });
  if (tile < 0) {
    // Nothing edible in sight or in memory: go and look further away (no job yet). Having to
    // search far is what tells that the land around the camp is exhausted.
    if (!lookingForFood || !sys.explore(person)) return false;
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
    default:
      people.working[person] = 1;
      return false;
  }
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
