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
  return nearestPrey(sys, sys.people.x(person), sys.people.y(person), recipe, sys.params.hunting.searchTiles);
}

/** Is there game of the recipe's species within `radius` of (x, y)? */
export function preyNear(sys: ProductionSystem, x: number, y: number, recipe: Recipe, radius: number): boolean {
  return nearestPrey(sys, x, y, recipe, radius) !== null;
}

function nearestPrey(sys: ProductionSystem, x: number, y: number, recipe: Recipe, radius: number): { slot: number; uid: number; tile: number } | null {
  const { fauna } = sys;
  let best = -1;
  let bestDistance = radius + 1;
  fauna.grid.forEachNear(x, y, radius, (slot) => {
    if (fauna.store.alive[slot] !== 1 || !recipe.prey.includes(fauna.store.species[slot]!)) return;
    const d = Math.max(Math.abs(fauna.store.x[slot]! - x), Math.abs(fauna.store.y[slot]! - y));
    if (d < bestDistance || (d === bestDistance && slot < best)) {
      best = slot;
      bestDistance = d;
    }
  });
  if (best < 0) return null;
  return { slot: best, uid: fauna.store.uid[best]!, tile: fauna.store.y[best]! * sys.size + fauna.store.x[best]! };
}

function strikeRange(sys: ProductionSystem, person: number): number {
  const { hunting } = sys.params;
  const ranged = hunting.rangedTools.some((id) => {
    const item = sys.catalog.itemIndex.get(id);
    return item !== undefined && sys.carried[person]!.count(item) >= 1 - 1e-9;
  });
  return ranged ? hunting.rangedStrikeTiles : hunting.strikeTiles;
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
  const px = fauna.store.x[job.prey]!;
  const py = fauna.store.y[job.prey]!;
  const distance = Math.max(Math.abs(px - sys.people.x(person)), Math.abs(py - sys.people.y(person)));
  if (distance <= strikeRange(sys, person)) {
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
  out.tile = py * sys.size + px;
}

/** The blow: the fauna applies the death, the hunter takes the carcass (as much as can be carried). */
function strike(sys: ProductionSystem, person: number, job: Job, recipe: Recipe): void {
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
