import { DeathCause, type FaunaSystem } from './fauna-system';
import { canDrink } from './fresh-water';
import { eatHere, foodValueAt } from './food';
import { biteSize, payTravel } from './energy';
import { choosePrey, meatOf, strike } from './hunting';
import { State as States } from './animal-store';
import { humanTargetValid, huntHuman, nearestLoneHuman } from './human-prey';
import { feastOnKill } from './kill';
import { denTarget, territorySearchSpot } from './territory';
import { thinkDomestic, troughHere } from './domestic';
import type { AnimalSpecies } from './params';
import type { SpatialGrid } from '../../core/spatial-grid';
import { advance, DIRECTION_COUNT, Gait, DIRECTIONS_X, DIRECTIONS_Y, distance, separation, speedOf, steer, stop, updateGait, type SteerGoal } from '../../core/motion';

/** Local copy: avoids a module lookup per access in hot loops. */
const State = { ...States };

/** Time allowed to creep up to a prey, against the time it takes at a steady walk. */
const STALK_SLACK = 1.5;
/** A prey that got this many times the hunter's sight away is lost. */
const LOSE_SIGHT = 1.5;
/** A hunter this close is frightening even when it is not hunting. */
const CLOSE_DANGER = 2;
/** Look-ahead on the known way to water (tiles), so the walk is a smooth line. */
const WATER_LOOKAHEAD = 3;
/** Close enough to a food spot to be on its tile (technical). */
const FORAGE_ARRIVE_TILES = 0.12;

const GOAL: SteerGoal = { x: 0, y: 0, speed: 0, accel: 0, arrive: true, pushX: 0, pushY: 0 };
const PUSH = { x: 0, y: 0 };
/** Neighbours looked at for avoidance (technical buffer). */
const NEAR = new Int32Array(256);

function setTarget(fauna: FaunaSystem, slot: number, state: number, x: number, y: number): void {
  const { store } = fauna;
  store.state[slot] = state;
  store.targetX[slot] = Math.max(0.5, Math.min(fauna.size - 0.5, x));
  store.targetY[slot] = Math.max(0.5, Math.min(fauna.size - 0.5, y));
  store.fleesHuman[slot] = 0;
}

/** Runs `fleeDistance` tiles away from (fx, fy). */
export function fleeFrom(fauna: FaunaSystem, slot: number, fx: number, fy: number): void {
  const { store, params } = fauna;
  const dx = store.px[slot]! - fx;
  const dy = store.py[slot]! - fy;
  const length = Math.max(0.5, Math.sqrt(dx * dx + dy * dy));
  setTarget(fauna, slot, State.Flee, store.px[slot]! + (dx / length) * params.behavior.fleeDistance, store.py[slot]! + (dy / length) * params.behavior.fleeDistance);
}

/** The animal's place in its herd: around the leader, at a distance that grows with its rank (organic, never stacked). */
function herdSpot(fauna: FaunaSystem, slot: number, leader: number, out: { x: number; y: number }): void {
  const { store, params } = fauna;
  const uid = store.uid[slot]!;
  const k = (uid * 7) % DIRECTION_COUNT;
  const ring = 1 + ((uid >> 4) % 3) * 0.6;
  const spacing = params.movement.herdSpacingTiles * ring;
  out.x = store.px[leader]! + DIRECTIONS_X[k]! * spacing;
  out.y = store.py[leader]! + DIRECTIONS_Y[k]! * spacing;
}

/** Decision: what the animal wants now, by priority (danger, thirst, hunger, herd, rest). */
export function think(fauna: FaunaSystem, slot: number): void {
  const { store, params } = fauna;
  const species = fauna.speciesOf(slot);
  const x = store.px[slot]!;
  const y = store.py[slot]!;

  if (species.fleeRadius > 0) {
    const n = params.species.length;
    const code = store.species[slot]!;
    // Danger = a hunter of this species that is hunting, or one that comes very close. More eyes
    // in the herd see it sooner; thick cover hides it.
    const sight = vigilanceRadius(fauna, slot, species);
    // A hunter charging is seen as far as the herd watches; one creeping up (or merely there) only
    // much closer; any hunter at a few steps is a danger.
    const stalkSight = sight * params.vigilance.stalkShare;
    const threat = nearestAnimal(fauna, fauna.hunterGrid, slot, sight, (other) => {
      if (fauna.hunts[store.species[other]! * n + code] !== 1) return false;
      const d = distance(x, y, store.px[other]!, store.py[other]!);
      return (store.state[other] === State.Hunt && store.gait[other] === Gait.Run) || d <= stalkSight || d <= CLOSE_DANGER;
    });
    if (threat >= 0) {
      fleeFrom(fauna, slot, store.px[threat]!, store.py[threat]!);
      alarmHerd(fauna, slot, store.px[threat]!, store.py[threat]!);
      return;
    }
  }
  // A hunt goes on (unless thirst becomes unbearable).
  if (store.state[slot] === State.Hunt && store.chase[slot]! > 0 && huntTargetAlive(fauna, slot) && store.thirst[slot]! < params.needs.thirstBreaksHunt) return;
  if (store.ownerCamp[slot]! >= 0) {
    thinkDomestic(fauna, slot, species);
    return;
  }

  const tile = store.y[slot]! * fauna.size + store.x[slot]!;
  if (store.thirst[slot]! > params.needs.seekWaterAbove) {
    if (canDrink(fauna.world, store.x[slot]!, store.y[slot]!)) {
      store.state[slot] = State.Drink;
      return;
    }
    if (fauna.waterPath[tile]! >= 0) {
      store.state[slot] = State.SeekWater;
      return;
    }
  }

  const group = store.group[slot]!;
  const leader = fauna.groups.leader[group]!;
  if (store.hunger[slot]! > params.needs.seekFoodAbove) {
    if (findFood(fauna, slot, species)) return;
    const leads = leader === slot || leader < 0 || store.alive[leader] !== 1;
    // A hunter hungry enough to hunt, with no prey in sight: the leader takes its group across its
    // territory (a lone disperser roams further); the others follow it.
    if (species.huntRadius > 0 && leads && store.hunger[slot]! > params.needs.huntAbove) {
      if (territorySearchSpot(fauna, slot, species, PUSH)) {
        setTarget(fauna, slot, State.Wander, PUSH.x, PUSH.y);
        return;
      }
    }
    // A grazer that finds nothing around looks further, and its herd follows: toward the grass.
    if (species.huntRadius <= 0 && leads && farFood(fauna, slot, PUSH)) {
      setTarget(fauna, slot, State.Wander, PUSH.x, PUSH.y);
      return;
    }
  }

  if (leader === slot && fauna.groups.migrating[group] === 1) {
    setTarget(fauna, slot, State.Migrate, fauna.groups.migrateX[group]! + 0.5, fauna.groups.migrateY[group]! + 0.5);
    return;
  }
  if (leader !== slot && leader >= 0 && store.alive[leader] === 1) {
    herdSpot(fauna, slot, leader, PUSH);
    // Out of its place in the herd (the leader went on, or it strayed): it rejoins, then keeps pace.
    if (distance(x, y, PUSH.x, PUSH.y) > params.movement.herdSlackTiles || store.state[leader] === State.Migrate) {
      setTarget(fauna, slot, fauna.groups.migrating[group] === 1 ? State.Migrate : State.Follow, PUSH.x, PUSH.y);
      return;
    }
  }
  // A pack leader strayed from its territory heads back to its den.
  if (denTarget(fauna, slot, PUSH)) {
    setTarget(fauna, slot, State.Wander, PUSH.x, PUSH.y);
    return;
  }
  if (fauna.rng.nextFloat() < params.behavior.wanderChance) {
    const r = params.behavior.wanderRadius;
    const alone = leader < 0 || store.alive[leader] !== 1 || leader === slot;
    const cx = alone ? x : store.px[leader]!;
    const cy = alone ? y : store.py[leader]!;
    setTarget(fauna, slot, State.Wander, cx + fauna.rng.nextIntInclusive(-r, r), cy + fauna.rng.nextIntInclusive(-r, r));
    return;
  }
  store.state[slot] = State.Rest;
}

/**
 * Food: a carcass in reach for meat eaters, then (hungry enough) a prey worth its chase, then
 * plant food or fish here, then the best of a few tiles around.
 */
function findFood(fauna: FaunaSystem, slot: number, species: AnimalSpecies): boolean {
  const { store, params } = fauna;
  const x = store.x[slot]!;
  const y = store.y[slot]!;
  // A meat eater goes straight for a carcass in reach; an omnivore (a bear) only when meat is what it
  // prefers, otherwise it weighs it against its other food.
  const diet = species.diet;
  const meatFirst = (diet['meat'] ?? 0) > 0 && Object.values(diet).every((weight) => weight <= diet['meat']!);
  if (meatFirst) {
    const carcass = reachableCarcass(fauna, slot, params.behavior.forageRadius);
    if (carcass >= 0) {
      setTarget(fauna, slot, State.Forage, (carcass % fauna.size) + 0.5, Math.floor(carcass / fauna.size) + 0.5);
      return true;
    }
  }
  if (species.huntRadius > 0 && store.hunger[slot]! > params.needs.huntAbove) {
    const prey = choosePrey(fauna, slot, species, (other) => straightWay(fauna, slot, store.px[other]!, store.py[other]!));
    const preyDistance = prey >= 0 ? distance(store.px[slot]!, store.py[slot]!, store.px[prey]!, store.py[prey]!) : Infinity;
    // A person walking alone is a prey like another for a hungry predator: it goes for the nearest.
    const human = nearestLoneHuman(fauna, slot, species.huntRadius);
    if (prey >= 0 || human.id >= 0) {
      const onHuman = human.distance < preyDistance;
      store.state[slot] = State.Hunt;
      store.targetAnimal[slot] = onHuman ? human.id : prey;
      store.huntsHuman[slot] = onHuman ? 1 : 0;
      store.chase[slot] = huntSteps(species, Math.min(preyDistance, human.distance));
      return true;
    }
  }
  const code = store.species[slot]!;
  if (foodValueAt(fauna, code, x, y) >= biteSize(fauna, slot)) {
    store.state[slot] = State.Eat;
    return true;
  }
  const best = bestFoodTile(fauna, slot, params.behavior.forageRadius);
  if (best < 0) return false;
  const bestX = best % fauna.size;
  const bestY = (best - bestX) / fauna.size;
  // Somewhere on the chosen tile (not its exact middle: a herd grazing a meadow spreads out).
  const k = (store.uid[slot]! * 3) % DIRECTION_COUNT;
  setTarget(fauna, slot, State.Forage, bestX + 0.5 + DIRECTIONS_X[k]! * 0.3, bestY + 0.5 + DIRECTIONS_Y[k]! * 0.3);
  return true;
}

/** The richest of a few tiles within `r` that the animal can walk to (no water in between), or -1. */
function bestFoodTile(fauna: FaunaSystem, slot: number, r: number): number {
  const { store, params } = fauna;
  const x = store.x[slot]!;
  const y = store.y[slot]!;
  const code = store.species[slot]!;
  let bestValue = 0;
  let bestX = x;
  let bestY = y;
  for (let s = 0; s < params.behavior.forageSamples; s++) {
    const tx = x + fauna.rng.nextIntInclusive(-r, r);
    const ty = y + fauna.rng.nextIntInclusive(-r, r);
    if (!fauna.isWalkable(tx, ty)) continue;
    const value = foodValueAt(fauna, code, tx, ty);
    if (value > bestValue) {
      bestValue = value;
      bestX = tx;
      bestY = ty;
    }
  }
  // Food across a river or a lake is out of reach (checked for the chosen tile only: grazing is frequent).
  if (bestValue <= 0 || !straightWay(fauna, slot, bestX + 0.5, bestY + 0.5)) return -1;
  return bestY * fauna.size + bestX;
}

/** A hungry grazer that found nothing around: a richer place further away, its herd behind it. */
function farFood(fauna: FaunaSystem, slot: number, out: { x: number; y: number }): boolean {
  const { params } = fauna;
  const best = bestFoodTile(fauna, slot, Math.round(params.behavior.forageRadius * params.behavior.farForageFactor));
  if (best < 0) return false;
  out.x = (best % fauna.size) + 0.5;
  out.y = Math.floor(best / fauna.size) + 0.5;
  return true;
}

/**
 * Distance at which a prey notices a hunter: its own vigilance, longer with each herd mate (more
 * eyes, up to a point), shorter in thick cover.
 */
export function vigilanceRadius(fauna: FaunaSystem, slot: number, species: AnimalSpecies): number {
  const { store, params } = fauna;
  const rules = params.vigilance;
  const mates = Math.min(rules.maxMates, Math.max(0, fauna.groups.size[store.group[slot]!]! - 1));
  const cover = fauna.coverOfBiome[fauna.world.biome[store.y[slot]! * fauna.size + store.x[slot]!]!]!;
  return species.fleeRadius * (1 + rules.perMate * mates) * (1 - rules.coverShare * cover);
}

/** The alarm: the herd mates close to an animal that runs from a hunter run with it. */
function alarmHerd(fauna: FaunaSystem, slot: number, fx: number, fy: number): void {
  const { store, params } = fauna;
  const group = store.group[slot]!;
  if (fauna.groups.size[group]! <= 1 || params.vigilance.alarmTiles <= 0) return;
  fauna.grid.forEachNear(store.px[slot]!, store.py[slot]!, params.vigilance.alarmTiles, (other) => {
    if (other === slot || store.group[other] !== group || store.state[other] === State.Flee) return;
    if (distance(store.px[slot]!, store.py[slot]!, store.px[other]!, store.py[other]!) > params.vigilance.alarmTiles) return;
    fleeFrom(fauna, other, fx, fy);
  });
}

/** Can the animal walk straight from where it is to (tx, ty) without crossing water? (Half-tile samples.) */
function straightWay(fauna: FaunaSystem, slot: number, tx: number, ty: number): boolean {
  const { store } = fauna;
  const x = store.px[slot]!;
  const y = store.py[slot]!;
  const samples = Math.ceil(distance(x, y, tx, ty) * 2);
  for (let k = 1; k <= samples; k++) {
    if (!fauna.isWalkable(Math.floor(x + ((tx - x) * k) / samples), Math.floor(y + ((ty - y) * k) / samples))) return false;
  }
  return true;
}

/** Nearest carcass within `radius` the animal can walk to (one across a river or a lake is out of reach), or -1. */
function reachableCarcass(fauna: FaunaSystem, slot: number, radius: number): number {
  const { store } = fauna;
  const x = store.x[slot]!;
  const y = store.y[slot]!;
  let best = -1;
  let bestDistance = radius + 1;
  for (const tile of fauna.carrion.tiles) {
    const tx = tile % fauna.size;
    const d = Math.max(Math.abs(tx - x), Math.abs((tile - tx) / fauna.size - y));
    if (d < bestDistance && straightWay(fauna, slot, tx + 0.5, (tile - tx) / fauna.size + 0.5)) {
      best = tile;
      bestDistance = d;
    }
  }
  return best;
}

/** Nearest living animal (real distance ≤ radius) passing `accept`, or -1. */
function nearestAnimal(fauna: FaunaSystem, grid: SpatialGrid, slot: number, radius: number, accept: (other: number) => boolean): number {
  const { store } = fauna;
  const x = store.px[slot]!;
  const y = store.py[slot]!;
  let best = -1;
  let bestDistance = radius;
  grid.forEachNear(x, y, radius, (other) => {
    if (other === slot) return;
    const d = distance(x, y, store.px[other]!, store.py[other]!);
    if (d <= bestDistance && accept(other)) {
      best = other;
      bestDistance = d;
    }
  });
  return best;
}

/** Action of one step, according to the current state. */
export function act(fauna: FaunaSystem, slot: number): void {
  const { store, params } = fauna;
  const species = fauna.speciesOf(slot);
  noticeLoneHuman(fauna, slot, species);
  const state = store.state[slot]!;
  switch (state) {
    case State.Rest:
      settle(fauna, slot);
      return;
    case State.Eat:
      settle(fauna, slot);
      if (eatHere(fauna, slot) <= 0 || store.hunger[slot]! < params.needs.fullBelow) store.state[slot] = State.Rest;
      return;
    case State.Drink:
      settle(fauna, slot);
      if (canDrink(fauna.world, store.x[slot]!, store.y[slot]!) || troughHere(fauna, slot)) store.thirst[slot] = Math.max(0, store.thirst[slot]! - params.needs.drinkPerStep);
      if (store.thirst[slot]! < params.needs.fullBelow) store.state[slot] = State.Rest;
      return;
    case State.Hunt:
      hunt(fauna, slot, species);
      return;
    default:
      travel(fauna, slot, species, state);
  }
}

/** Standing (resting, grazing, drinking): it slows down to a stop where it is. */
function settle(fauna: FaunaSystem, slot: number): void {
  const { store } = fauna;
  if (store.vx[slot] === 0 && store.vy[slot] === 0) return;
  const speed = speedOf(store, slot);
  const brake = fauna.params.movement.accelTilesPerHour2 * fauna.hoursPerStep;
  if (speed <= brake) {
    stop(store, slot);
    return;
  }
  const keep = (speed - brake) / speed;
  store.vx[slot] = store.vx[slot]! * keep;
  store.vy[slot] = store.vy[slot]! * keep;
  advance(store, slot, fauna.hoursPerStep, fauna.size, fauna.walkableTile);
  updateGait(store, slot, false);
  fauna.place(slot, store.px[slot]!, store.py[slot]!);
}

/**
 * One step of steering toward (tx, ty) at `speed` tiles per hour: acceleration, braking when
 * `arrive`, progressive turns, soft avoidance of the neighbours, and no entering water.
 */
export function moveTo(fauna: FaunaSystem, slot: number, tx: number, ty: number, speed: number, arrive: boolean, running: boolean): void {
  const { store, params } = fauna;
  const movement = params.movement;
  const hours = fauna.hoursPerStep;
  // The neighbours too close are looked at when the animal thinks; the push is kept in between.
  if ((store.uid[slot]! + fauna.step) % params.thinkEverySteps === 0) {
    const count = fauna.grid.gather(store.px[slot]!, store.py[slot]!, movement.personalSpaceTiles, NEAR);
    separation(store, slot, movement.personalSpaceTiles, movement.avoidTilesPerHour, NEAR, count, null, PUSH);
    store.pushX[slot] = PUSH.x;
    store.pushY[slot] = PUSH.y;
  }
  GOAL.x = tx;
  GOAL.y = ty;
  GOAL.speed = speed;
  GOAL.accel = movement.accelTilesPerHour2 * (running ? 2 : 1);
  GOAL.arrive = arrive;
  GOAL.pushX = store.pushX[slot]!;
  GOAL.pushY = store.pushY[slot]!;
  const x0 = store.px[slot]!;
  const y0 = store.py[slot]!;
  steer(store, slot, GOAL, hours);
  advance(store, slot, hours, fauna.size, fauna.walkableTile);
  updateGait(store, slot, running);
  fauna.place(slot, store.px[slot]!, store.py[slot]!);
  payTravel(fauna, slot, distance(x0, y0, store.px[slot]!, store.py[slot]!), running);
}

function travel(fauna: FaunaSystem, slot: number, species: AnimalSpecies, state: number): void {
  const { store, params, groups } = fauna;
  if (state === State.SeekWater) {
    seekWater(fauna, slot, species);
    return;
  }
  const movement = params.movement;
  const group = store.group[slot]!;
  const leader = groups.leader[group]!;
  // Following its herd: its place moves with the leader, the follower keeps pace.
  if ((state === State.Follow || state === State.Migrate) && leader !== slot && leader >= 0 && store.alive[leader] === 1) {
    herdSpot(fauna, slot, leader, PUSH);
    store.targetX[slot] = PUSH.x;
    store.targetY[slot] = PUSH.y;
  }
  const tx = store.targetX[slot]!;
  const ty = store.targetY[slot]!;
  const away = distance(store.px[slot]!, store.py[slot]!, tx, ty);
  // Food is eaten on its own tile: one stops right on the spot, or anywhere on that tile (pack
  // mates around a carcass push each other and could never all reach its very middle).
  const onFoodTile = state === State.Forage && Math.floor(store.px[slot]!) === Math.floor(tx) && Math.floor(store.py[slot]!) === Math.floor(ty);
  if (!onFoodTile && away > (state === State.Forage ? FORAGE_ARRIVE_TILES : movement.arriveTiles)) {
    let speed = species.walkTilesPerHour;
    let running = false;
    if (state === State.Flee) {
      running = true;
      speed = store.fleesHuman[slot] === 1 ? species.fleeSprintTiles : species.walkTilesPerHour * movement.panicRunFactor;
    } else if (state === State.Wander && store.hunger[slot]! <= params.needs.seekFoodAbove) speed *= movement.wanderSpeedShare; // a hungry animal roams in search of food
    else if (state === State.Follow && away > movement.herdSlackTiles * 2) speed *= movement.panicRunFactor;
    moveTo(fauna, slot, tx, ty, speed, true, running);
    return;
  }
  if (state === State.Forage) store.state[slot] = State.Eat;
  else if (state !== State.Migrate) store.state[slot] = State.Rest;
  settle(fauna, slot);
}

/** Follows the known path over land toward the nearest river or lake, then drinks. */
function seekWater(fauna: FaunaSystem, slot: number, species: AnimalSpecies): void {
  const { store } = fauna;
  if (canDrink(fauna.world, store.x[slot]!, store.y[slot]!)) {
    store.state[slot] = State.Drink;
    settle(fauna, slot);
    return;
  }
  let at = store.y[slot]! * fauna.size + store.x[slot]!;
  if (fauna.waterPath[at]! < 0) {
    store.state[slot] = State.Rest;
    return;
  }
  // Aims a few tiles ahead on the way: a smooth line instead of a staircase.
  for (let k = 0; k < WATER_LOOKAHEAD; k++) {
    const next = fauna.waterPath[at]!;
    if (next < 0) break;
    at = next;
    if (canDrink(fauna.world, at % fauna.size, Math.floor(at / fauna.size))) break;
  }
  moveTo(fauna, slot, (at % fauna.size) + 0.5, Math.floor(at / fauna.size) + 0.5, species.walkTilesPerHour, false, false);
}

/**
 * A person walking alone draws attention at any moment (not only when the predator stops to think):
 * a hungry predator that is not busy (hunting, eating, drinking, fleeing) goes for her.
 */
function noticeLoneHuman(fauna: FaunaSystem, slot: number, species: AnimalSpecies): void {
  const { store } = fauna;
  if (fauna.canHuntHumans[store.species[slot]!] !== 1 || species.huntRadius <= 0) return;
  const state = store.state[slot]!;
  if (state === State.Hunt || state === State.Eat || state === State.Drink || state === State.Flee) return;
  const human = nearestLoneHuman(fauna, slot, species.huntRadius);
  if (human.id < 0) return;
  store.state[slot] = State.Hunt;
  store.targetAnimal[slot] = human.id;
  store.huntsHuman[slot] = 1;
  store.chase[slot] = huntSteps(species, human.distance);
}

/** Steps a hunt may last: creeping up to the prey at a walk, then the rush. */
function huntSteps(species: AnimalSpecies, distanceTiles: number): number {
  return species.chaseSteps + Math.ceil((STALK_SLACK * Math.max(0, distanceTiles - species.chargeTiles)) / species.walkTilesPerHour);
}

function huntTargetAlive(fauna: FaunaSystem, slot: number): boolean {
  const { store } = fauna;
  const target = store.targetAnimal[slot]!;
  if (target < 0) return false;
  return store.huntsHuman[slot] === 1 ? humanTargetValid(fauna, target) : store.alive[target] === 1;
}

/**
 * Goes for a prey (animal or person) at (px, py): far off, the hunter creeps up at a walk (it is
 * seen only close); within its charging distance, it rushes. A pack closes in from several sides:
 * each hunter aims at its own point around the prey, then rushes. Returns true when the hunter is in
 * contact.
 */
export function chase(fauna: FaunaSystem, slot: number, species: AnimalSpecies, px: number, py: number): boolean {
  const { store, params, groups } = fauna;
  const movement = params.movement;
  const d = distance(store.px[slot]!, store.py[slot]!, px, py);
  if (d <= movement.catchTiles) {
    settle(fauna, slot);
    return true;
  }
  let tx = px;
  let ty = py;
  if (groups.size[store.group[slot]!]! > 1 && d > movement.encircleTiles + movement.catchTiles) {
    const k = (store.uid[slot]! * 5) % DIRECTION_COUNT;
    tx += DIRECTIONS_X[k]! * movement.encircleTiles;
    ty += DIRECTIONS_Y[k]! * movement.encircleTiles;
  }
  if (d > species.chargeTiles) {
    moveTo(fauna, slot, tx, ty, species.walkTilesPerHour, false, false);
    return false;
  }
  // Close to the prey, the hunter brakes so as to stay on it instead of running past.
  const close = d <= movement.encircleTiles + movement.catchTiles;
  moveTo(fauna, slot, tx, ty, species.sprintTiles, close, true);
  return distance(store.px[slot]!, store.py[slot]!, px, py) <= movement.catchTiles;
}

function hunt(fauna: FaunaSystem, slot: number, species: AnimalSpecies): void {
  const { store } = fauna;
  const prey = store.targetAnimal[slot]!;
  store.chase[slot] = store.chase[slot]! - 1;
  // A prey gone far out of sight is given up.
  const lost = store.huntsHuman[slot] === 0 && store.alive[prey] === 1 && distance(store.px[slot]!, store.py[slot]!, store.px[prey]!, store.py[prey]!) > species.huntRadius * LOSE_SIGHT;
  // Out of breath, or the prey is gone: the chase is over.
  if (store.chase[slot]! <= 0 || lost || !huntTargetAlive(fauna, slot)) {
    store.state[slot] = State.Rest;
    store.huntsHuman[slot] = 0;
    return;
  }
  if (store.huntsHuman[slot] === 1) {
    huntHuman(fauna, slot, species);
    return;
  }
  const px = store.px[prey]!;
  const py = store.py[prey]!;
  if (!chase(fauna, slot, species, px, py)) return;
  // On the prey: one attack.
  if (!strike(fauna, slot, species, prey)) {
    if (store.alive[slot] !== 1) return;
    // Missed: the prey runs off, the hunter gives up this one.
    if (store.alive[prey] === 1) fleeFrom(fauna, prey, store.px[slot]!, store.py[slot]!);
    store.state[slot] = State.Rest;
    store.targetAnimal[slot] = -1;
    return;
  }
  const tile = store.y[prey]! * fauna.size + store.x[prey]!;
  const meat = meatOf(fauna, prey);
  fauna.kill(prey, DeathCause.Predation);
  // The kill becomes a carcass: the hunter eats first, the group (and scavengers) come for the rest.
  fauna.carrion.add(tile, meat);
  feastOnKill(fauna, slot, px, py);
}
