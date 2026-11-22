import { localDayOfYear } from '../flora/fitness';
import { Sex } from './animal-store';
import { condition, nurse, refreshBody } from './energy';
import { DeathCause, type FaunaSystem } from './fauna-system';
import { holdsTerritory } from './territory';

const FULL = 100;

/**
 * One day of an animal's life: its body grows, a young drinks its mother's milk, health from its
 * needs and the cold, ageing, death, pregnancy, mating.
 */
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
  refreshBody(fauna, slot, species);
  store.spentMoving[slot] = 0;
  if (store.mother[slot]! >= 0) nurse(fauna, slot, species);

  const damages = [0, 0, 0, 0, 0, 0, 0, 0];
  if (store.hunger[slot]! >= FULL) damages[DeathCause.Starvation] = needs.starvationDamagePerDay;
  if (store.thirst[slot]! >= FULL) damages[DeathCause.Thirst] = needs.thirstDamagePerDay;
  const temperature = fauna.climate.temperatureAt(store.y[slot]! * fauna.size + store.x[slot]!);
  if (temperature < species.minCelsius) damages[DeathCause.Cold] = (species.minCelsius - temperature) * needs.coldDamagePerDegreeDay;
  if (age > needs.oldAgeShare * maxAgeDays) damages[DeathCause.Age] = needs.oldAgeDamagePerDay;
  if (store.sickDays[slot]! > 0) damages[DeathCause.Disease] = fauna.params.sickness.damagePerDay;
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
  if (canConceive(fauna, slot) && fauna.rng.nextFloat() < species.conceptionChance * fertility(fauna, slot)) store.pregnancy[slot] = species.gestationDays;
}

/**
 * Fertility from the body: 0 below the condition needed to breed, then growing with the reserves
 * up to 1 for a female in full condition (a thin female conceives seldom, has small litters).
 */
export function fertility(fauna: FaunaSystem, slot: number): number {
  const { breedingMinCondition: min, breedingFullCondition: full } = fauna.params.energy;
  const shape = condition(fauna, slot);
  if (shape < min) return 0;
  return full <= min ? 1 : Math.min(1, (shape - min) / (full - min));
}

export function canConceive(fauna: FaunaSystem, slot: number): boolean {
  const { store, params } = fauna;
  const species = fauna.speciesOf(slot);
  if (store.sex[slot] !== Sex.Female || store.ageDays[slot]! < species.adultAgeYears * fauna.daysPerYear) return false;
  // A mother still raising her last young, or a sick animal, does not conceive.
  if (fauna.day - store.lastBirthDay[slot]! < species.birthIntervalDays || store.sickDays[slot]! > 0) return false;
  if (store.health[slot]! < params.behavior.breedingMinHealth || fertility(fauna, slot) <= 0) return false;
  const northern = store.y[slot]! < fauna.size / 2;
  const day = localDayOfYear(fauna.climate.dayOfYear, northern, fauna.daysPerYear);
  if (day < species.breedingDays[0] || day >= species.breedingDays[1]) return false;
  // Territorial hunters raise young only on the land their group holds (and, for wolves, only the dominant female).
  if (species.breedingSiteTiles > 0 && sitesTaken(fauna, slot, species.breedingSiteTiles, species.breedersPerSite)) return false;
  return hasMateNearby(fauna, slot, params.behavior.mateRadius) && (species.territoryMaxTiles <= 0 || store.ownerCamp[slot]! >= 0 || holdsTerritory(fauna, slot));
}

/** All the places of the warren are held: as many other adult females of her kind live around (the dominated ones do not breed). */
function sitesTaken(fauna: FaunaSystem, slot: number, radius: number, places: number): boolean {
  const { store } = fauna;
  const x = store.px[slot]!;
  const y = store.py[slot]!;
  const code = store.species[slot]!;
  const adultDays = fauna.speciesOf(slot).adultAgeYears * fauna.daysPerYear;
  let held = 0;
  fauna.grid.forEachNear(x, y, radius, (other) => {
    if (held >= places || other === slot || store.species[other] !== code || store.sex[other] !== Sex.Female) return;
    if (store.ageDays[other]! < adultDays) return;
    if (Math.abs(store.px[other]! - x) <= radius && Math.abs(store.py[other]! - y) <= radius) held++;
  });
  return held >= places;
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

/** The litter: bigger for a mother in good condition; each young starts with its share of her reserves. */
function giveBirth(fauna: FaunaSystem, mother: number): void {
  const { store } = fauna;
  const species = fauna.speciesOf(mother);
  const [few, many] = species.litter;
  const young = few + Math.min(many - few, Math.floor((many - few + 1) * fertility(fauna, mother) * fauna.rng.nextFloat()));
  store.lastBirthDay[mother] = fauna.day;
  for (let k = 0; k < young; k++) {
    const child = fauna.spawn(store.species[mother]!, store.px[mother]!, store.py[mother]!, store.group[mother]!, 0);
    store.thirst[child] = 0;
    store.energy[child] = store.maxReserve[child]! * condition(fauna, mother);
    store.mother[child] = mother;
    store.motherUid[child] = store.uid[mother]!;
    // Born among its keepers: domestic and tame, with its mother's owner and home.
    if (store.ownerCamp[mother]! >= 0) {
      store.ownerCamp[child] = store.ownerCamp[mother]!;
      store.ownerPerson[child] = store.ownerPerson[mother]!;
      store.homeX[child] = store.homeX[mother]!;
      store.homeY[child] = store.homeY[mother]!;
      store.penned[child] = store.penned[mother]!;
      store.tame[child] = 1;
      store.captureEvent[child] = store.captureEvent[mother]!;
    }
  }
}
