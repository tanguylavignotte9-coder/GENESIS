import { appetite, biteSize, swallow } from './energy';
import type { FaunaSystem } from './fauna-system';
import type { FaunaParams } from './params';

const Kind = { Grass: 0, Meat: 1, Fish: 2, Produce: 3 } as const;

/** A species' diet, precomputed as arrays (fast to loop over in the hot path). */
export interface Diet {
  kinds: Uint8Array;
  weights: Float64Array;
  /** Energy of one unit of each food (data: energy.foodEnergy). */
  energies: Float64Array;
  /** Plant resource id, for Produce entries. */
  resources: string[];
}

export function buildDiets(params: FaunaParams): Diet[] {
  const energy = params.energy.foodEnergy;
  return params.species.map((species) => {
    const foods = Object.keys(species.diet);
    const kinds = Uint8Array.from(foods, (food) => (food === 'grass' ? Kind.Grass : food === 'meat' ? Kind.Meat : food === 'fish' ? Kind.Fish : Kind.Produce));
    return {
      kinds,
      weights: Float64Array.from(foods, (food) => species.diet[food]!),
      energies: Float64Array.from(kinds, (kind) => (kind === Kind.Grass ? energy.grass : kind === Kind.Meat ? energy.meat : kind === Kind.Fish ? energy.fish : energy.produce)),
      resources: foods,
    };
  });
}

/** Food an animal of `species` can find on tile (x, y): its energy, weighted by the diet's preferences (meat = carcasses). */
export function foodValueAt(fauna: FaunaSystem, code: number, x: number, y: number): number {
  const diet = fauna.diets[code]!;
  const index = y * fauna.size + x;
  let value = 0;
  for (let k = 0; k < diet.kinds.length; k++) {
    const kind = diet.kinds[k]!;
    const weight = diet.weights[k]! * diet.energies[k]!;
    if (kind === Kind.Grass) value += weight * fauna.flora.grassReachable(index);
    else if (kind === Kind.Meat) value += weight * fauna.carrion.at(index);
    else if (kind === Kind.Fish) value += weight * fauna.fish.availableNear(x, y);
    else value += weight * fauna.flora.produceAvailable(index, diet.resources[k]!);
  }
  return value;
}

/**
 * Eats plant food, fish or carcass meat on the animal's tile: one bite at most (a share of its
 * largest meal), never more than its stomach and body can take. Returns the energy swallowed.
 */
export function eatHere(fauna: FaunaSystem, slot: number): number {
  const { store } = fauna;
  const diet = fauna.diets[store.species[slot]!]!;
  const x = store.x[slot]!;
  const y = store.y[slot]!;
  const index = y * fauna.size + x;
  let wanted = Math.min(biteSize(fauna, slot), appetite(fauna, slot));
  let eaten = 0;
  for (let k = 0; k < diet.kinds.length && wanted > 1e-6; k++) {
    const kind = diet.kinds[k]!;
    const per = diet.energies[k]!;
    if (per <= 0) continue;
    const units = wanted / per;
    let got = 0;
    if (kind === Kind.Grass) got = fauna.flora.takeGrass(index, Math.ceil(units));
    else if (kind === Kind.Meat) got = fauna.carrion.take(index, units);
    else if (kind === Kind.Fish) got = fauna.fish.takeNear(x, y, Math.ceil(units));
    else got = fauna.flora.takeProduce(index, diet.resources[k]!, units);
    const energy = swallow(fauna, slot, got * per);
    eaten += energy;
    wanted -= energy;
  }
  return eaten;
}

/** Fodder given by people to a domestic animal (units of harvest). */
export function feed(fauna: FaunaSystem, slot: number, units: number): void {
  swallow(fauna, slot, units * fauna.params.energy.foodEnergy.produce);
}
