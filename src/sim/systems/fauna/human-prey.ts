import type { Attack, AttackOutcome, BodyView } from '../../core/interactions';
import { State } from './animal-store';
import type { FaunaSystem } from './fauna-system';
import { feastOnKill } from './kill';
import type { AnimalSpecies } from './params';
import { chase } from './behavior';
import { distance } from '../../core/motion';

/**
 * Predators and humans. A hungry predator sees the humans around through the world's view of them
 * (positions only), picks a person who walks alone and attacks through the common interaction
 * mechanism: the humans' system applies the wound or the death, then the predator eats the remains.
 */

export function humans(fauna: FaunaSystem): BodyView | null {
  return fauna.interactions.view('human');
}

/** Nobody else within `radius` tiles of the person: an easy prey. */
function isAlone(view: BodyView, person: number, radius: number): boolean {
  const x = view.x(person);
  const y = view.y(person);
  let alone = true;
  view.forEachNear(x, y, radius, (other) => {
    if (alone && other !== person && view.alive(other) && distance(x, y, view.x(other), view.y(other)) <= radius) alone = false;
  });
  return alone;
}

/** Nearest lone person within `radius` of a hungry predator able to attack humans: id and distance, or id -1. */
export function nearestLoneHuman(fauna: FaunaSystem, slot: number, radius: number): { id: number; distance: number } {
  const { store, params } = fauna;
  const none = { id: -1, distance: Infinity };
  const view = humans(fauna);
  if (!view || fauna.canHuntHumans[store.species[slot]!] !== 1 || store.hunger[slot]! < params.humanPrey.minHunger) return none;
  const x = store.px[slot]!;
  const y = store.py[slot]!;
  let best = -1;
  let bestDistance = radius;
  view.forEachNear(x, y, radius, (person) => {
    if (!view.alive(person)) return;
    const d = distance(x, y, view.x(person), view.y(person));
    if (d <= bestDistance && isAlone(view, person, params.humanPrey.loneTiles)) {
      best = person;
      bestDistance = d;
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
export function huntHuman(fauna: FaunaSystem, slot: number, species: AnimalSpecies): void {
  const { store, params } = fauna;
  const person = store.targetAnimal[slot]!;
  const view = humans(fauna);
  if (!view || !humanTargetValid(fauna, person)) {
    store.state[slot] = State.Rest;
    return;
  }
  if (!chase(fauna, slot, species, view.x(person), view.y(person))) return;
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
  feastOnKill(fauna, slot, outcome.x + 0.5, outcome.y + 0.5);
}
