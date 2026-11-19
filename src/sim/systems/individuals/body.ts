import { DeathCause } from './people';
import type { IndividualsSystem } from './individuals-system';

const FULL = 100;

/**
 * Temperature the person feels: air + weather, warmed by a lit fire nearby, a shelter while asleep
 * in one's bed, and the clothes one wears.
 */
export function feltTemperature(sys: IndividualsSystem, person: number): number {
  const { people, production } = sys;
  const tile = people.y[person]! * sys.size + people.x[person]!;
  const felt = sys.climate.temperatureAt(tile) + sys.weather.typeAt(tile).feltCelsius;
  let bonus = production.fireWarmthAt(people.camp[person]!, people.x[person]!, people.y[person]!) + production.clothingWarmth(person);
  if (sys.isSleeping(person)) {
    const bed = production.bed(person);
    if (bed.tile === tile) bonus += bed.warmth;
  }
  // Fire, shelter and clothes bring warmth up to a pleasant temperature, never beyond.
  const cap = sys.params.camp.shelterMaxCelsius;
  return bonus > 0 && felt < cap ? Math.min(felt + bonus, cap) : felt;
}

/** Needs and health over `hours`; returns the cause of death, or None if the person survives. */
export function liveHours(sys: IndividualsSystem, person: number, hours: number): number {
  const { people, life } = sys;
  const needs = sys.params.needs;
  // A body at rest in its sleep burns less; a child or a frail elder needs less than an adult.
  const asleep = sys.isSleeping(person) ? needs.sleepHungerFactor : 1;
  people.hunger[person] = Math.min(FULL, people.hunger[person]! + life.hungerPerHour(person, needs.hungerPerHour * asleep) * hours);
  people.thirst[person] = Math.min(FULL, people.thirst[person]! + needs.thirstPerHour * hours);
  // A small child at the breast drinks and eats its mother's milk.
  life.nurseStep(person, hours);
  // Less strength, less endurance: the old, the sick and the pregnant tire sooner.
  const endurance = 1 + life.params.aging.enduranceEffect * (1 - life.vigor(person));
  if (!sys.isSleeping(person)) people.fatigue[person] = Math.min(FULL, people.fatigue[person]! + needs.fatiguePerHour * endurance * hours);
  const chill = needs.comfortCelsius - feltTemperature(sys, person);
  const cold = chill > 0 ? people.cold[person]! + chill * needs.coldPerDegreeHour * hours : people.cold[person]! - needs.warmingPerHour * hours;
  people.cold[person] = Math.max(0, Math.min(FULL, cold));
  people.danger[person] = Math.max(0, people.danger[person]! - needs.dangerDecayPerHour * hours);

  // Damage from each critical need; the worst one is the cause if the person dies.
  const starving = people.hunger[person]! >= FULL ? needs.starvationDamagePerHour : 0;
  const parched = people.thirst[person]! >= FULL ? needs.thirstDamagePerHour : 0;
  const freezing = people.cold[person]! >= FULL ? needs.coldDamagePerHour : 0;
  const sick = life.diseaseDamage(person);
  const damage = (starving + parched + freezing + sick) * hours;
  let cause: number = DeathCause.Hunger;
  const worst = Math.max(starving, parched, freezing, sick);
  if (sick === worst && sick > 0) cause = DeathCause.Disease;
  else if (parched > starving && parched >= freezing) cause = DeathCause.Thirst;
  else if (freezing > starving && freezing > parched) cause = DeathCause.Cold;
  if (damage > 0) people.health[person] = people.health[person]! - damage;
  // A sick body does not mend until the disease is gone.
  else if (life.state.disease[person]! < 0) people.health[person] = Math.min(FULL, people.health[person]! + needs.regenPerHour * hours);
  return people.health[person]! <= 0 ? cause : DeathCause.None;
}
