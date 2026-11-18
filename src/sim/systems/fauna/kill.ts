import { State } from './animal-store';
import type { FaunaSystem } from './fauna-system';

/**
 * After a kill: the hunter moves onto the carcass and eats first; its pack mates nearby come for
 * the rest (scavengers may follow). Same for an animal or a human prey.
 */
export function feastOnKill(fauna: FaunaSystem, slot: number, x: number, y: number): void {
  const { store, params } = fauna;
  fauna.place(slot, x, y);
  store.state[slot] = State.Eat;
  store.huntsHuman[slot] = 0;
  store.targetAnimal[slot] = -1;
  const group = store.group[slot]!;
  fauna.grid.forEachNear(x, y, params.behavior.packShareRadius * 4, (other) => {
    if (other === slot || store.group[other] !== group || store.state[other] === State.Eat) return;
    store.state[other] = State.Forage;
    store.targetX[other] = x;
    store.targetY[other] = y;
  });
}
