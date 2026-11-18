import type { FaunaSystem } from './fauna-system';
import type { AnimalSpecies, FaunaParams } from './params';

const Kind = { Grass: 0, Meat: 1, Fish: 2, Produce: 3 } as const;

/** A species' diet, precomputed as arrays (fast to loop over in the hot path). */
export interface Diet {
  kinds: Uint8Array;
  weights: Float64Array;
  /** Plant resource id, for Produce entries. */
  resources: string[];
}

export function buildDiets(params: FaunaParams): Diet[] {
  return params.species.map((species) => {
    const foods = Object.keys(species.diet);
    return {
      kinds: Uint8Array.from(foods, (food) => (food === 'grass' ? Kind.Grass : food === 'meat' ? Kind.Meat : food === 'fish' ? Kind.Fish : Kind.Produce)),
      weights: Float64Array.from(foods, (food) => species.diet[food]!),
      resources: foods,
    };
  });
}

/** Food an animal of `species` can find on tile (x, y), weighted by its diet (meat = carcasses). */
export function foodValueAt(fauna: FaunaSystem, code: number, x: number, y: number): number {
  const diet = fauna.diets[code]!;
  const index = y * fauna.size + x;
  let value = 0;
  for (let k = 0; k < diet.kinds.length; k++) {
    const kind = diet.kinds[k]!;
    const weight = diet.weights[k]!;
    if (kind === Kind.Grass) value += weight * fauna.flora.grassReachable(index);
    else if (kind === Kind.Meat) value += weight * fauna.carrion.at(index);
    else if (kind === Kind.Fish) value += weight * fauna.fish.availableNear(x, y);
    else value += weight * fauna.flora.produceAvailable(index, diet.resources[k]!);
  }
  return value;
}

/** Eats plant food, fish or carcass meat on the animal's tile. Returns the food units eaten. */
export function eatHere(fauna: FaunaSystem, slot: number, species: AnimalSpecies): number {
  const { store } = fauna;
  const diet = fauna.diets[store.species[slot]!]!;
  const x = store.x[slot]!;
  const y = store.y[slot]!;
  const index = y * fauna.size + x;
  const unitsWanted = Math.min(species.foodPerDay / 4, store.hunger[slot]! / hungerPerUnit(species));
  let eaten = 0;
  for (let k = 0; k < diet.kinds.length && eaten < unitsWanted; k++) {
    const wanted = unitsWanted - eaten;
    const kind = diet.kinds[k]!;
    if (kind === Kind.Grass) eaten += fauna.flora.takeGrass(index, Math.ceil(wanted));
    else if (kind === Kind.Meat) eaten += fauna.carrion.take(index, wanted);
    else if (kind === Kind.Fish) eaten += fauna.fish.takeNear(x, y, Math.ceil(wanted));
    else eaten += fauna.flora.takeProduce(index, diet.resources[k]!, wanted);
  }
  feed(fauna, slot, species, eaten);
  return eaten;
}

/** Hunger removed by one food unit. */
export function hungerPerUnit(species: AnimalSpecies): number {
  return species.hungerPerDay / species.foodPerDay;
}

export function feed(fauna: FaunaSystem, slot: number, species: AnimalSpecies, units: number): void {
  fauna.store.hunger[slot] = Math.max(0, fauna.store.hunger[slot]! - units * hungerPerUnit(species));
}
