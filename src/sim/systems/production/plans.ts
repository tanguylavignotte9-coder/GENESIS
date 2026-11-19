import { satisfies } from '../../core/knowledge';
import { BuildState } from './buildings';
import type { BuildPlan, CampNeeds, CampState, CraftPlan, WantReason } from './camps';
import type { BuildingType, Need, Recipe } from './catalog';
import type { ProductionSystem } from './production-system';
import type { Inventory } from './inventory';
import { findSourceFrom } from './sources';
import { preyNear } from './hunting';

/** A recipe's ingredients are looked for this many steps back (make the tool, then the item…). */
const MAX_PLAN_DEPTH = 3;

/**
 * The collective needs of a camp, as custom sees them: food and firewood reserves for the season,
 * room to sleep, a fire, a cache, the objects custom wants per member. Everyone reads them and
 * decides, according to their character, whether to answer them.
 */
export function computeNeeds(sys: ProductionSystem, camp: CampState): void {
  const { params } = sys;
  const members: number[] = [];
  let knowledge = 0;
  for (let person = 0; person < sys.people.count; person++) {
    if (!sys.people.alive(person) || sys.people.camp(person) !== camp.id) continue;
    members.push(person);
    knowledge = (knowledge | sys.people.knowledge(person)) >>> 0;
  }
  const needs: CampNeeds = { food: 0, wood: 0, build: 0, craft: 0, buildPlan: null, craftPlan: null, foodReserve: 0, foodHave: 0, woodReserve: 0, woodHave: 0, members, knowledge };
  camp.needs = needs;
  if (members.length === 0) return;

  const seasons = params.custom.foodReserveDaysBySeason;
  const season = sys.climate.seasonAt(camp.center);
  const reserve = (seasons[season] ?? seasons[0] ?? 0) * members.length * sys.body.dailyFood;
  // Custom counts what is in the stock, in members' hands, and on its way back from harvests.
  let food = sys.stockFood(camp.id) + camp.pendingFood;
  for (const person of members) food += sys.carriedFood(person);
  needs.food = reserve > 0 ? clamp01(1 - food / reserve) : 0;
  needs.foodReserve = reserve;
  needs.foodHave = food;

  const fire = sys.catalog.building('campfire');
  const fireKnown = fire !== undefined && satisfies(knowledge, fire.knowledgeMask);
  let fuelHours = camp.pendingFuel;
  const countFuel = (inventory: Inventory): void => {
    for (const pile of inventory.piles) if (sys.catalog.items[pile.item]!.category === 'material') fuelHours += pile.qty * sys.catalog.fuel[pile.item]!;
  };
  countFuel(camp.stock);
  for (const person of members) countFuel(sys.carried[person]!);
  needs.wood = fireKnown && params.custom.firewoodReserveHours > 0 ? clamp01(1 - fuelHours / params.custom.firewoodReserveHours) : 0;
  needs.woodReserve = fireKnown ? params.custom.firewoodReserveHours : 0;
  needs.woodHave = fuelHours;

  sourceCache.clear();
  needs.craftPlan = chooseCraft(sys, camp, knowledge, members.length);
  // Unfinished work waiting in the camp is a need of its own.
  if (!needs.craftPlan && camp.unfinished.length > 0) needs.craft = params.custom.urgency.craft;
  // Any missing object custom wants is a need; the more is missing, the stronger.
  if (needs.craftPlan) needs.craft = params.custom.urgency.craft * (0.5 + 0.5 * craftShortfall(sys, camp, needs.craftPlan, members.length));
  const build = chooseBuild(sys, camp, knowledge, members.length, needs.craftPlan);
  if (build) {
    needs.buildPlan = build.plan;
    needs.build = build.urgency;
  }
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Quantity of an item the camp holds: common stock, what members carry, and what is being made. */
export function campHolds(sys: ProductionSystem, camp: CampState, item: number): number {
  let total = camp.stock.count(item) + camp.pending[item]!;
  for (const work of camp.unfinished) for (const output of work.recipe.outputs) if (output.item === item) total += output.qty;
  for (const person of camp.needs.members) total += sys.carried[person]!.count(item);
  return total;
}

function wanted(sys: ProductionSystem, item: number, members: number): number {
  return Math.round(sys.catalog.items[item]!.wantPerMember * members);
}

function craftShortfall(sys: ProductionSystem, camp: CampState, plan: CraftPlan, members: number): number {
  const top = plan.wantedItem;
  if (top < 0) return 1;
  const target = wanted(sys, top, members);
  // Not a want of custom: something to save before it rots.
  if (target <= 0) return 1;
  return clamp01((target - campHolds(sys, camp, top)) / target);
}

/**
 * What to make: first, save what is about to rot (butcher a carcass, tan a hide) when it can be
 * done right now; then the first object custom wants that is missing and can be started (data order).
 */
function chooseCraft(sys: ProductionSystem, camp: CampState, knowledge: number, members: number): CraftPlan | null {
  const rescue = savePerishables(sys, camp, knowledge);
  if (rescue) return rescue;
  const sowing = sowFields(sys, camp, knowledge);
  if (sowing) return sowing;
  const items = sys.catalog.items;
  for (let item = 0; item < items.length; item++) {
    const target = wanted(sys, item, members);
    if (target <= 0 || campHolds(sys, camp, item) >= target) continue;
    const plan = planFor(sys, camp, knowledge, item, 0);
    if (plan) return { ...plan, wantedItem: item };
  }
  return null;
}

/** A perishable raw material of the stock (not food) that a known recipe can turn into something now. */
function savePerishables(sys: ProductionSystem, camp: CampState, knowledge: number): CraftPlan | null {
  for (const pile of camp.stock.piles) {
    if (sys.catalog.halfLife[pile.item]! <= 0 || sys.catalog.food[pile.item]! > 0 || pile.qty < 1 - 1e-6) continue;
    for (const recipe of sys.catalog.recipes) {
      if (recipe.def.source || !satisfies(knowledge, recipe.knowledgeMask) || !recipe.inputs.some((need) => need.items.includes(pile.item))) continue;
      if (!toolsAvailable(sys, camp, recipe) || (recipe.station >= 0 && stationOf(sys, camp.id, recipe) < 0)) continue;
      if (!recipe.inputs.every((need) => haveNeed(sys, camp, need))) continue;
      const output = recipe.outputs[0]?.item ?? pile.item;
      return { kind: 'craft', recipe, item: output, station: -1, wantedItem: pile.item };
    }
  }
  return null;
}

/** An empty field in the growing season is sown (with seeds from the stock, or gathered for it). */
function sowFields(sys: ProductionSystem, camp: CampState, knowledge: number): CraftPlan | null {
  for (const recipe of sys.catalog.recipes) {
    if (recipe.def.effect !== 'sow' || !satisfies(knowledge, recipe.knowledgeMask)) continue;
    const field = stationOf(sys, camp.id, recipe);
    if (field < 0 || sys.climate.temperatureAt(sys.buildings[field]!.tile) < sys.params.crop.minCelsius) continue;
    const seeds = recipe.inputs[0];
    if (!seeds || haveNeed(sys, camp, seeds)) return { kind: 'craft', recipe, item: -1, station: -1, wantedItem: -1 };
    if (onItsWay(sys, camp, seeds)) continue;
    for (const item of seeds.items) {
      const plan = planFor(sys, camp, knowledge, item, 1, true);
      // wantedItem -1: these are seeds for a field (sown at once, not stored).
      if (plan) return { ...plan, wantedItem: -1 };
    }
  }
  return null;
}

/** Is any of the items of a need in the common stock? */
function haveNeed(sys: ProductionSystem, camp: CampState, need: Need): boolean {
  return need.items.some((item) => camp.stock.count(item) >= need.qty - 1e-6);
}

/** Is a need on its way to the stock (in members' hands, or being harvested)? */
function onItsWay(sys: ProductionSystem, camp: CampState, need: Need): boolean {
  return need.items.some((item) => camp.stock.count(item) + carriedByMembers(sys, camp, item) + camp.pending[item]! >= need.qty - 1e-6);
}

function carriedByMembers(sys: ProductionSystem, camp: CampState, item: number): number {
  let total = 0;
  for (const person of camp.needs.members) total += sys.carried[person]!.count(item);
  return total;
}

/** Can a harvest happen at all here (its source kind exists for this camp)? */
export function harvestPossible(sys: ProductionSystem, camp: number, recipe: Recipe): boolean {
  const kind = recipe.def.source?.kind;
  if (kind === 'livestock') return false; // no domestic animals yet
  if (kind === 'field') return sys.campBuildings(camp).some((b) => b.state === BuildState.Done && b.grain >= 1);
  return true;
}

/** Has the camp the tools of a recipe in its common stock? */
export function toolsAvailable(sys: ProductionSystem, camp: CampState, recipe: Recipe): boolean {
  return recipe.tools.length === 0 || recipe.tools.some((tool) => camp.stock.count(tool) >= 1 - 1e-9);
}

/** Is one of the recipe's tools somewhere in the camp (in the stock or in someone's hands)? */
function toolsInCamp(sys: ProductionSystem, camp: CampState, recipe: Recipe): boolean {
  return recipe.tools.length === 0 || recipe.tools.some((tool) => camp.stock.count(tool) + carriedByMembers(sys, camp, tool) + camp.pending[tool]! >= 1 - 1e-9);
}

/** A built station of the recipe in the camp (lit, for a fire), or -1. */
export function stationOf(sys: ProductionSystem, camp: number, recipe: Recipe): number {
  if (recipe.station < 0) return -1;
  for (const building of sys.buildings) {
    if (building.camp !== camp || building.type !== recipe.station || building.state !== BuildState.Done) continue;
    if (sys.typeOf(building).def.function === 'fire' && building.fuel <= 0 && recipe.def.effect !== 'fuel') continue;
    if (recipe.def.effect === 'sow' && (building.sown > 0 || building.grain >= 1)) continue;
    return building.id;
  }
  return -1;
}

function stationBuilt(sys: ProductionSystem, camp: number, type: number): boolean {
  return sys.buildings.some((b) => b.camp === camp && b.type === type && b.state !== BuildState.Abandoned);
}

/** How to obtain an item: craft it, harvest it, or first build the station it needs. */
function planFor(sys: ProductionSystem, camp: CampState, knowledge: number, item: number, depth: number, seeds = false): CraftPlan | null {
  if (depth > MAX_PLAN_DEPTH) return null;
  for (const recipe of sys.catalog.producers[item]!) {
    if (!satisfies(knowledge, recipe.knowledgeMask)) continue;
    if (recipe.def.source) {
      // Harvesting is only a way to get an ingredient, not an aim of its own; the source must be near.
      // Food is gathered for its own sake (gathering, hunting, fishing), not as an ingredient.
      if (depth === 0 || (sys.catalog.food[item]! > 0 && !seeds) || !harvestPossible(sys, camp.id, recipe) || !sourceNearCamp(sys, camp, recipe, item)) continue;
      if (!toolsAvailable(sys, camp, recipe)) {
        const tool = toolsInCamp(sys, camp, recipe) ? null : firstPlan(sys, camp, knowledge, recipe.tools, depth);
        if (tool) return tool;
        continue;
      }
      return { kind: 'harvest', recipe, item, station: -1, wantedItem: item };
    }
    if (recipe.station >= 0 && stationOf(sys, camp.id, recipe) < 0) {
      const station = sys.catalog.buildings[recipe.station]!;
      if (stationBuilt(sys, camp.id, recipe.station) || !satisfies(knowledge, station.knowledgeMask) || station.def.want !== 'station') continue;
      // Its materials must be at hand or harvestable; else, make them first (hides for a smokehouse…).
      const lacking = station.materials.find((need) => !obtainable(sys, camp, knowledge, need));
      if (!lacking) return { kind: 'build', recipe, item, station: recipe.station, wantedItem: item };
      const material = firstPlan(sys, camp, knowledge, lacking.items, depth);
      if (material) return material;
      continue;
    }
    if (!toolsAvailable(sys, camp, recipe)) {
      // A tool in someone's hands comes back to the stock: wait for it rather than make another.
      const tool = toolsInCamp(sys, camp, recipe) ? null : firstPlan(sys, camp, knowledge, recipe.tools, depth);
      if (tool) return tool;
      continue;
    }
    const missing = recipe.inputs.find((need) => !haveNeed(sys, camp, need));
    if (!missing) return { kind: 'craft', recipe, item, station: -1, wantedItem: item };
    // What is already on its way to the stock is not fetched twice.
    if (onItsWay(sys, camp, missing)) continue;
    const input = firstPlan(sys, camp, knowledge, missing.items, depth);
    if (input) return input;
  }
  return null;
}

function firstPlan(sys: ProductionSystem, camp: CampState, knowledge: number, items: readonly number[], depth: number): CraftPlan | null {
  for (const item of items) {
    const plan = planFor(sys, camp, knowledge, item, depth + 1);
    if (plan) return plan;
  }
  return null;
}

/** Could the camp get this material: in the stock already, or by a harvest it knows, near the camp? */
function obtainable(sys: ProductionSystem, camp: CampState, knowledge: number, need: Need): boolean {
  if (haveNeed(sys, camp, need)) return true;
  return need.items.some((item) =>
    sys.catalog.producers[item]!.some(
      (recipe) =>
        recipe.def.source !== undefined &&
        recipe.def.source.kind !== 'prey' &&
        satisfies(knowledge, recipe.knowledgeMask) &&
        harvestPossible(sys, camp.id, recipe) &&
        recipe.tools.length === 0 &&
        sourceNearCamp(sys, camp, recipe, item),
    ),
  );
}

/** Results of the source searches of one needs computation (recipe:item → found). */
const sourceCache = new Map<string, boolean>();

/** Is there a place to harvest this item around the camp (game for a hunt)? */
function sourceNearCamp(sys: ProductionSystem, camp: CampState, recipe: Recipe, item: number): boolean {
  const key = `${recipe.index}:${item}`;
  let found = sourceCache.get(key);
  if (found === undefined) {
    const x = camp.center % sys.size;
    const y = Math.floor(camp.center / sys.size);
    const radius = sys.params.work.searchTiles;
    found = recipe.def.source?.kind === 'prey' ? preyNear(sys, x + 0.5, y + 0.5, recipe, radius) : findSourceFrom(sys, x, y, camp.id, recipe, [item], radius) >= 0;
    sourceCache.set(key, found);
  }
  return found;
}

/** Among the known building types answering a want, the best one the camp can gather materials for. */
function bestType(sys: ProductionSystem, camp: CampState, knowledge: number, want: WantReason, score: (type: BuildingType) => number): BuildingType | null {
  let best: BuildingType | null = null;
  for (const type of sys.catalog.buildings) {
    if (type.def.want !== want || type.def.requiresReligion || !satisfies(knowledge, type.knowledgeMask)) continue;
    if (!type.materials.every((need) => obtainable(sys, camp, knowledge, need))) continue;
    if (!best || score(type) > score(best)) best = type;
  }
  return best;
}

/** The most pressing building need: an open site first, then a fire, shelter, storage, a station, custom. */
function chooseBuild(sys: ProductionSystem, camp: CampState, knowledge: number, members: number, craft: CraftPlan | null): { plan: BuildPlan; urgency: number } | null {
  const { urgency, storageFullShare } = sys.params.custom;
  const buildings = sys.campBuildings(camp.id).filter((b) => b.state !== BuildState.Abandoned);
  const site = buildings.find((b) => b.state === BuildState.Site);
  if (site) return { plan: { site: site.id, type: site.type, reason: 'shelter', recipe: null }, urgency: Math.max(urgency.openSite, siteUrgency(sys, camp, site.type, members)) };
  const fresh = (type: BuildingType, reason: WantReason, value: number): { plan: BuildPlan; urgency: number } => ({ plan: { site: -1, type: type.index, reason, recipe: null }, urgency: value });

  if (!buildings.some((b) => sys.typeOf(b).def.function === 'fire')) {
    const fire = bestType(sys, camp, knowledge, 'fire', () => 1);
    if (fire) return fresh(fire, 'fire', urgency.fire);
  }
  const beds = buildings.reduce((sum, b) => sum + sys.typeOf(b).def.sleeps, 0);
  if (beds < members) {
    const shelter = bestType(sys, camp, knowledge, 'shelter', (type) => type.def.sleeps * type.def.warmthCelsius);
    if (shelter) return fresh(shelter, 'shelter', Math.min(1, urgency.shelter * (0.5 + (members - beds) / members)));
  }
  const bulk = sys.foodBulk(camp.stock);
  const capacity = buildings.reduce((sum, b) => sum + sys.typeOf(b).def.storage, 0);
  if (bulk > 0 && bulk > capacity * storageFullShare) {
    const storage = bestType(sys, camp, knowledge, 'storage', (type) => type.def.storage);
    if (storage) return fresh(storage, 'storage', urgency.storage);
  }
  if (craft?.kind === 'build') {
    const station = sys.catalog.buildings[craft.station]!;
    if (station.materials.every((need) => obtainable(sys, camp, knowledge, need))) {
      return { plan: { site: -1, type: station.index, reason: 'station', recipe: craft.recipe }, urgency: urgency.station };
    }
  }
  for (const type of sys.catalog.buildings) {
    if (type.def.want !== 'perMember' || !satisfies(knowledge, type.knowledgeMask)) continue;
    const count = buildings.filter((b) => b.type === type.index).length;
    if (count < Math.round(type.def.wantPerMember * members) && type.materials.every((need) => obtainable(sys, camp, knowledge, need))) {
      return fresh(type, 'perMember', urgency.perMember);
    }
  }
  return null;
}

/** An open site is as urgent as what it answers (a fire, a shelter…). */
function siteUrgency(sys: ProductionSystem, camp: CampState, type: number, members: number): number {
  const { urgency } = sys.params.custom;
  const def = sys.catalog.buildings[type]!.def;
  if (def.function === 'fire') return urgency.fire;
  if (def.sleeps > 0) {
    const beds = sys.campBuildings(camp.id).reduce((sum, b) => sum + (b.state === BuildState.Done ? sys.typeOf(b).def.sleeps : 0), 0);
    return beds < members ? Math.min(1, urgency.shelter * (0.5 + (members - beds) / members)) : 0;
  }
  return 0;
}
