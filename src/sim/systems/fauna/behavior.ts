import { DeathCause, type FaunaSystem } from './fauna-system';
import { canDrink } from './fresh-water';
import { eatHere, foodValueAt } from './food';
import { State as States } from './animal-store';
import type { AnimalSpecies } from './params';
import type { SpatialGrid } from './spatial-grid';

/** Local copy: avoids a module lookup per access in hot loops. */
const State = { ...States };

/** A hunter this close is frightening even when it is not hunting. */
const CLOSE_DANGER = 2;

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

function setTarget(fauna: FaunaSystem, slot: number, state: number, x: number, y: number): void {
  const { store } = fauna;
  store.state[slot] = state;
  store.targetX[slot] = Math.max(0, Math.min(fauna.size - 1, Math.round(x)));
  store.targetY[slot] = Math.max(0, Math.min(fauna.size - 1, Math.round(y)));
}

/** Decision: what the animal wants now, by priority (danger, thirst, hunger, herd, rest). */
export function think(fauna: FaunaSystem, slot: number): void {
  const { store, params } = fauna;
  const species = fauna.speciesOf(slot);
  const x = store.x[slot]!;
  const y = store.y[slot]!;

  if (species.fleeRadius > 0) {
    const n = params.species.length;
    const code = store.species[slot]!;
    // Danger = a hunter of this species that is hunting, or one that comes very close.
    const threat = nearestAnimal(fauna, fauna.hunterGrid, slot, species.fleeRadius, (other) => {
      if (fauna.hunts[store.species[other]! * n + code] !== 1) return false;
      return store.state[other] === State.Hunt || chebyshev(x, y, store.x[other]!, store.y[other]!) <= CLOSE_DANGER;
    });
    if (threat >= 0) {
      const dx = x - store.x[threat]!;
      const dy = y - store.y[threat]!;
      const length = Math.max(1, Math.hypot(dx, dy));
      setTarget(fauna, slot, State.Flee, x + (dx / length) * params.behavior.fleeDistance, y + (dy / length) * params.behavior.fleeDistance);
      return;
    }
  }
  if (store.state[slot] === State.Hunt && store.chase[slot]! > 0 && store.alive[store.targetAnimal[slot]!] === 1) return;

  if (store.thirst[slot]! > params.needs.seekWaterAbove) {
    if (canDrink(fauna.world, x, y)) {
      store.state[slot] = State.Drink;
      return;
    }
    if (fauna.waterPath[y * fauna.size + x]! >= 0) {
      store.state[slot] = State.SeekWater;
      return;
    }
  }

  if (store.hunger[slot]! > params.needs.seekFoodAbove && findFood(fauna, slot, species)) return;

  const group = store.group[slot]!;
  const leader = fauna.groups.leader[group]!;
  if (leader === slot && fauna.groups.migrating[group] === 1) {
    setTarget(fauna, slot, State.Migrate, fauna.groups.migrateX[group]!, fauna.groups.migrateY[group]!);
    return;
  }
  if (leader !== slot && leader >= 0 && store.alive[leader] === 1) {
    const lx = store.x[leader]!;
    const ly = store.y[leader]!;
    if (chebyshev(x, y, lx, ly) > params.behavior.cohesionRadius) {
      const state = fauna.groups.migrating[group] === 1 ? State.Migrate : State.Follow;
      setTarget(fauna, slot, state, lx + fauna.rng.nextIntInclusive(-2, 2), ly + fauna.rng.nextIntInclusive(-2, 2));
      return;
    }
  }
  if (fauna.rng.nextFloat() < params.behavior.wanderChance) {
    const r = params.behavior.wanderRadius;
    const cx = leader >= 0 && store.alive[leader] === 1 ? store.x[leader]! : x;
    const cy = leader >= 0 && store.alive[leader] === 1 ? store.y[leader]! : y;
    setTarget(fauna, slot, State.Wander, cx + fauna.rng.nextIntInclusive(-r, r), cy + fauna.rng.nextIntInclusive(-r, r));
    return;
  }
  store.state[slot] = State.Rest;
}

/** Hunting first for meat eaters, then plant food or fish here, then the best of a few tiles around. */
function findFood(fauna: FaunaSystem, slot: number, species: AnimalSpecies): boolean {
  const { store, params } = fauna;
  const x = store.x[slot]!;
  const y = store.y[slot]!;
  if ('meat' in species.diet) {
    const carcass = fauna.carrion.nearest(x, y, params.behavior.forageRadius, fauna.size);
    if (carcass >= 0) {
      setTarget(fauna, slot, State.Forage, carcass % fauna.size, Math.floor(carcass / fauna.size));
      return true;
    }
  }
  if (species.huntRadius > 0) {
    const n = params.species.length;
    const hunter = store.species[slot]!;
    const prey = nearestAnimal(fauna, fauna.grid, slot, species.huntRadius, (other) => fauna.hunts[hunter * n + store.species[other]!] === 1);
    if (prey >= 0) {
      store.state[slot] = State.Hunt;
      store.targetAnimal[slot] = prey;
      store.chase[slot] = params.behavior.chaseSteps;
      return true;
    }
  }
  const bite = species.foodPerDay / 4;
  const code = store.species[slot]!;
  if (foodValueAt(fauna, code, x, y) >= bite) {
    store.state[slot] = State.Eat;
    return true;
  }
  let bestValue = 0;
  let bestX = x;
  let bestY = y;
  const r = params.behavior.forageRadius;
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
  if (bestValue <= 0) return false;
  setTarget(fauna, slot, State.Forage, bestX, bestY);
  return true;
}

/** Nearest living animal (Chebyshev distance ≤ radius) passing `accept`, or -1. */
function nearestAnimal(fauna: FaunaSystem, grid: SpatialGrid, slot: number, radius: number, accept: (other: number) => boolean): number {
  const { store } = fauna;
  const x = store.x[slot]!;
  const y = store.y[slot]!;
  let best = -1;
  let bestDistance = radius + 1;
  grid.forEachNear(x, y, radius, (other) => {
    if (other === slot) return;
    const distance = chebyshev(x, y, store.x[other]!, store.y[other]!);
    if (distance < bestDistance && accept(other)) {
      best = other;
      bestDistance = distance;
    }
  });
  return best;
}

/** Action of one step, according to the current state. */
export function act(fauna: FaunaSystem, slot: number): void {
  const { store, params } = fauna;
  const species = fauna.speciesOf(slot);
  const state = store.state[slot]!;
  switch (state) {
    case State.Rest:
      return;
    case State.Eat:
      if (eatHere(fauna, slot, species) <= 0 || store.hunger[slot]! < params.needs.fullBelow) store.state[slot] = State.Rest;
      return;
    case State.Drink:
      if (canDrink(fauna.world, store.x[slot]!, store.y[slot]!)) store.thirst[slot] = Math.max(0, store.thirst[slot]! - params.needs.drinkPerStep);
      if (store.thirst[slot]! < params.needs.fullBelow) store.state[slot] = State.Rest;
      return;
    case State.Hunt:
      hunt(fauna, slot, species);
      return;
    default:
      travel(fauna, slot, species, state);
  }
}

function travel(fauna: FaunaSystem, slot: number, species: AnimalSpecies, state: number): void {
  const { store } = fauna;
  if (state === State.SeekWater) {
    seekWater(fauna, slot, species);
    return;
  }
  const arrived = store.x[slot] === store.targetX[slot] && store.y[slot] === store.targetY[slot];
  if (!arrived) {
    moveToward(fauna, slot, species, store.targetX[slot]!, store.targetY[slot]!);
    return;
  }
  if (state === State.Forage) store.state[slot] = State.Eat;
  else if (state !== State.Migrate) store.state[slot] = State.Rest;
}

/** Follows the known path over land toward the nearest river or lake, then drinks. */
function seekWater(fauna: FaunaSystem, slot: number, species: AnimalSpecies): void {
  const { store } = fauna;
  const x = store.x[slot]!;
  const y = store.y[slot]!;
  if (canDrink(fauna.world, x, y)) {
    store.state[slot] = State.Drink;
    return;
  }
  const next = fauna.waterPath[y * fauna.size + x]!;
  if (next < 0) {
    store.state[slot] = State.Rest;
    return;
  }
  if (fauna.rng.nextFloat() >= species.moveChance) return;
  const nx = next % fauna.size;
  const ny = (next - nx) / fauna.size;
  if (fauna.isWalkable(nx, ny)) fauna.place(slot, nx, ny);
}

function hunt(fauna: FaunaSystem, slot: number, species: AnimalSpecies): void {
  const { store, params } = fauna;
  const prey = store.targetAnimal[slot]!;
  store.chase[slot] = store.chase[slot]! - 1;
  if (prey < 0 || store.alive[prey] === 0 || store.chase[slot]! <= 0) {
    store.state[slot] = State.Rest;
    return;
  }
  const px = store.x[prey]!;
  const py = store.y[prey]!;
  if (chebyshev(store.x[slot]!, store.y[slot]!, px, py) > 1) {
    for (let k = 0; k < species.sprintTiles && chebyshev(store.x[slot]!, store.y[slot]!, px, py) > 1; k++) {
      moveToward(fauna, slot, species, px, py);
    }
    return;
  }
  if (fauna.rng.nextFloat() >= species.huntSuccess) return;
  const preySpecies = fauna.speciesOf(prey);
  const adult = store.ageDays[prey]! >= preySpecies.adultAgeYears * fauna.daysPerYear;
  fauna.kill(prey, DeathCause.Predation);
  // The kill becomes a carcass: the hunter eats first, the pack (and scavengers) come for the rest.
  fauna.carrion.add(py * fauna.size + px, adult ? preySpecies.meat : preySpecies.meat / 2);
  fauna.place(slot, px, py);
  store.state[slot] = State.Eat;
  const group = store.group[slot]!;
  fauna.grid.forEachNear(px, py, params.behavior.packShareRadius * 4, (other) => {
    if (other === slot || store.group[other] !== group || store.state[other] === State.Eat) return;
    store.state[other] = State.Forage;
    store.targetX[other] = px;
    store.targetY[other] = py;
  });
}

/** One tile toward the target (8 directions), if the animal moves this step and the ground allows it. */
export function moveToward(fauna: FaunaSystem, slot: number, species: AnimalSpecies, tx: number, ty: number): void {
  if (fauna.rng.nextFloat() >= species.moveChance) return;
  const { store } = fauna;
  const x = store.x[slot]!;
  const y = store.y[slot]!;
  const dx = Math.sign(tx - x);
  const dy = Math.sign(ty - y);
  if (fauna.isWalkable(x + dx, y + dy)) fauna.place(slot, x + dx, y + dy);
  else if (dx !== 0 && fauna.isWalkable(x + dx, y)) fauna.place(slot, x + dx, y);
  else if (dy !== 0 && fauna.isWalkable(x, y + dy)) fauna.place(slot, x, y + dy);
  else {
    const rx = x + fauna.rng.nextIntInclusive(-1, 1);
    const ry = y + fauna.rng.nextIntInclusive(-1, 1);
    if (fauna.isWalkable(rx, ry)) fauna.place(slot, rx, ry);
  }
}
