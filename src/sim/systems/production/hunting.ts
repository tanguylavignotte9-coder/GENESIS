import { distance } from '../../core/motion';
import type { Recipe } from './catalog';
import type { Job, WorkResult } from './jobs';
import type { ProductionSystem } from './production-system';

/**
 * Hunting: the hunter looks for game of the recipe's species, walks up to it and strikes when in
 * range (farther with a bow). The kill goes through the common interaction mechanism: the fauna
 * removes its animal, the hunter brings back what can be carried of the carcass, the rest is left
 * for the scavengers.
 */

/** Nearest game in sight: animal slot, its uid and tile, or null. */
export function goHunting(sys: ProductionSystem, person: number, recipe: Recipe): { slot: number; uid: number; tile: number } | null {
  return nearestPrey(sys, sys.people.px(person), sys.people.py(person), recipe, sys.params.hunting.searchTiles);
}

/** Is there game of the recipe's species within `radius` of (x, y) (decimal tiles)? */
export function preyNear(sys: ProductionSystem, x: number, y: number, recipe: Recipe, radius: number): boolean {
  return nearestPrey(sys, x, y, recipe, radius) !== null;
}

function nearestPrey(sys: ProductionSystem, x: number, y: number, recipe: Recipe, radius: number): { slot: number; uid: number; tile: number } | null {
  const { fauna } = sys;
  let best = -1;
  let bestDistance = radius;
  fauna.grid.forEachNear(x, y, radius, (slot) => {
    // Game is wild: a domestic animal is not hunted (it is slaughtered by its keepers).
    if (fauna.store.alive[slot] !== 1 || fauna.store.ownerCamp[slot]! >= 0 || !recipe.prey.includes(fauna.store.species[slot]!)) return;
    const d = distance(fauna.store.px[slot]!, fauna.store.py[slot]!, x, y);
    if (d < bestDistance || (d === bestDistance && slot < best)) {
      best = slot;
      bestDistance = d;
    }
  });
  if (best < 0) return null;
  return { slot: best, uid: fauna.store.uid[best]!, tile: fauna.store.y[best]! * sys.size + fauna.store.x[best]! };
}

/** Does the hunter carry a weapon that shoots from afar (a bow)? */
function shootsFromAfar(sys: ProductionSystem, person: number): boolean {
  return sys.params.hunting.rangedTools.some((id) => {
    const item = sys.catalog.itemIndex.get(id);
    return item !== undefined && sys.carried[person]!.count(item) >= 1 - 1e-9;
  });
}

function strikeRange(sys: ProductionSystem, person: number): number {
  const { hunting } = sys.params;
  return shootsFromAfar(sys, person) ? hunting.rangedStrikeTiles : hunting.strikeTiles;
}

export function huntStep(sys: ProductionSystem, person: number, job: Job, hours: number, out: WorkResult): void {
  const { fauna, params } = sys;
  const recipe = job.recipe!;
  job.progress += hours;
  out.skill = recipe.skill;
  out.hours = hours;
  if (fauna.store.alive[job.prey] !== 1 || fauna.store.uid[job.prey] !== job.preyUid) {
    const next = goHunting(sys, person, recipe);
    if (!next || job.progress >= params.hunting.giveUpHours) {
      out.status = 'done';
      return;
    }
    job.prey = next.slot;
    job.preyUid = next.uid;
  }
  const store = fauna.store;
  const away = distance(store.px[job.prey]!, store.py[job.prey]!, sys.people.px(person), sys.people.py(person));
  if (away <= strikeRange(sys, person)) {
    const skill = recipe.skill >= 0 ? sys.people.skill(person, recipe.skill) : 0;
    const chance = (params.hunting.successChance + params.hunting.skillBonus * skill) * hours;
    if (sys.rng.nextFloat() < chance) {
      strike(sys, person, job, recipe);
      out.status = 'done';
      return;
    }
  }
  if (job.progress >= params.hunting.giveUpHours) {
    out.status = 'done';
    return;
  }
  out.status = 'move';
  out.tile = store.y[job.prey]! * sys.size + store.x[job.prey]!;
}

/**
 * A big animal may fight back when struck (an aurochs charges, a boar or a bear turns on the
 * hunter): the blow is applied to the hunter through the interactions; a skilled hunter, or one who
 * shoots from afar, is less exposed. Returns true if the hunt ends there (the hunter fell, or the
 * animal got away).
 */
function riposte(sys: ProductionSystem, person: number, job: Job, recipe: Recipe): boolean {
  const species = sys.fauna.speciesOf(job.prey);
  const skill = recipe.skill >= 0 ? sys.people.skill(person, recipe.skill) : 0;
  const chance = species.riposteChance * (shootsFromAfar(sys, person) ? sys.params.hunting.rangedRiposte : 1) * (1 - skill / 2);
  if (chance <= 0 || sys.rng.nextFloat() >= chance) return false;
  const female = sys.people.female(person);
  const outcome = sys.interactions.attack({
    attacker: { kind: 'animal', id: job.prey },
    target: { kind: 'human', id: person },
    damage: species.riposteDamage * (0.5 + sys.rng.nextFloat()),
    attackerName: species.name.toLowerCase(),
    tick: sys.tick,
    motive: 'defense',
    context: ` qu’${female ? 'elle' : 'il'} chassait`,
  });
  return outcome.killed || sys.rng.nextFloat() < sys.params.hunting.riposteEscape;
}

/** The blow: the fauna applies the death, the hunter takes the carcass (as much as can be carried). */
function strike(sys: ProductionSystem, person: number, job: Job, recipe: Recipe): void {
  if (riposte(sys, person, job, recipe)) return;
  const outcome = sys.interactions.attack({
    attacker: { kind: 'human', id: person },
    target: { kind: 'animal', id: job.prey },
    damage: Number.MAX_VALUE,
    attackerName: sys.people.name(person),
    tick: sys.tick,
  });
  if (!outcome.killed) return;
  const carcass = recipe.outputs[0]?.item ?? -1;
  if (carcass < 0) return;
  const { meatPerCarcass } = sys.params.hunting;
  const units = Math.max(1, Math.round(outcome.remains / meatPerCarcass));
  const carried = Math.max(1, Math.min(units, Math.floor(sys.room(person) / sys.catalog.bulk[carcass]!)));
  sys.carried[person]!.put(carcass, carried, 0.5, person);
  const left = units - carried;
  if (left > 0) sys.fauna.leaveRemains(outcome.y * sys.size + outcome.x, left * meatPerCarcass);
}
