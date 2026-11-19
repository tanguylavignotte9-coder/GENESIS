import { State } from './animal-store';
import type { FaunaSystem } from './fauna-system';
import { DIRECTION_COUNT, DIRECTIONS_X, DIRECTIONS_Y, stop } from '../../core/motion';

/** Pack mates eat around the carcass at this distance (tiles, display of a shared meal). */
const FEAST_RING = 0.3;

/**
 * After a kill: the hunter moves onto the carcass and eats first; its pack mates nearby come for
 * the rest (scavengers may follow). Same for an animal or a human prey. (x, y): where the prey fell (decimal tiles).
 */
export function feastOnKill(fauna: FaunaSystem, slot: number, x: number, y: number): void {
  const { store, params } = fauna;
  // The pounce: the hunter is on its prey.
  stop(store, slot);
  fauna.place(slot, x, y);
  const cx = Math.floor(x) + 0.5;
  const cy = Math.floor(y) + 0.5;
  store.state[slot] = State.Eat;
  store.huntsHuman[slot] = 0;
  store.targetAnimal[slot] = -1;
  const group = store.group[slot]!;
  // The pack gathers around the kill, each on its own side.
  let k = 0;
  fauna.grid.forEachNear(x, y, params.behavior.packShareRadius * 4, (other) => {
    if (other === slot || store.group[other] !== group || store.state[other] === State.Eat) return;
    store.state[other] = State.Forage;
    const d = (k++ * 5) % DIRECTION_COUNT;
    store.targetX[other] = cx + DIRECTIONS_X[d]! * FEAST_RING;
    store.targetY[other] = cy + DIRECTIONS_Y[d]! * FEAST_RING;
  });
}
