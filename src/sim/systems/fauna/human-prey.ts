import type { Attack, AttackOutcome, BodyView } from '../../core/interactions';
import { State } from './animal-store';
import type { FaunaSystem } from './fauna-system';
import { feastOnKill } from './kill';
import type { AnimalSpecies } from './params';

/**
 * Predators and humans. A hungry predator sees the humans around through the world's view of them
 * (positions only), picks a person who walks alone and attacks through the common interaction
 * mechanism: the humans' system applies the wound or the death, then the predator eats the remains.
 */

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function humans(fauna: FaunaSystem): BodyView | null {
  return fauna.interactions.view('human');
}

/** Nobody else within `radius` tiles of the person: an easy prey. */
function isAlone(view: BodyView, person: number, radius: number): boolean {
  const x = view.x(person);
  const y = view.y(person);
  let alone = true;
  view.forEachNear(x, y, radius, (other) => {
    if (alone && other !== person && view.alive(other) && chebyshev(x, y, view.x(other), view.y(other)) <= radius) alone = false;
  });
  return alone;
}

/** Nearest lone person within `radius` of a hungry predator able to attack humans: id and distance, or id -1. */
export function nearestLoneHuman(fauna: FaunaSystem, slot: number, radius: number): { id: number; distance: number } {
  const { store, params } = fauna;
  const none = { id: -1, distance: Infinity };
  const view = humans(fauna);
  if (!view || fauna.canHuntHumans[store.species[slot]!] !== 1 || store.hunger[slot]! < params.humanPrey.minHunger) return none;
  const x = store.x[slot]!;
  const y = store.y[slot]!;
  let best = -1;
  let bestDistance = radius + 1;
  view.forEachNear(x, y, radius, (person) => {
    if (!view.alive(person)) return;
    const distance = chebyshev(x, y, view.x(person), view.y(person));
    if (distance < bestDistance && isAlone(view, person, params.humanPrey.loneTiles)) {
      best = person;
      bestDistance = distance;
    }
  });
  return best < 0 ? none : { id: best, distance: bestDistance };
}

/** Still worth chasing: alive, and still alone (a predator does not charge a group). */
export function humanTargetValid(fauna: FaunaSystem, person: number): boolean {
  const view = humans(fauna);
  return view !== null && view.alive(person) && isAlone(view, person, fauna.params.humanPrey.loneTiles);
}

/** One step of the chase of a person: run closer, then attack. */
export function huntHuman(fauna: FaunaSystem, slot: number, species: AnimalSpecies, moveToward: (tx: number, ty: number) => void): void {
  const { store, params } = fauna;
  const person = store.targetAnimal[slot]!;
  const view = humans(fauna);
  if (!view || !humanTargetValid(fauna, person)) {
    store.state[slot] = State.Rest;
    return;
  }
  const px = view.x(person);
  const py = view.y(person);
  if (chebyshev(store.x[slot]!, store.y[slot]!, px, py) > 1) {
    for (let k = 0; k < species.sprintTiles && chebyshev(store.x[slot]!, store.y[slot]!, px, py) > 1; k++) moveToward(px, py);
    return;
  }
  if (fauna.rng.nextFloat() >= params.humanPrey.attackChancePerStep) return;
  fauna.interactions.attack({
    attacker: { kind: 'animal', id: slot },
    target: { kind: 'human', id: person },
    damage: params.humanPrey.attackDamage,
    attackerName: species.name.toLowerCase(),
    tick: fauna.tick,
  });
}

/** The predator's side of an attack: if the person died, the body becomes a carcass it eats first. */
export function onAttackDone(fauna: FaunaSystem, slot: number, _attack: Attack, outcome: AttackOutcome): void {
  if (!outcome.killed) return;
  fauna.carrion.add(outcome.y * fauna.size + outcome.x, outcome.remains);
  feastOnKill(fauna, slot, outcome.x, outcome.y);
}
