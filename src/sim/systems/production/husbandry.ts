import { distance } from '../../core/motion';
import { satisfies } from '../../core/knowledge';
import { fillTemplate } from '../../core/text';
import { abandonToWild, domesticate, genderOf } from '../fauna/domestic';
import { feed } from '../fauna/food';
import { BuildState } from './buildings';
import type { Recipe } from './catalog';
import type { CampState } from './camps';
import { publishFirstItem } from './events';
import type { Job, WorkResult } from './jobs';
import type { ProductionSystem } from './production-system';

/**
 * Husbandry, the herders' side (the animals stay in the fauna, see fauna/domestic): with the
 * knowledge of husbandry, a camp that has domesticable animals around wants a pen; then herders
 * capture wild animals (young ones by preference, adults may fight back), feed the hungry ones
 * when the pasture is bare, milk the nursing females, shear the woolly ones and slaughter the
 * surplus or in a time of want. Each task is chosen by a person who answers the camp's need.
 */

export const HUSBANDRY_EVENTS = {
  capture: 'production.husbandry.capture',
  firstSlaughter: 'production.husbandry.firstSlaughter',
  stolen: 'production.husbandry.stolen',
} as const;

export type HerdTask = 'capture' | 'milk' | 'shear' | 'slaughter' | 'feed';

/** The camp's animals (fauna slots, by slot order), counted once per hour for all camps. */
export function herdOf(sys: ProductionSystem, camp: number): readonly number[] {
  if (sys.herdsHour !== sys.hour) {
    sys.herdsHour = sys.hour;
    sys.herds.clear();
    const { store } = sys.fauna;
    for (let slot = 0; slot < store.slots; slot++) {
      if (store.alive[slot] !== 1 || store.ownerCamp[slot]! < 0) continue;
      const list = sys.herds.get(store.ownerCamp[slot]!) ?? [];
      list.push(slot);
      sys.herds.set(store.ownerCamp[slot]!, list);
    }
  }
  return sys.herds.get(camp) ?? [];
}

function recipeFor(sys: ProductionSystem, effect: HerdTask): Recipe | null {
  return sys.catalog.recipes.find((recipe) => recipe.def.effect === effect) ?? null;
}

/** The camp's finished pen (the first one), or -1. */
export function penOf(sys: ProductionSystem, camp: number): number {
  for (const building of sys.campBuildings(camp)) {
    if (building.state === BuildState.Done && sys.typeOf(building).def.function === 'pen') return building.id;
  }
  return -1;
}

/** Where the camp's animals live: its pen, or the heart of the camp while there is none. */
function homeOf(sys: ProductionSystem, camp: number): { x: number; y: number; penned: boolean } {
  const pen = penOf(sys, camp);
  const tile = pen >= 0 ? sys.buildings[pen]!.tile : sys.camps[camp]!.center;
  const x = tile % sys.size;
  return { x: x + 0.5, y: (tile - x) / sys.size + 0.5, penned: pen >= 0 };
}

function pens(sys: ProductionSystem, camp: number): number {
  return sys.campBuildings(camp).filter((b) => b.state === BuildState.Done && sys.typeOf(b).def.function === 'pen').length;
}

/** Room left for animals in the camp's pens. */
function room(sys: ProductionSystem, camp: number): number {
  return pens(sys, camp) * sys.params.husbandry.penCapacity - herdOf(sys, camp).length;
}

function isAdult(sys: ProductionSystem, slot: number): boolean {
  const species = sys.fauna.speciesOf(slot);
  return sys.fauna.store.ageDays[slot]! >= species.adultAgeYears * sys.fauna.daysPerYear;
}

/** A nursing female not milked lately. */
function milkable(sys: ProductionSystem, slot: number): boolean {
  const { store } = sys.fauna;
  const h = sys.params.husbandry;
  const species = sys.fauna.speciesOf(slot);
  if (species.milk <= 0 || store.sex[slot] !== 0 || store.hunger[slot]! > h.feedAboveHunger) return false;
  return sys.fauna.day - store.lastBirthDay[slot]! <= h.lactationDays && sys.fauna.day - store.milkedDay[slot]! >= h.milkEveryDays;
}

function shearable(sys: ProductionSystem, slot: number): boolean {
  const { store } = sys.fauna;
  return sys.fauna.speciesOf(slot).wool > 0 && isAdult(sys, slot) && sys.fauna.day - store.shornDay[slot]! >= sys.params.husbandry.shearEveryDays;
}

function hungry(sys: ProductionSystem, slot: number): boolean {
  return sys.fauna.store.hunger[slot]! > sys.params.husbandry.feedAboveHunger;
}

/** Fodder in the camp's stock (item index), or -1. */
function fodder(sys: ProductionSystem, camp: number): number {
  const stock = sys.stockOf(camp);
  for (const id of sys.params.husbandry.feedItems) {
    const item = sys.catalog.itemIndex.get(id);
    if (item !== undefined && stock.count(item) >= 1) return item;
  }
  return -1;
}

/** Too many animals for the pens, or the camp short of food (and the herd big enough to spare one). */
function slaughterWanted(sys: ProductionSystem, camp: CampState): boolean {
  const h = sys.params.husbandry;
  const herd = herdOf(sys, camp.id).filter((slot) => sys.fauna.speciesOf(slot).meat > 0 && recipeFor(sys, 'slaughter')!.prey.includes(sys.fauna.store.species[slot]!));
  if (herd.length === 0) return false;
  if (room(sys, camp.id) < 0) return true;
  return camp.needs.food > h.slaughterFoodNeed && herd.length > h.keepAtLeast;
}

/** Nearest wild animal the recipe can capture within `radius` of (x, y): young ones count as nearer. */
function wildAnimal(sys: ProductionSystem, x: number, y: number, recipe: Recipe, radius: number): number {
  const { fauna } = sys;
  const { store } = fauna;
  const young = sys.params.husbandry.youngFactor;
  let best = -1;
  let bestScore = Infinity;
  fauna.grid.forEachNear(x, y, radius, (slot) => {
    if (store.alive[slot] !== 1 || store.ownerCamp[slot]! >= 0 || !recipe.prey.includes(store.species[slot]!)) return;
    const d = distance(store.px[slot]!, store.py[slot]!, x, y);
    if (d > radius) return;
    const score = isAdult(sys, slot) ? d : d / young;
    if (score < bestScore || (score === bestScore && slot < best)) {
      best = slot;
      bestScore = score;
    }
  });
  return best;
}

/** Wild animals of a husbandry recipe live around the camp (what makes one want a pen). */
export function wildAround(sys: ProductionSystem, camp: CampState): boolean {
  const recipe = recipeFor(sys, 'capture');
  if (!recipe) return false;
  const x = camp.center % sys.size;
  return wildAnimal(sys, x + 0.5, (camp.center - x) / sys.size + 0.5, recipe, sys.params.husbandry.searchTiles) >= 0;
}

/** What the camp's herders could do now, by urgency (the camp's need is the strongest one). */
function tasks(sys: ProductionSystem, camp: CampState): { task: HerdTask; urgency: number }[] {
  const h = sys.params.husbandry;
  const out: { task: HerdTask; urgency: number }[] = [];
  const herd = herdOf(sys, camp.id);
  const know = (task: HerdTask): boolean => {
    const recipe = recipeFor(sys, task);
    return recipe !== null && satisfies(camp.needs.knowledge, recipe.knowledgeMask);
  };
  if (herd.some((slot) => hungry(sys, slot)) && fodder(sys, camp.id) >= 0 && know('feed')) out.push({ task: 'feed', urgency: h.urgency.feed });
  if (herd.some((slot) => milkable(sys, slot)) && know('milk')) out.push({ task: 'milk', urgency: h.urgency.milk });
  if (herd.some((slot) => shearable(sys, slot)) && know('shear')) out.push({ task: 'shear', urgency: h.urgency.shear });
  if (know('slaughter') && slaughterWanted(sys, camp)) out.push({ task: 'slaughter', urgency: h.urgency.slaughter * (room(sys, camp.id) < 0 ? 1 : camp.needs.food) });
  if (know('capture') && room(sys, camp.id) > 0 && wildAround(sys, camp)) out.push({ task: 'capture', urgency: h.urgency.capture });
  return out.sort((a, b) => b.urgency - a.urgency);
}

/** How much the camp needs its herders now (0..1), for the brains of its members. */
export function herdNeed(sys: ProductionSystem, camp: CampState): number {
  return tasks(sys, camp)[0]?.urgency ?? 0;
}

/** The camp wants a pen: it knows husbandry, has none, and animals to keep (its own, or wild ones around). */
export function penWanted(sys: ProductionSystem, camp: CampState): boolean {
  if (pens(sys, camp.id) > 0) return false;
  const capture = recipeFor(sys, 'capture');
  if (!capture || !satisfies(camp.needs.knowledge, capture.knowledgeMask)) return false;
  return herdOf(sys, camp.id).length > 0 || wildAround(sys, camp);
}

/** A herder's job: the most pressing task that the person can do. */
export function startHerd(sys: ProductionSystem, person: number, newJob: (recipe: Recipe, target: number) => Job): Job | null {
  const campId = sys.people.camp(person);
  const camp = sys.camps[campId];
  if (!camp) return null;
  const knowledge = sys.people.knowledge(person);
  for (const { task } of tasks(sys, camp)) {
    const recipe = recipeFor(sys, task);
    if (!recipe || !satisfies(knowledge, recipe.knowledgeMask)) continue;
    if (recipe.tools.length > 0 && !recipe.tools.some((tool) => sys.carried[person]!.count(tool) >= 1 - 1e-9 || sys.stockOf(campId).count(tool) >= 1 - 1e-9)) continue;
    const target = pickAnimal(sys, person, campId, task, recipe);
    if (task !== 'feed' && target < 0) continue;
    const home = homeOf(sys, campId);
    const tile = target >= 0 ? sys.fauna.store.y[target]! * sys.size + sys.fauna.store.x[target]! : Math.floor(home.y) * sys.size + Math.floor(home.x);
    const job = newJob(recipe, tile);
    job.prey = target;
    job.preyUid = target >= 0 ? sys.fauna.store.uid[target]! : -1;
    if (task === 'feed') {
      // The fodder is taken from the stock on the way.
      const item = fodder(sys, campId);
      if (item < 0) continue;
      const hungryCount = herdOf(sys, campId).filter((slot) => hungry(sys, slot)).length;
      const units = Math.min(sys.stockOf(campId).count(item), Math.max(1, Math.ceil(hungryCount / 2)), Math.floor(sys.room(person) / sys.catalog.bulk[item]!));
      if (units < 1) continue;
      const taken = sys.stockOf(campId).take(item, units);
      sys.carried[person]!.put(item, taken.qty, taken.quality, person);
      job.chosen = [item];
    }
    return job;
  }
  return null;
}

/** The animal a task is about (-1 = none): the nearest one that needs it. */
function pickAnimal(sys: ProductionSystem, person: number, camp: number, task: HerdTask, recipe: Recipe): number {
  const px = sys.people.px(person);
  const py = sys.people.py(person);
  const { store } = sys.fauna;
  if (task === 'capture') return wildAnimal(sys, px, py, recipe, sys.params.husbandry.searchTiles);
  if (task === 'feed') return -1;
  const herd = herdOf(sys, camp).filter((slot) => recipe.prey.includes(store.species[slot]!));
  let candidates: number[];
  if (task === 'milk') candidates = herd.filter((slot) => milkable(sys, slot));
  else if (task === 'shear') candidates = herd.filter((slot) => shearable(sys, slot));
  else {
    // One spares the breeding females: an old male first, else the oldest.
    const males = herd.filter((slot) => store.sex[slot] === 1 && isAdult(sys, slot));
    candidates = males.length > 1 ? males : herd;
    let oldest = -1;
    for (const slot of candidates) if (oldest < 0 || store.ageDays[slot]! > store.ageDays[oldest]!) oldest = slot;
    return oldest;
  }
  let best = -1;
  let bestDistance = Infinity;
  for (const slot of candidates) {
    const d = distance(store.px[slot]!, store.py[slot]!, px, py);
    if (d < bestDistance) {
      best = slot;
      bestDistance = d;
    }
  }
  return best;
}

/** One step of a herder's job: walk to the animal (or the pen), then do the task. */
export function herdStep(sys: ProductionSystem, person: number, job: Job, hours: number, out: WorkResult): void {
  const recipe = job.recipe!;
  const { fauna } = sys;
  const { store } = fauna;
  const h = sys.params.husbandry;
  job.progress += hours;
  const effect = recipe.def.effect as HerdTask;
  if (effect === 'feed') {
    feedStep(sys, person, job, out);
    return;
  }
  if (store.alive[job.prey] !== 1 || store.uid[job.prey] !== job.preyUid || (effect === 'capture' && store.ownerCamp[job.prey]! >= 0) || job.progress >= h.giveUpHours) {
    out.status = 'done';
    return;
  }
  const reach = sys.params.hunting.strikeTiles;
  const away = distance(store.px[job.prey]!, store.py[job.prey]!, sys.people.px(person), sys.people.py(person));
  if (away > reach) {
    out.status = 'move';
    out.tile = store.y[job.prey]! * sys.size + store.x[job.prey]!;
    return;
  }
  out.skill = recipe.skill;
  out.hours = hours;
  if (effect === 'capture') {
    tryCapture(sys, person, job, recipe, hours, out);
    return;
  }
  // Milking, shearing, slaughtering: the work takes the recipe's hours at the animal.
  job.station = (job.station < 0 ? 0 : job.station) + hours;
  if (job.station < recipe.def.hours) {
    out.status = 'working';
    return;
  }
  if (effect === 'milk') {
    store.milkedDay[job.prey] = fauna.day;
    give(sys, person, recipe, fauna.speciesOf(job.prey).milk);
  } else if (effect === 'shear') {
    store.shornDay[job.prey] = fauna.day;
    give(sys, person, recipe, fauna.speciesOf(job.prey).wool);
  } else if (effect === 'slaughter') slaughter(sys, person, job, recipe);
  out.status = 'done';
}

/** The products of a milking or a shearing, in the herder's hands (a first for the tribe is told). */
function give(sys: ProductionSystem, person: number, recipe: Recipe, qty: number): void {
  const output = recipe.outputs[0];
  if (!output || qty <= 0) return;
  const units = Math.min(qty * output.qty, sys.room(person) / sys.catalog.bulk[output.item]!);
  if (units <= 0) return;
  sys.carried[person]!.put(output.item, units, 0.5, person);
  const camp = sys.camps[sys.people.camp(person)];
  if (camp && !camp.firsts.has(output.item)) {
    camp.firsts.add(output.item);
    publishFirstItem(sys, person, output.item, sys.people.y(person) * sys.size + sys.people.x(person));
  }
}

/** Hungry animals at home get the fodder the herder brought. */
function feedStep(sys: ProductionSystem, person: number, job: Job, out: WorkResult): void {
  const camp = sys.people.camp(person);
  const home = homeOf(sys, camp);
  const { store } = sys.fauna;
  if (distance(home.x, home.y, sys.people.px(person), sys.people.py(person)) > sys.fauna.params.domestic.pastureTiles) {
    if (job.progress >= sys.params.husbandry.giveUpHours) {
      out.status = 'done';
      return;
    }
    out.status = 'move';
    out.tile = Math.floor(home.y) * sys.size + Math.floor(home.x);
    return;
  }
  const item = job.chosen[0] ?? -1;
  const carried = sys.carried[person]!;
  for (const slot of herdOf(sys, camp)) {
    if (item < 0 || carried.count(item) < 1 - 1e-9) break;
    if (!hungry(sys, slot)) continue;
    carried.take(item, 1);
    const species = sys.fauna.speciesOf(slot);
    feed(sys.fauna, slot, species, sys.params.husbandry.feedPerItem);
  }
  out.skill = job.recipe!.skill;
  out.hours = job.recipe!.def.hours;
  out.status = 'done';
}

/** At the animal's side: a young one is easier to catch; an adult may fight back. */
function tryCapture(sys: ProductionSystem, person: number, job: Job, recipe: Recipe, hours: number, out: WorkResult): void {
  const h = sys.params.husbandry;
  const { fauna } = sys;
  const slot = job.prey;
  const adult = isAdult(sys, slot);
  const species = fauna.speciesOf(slot);
  if (adult && sys.rng.nextFloat() < species.riposteChance * h.adultRiposte * hours) {
    const female = sys.people.female(person);
    const outcome = sys.interactions.attack({
      attacker: { kind: 'animal', id: slot },
      target: { kind: 'human', id: person },
      damage: species.riposteDamage * (0.5 + sys.rng.nextFloat()),
      attackerName: species.name.toLowerCase(),
      tick: sys.tick,
      motive: 'defense',
      context: ` qu’${female ? 'elle' : 'il'} tentait de capturer`,
    });
    if (outcome.killed || sys.rng.nextFloat() < sys.params.hunting.riposteEscape) {
      out.status = 'done';
      return;
    }
  }
  const skill = recipe.skill >= 0 ? sys.people.skill(person, recipe.skill) : 0;
  const chance = (h.captureChance + h.skillBonus * skill) * (adult ? 1 : h.youngFactor) * hours;
  if (sys.rng.nextFloat() >= chance) {
    out.status = 'working';
    return;
  }
  const camp = sys.people.camp(person);
  const first = herdOf(sys, camp).length === 0;
  const home = homeOf(sys, camp);
  const event = sys.journal.publish({
    tick: sys.tick,
    type: HUSBANDRY_EVENTS.capture,
    text: fillTemplate(h.texts.capture, {
      nom: sys.people.name(person),
      un_animal: `${genderOf(species).un} ${species.tameName}`,
      jeune: adult ? '' : h.texts.young,
      premier: first ? fillTemplate(h.texts.first, { peuple: fauna.keeperName(camp) }) : '',
    }),
    place: { x: sys.people.x(person), y: sys.people.y(person), label: '' },
    actors: [{ kind: 'human', id: person }, { kind: 'animal', id: slot }],
    causes: [],
    details: { camp, species: species.id, young: adult ? 0 : 1 },
  });
  // A young animal raised among people is already half tame.
  domesticate(fauna, slot, camp, sys.people.propertyOwner(person), home.x, home.y, home.penned, event, adult ? 0 : h.youngTame);
  sys.herdsHour = -1;
  out.status = 'done';
}

/** The animal is killed by its keeper: the carcass in the herder's hands, as from a hunt. */
function slaughter(sys: ProductionSystem, person: number, job: Job, recipe: Recipe): void {
  const { fauna } = sys;
  const slot = job.prey;
  const species = fauna.speciesOf(slot);
  const camp = sys.people.camp(person);
  const outcome = sys.interactions.attack({
    attacker: { kind: 'human', id: person },
    target: { kind: 'animal', id: slot },
    damage: Number.MAX_VALUE,
    attackerName: sys.people.name(person),
    tick: sys.tick,
  });
  sys.herdsHour = -1;
  if (!outcome.killed) return;
  const carcass = recipe.outputs[0]?.item ?? -1;
  if (carcass < 0) return;
  const units = Math.max(1, Math.round(outcome.remains / sys.params.hunting.meatPerCarcass));
  const carried = Math.max(1, Math.min(units, Math.floor(sys.room(person) / sys.catalog.bulk[carcass]!)));
  sys.carried[person]!.put(carcass, carried, 0.5, person);
  // What cannot be carried at once stays in the camp's stock (the animal was killed at home).
  if (units > carried && sys.camps[camp]) sys.storeInCamp(camp, carcass, units - carried, 0.5);
  const state = sys.camps[camp];
  const key = -1 - recipe.index;
  if (state && !state.firsts.has(key)) {
    state.firsts.add(key);
    sys.journal.publish({
      tick: sys.tick,
      type: HUSBANDRY_EVENTS.firstSlaughter,
      text: fillTemplate(sys.params.husbandry.texts.slaughter, { nom: sys.people.name(person), un_animal: `${genderOf(species).un} ${species.tameName}`, peuple: fauna.keeperName(camp) }),
      place: { x: outcome.x, y: outcome.y, label: '' },
      actors: [{ kind: 'human', id: person }],
      causes: [],
      details: { camp, species: species.id },
    });
  }
}

/**
 * Daily upkeep: the animals live at their camp's pen (or its heart), follow their owner when the
 * owner moved to another camp (a split), go to the heirs when the owner dies, and go back to the
 * wild when their camp is no more.
 */
export function husbandryDay(sys: ProductionSystem): void {
  const { store } = sys.fauna;
  const homes = new Map<number, { x: number; y: number; penned: boolean }>();
  const homeFor = (camp: number): { x: number; y: number; penned: boolean } | null => {
    if (!sys.camps[camp] || !sys.campAlive(camp)) return null;
    let home = homes.get(camp);
    if (!home) {
      home = homeOf(sys, camp);
      homes.set(camp, home);
    }
    return home;
  };
  for (let slot = 0; slot < store.slots; slot++) {
    if (store.alive[slot] !== 1 || store.ownerCamp[slot]! < 0) continue;
    const owner = store.ownerPerson[slot]!;
    if (owner >= 0 && !sys.people.alive(owner)) store.ownerPerson[slot] = sys.people.heirOf(owner);
    const keeper = store.ownerPerson[slot]!;
    if (keeper >= 0 && sys.people.alive(keeper) && sys.people.camp(keeper) !== store.ownerCamp[slot]) {
      const camp = sys.people.camp(keeper);
      const home = homeFor(camp);
      if (home) domesticate(sys.fauna, slot, camp, keeper, home.x, home.y, home.penned, store.captureEvent[slot]!);
      continue;
    }
    const home = homeFor(store.ownerCamp[slot]!);
    if (!home) {
      abandonToWild(sys.fauna, slot);
      continue;
    }
    store.homeX[slot] = home.x;
    store.homeY[slot] = home.y;
    store.penned[slot] = home.penned ? 1 : 0;
  }
  sys.herdsHour = -1;
}

/**
 * A raid: the raiders drive off a share of the defeated camp's animals to their own camp. Returns
 * how many (told in the journal by the caller's battle, as a cause).
 */
export function stealAnimals(sys: ProductionSystem, from: number, to: number, share: number, raiders: string, causes: readonly number[]): number {
  const herd = herdOf(sys, from);
  if (herd.length === 0 || share <= 0 || !sys.camps[to]) return 0;
  const count = Math.min(herd.length, Math.round(herd.length * share));
  if (count <= 0) return 0;
  const home = homeOf(sys, to);
  // The tamest are the easiest to drive off.
  const { store } = sys.fauna;
  const taken = [...herd].sort((a, b) => store.tame[b]! - store.tame[a]! || a - b).slice(0, count);
  for (const slot of taken) domesticate(sys.fauna, slot, to, -1, home.x, home.y, home.penned, store.captureEvent[slot]!);
  sys.herdsHour = -1;
  sys.journal.publish({
    tick: sys.tick,
    type: HUSBANDRY_EVENTS.stolen,
    text: fillTemplate(sys.params.husbandry.texts.stolen, { n: String(count), peuple: sys.fauna.keeperName(from), pillards: raiders }),
    place: null,
    actors: [],
    causes: [...causes],
    details: { from, to, count },
  });
  return count;
}

/** Animals and milk: the camp's herd for the HUD (count by species). */
export function herdSummary(sys: ProductionSystem, camp: number): { species: string; count: number }[] {
  const counts = new Map<number, number>();
  for (const slot of herdOf(sys, camp)) counts.set(sys.fauna.store.species[slot]!, (counts.get(sys.fauna.store.species[slot]!) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([code, count]) => ({ species: sys.fauna.params.species[code]!.tameName, count }));
}
