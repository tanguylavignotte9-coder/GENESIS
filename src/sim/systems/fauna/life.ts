import { localDayOfYear } from '../flora/fitness';
import { Sex } from './animal-store';
import { DeathCause, type FaunaSystem } from './fauna-system';

const FULL = 100;

/** One day of an animal's life: health from its needs and the cold, ageing, death, pregnancy, mating. */
export function liveOneDay(fauna: FaunaSystem, slot: number): void {
  const { store, params } = fauna;
  const species = fauna.speciesOf(slot);
  const needs = params.needs;
  const age = store.ageDays[slot]! + 1;
  store.ageDays[slot] = age;
  const maxAgeDays = species.maxAgeYears * fauna.daysPerYear;
  if (age > maxAgeDays) {
    fauna.kill(slot, DeathCause.Age);
    return;
  }

  const damages = [0, 0, 0, 0];
  if (store.hunger[slot]! >= FULL) damages[DeathCause.Starvation] = needs.starvationDamagePerDay;
  if (store.thirst[slot]! >= FULL) damages[DeathCause.Thirst] = needs.thirstDamagePerDay;
  const temperature = fauna.climate.temperatureAt(store.y[slot]! * fauna.size + store.x[slot]!);
  if (temperature < species.minCelsius) damages[DeathCause.Cold] = (species.minCelsius - temperature) * needs.coldDamagePerDegreeDay;
  if (age > needs.oldAgeShare * maxAgeDays) damages[DeathCause.Age] = needs.oldAgeDamagePerDay;
  const total = damages.reduce((sum, value) => sum + value, 0);
  if (total > 0) {
    store.health[slot] = store.health[slot]! - total;
    if (store.health[slot]! <= 0) {
      fauna.kill(slot, damages.indexOf(Math.max(...damages)));
      return;
    }
  } else {
    store.health[slot] = Math.min(FULL, store.health[slot]! + needs.regenPerDay);
  }

  if (store.pregnancy[slot]! > 0) {
    store.pregnancy[slot] = store.pregnancy[slot]! - 1;
    if (store.pregnancy[slot] === 0) giveBirth(fauna, slot);
    return;
  }
  if (canConceive(fauna, slot) && fauna.rng.nextFloat() < species.conceptionChance) store.pregnancy[slot] = species.gestationDays;
}

function canConceive(fauna: FaunaSystem, slot: number): boolean {
  const { store, params } = fauna;
  const species = fauna.speciesOf(slot);
  if (store.sex[slot] !== Sex.Female || store.ageDays[slot]! < species.adultAgeYears * fauna.daysPerYear) return false;
  if (store.health[slot]! < params.behavior.breedingMinHealth || store.hunger[slot]! > params.behavior.breedingMaxHunger) return false;
  const northern = store.y[slot]! < fauna.size / 2;
  const day = localDayOfYear(fauna.climate.dayOfYear, northern, fauna.daysPerYear);
  if (day < species.breedingDays[0] || day >= species.breedingDays[1]) return false;
  return (
    hasMateNearby(fauna, slot, params.behavior.mateRadius) &&
    !isCrowded(fauna, slot, species.crowdingRadius, species.crowdingMax) &&
    enoughPrey(fauna, slot, species.preyCheckRadius, species.breedingMinPrey)
  );
}

/** Hunters raise young only where game is plentiful: at least `min` prey within `radius` tiles. */
function enoughPrey(fauna: FaunaSystem, slot: number, radius: number, min: number): boolean {
  if (min <= 0) return true;
  const { store } = fauna;
  const x = store.x[slot]!;
  const y = store.y[slot]!;
  const n = fauna.params.species.length;
  const hunter = store.species[slot]!;
  let seen = 0;
  fauna.grid.forEachNear(x, y, radius, (other) => {
    if (seen >= min || fauna.hunts[hunter * n + store.species[other]!] !== 1) return;
    if (Math.abs(store.x[other]! - x) <= radius && Math.abs(store.y[other]! - y) <= radius) seen++;
  });
  return seen >= min;
}

/** An adult male of the same species within `radius` tiles (herd mate or a solitary neighbour). */
function hasMateNearby(fauna: FaunaSystem, slot: number, radius: number): boolean {
  const { store } = fauna;
  const x = store.x[slot]!;
  const y = store.y[slot]!;
  const code = store.species[slot]!;
  const adultDays = fauna.speciesOf(slot).adultAgeYears * fauna.daysPerYear;
  let found = false;
  fauna.grid.forEachNear(x, y, radius, (other) => {
    if (found || store.species[other] !== code || store.sex[other] !== Sex.Male || store.ageDays[other]! < adultDays) return;
    found = Math.abs(store.x[other]! - x) <= radius && Math.abs(store.y[other]! - y) <= radius;
  });
  return found;
}

/** Does the animal see more than `max` others of its species within `radius` tiles? */
function isCrowded(fauna: FaunaSystem, slot: number, radius: number, max: number): boolean {
  const { store } = fauna;
  const x = store.x[slot]!;
  const y = store.y[slot]!;
  const code = store.species[slot]!;
  let seen = 0;
  fauna.grid.forEachNear(x, y, radius, (other) => {
    if (store.species[other] === code && Math.abs(store.x[other]! - x) <= radius && Math.abs(store.y[other]! - y) <= radius) seen++;
  });
  return seen > max;
}

function giveBirth(fauna: FaunaSystem, mother: number): void {
  const { store } = fauna;
  const species = fauna.speciesOf(mother);
  const young = fauna.rng.nextIntInclusive(species.litter[0], species.litter[1]);
  for (let k = 0; k < young; k++) {
    const child = fauna.spawn(store.species[mother]!, store.x[mother]!, store.y[mother]!, store.group[mother]!, 0);
    store.hunger[child] = 0;
    store.thirst[child] = 0;
  }
}
