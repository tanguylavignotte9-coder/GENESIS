import { Gait } from '../../core/motion';
import { DeathCause, HARM_KINDS } from './people';
import type { IndividualsSystem } from './individuals-system';

const FULL = 100;

/**
 * Temperature the person feels: air + weather, warmed by a lit fire nearby, a shelter while asleep
 * in one's bed, and the clothes one wears.
 */
export function feltTemperature(sys: IndividualsSystem, person: number): number {
  const { people, production } = sys;
  // A baby in arms shares the warmth of the body that carries it.
  const carrier = sys.life.carrier(person);
  if (carrier >= 0 && carrier !== person) return feltTemperature(sys, carrier);
  const tile = people.y[person]! * sys.size + people.x[person]!;
  const felt = sys.climate.temperatureAt(tile) + sys.weather.typeAt(tile).feltCelsius;
  let bonus = production.fireWarmthAt(people.camp[person]!, people.px[person]!, people.py[person]!) + production.clothingWarmth(person);
  if (sys.isSleeping(person)) {
    const bed = production.bed(person);
    if (bed.tile === tile) bonus += bed.warmth;
  }
  // Fire, shelter and clothes bring warmth up to a pleasant temperature, never beyond.
  const cap = sys.params.camp.shelterMaxCelsius;
  const warmed = bonus > 0 && felt < cap ? Math.min(felt + bonus, cap) : felt;
  // Sitting right by a lit fire to warm up, one does not freeze, whatever the weather.
  if (sys.behavior(person) === 'warm_up' && people.working[person] === 1 && production.fireWarmthAt(people.camp[person]!, people.px[person]!, people.py[person]!) > 0) {
    return Math.max(warmed, sys.params.camp.besideFireCelsius);
  }
  return warmed;
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
  // Running wears one out faster than walking.
  const effort = people.gait[person] === Gait.Run ? sys.params.movement.runFatigueFactor : 1;
  if (!sys.isSleeping(person)) people.fatigue[person] = Math.min(FULL, people.fatigue[person]! + needs.fatiguePerHour * endurance * effort * hours);
  const chill = needs.comfortCelsius - feltTemperature(sys, person);
  const cold = chill > 0 ? people.cold[person]! + chill * needs.coldPerDegreeHour * hours : people.cold[person]! - needs.warmingPerHour * hours;
  people.cold[person] = Math.max(0, Math.min(FULL, cold));
  people.danger[person] = Math.max(0, people.danger[person]! - needs.dangerDecayPerHour * hours);

  // Damage from each critical need. The cause of a death is the need that wore the body down most
  // since it was last whole: a starving body that also goes without water one last day dies of
  // hunger, aggravated by thirst, not of thirst alone.
  const starving = people.hunger[person]! >= FULL ? needs.starvationDamagePerHour : 0;
  const parched = people.thirst[person]! >= FULL ? needs.thirstDamagePerHour : 0;
  const freezing = people.cold[person]! >= FULL ? needs.coldDamagePerHour : 0;
  const sick = life.diseaseDamage(person);
  const damage = (starving + parched + freezing + sick) * hours;
  const harm = people.harm;
  const at = person * HARM_KINDS;
  if (damage > 0) {
    people.health[person] = people.health[person]! - damage;
    harm[at] = harm[at]! + starving * hours;
    harm[at + 1] = harm[at + 1]! + parched * hours;
    harm[at + 2] = harm[at + 2]! + freezing * hours;
    harm[at + 3] = harm[at + 3]! + sick * hours;
  } else if (life.state.disease[person]! < 0) {
    // A sick body does not mend until the disease is gone; as it mends, old harms fade with it.
    people.health[person] = Math.min(FULL, people.health[person]! + needs.regenPerHour * hours);
    healHarm(harm, at, FULL - people.health[person]!);
  }
  if (people.health[person]! > 0) return DeathCause.None;
  return worstHarm(harm, at, life.state.disease[person]! >= 0);
}

const HARM_CAUSES = [DeathCause.Hunger, DeathCause.Thirst, DeathCause.Cold, DeathCause.Disease] as const;

/** The harms shrink in proportion once the body mends (they never exceed the health lost). */
function healHarm(harm: Float32Array, at: number, deficit: number): void {
  let total = 0;
  for (let k = 0; k < HARM_KINDS; k++) total += harm[at + k]!;
  if (total <= deficit || total <= 0) return;
  const keep = deficit / total;
  for (let k = 0; k < HARM_KINDS; k++) harm[at + k] = harm[at + k]! * keep;
}

/** The cause that did the most harm (hunger when none); a disease only if one is still sick. */
function worstHarm(harm: Float32Array, at: number, sick: boolean): number {
  let best = 0;
  for (let k = 1; k < HARM_KINDS; k++) {
    if (HARM_CAUSES[k] === DeathCause.Disease && !sick) continue;
    if (harm[at + k]! > harm[at + best]!) best = k;
  }
  return HARM_CAUSES[best]!;
}
