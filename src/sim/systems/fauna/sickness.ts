import { distance } from '../../core/motion';
import type { FaunaSystem } from './fauna-system';

/**
 * Animal diseases (parasites, epizootics). Now and then an animal falls ill by itself; a sick animal
 * gives its illness to the animals of its species close to it. The more crowded a population, the
 * more neighbours each sick animal has, the further the disease goes: dense herds pay for their
 * density. A sick animal loses health every day (it may die of it) and does not breed; once healed,
 * it is immune for a while.
 */
export function spreadSickness(fauna: FaunaSystem): void {
  const { store, params, rng } = fauna;
  const rules = params.sickness;
  const caught: number[] = [];
  for (let slot = 0; slot < store.slots; slot++) {
    if (store.alive[slot] === 0) continue;
    if (store.sickDays[slot]! > 0) {
      const code = store.species[slot]!;
      const x = store.px[slot]!;
      const y = store.py[slot]!;
      fauna.grid.forEachNear(x, y, rules.contagionTiles, (other) => {
        if (store.species[other] !== code || store.sickDays[other]! > 0 || store.immuneDays[other]! > 0) return;
        if (distance(x, y, store.px[other]!, store.py[other]!) > rules.contagionTiles) return;
        if (rng.nextFloat() < rules.transmitPerDay) caught.push(other);
      });
      store.sickDays[slot] = store.sickDays[slot]! - 1;
      if (store.sickDays[slot] === 0) store.immuneDays[slot] = rules.immuneDays;
    } else if (store.immuneDays[slot]! > 0) store.immuneDays[slot] = store.immuneDays[slot]! - 1;
    else if (rng.nextFloat() < rules.outbreakPerDay) caught.push(slot);
  }
  for (const slot of caught) if (store.sickDays[slot] === 0) store.sickDays[slot] = rules.sickDays;
}
