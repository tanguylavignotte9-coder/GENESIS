import { DeathCause } from './people';
import type { IndividualsSystem } from './individuals-system';

const FULL = 100;

/** Temperature the person feels: air + weather, warmed by a lit fire nearby or a hut while asleep. */
export function feltTemperature(sys: IndividualsSystem, person: number): number {
  const { people } = sys;
  const tile = people.y[person]! * sys.size + people.x[person]!;
  const felt = sys.climate.temperatureAt(tile) + sys.weather.typeAt(tile).feltCelsius;
  const camp = sys.camps[people.camp[person]!];
  let bonus = 0;
  if (camp?.lit && camp.distanceTo(people.x[person]!, people.y[person]!) <= sys.params.camp.fireWarmthTiles) bonus += sys.params.camp.fireWarmthCelsius;
  const hut = people.hut[person]!;
  if (hut >= 0 && sys.isSleeping(person) && camp?.huts[hut]?.tile === tile) bonus += sys.params.camp.hutWarmthCelsius;
  // A fire or a hut brings warmth up to a pleasant temperature, never beyond.
  const cap = sys.params.camp.shelterMaxCelsius;
  return bonus > 0 && felt < cap ? Math.min(felt + bonus, cap) : felt;
}

/** Needs and health over `hours`; returns the cause of death, or None if the person survives. */
export function liveHours(sys: IndividualsSystem, person: number, hours: number): number {
  const { people } = sys;
  const needs = sys.params.needs;
  people.hunger[person] = Math.min(FULL, people.hunger[person]! + needs.hungerPerHour * hours);
  people.thirst[person] = Math.min(FULL, people.thirst[person]! + needs.thirstPerHour * hours);
  if (!sys.isSleeping(person)) people.fatigue[person] = Math.min(FULL, people.fatigue[person]! + needs.fatiguePerHour * hours);
  const chill = needs.comfortCelsius - feltTemperature(sys, person);
  const cold = chill > 0 ? people.cold[person]! + chill * needs.coldPerDegreeHour * hours : people.cold[person]! - needs.warmingPerHour * hours;
  people.cold[person] = Math.max(0, Math.min(FULL, cold));
  people.danger[person] = Math.max(0, people.danger[person]! - needs.dangerDecayPerHour * hours);

  // Damage from each critical need; the worst one is the cause if the person dies.
  const starving = people.hunger[person]! >= FULL ? needs.starvationDamagePerHour : 0;
  const parched = people.thirst[person]! >= FULL ? needs.thirstDamagePerHour : 0;
  const freezing = people.cold[person]! >= FULL ? needs.coldDamagePerHour : 0;
  const damage = (starving + parched + freezing) * hours;
  let cause: number = DeathCause.Hunger;
  if (parched > starving && parched >= freezing) cause = DeathCause.Thirst;
  else if (freezing > starving && freezing > parched) cause = DeathCause.Cold;
  if (damage > 0) people.health[person] = people.health[person]! - damage;
  else people.health[person] = Math.min(FULL, people.health[person]! + needs.regenPerHour * hours);
  return people.health[person]! <= 0 ? cause : DeathCause.None;
}
