import { canDrink } from '../fauna/fresh-water';
import { BYTE_MAX } from '../flora/flora-state';
import type { IndividualsSystem } from './individuals-system';
import type { ActionId } from './params';

const FULL = 100;
const SATISFIED = 5;
/** A sleeper wakes up once rested and the day has come. */
const DAWN_LIGHT = 0.3;

/** Result of starting an action: did it find something to do? */
export type Start = boolean;

/** Chooses the target of an action and the way there. False if the action is impossible now. */
export function startAction(sys: IndividualsSystem, person: number, id: ActionId): Start {
  const { people } = sys;
  const camp = sys.camps[people.camp[person]!]!;
  people.working[person] = 0;
  people.paths[person] = null;
  people.target[person] = -1;
  const here = sys.tileOf(person);
  switch (id) {
    case 'drink': {
      if (canDrink(sys.world, people.x[person]!, people.y[person]!)) return true;
      const remembered = sys.nearestMemory(person, 'water');
      return remembered >= 0 ? sys.goTo(person, remembered) : sys.fauna.waterPath[here]! >= 0;
    }
    case 'eat':
      return people.food[person]! > 0;
    case 'gather': {
      // Nothing edible in sight or in memory: go and look further away.
      const tile = sys.findFood(person);
      return tile >= 0 ? sys.goTo(person, tile) : sys.explore(person);
    }
    case 'collect_wood': {
      const tile = sys.findWood(person);
      return tile >= 0 && sys.goTo(person, tile);
    }
    case 'tend_fire':
      return people.branches[person]! > 0 && sys.goHome(person, camp.fireTile);
    case 'warm_up':
      return camp.lit && sys.goHome(person, camp.fireTile);
    case 'sleep': {
      const hut = camp.huts[people.hut[person]!];
      return sys.goHome(person, hut ? hut.tile : camp.fireTile);
    }
    case 'return_camp':
      return sys.goHome(person, camp.fireTile);
    case 'flee':
      // Fleeing means running back to the others; once at the camp there is nowhere safer to go.
      if (camp.distanceTo(people.x[person]!, people.y[person]!) <= sys.params.tribe.campRadius) return false;
      return people.threat[person]! >= 0 && sys.goHome(person, camp.fireTile);
    case 'stay_with_group': {
      const mate = sys.nearestTribeMember(person);
      return mate >= 0 && sys.goTo(person, sys.tileOf(mate));
    }
    case 'rest':
      return true;
  }
}

/** One step of the current action. Returns true when the action is over (done or failed). */
export function performAction(sys: IndividualsSystem, person: number, id: ActionId, hours: number): boolean {
  const { people, params } = sys;
  const body = params.body;
  const camp = sys.camps[people.camp[person]!]!;
  switch (id) {
    case 'drink':
      if (!canDrink(sys.world, people.x[person]!, people.y[person]!)) {
        if (people.paths[person]) return sys.walk(person, hours) === 'stuck';
        return !sys.walkToWater(person, hours);
      }
      people.working[person] = 1;
      sys.remember(person, 'water', sys.tileOf(person));
      people.thirst[person] = Math.max(0, people.thirst[person]! - body.drinkPerHour * hours);
      return people.thirst[person]! < SATISFIED;
    case 'eat': {
      people.working[person] = 1;
      const units = Math.min(people.food[person]!, body.eatUnitsPerHour * hours);
      people.food[person] = people.food[person]! - units;
      people.hunger[person] = Math.max(0, people.hunger[person]! - units * body.hungerPerFoodUnit);
      return people.food[person]! <= 0 || people.hunger[person]! < SATISFIED;
    }
    case 'gather':
      return sys.arrived(person, hours, () => gatherHere(sys, person, hours));
    case 'collect_wood':
      return sys.arrived(person, hours, () => collectWoodHere(sys, person, hours));
    case 'tend_fire':
      return sys.arrived(person, hours, () => {
        camp.fuel = Math.min(params.camp.maxFuelHours, camp.fuel + people.branches[person]! * params.camp.fuelHoursPerBranch);
        people.branches[person] = 0;
        return true;
      });
    case 'warm_up':
      return sys.arrived(person, hours, () => {
        people.working[person] = 1;
        return people.cold[person]! < SATISFIED || !camp.lit;
      });
    case 'sleep':
      return sys.arrived(person, hours, () => {
        people.working[person] = 1;
        people.fatigue[person] = Math.max(0, people.fatigue[person]! - params.needs.restPerHour * hours);
        return people.fatigue[person]! < SATISFIED && sys.lightAt(person) > DAWN_LIGHT;
      });
    case 'return_camp':
    case 'flee':
      return sys.arrived(person, hours, () => true);
    case 'stay_with_group':
      return sys.arrived(person, hours, () => true);
    case 'rest':
      people.working[person] = 1;
      return false;
  }
}

/** Picks the produce of the plant on the tile (taken from the real plant). */
function gatherHere(sys: IndividualsSystem, person: number, hours: number): boolean {
  const { people, params } = sys;
  const tile = sys.tileOf(person);
  people.working[person] = 1;
  const room = params.body.carryFood - people.food[person]!;
  const produce = sys.flora.speciesAt(tile)?.produce;
  const value = produce ? (sys.edibleValue.get(produce.resource) ?? 0) : 0;
  if (!produce || value <= 0 || room <= 0) return true;
  const taken = sys.flora.takeProduce(tile, produce.resource, Math.min(room / value, params.body.gatherUnitsPerHour * hours));
  if (taken <= 0) {
    sys.forget(person, 'food', tile);
    return true;
  }
  people.food[person] = people.food[person]! + taken * value;
  sys.remember(person, 'food', tile);
  return people.food[person]! >= params.body.carryFood - 0.5;
}

/** Breaks branches off the plant on the tile (which suffers a little). */
function collectWoodHere(sys: IndividualsSystem, person: number, hours: number): boolean {
  const { people, params, flora } = sys;
  const tile = sys.tileOf(person);
  people.working[person] = 1;
  if (!flora.speciesAt(tile)) return true;
  const taken = Math.min(params.body.carryBranches - people.branches[person]!, params.body.branchesPerHour * hours);
  people.branches[person] = people.branches[person]! + taken;
  const harm = Math.round(taken * params.body.branchHarmToPlant * BYTE_MAX);
  flora.state.health[tile] = Math.max(1, flora.state.health[tile]! - harm);
  return people.branches[person]! >= params.body.carryBranches - 0.01;
}

export { FULL };
