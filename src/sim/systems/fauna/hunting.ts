import { State } from './animal-store';
import { condition } from './energy';
import { DeathCause, type FaunaSystem } from './fauna-system';
import type { AnimalSpecies } from './params';
import { distance } from '../../core/motion';

/**
 * How an animal hunter (wolf, lion) chooses and attacks its prey (v1.4). Most attacks fail. The
 * chance of one attack grows with the strength of the hunters (their masses, up to a few of them:
 * beyond, the others let the work be done) against the mass of the prey, with the prey's weakness
 * (young, old, sick, wounded, thin), with surprise (a prey that had not seen the hunter), and falls
 * with the prey's agility, the refuge terrain where it stands, and the hunter's own youth or
 * wounds. A prey may fight back and wound, even kill, its attacker. The hunter picks, among the
 * prey it sees, the one that gives the most food for the effort: expected meat (what the group can
 * eat of it) against the cost of the chase and the risk of being hurt.
 */

/** Best prey options checked for a way there (technical: the check is costly). */
const REACH_CHECKS = 3;

/** Is this animal an easy prey: young, old, sick, wounded or thin? */
export function weakPrey(fauna: FaunaSystem, prey: number): boolean {
  const { store, params } = fauna;
  const species = fauna.speciesOf(prey);
  const age = store.ageDays[prey]!;
  return (
    age < species.adultAgeYears * fauna.daysPerYear ||
    age > params.needs.oldAgeShare * species.maxAgeYears * fauna.daysPerYear ||
    store.sickDays[prey]! > 0 ||
    store.health[prey]! < params.hunting.weakPreyHealth ||
    condition(fauna, prey) < params.hunting.weakPreyCondition
  );
}

/** Adults of the prey's herd within the guarding distance of it (the prey itself not counted), up to the cap. */
function adultsAround(fauna: FaunaSystem, prey: number): number {
  const { store, params } = fauna;
  const group = store.group[prey]!;
  if (fauna.groups.size[group]! <= 1) return 0;
  const adultDays = fauna.speciesOf(prey).adultAgeYears * fauna.daysPerYear;
  const r = params.hunting.guardTiles;
  let count = 0;
  fauna.grid.forEachNear(store.px[prey]!, store.py[prey]!, r, (other) => {
    if (count >= params.hunting.maxDefenders || other === prey || store.group[other] !== group || store.ageDays[other]! < adultDays) return;
    if (distance(store.px[prey]!, store.py[prey]!, store.px[other]!, store.py[other]!) <= r) count++;
  });
  return count;
}

/** A young still at its mother's side (within a few tiles), its mother alive. */
function guarded(fauna: FaunaSystem, prey: number): boolean {
  const { store } = fauna;
  const mother = store.mother[prey]!;
  if (mother < 0 || store.alive[mother] !== 1 || store.uid[mother] !== store.motherUid[prey]) return false;
  return distance(store.px[prey]!, store.py[prey]!, store.px[mother]!, store.py[mother]!) <= fauna.params.hunting.guardTiles;
}

/** Meat (kg) the body of this animal gives: an adult's, a young's by its weight. */
export function meatOf(fauna: FaunaSystem, prey: number): number {
  const species = fauna.speciesOf(prey);
  return species.meat * Math.min(1, fauna.store.mass[prey]! / species.massKg);
}

/** Hunters of the group (the hunter included) close enough to the prey to attack together, at most `cap`. */
export function huntersOn(fauna: FaunaSystem, slot: number, px: number, py: number, cap: number): number {
  const { store, params } = fauna;
  const group = store.group[slot]!;
  if (fauna.groups.size[group]! <= 1) return 1;
  let count = 1;
  fauna.hunterGrid.forEachNear(px, py, params.hunting.groupTiles, (other) => {
    if (count >= cap || other === slot || store.group[other] !== group) return;
    if (store.ageDays[other]! < fauna.speciesOf(other).adultAgeYears * fauna.daysPerYear) return;
    if (distance(px, py, store.px[other]!, store.py[other]!) <= params.hunting.groupTiles) count++;
  });
  return count;
}

/** Chance that one attack succeeds, for `hunters` hunters of this species on that prey. */
export function attackChance(fauna: FaunaSystem, slot: number, species: AnimalSpecies, prey: number, hunters: number, surprised: boolean): number {
  const { store, params } = fauna;
  const rules = params.hunting;
  const strength = hunters * species.massKg;
  const size = strength / (strength + store.mass[prey]! * rules.sizeResistance);
  const preySpecies = fauna.speciesOf(prey);
  const tile = store.y[prey]! * fauna.size + store.x[prey]!;
  const refuge = fauna.refugeOfBiome[fauna.world.biome[tile]!]!;
  const young = store.ageDays[slot]! < species.adultAgeYears * fauna.daysPerYear ? rules.youngHunterFactor : 1;
  const vigor = 0.5 + 0.5 * Math.min(1, store.health[slot]! / 100);
  let chance = species.huntSkill * size * (1 - preySpecies.evasion) * (1 - refuge) * young * vigor;
  if (weakPrey(fauna, prey)) chance *= rules.weakPreyFactor;
  // The adults of its herd close by stand together (aurochs, boars): each one makes the attack fail as
  // often as it would fight back; a young one by its mother is defended by her too.
  const defenders = Math.min(rules.maxDefenders, adultsAround(fauna, prey) + (guarded(fauna, prey) ? 1 : 0));
  if (defenders > 0 && preySpecies.riposteChance > 0) chance *= Math.pow(1 - preySpecies.riposteChance, defenders);
  if (surprised) chance *= rules.surpriseFactor;
  return Math.min(rules.maxSuccess, chance);
}

/**
 * The prey worth hunting among those in sight, or -1: expected energy (chance × the meat the group
 * can eat, at most the carcass) minus the cost of running to it and the risk of its riposte.
 */
export function choosePrey(fauna: FaunaSystem, slot: number, species: AnimalSpecies, reachable: (prey: number) => boolean): number {
  const { store, params } = fauna;
  const n = params.species.length;
  const hunter = store.species[slot]!;
  const x = store.px[slot]!;
  const y = store.py[slot]!;
  const group = store.group[slot]!;
  const eaters = Math.max(1, Math.min(fauna.groups.size[group]!, species.maxGroupSize));
  const cap = Math.min(eaters, species.huntGroupCap);
  const meatEnergy = params.energy.foodEnergy.meat;
  // What the group can swallow at one meal (energy units).
  const groupMeal = eaters * store.mealSize[slot]!;
  const runCost = params.energy.walkCostPerKg075Tile * params.energy.runCostFactor * Math.pow(store.mass[slot]!, 0.75);
  // A blow loses health; health is worth, roughly, the energy of the body's reserves.
  const healthValue = store.maxReserve[slot]! / 100;
  const options: { prey: number; score: number }[] = [];
  fauna.grid.forEachNear(x, y, species.huntRadius, (other) => {
    if (other === slot || fauna.hunts[hunter * n + store.species[other]!] !== 1 || store.ownerCamp[other]! >= 0) return;
    const d = distance(x, y, store.px[other]!, store.py[other]!);
    if (d > species.huntRadius) return;
    const chance = attackChance(fauna, slot, species, other, cap, store.state[other] !== State.Flee);
    const gain = chance * Math.min(groupMeal, meatOf(fauna, other) * meatEnergy);
    const preySpecies = fauna.speciesOf(other);
    const risk = (1 - chance) * preySpecies.riposteChance * preySpecies.riposteDamage * params.hunting.riposteShare * healthValue;
    const score = gain - d * runCost - risk;
    if (score > 0) options.push({ prey: other, score });
  });
  // The best one it can run to (not across a river or a lake).
  options.sort((a, b) => b.score - a.score || a.prey - b.prey);
  for (let k = 0; k < Math.min(options.length, REACH_CHECKS); k++) if (reachable(options[k]!.prey)) return options[k]!.prey;
  return -1;
}

/**
 * The attack, once the hunter is on its prey: one try. Success: the prey dies and becomes a
 * carcass. Failure: the prey runs, and may fight back. Returns true when the prey was killed.
 */
export function strike(fauna: FaunaSystem, slot: number, species: AnimalSpecies, prey: number): boolean {
  const { store, params } = fauna;
  const cap = Math.min(species.huntGroupCap, fauna.groups.size[store.group[slot]!]!);
  const hunters = huntersOn(fauna, slot, store.px[prey]!, store.py[prey]!, cap);
  const chance = attackChance(fauna, slot, species, prey, hunters, store.state[prey] !== State.Flee);
  const code = store.species[slot]!;
  fauna.huntStats.attempts[code] = fauna.huntStats.attempts[code]! + 1;
  if (fauna.rng.nextFloat() < chance) {
    fauna.huntStats.kills[code] = fauna.huntStats.kills[code]! + 1;
    return true;
  }
  const preySpecies = fauna.speciesOf(prey);
  // A prey in its prime may turn on its attacker.
  if (!weakPrey(fauna, prey) && fauna.rng.nextFloat() < preySpecies.riposteChance) {
    const blow = preySpecies.riposteDamage * params.hunting.riposteShare * (0.5 + fauna.rng.nextFloat());
    store.health[slot] = store.health[slot]! - blow;
    if (store.health[slot]! <= 0) {
      fauna.kill(slot, DeathCause.Injury);
      return false;
    }
  }
  return false;
}
