import type { Attack, AttackOutcome } from '../../core/interactions';
import { DeathCause, type FaunaSystem } from './fauna-system';

/**
 * An animal struck by a hunter (through the common interaction mechanism): the fauna applies the
 * blow to its own animal. A mortal blow kills it; the body's meat is the outcome (the hunter's
 * owner decides what is carried away and leaves the rest with `leaveRemains`).
 */
export function sufferHunt(fauna: FaunaSystem, slot: number, attack: Attack): AttackOutcome {
  const { store } = fauna;
  const x = store.x[slot]!;
  const y = store.y[slot]!;
  const outcome: AttackOutcome = { killed: false, remains: 0, x, y, eventId: -1 };
  if (store.alive[slot] !== 1) return outcome;
  store.health[slot] = store.health[slot]! - attack.damage;
  if (store.health[slot]! > 0) return outcome;
  outcome.killed = true;
  outcome.remains = fauna.speciesOf(slot).meat;
  fauna.kill(slot, DeathCause.Hunted);
  return outcome;
}
