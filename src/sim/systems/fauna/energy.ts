import type { FaunaSystem } from './fauna-system';
import type { AnimalSpecies } from './params';

/**
 * The body's energy budget, the same for every animal (v1.4). Each animal has reserves (fat) and a
 * stomach. Every step it pays its basal metabolism, which grows as the mass to the power 0.75
 * (Kleiber): a big animal spends less per kg, and as its reserves grow with its mass, it can fast
 * longer. Food goes into the stomach, never more than one meal at a time, then is digested little
 * by little into the reserves. Walking and above all running cost energy; so do gestation and the
 * milk a mother gives her young. Hunger is how empty the body is: reserves plus stomach against
 * the largest reserves.
 */

const KLEIBER = 0.75;
const FULL = 100;

/** Mass of an animal of this age (kg): from its mass at birth, it grows until it is adult. */
export function massAt(fauna: FaunaSystem, species: AnimalSpecies, ageDays: number): number {
  const adultDays = species.adultAgeYears * fauna.daysPerYear;
  const birth = fauna.params.energy.birthMassShare;
  const grown = adultDays <= 0 ? 1 : Math.min(1, ageDays / adultDays);
  return species.massKg * (birth + (1 - birth) * grown);
}

/** Basal needs of a body of this mass for one day (energy units). */
export function basalPerDay(fauna: FaunaSystem, mass: number): number {
  return fauna.params.energy.basalPerKg075 * Math.pow(mass, KLEIBER);
}

/** Refreshes what follows from the animal's age: mass, largest reserves, basal cost of a step, largest meal. */
export function refreshBody(fauna: FaunaSystem, slot: number, species: AnimalSpecies): void {
  const { store, params } = fauna;
  const mass = massAt(fauna, species, store.ageDays[slot]!);
  const day = basalPerDay(fauna, mass);
  store.mass[slot] = mass;
  store.maxReserve[slot] = params.energy.reservePerKg * mass;
  store.basalStep[slot] = day / params.stepsPerDay;
  store.mealSize[slot] = species.mealDays * day;
}

/** Share of its largest reserves the animal holds (0 = starving, 1 = fat). */
export function condition(fauna: FaunaSystem, slot: number): number {
  const max = fauna.store.maxReserve[slot]!;
  return max > 0 ? fauna.store.energy[slot]! / max : 0;
}

/** Keeps the hunger (0..100) in line with the reserves and the stomach. */
export function updateHunger(fauna: FaunaSystem, slot: number): void {
  const { store } = fauna;
  const max = store.maxReserve[slot]!;
  const full = max > 0 ? (store.energy[slot]! + store.gut[slot]!) / max : 0;
  store.hunger[slot] = FULL * (1 - Math.min(1, full));
}

/**
 * One step of life: the basal cost (more for a pregnant female), digestion of a part of the
 * stomach into the reserves (what exceeds the largest reserves is lost), then the hunger.
 */
export function metabolismStep(fauna: FaunaSystem, slot: number, digestShare: number): void {
  const { store } = fauna;
  let cost = store.basalStep[slot]!;
  if (store.pregnancy[slot]! > 0) cost *= 1 + fauna.params.energy.gestationShare;
  const digested = store.gut[slot]! * digestShare;
  store.gut[slot] = store.gut[slot]! - digested;
  const energy = store.energy[slot]! - cost + digested;
  store.energy[slot] = Math.max(0, Math.min(store.maxReserve[slot]!, energy));
  updateHunger(fauna, slot);
}

/** Pays for `tiles` walked (or run, which costs `runCostFactor` times more). */
export function payTravel(fauna: FaunaSystem, slot: number, tiles: number, running: boolean): void {
  if (tiles <= 0) return;
  const { store, params } = fauna;
  // mass^0.75, read back from the basal cost of a step (no power computed in the hot path).
  const mass075 = (store.basalStep[slot]! * params.stepsPerDay) / params.energy.basalPerKg075;
  const cost = params.energy.walkCostPerKg075Tile * mass075 * tiles * (running ? params.energy.runCostFactor : 1);
  store.energy[slot] = Math.max(0, store.energy[slot]! - cost);
  store.spentMoving[slot] = store.spentMoving[slot]! + cost;
}

/** Room left in the stomach and in the body for food (energy units). */
export function appetite(fauna: FaunaSystem, slot: number): number {
  const { store } = fauna;
  const stomach = store.mealSize[slot]! - store.gut[slot]!;
  const body = store.maxReserve[slot]! - store.energy[slot]! - store.gut[slot]!;
  return Math.max(0, Math.min(stomach, body));
}

/** Swallows `energy` units of food (never more than its appetite); returns what was swallowed. */
export function swallow(fauna: FaunaSystem, slot: number, energy: number): number {
  const taken = Math.min(energy, appetite(fauna, slot));
  if (taken <= 0) return 0;
  fauna.store.gut[slot] = fauna.store.gut[slot]! + taken;
  updateHunger(fauna, slot);
  return taken;
}

/** Largest bite in one step (energy units): a share of a full meal per hour. */
export function biteSize(fauna: FaunaSystem, slot: number): number {
  return fauna.store.mealSize[slot]! * Math.min(1, fauna.params.energy.intakePerHour * fauna.hoursPerStep);
}

/**
 * Daily, for a young that still drinks milk: its mother gives what it lacks (up to a day of its
 * needs and a half), paid from her reserves at the milk's yield, as long as her reserves are above
 * the level where milk dries up. Without a mother (dead, gone), or with a starving one, the young
 * must find food by itself or fast.
 */
export function nurse(fauna: FaunaSystem, young: number, species: AnimalSpecies): void {
  const { store, params } = fauna;
  if (store.ageDays[young]! >= species.nursingDays) {
    store.mother[young] = -1;
    return;
  }
  const mother = store.mother[young]!;
  if (mother < 0 || store.alive[mother] !== 1 || store.uid[mother] !== store.motherUid[young]) {
    store.mother[young] = -1;
    return;
  }
  const lack = store.maxReserve[young]! - store.energy[young]!;
  const want = Math.min(lack, basalPerDay(fauna, store.mass[young]!) * 1.5);
  const spare = store.energy[mother]! - params.energy.nursingMinCondition * store.maxReserve[mother]!;
  if (want <= 0 || spare <= 0) return;
  const cost = Math.min(spare, want / params.energy.milkEfficiency);
  store.energy[mother] = store.energy[mother]! - cost;
  store.energy[young] = store.energy[young]! + cost * params.energy.milkEfficiency;
  updateHunger(fauna, mother);
  updateHunger(fauna, young);
}
