import { satisfies } from '../../core/knowledge';
import { BuildState, missingMaterial, unclaimedMaterial, type Building } from './buildings';
import type { Recipe } from './catalog';
import { publishFirstItem, publishSiteStarted } from './events';
import { campOwner, type Inventory } from './inventory';
import { harvestPossible, stationOf } from './plans';
import type { ProductionSystem } from './production-system';
import { findSource, takeFromSource, yieldAt } from './sources';
import { goHunting, huntStep } from './hunting';

export type JobKind = 'harvest' | 'craft' | 'build' | 'deposit' | 'fuel';

/** What the brain asks for: a kind of work, the recipes it may use, the items it is after. */
export interface JobSpec {
  kind: JobKind;
  /** Recipe indices (harvest, fuel). */
  recipes: readonly number[];
  /** Item indices wanted from a harvest (empty = any). */
  items: readonly number[];
  /** Tile to try when nothing is in sight (a remembered spot), or -1. */
  fallback: number;
  /** How far the person sees. */
  perception: number;
}

export const Stage = { Fetch: 0, Harvest: 1, Hunt: 2, Deliver: 3, Work: 4, Deposit: 5, Fuel: 6 } as const;
type StageCode = (typeof Stage)[keyof typeof Stage];

export interface Job {
  kind: JobKind;
  stage: StageCode;
  recipe: Recipe | null;
  wanted: number[];
  /** Building being built, or station worked at (id), -1 if none. */
  site: number;
  station: number;
  target: number;
  /** Hours done on the current batch / spent hunting. */
  progress: number;
  prey: number;
  preyUid: number;
  /** Item counted as "being made" in the camp, and how much (-1 = none). */
  pending: number;
  pendingQty: number;
  /** Ingredient chosen for each input of a craft. */
  chosen: number[];
  /** Harvesting materials for a site (then deliver them). */
  forSite: boolean;
  /** Material of the site this person promised to bring (-1 = none), and how much. */
  claim: number;
  claimQty: number;
  /** Most a harvest should bring (Infinity = a full load). */
  limit: number;
  /** Food value and fire hours this harvest is expected to bring to the camp (counted by custom). */
  expectedFood: number;
  expectedFuel: number;
  /** Hours of fire this person is bringing to the campfire. */
  expectedFire: number;
}

export interface WorkResult {
  status: 'working' | 'move' | 'done' | 'failed';
  /** Where to go next (move). */
  tile: number;
  /** Skill practised during this step (-1 = none) and for how long. */
  skill: number;
  hours: number;
  /** Food was found on this tile (to remember) / this remembered tile is empty (to forget). */
  foodTile: number;
  emptyTile: number;
}

const result: WorkResult = { status: 'done', tile: -1, skill: -1, hours: 0, foodTile: -1, emptyTile: -1 };

function reset(): WorkResult {
  result.status = 'working';
  result.tile = -1;
  result.skill = -1;
  result.hours = 0;
  result.foodTile = -1;
  result.emptyTile = -1;
  return result;
}

function newJob(kind: JobKind, stage: StageCode, recipe: Recipe | null, target: number): Job {
  return {
    kind,
    stage,
    recipe,
    wanted: [],
    site: -1,
    station: -1,
    target,
    progress: 0,
    prey: -1,
    preyUid: -1,
    pending: -1,
    pendingQty: 0,
    chosen: [],
    forSite: false,
    claim: -1,
    claimQty: 0,
    limit: Infinity,
    expectedFood: 0,
    expectedFuel: 0,
    expectedFire: 0,
  };
}

/** Takes back a builder's promise to bring a material (delivered, or given up). */
export function releaseClaim(sys: ProductionSystem, job: Job): void {
  const site = sys.buildings[job.site];
  if (site && job.claim >= 0) site.incoming[job.claim] = Math.max(0, site.incoming[job.claim]! - job.claimQty);
  job.claim = -1;
  job.claimQty = 0;
}

function claim(sys: ProductionSystem, job: Job, material: number, qty: number): void {
  releaseClaim(sys, job);
  const site = sys.buildings[job.site]!;
  site.incoming[material]! += qty;
  job.claim = material;
  job.claimQty = qty;
}

/** Work speed: an expert works up to (1 + skillSpeedBonus) times faster. */
export function speed(sys: ProductionSystem, person: number, recipe: Recipe | null): number {
  const skill = recipe && recipe.skill >= 0 ? sys.people.skill(person, recipe.skill) : 0;
  return 1 + sys.params.work.skillSpeedBonus * skill;
}

/** Quality of a product: the worker's skill and tools, and a little chance. */
export function qualityFor(sys: ProductionSystem, person: number, recipe: Recipe): number {
  const { quality } = sys.params;
  const skill = recipe.skill >= 0 ? sys.people.skill(person, recipe.skill) : 0;
  let tool = 0.5;
  if (recipe.tools.length > 0) tool = Math.max(0, ...recipe.tools.map((item) => sys.carried[person]!.bestQuality(item)));
  const value = quality.base + quality.skillWeight * skill + quality.toolWeight * tool + quality.randomness * (2 * sys.rng.nextFloat() - 1);
  return Math.min(1, Math.max(0, value));
}

function hasTool(inventory: Inventory, recipe: Recipe): boolean {
  return recipe.tools.length === 0 || recipe.tools.some((tool) => inventory.count(tool) >= 1 - 1e-9);
}

/** Takes one of the recipe's tools from the common stock (it stays the camp's). */
function borrowTool(sys: ProductionSystem, person: number, recipe: Recipe): boolean {
  if (hasTool(sys.carried[person]!, recipe)) return true;
  const camp = sys.people.camp(person);
  const stock = sys.stockOf(camp);
  for (const tool of recipe.tools) {
    if (stock.count(tool) < 1 - 1e-9) continue;
    const taken = stock.take(tool, 1);
    sys.carried[person]!.put(tool, taken.qty, taken.quality, campOwner(camp));
    return true;
  }
  return false;
}

function tileDistance(sys: ProductionSystem, a: number, b: number): number {
  const size = sys.size;
  return Math.max(Math.abs((a % size) - (b % size)), Math.abs(Math.floor(a / size) - Math.floor(b / size)));
}

// ----- starting a job -------------------------------------------------------------------------

export function startJob(sys: ProductionSystem, person: number, spec: JobSpec): number {
  sys.endJob(person);
  const camp = sys.people.camp(person);
  let job: Job | null = null;
  switch (spec.kind) {
    case 'harvest':
      job = startHarvest(sys, person, spec.recipes.map((k) => sys.catalog.recipes[k]!), spec.items, spec.fallback, spec.perception);
      if (job) expectHarvest(sys, person, job);
      break;
    case 'deposit':
      if (sys.carried[person]!.piles.some((pile) => depositable(sys, pile.item))) job = newJob('deposit', Stage.Deposit, null, sys.stockTile(camp));
      break;
    case 'fuel':
      job = startFuel(sys, person, sys.catalog.recipes[spec.recipes[0] ?? -1] ?? null);
      if (job) {
        const fire = sys.buildings[job.site]!;
        const state = sys.camps[camp]!;
        job.expectedFire = Math.max(0, sys.typeOf(fire).def.fuelMaxHours - fire.fuel - state.pendingFire);
        state.pendingFire += job.expectedFire;
      }
      break;
    case 'craft':
      job = startCraft(sys, person, spec.perception);
      break;
    case 'build':
      job = startBuild(sys, person);
      break;
  }
  sys.jobs[person] = job;
  return job ? job.target : -1;
}

/** Anything but what a person wears or carries things in goes to the common stock. */
export function depositable(sys: ProductionSystem, item: number): boolean {
  const def = sys.catalog.items[item]!;
  return def.category !== 'clothing' && def.carryBonus <= 0;
}

function startHarvest(sys: ProductionSystem, person: number, recipes: Recipe[], wanted: readonly number[], fallback: number, perception: number): Job | null {
  const camp = sys.people.camp(person);
  const knowledge = sys.people.knowledge(person);
  for (const recipe of recipes) {
    if (!satisfies(knowledge, recipe.knowledgeMask) || !harvestPossible(sys, camp, recipe)) continue;
    const toolHere = hasTool(sys.carried[person]!, recipe);
    if (!toolHere && !recipe.tools.some((tool) => sys.stockOf(camp).count(tool) >= 1 - 1e-9)) continue;
    const kind = recipe.def.source?.kind;
    let tile: number;
    let job: Job;
    if (kind === 'prey') {
      const hunt = goHunting(sys, person, recipe);
      if (!hunt) continue;
      job = newJob('harvest', Stage.Hunt, recipe, hunt.tile);
      job.prey = hunt.slot;
      job.preyUid = hunt.uid;
      tile = hunt.tile;
    } else {
      const near = kind === 'plantProduce' || kind === 'plantBranches';
      tile = findSource(sys, person, recipe, wanted, near ? perception : sys.params.work.searchTiles);
      if (tile < 0 && kind === 'plantProduce' && fallback >= 0) tile = fallback;
      if (tile < 0) continue;
      job = newJob('harvest', Stage.Harvest, recipe, tile);
    }
    job.wanted = [...wanted];
    if (!toolHere) {
      job.station = tile; // remembered source while fetching the tool
      job.stage = Stage.Fetch;
      job.target = sys.stockTile(camp);
    }
    return job;
  }
  return null;
}

function startFuel(sys: ProductionSystem, person: number, recipe: Recipe | null): Job | null {
  const camp = sys.people.camp(person);
  const fire = sys.fireOf(camp);
  if (!recipe || !fire || !satisfies(sys.people.knowledge(person), recipe.knowledgeMask)) return null;
  const fuels = recipe.inputs[0]?.items ?? [];
  const carried = sys.carried[person]!;
  if (fuels.some((item) => carried.count(item) > 0)) {
    const job = newJob('fuel', Stage.Fuel, recipe, fire.tile);
    job.site = fire.id;
    return job;
  }
  if (!fuels.some((item) => sys.stockOf(camp).count(item) >= 1)) return null;
  const job = newJob('fuel', Stage.Fetch, recipe, sys.stockTile(camp));
  job.site = fire.id;
  return job;
}

function startCraft(sys: ProductionSystem, person: number, perception: number): Job | null {
  const camp = sys.people.camp(person);
  const plan = sys.needs(camp).craftPlan;
  if (!plan || !satisfies(sys.people.knowledge(person), plan.recipe.knowledgeMask)) return null;
  if (plan.kind === 'harvest') {
    const job = startHarvest(sys, person, [plan.recipe], [plan.item], -1, perception);
    if (job) countPending(sys, person, job, plan.item, 1);
    return job;
  }
  if (plan.item < 0) {
    // Sowing: no object made.
    return newJob('craft', Stage.Fetch, plan.recipe, sys.stockTile(camp));
  }
  if (plan.kind === 'build') return startBuild(sys, person);
  const job = newJob('craft', Stage.Fetch, plan.recipe, sys.stockTile(camp));
  const output = plan.recipe.outputs[0];
  if (output) countPending(sys, person, job, output.item, output.qty);
  return job;
}

/** A harvest for the camp counts, while under way, toward its food and firewood reserves. */
function expectHarvest(sys: ProductionSystem, person: number, job: Job): void {
  const items = job.wanted.length > 0 ? job.wanted : (job.recipe?.outputs.map((output) => output.item) ?? []);
  const room = sys.room(person);
  let food = 0;
  let fuel = 0;
  for (const item of items) {
    const bulk = sys.catalog.bulk[item]!;
    food = Math.max(food, (room / bulk) * sys.catalog.food[item]!);
    if (sys.catalog.items[item]!.category === 'material') fuel = Math.max(fuel, (room / bulk) * sys.catalog.fuel[item]!);
  }
  const camp = sys.camps[sys.people.camp(person)]!;
  job.expectedFood = food;
  job.expectedFuel = fuel;
  camp.pendingFood += food;
  camp.pendingFuel += fuel;
}

/** Releases what a job promised to the camp (it is over, or given up). */
export function releaseExpected(sys: ProductionSystem, person: number, job: Job): void {
  const camp = sys.camps[sys.people.camp(person)]!;
  camp.pendingFood = Math.max(0, camp.pendingFood - job.expectedFood);
  camp.pendingFuel = Math.max(0, camp.pendingFuel - job.expectedFuel);
  camp.pendingFire = Math.max(0, camp.pendingFire - job.expectedFire);
  job.expectedFood = 0;
  job.expectedFuel = 0;
  job.expectedFire = 0;
}

function countPending(sys: ProductionSystem, person: number, job: Job, item: number, qty: number): void {
  job.pending = item;
  job.pendingQty = qty;
  sys.camps[sys.people.camp(person)]!.pending[item]! += qty;
}

function startBuild(sys: ProductionSystem, person: number): Job | null {
  const camp = sys.people.camp(person);
  const needs = sys.needs(camp);
  const plan = needs.buildPlan;
  if (!plan) return null;
  const type = sys.catalog.buildings[plan.type]!;
  if (!satisfies(sys.people.knowledge(person), type.knowledgeMask)) return null;
  let site: Building | undefined = sys.buildings[plan.site];
  if (!site) {
    const tile = sys.siteTile(camp, type);
    if (tile < 0) return null;
    site = sys.addBuilding(type, camp, tile, BuildState.Site);
    site.startEvent = publishSiteStarted(sys, site, person, plan.reason, plan.recipe);
    sys.camps[camp]!.needsHour = -1;
  }
  const job = newJob('build', Stage.Work, null, site.tile);
  job.site = site.id;
  return nextBuildStep(sys, person, job) ? job : null;
}

/**
 * Next step of a build: deliver what one carries for it, else bring a material nobody is bringing
 * yet (from the stock, or harvested on purpose: only what is missing), else work on the site
 * (waiting there for the materials on their way). False if the site cannot progress.
 */
function nextBuildStep(sys: ProductionSystem, person: number, job: Job): boolean {
  const site = sys.buildings[job.site];
  if (!site || site.state !== BuildState.Site) return false;
  const type = sys.typeOf(site);
  const carried = sys.carried[person]!;
  job.forSite = false;
  job.limit = Infinity;
  const toDeliver = type.materials.some((need, k) => site.delivered[k]! < need.qty - 1e-6 && need.items.some((item) => carried.count(item) > 1e-6));
  if (toDeliver) {
    job.stage = Stage.Deliver;
    job.target = site.tile;
    return true;
  }
  releaseClaim(sys, job);
  const material = unclaimedMaterial(site, type);
  if (material < 0) {
    // Everything is there (work), or on its way with others (nothing to do here for now).
    if (missingMaterial(site, type) >= 0) return false;
    job.stage = Stage.Work;
    job.target = site.tile;
    return true;
  }
  const need = type.materials[material]!;
  const left = need.qty - site.delivered[material]! - site.incoming[material]!;
  const camp = sys.people.camp(person);
  if (need.items.some((item) => sys.stockOf(camp).count(item) > 1e-6)) {
    claim(sys, job, material, left);
    job.stage = Stage.Fetch;
    job.target = sys.stockTile(camp);
    return true;
  }
  // Nothing in the stock: go and get it (the first harvest the person knows).
  for (const item of need.items) {
    const recipes = sys.catalog.producers[item]!.filter((recipe) => recipe.def.source && recipe.def.source.kind !== 'prey');
    const harvest = startHarvest(sys, person, recipes, [item], -1, sys.params.work.searchTiles);
    if (!harvest) continue;
    const units = Math.min(left, sys.room(person) / sys.catalog.bulk[item]!);
    claim(sys, job, material, units);
    job.stage = harvest.stage;
    job.recipe = harvest.recipe;
    job.wanted = harvest.wanted;
    job.station = harvest.station;
    job.target = harvest.target;
    job.forSite = true;
    job.limit = units;
    return true;
  }
  return false;
}

// ----- working on the spot --------------------------------------------------------------------

export function workAt(sys: ProductionSystem, person: number, hours: number): WorkResult {
  const out = reset();
  const job = sys.jobs[person];
  if (!job) {
    out.status = 'failed';
    return out;
  }
  switch (job.stage) {
    case Stage.Fetch:
      fetch(sys, person, job, out);
      break;
    case Stage.Harvest:
      harvest(sys, person, job, hours, out);
      break;
    case Stage.Hunt:
      huntStep(sys, person, job, hours, out);
      break;
    case Stage.Deliver:
      deliver(sys, person, job, out);
      break;
    case Stage.Work:
      if (job.kind === 'build') build(sys, person, job, hours, out);
      else craft(sys, person, job, hours, out);
      break;
    case Stage.Deposit:
      deposit(sys, person, out);
      break;
    case Stage.Fuel:
      fuel(sys, person, job, out);
      break;
  }
  if (out.status === 'done' || out.status === 'failed') sys.endJob(person);
  else if (out.status === 'move') job.target = out.tile;
  return out;
}

function moveTo(out: WorkResult, tile: number): void {
  out.status = 'move';
  out.tile = tile;
}

function fetch(sys: ProductionSystem, person: number, job: Job, out: WorkResult): void {
  const camp = sys.people.camp(person);
  const stock = sys.stockOf(camp);
  const carried = sys.carried[person]!;
  const take = (item: number, qty: number): void => {
    const taken = stock.take(item, qty);
    carried.put(item, taken.qty, taken.quality, campOwner(camp));
  };
  switch (job.kind) {
    case 'harvest': {
      if (!job.recipe || !borrowTool(sys, person, job.recipe)) {
        out.status = 'failed';
        return;
      }
      job.stage = job.recipe.def.source?.kind === 'prey' ? Stage.Hunt : Stage.Harvest;
      moveTo(out, job.station);
      return;
    }
    case 'fuel': {
      const recipe = job.recipe!;
      const fire = sys.buildings[job.site]!;
      let wanted = (sys.typeOf(fire).def.fuelMaxHours - fire.fuel) * 1;
      for (const item of recipe.inputs[0]?.items ?? []) {
        const hoursPerUnit = sys.catalog.fuel[item]!;
        if (hoursPerUnit <= 0 || wanted <= 0) continue;
        // Whole branches or logs: what the fire lacks, rounded up.
        const units = Math.floor(Math.min(stock.count(item), Math.ceil(wanted / hoursPerUnit), sys.room(person) / sys.catalog.bulk[item]!));
        if (units <= 0) continue;
        take(item, units);
        wanted -= units * hoursPerUnit;
      }
      job.stage = Stage.Fuel;
      moveTo(out, fire.tile);
      return;
    }
    case 'craft': {
      const recipe = job.recipe!;
      job.chosen = [];
      for (const need of recipe.inputs) {
        const item = need.items.find((candidate) => carried.count(candidate) + stock.count(candidate) >= need.qty - 1e-6);
        if (item === undefined) {
          out.status = 'failed';
          return;
        }
        job.chosen.push(item);
        const missing = need.qty - carried.count(item);
        if (missing > 0) take(item, missing);
      }
      if (!borrowTool(sys, person, recipe)) {
        out.status = 'failed';
        return;
      }
      const station = stationOf(sys, camp, recipe);
      if (recipe.station >= 0 && station < 0) {
        out.status = 'failed';
        return;
      }
      job.site = station;
      job.stage = Stage.Work;
      job.progress = 0;
      moveTo(out, station >= 0 ? sys.buildings[station]!.tile : sys.stockTile(camp));
      return;
    }
    case 'build': {
      const site = sys.buildings[job.site]!;
      const type = sys.typeOf(site);
      const material = job.claim;
      if (material >= 0) {
        const need = type.materials[material]!;
        let left = job.claimQty;
        for (const item of need.items) {
          const units = Math.min(left, stock.count(item), sys.room(person) / sys.catalog.bulk[item]!);
          if (units <= 0) continue;
          take(item, units);
          left -= units;
        }
      }
      if (!nextBuildStep(sys, person, job)) out.status = 'done';
      else moveTo(out, job.target);
      return;
    }
    default:
      out.status = 'failed';
  }
}

function harvest(sys: ProductionSystem, person: number, job: Job, hours: number, out: WorkResult): void {
  const recipe = job.recipe!;
  const tile = sys.people.y(person) * sys.size + sys.people.x(person);
  const item = yieldAt(sys, recipe, tile, job.wanted);
  if (item < 0) {
    if (recipe.def.source?.kind === 'plantProduce') out.emptyTile = tile;
    finishHarvest(sys, person, job, out);
    return;
  }
  const room = Math.min(sys.room(person) / sys.catalog.bulk[item]!, job.limit - sys.carried[person]!.count(item));
  const units = Math.max(0, Math.min(room, (hours / recipe.def.hours) * speed(sys, person, recipe)));
  const taken = takeFromSource(sys, recipe, tile, item, units);
  if (taken > 0) {
    sys.carried[person]!.put(item, taken, qualityFor(sys, person, recipe), person);
    if (sys.catalog.food[item]! > 0) out.foodTile = tile;
  }
  out.skill = recipe.skill;
  out.hours = hours;
  if (room - taken < 0.5 || taken < units * 0.5) finishHarvest(sys, person, job, out);
}

function finishHarvest(sys: ProductionSystem, person: number, job: Job, out: WorkResult): void {
  if (job.forSite && nextBuildStep(sys, person, job)) moveTo(out, job.target);
  else out.status = 'done';
}

function deliver(sys: ProductionSystem, person: number, job: Job, out: WorkResult): void {
  const site = sys.buildings[job.site];
  if (!site || site.state !== BuildState.Site) {
    out.status = 'done';
    return;
  }
  const type = sys.typeOf(site);
  type.materials.forEach((need, k) => {
    for (const item of need.items) {
      const left = need.qty - site.delivered[k]!;
      if (left <= 1e-6) break;
      const given = sys.carried[person]!.take(item, left);
      site.delivered[k]! += given.qty;
    }
  });
  releaseClaim(sys, job);
  if (!site.builders.includes(person)) site.builders.push(person);
  if (!nextBuildStep(sys, person, job)) out.status = 'done';
  else if (job.target !== site.tile || job.stage !== Stage.Work) moveTo(out, job.target);
}

function build(sys: ProductionSystem, person: number, job: Job, hours: number, out: WorkResult): void {
  const site = sys.buildings[job.site];
  if (!site || site.state !== BuildState.Site) {
    out.status = 'done';
    return;
  }
  const type = sys.typeOf(site);
  if (missingMaterial(site, type) >= 0) {
    // Materials are missing: bring some; if others are already bringing them all, do something else meanwhile.
    if (unclaimedMaterial(site, type) < 0) {
      out.status = 'done';
      return;
    }
    if (nextBuildStep(sys, person, job)) moveTo(out, job.target);
    else out.status = 'done';
    return;
  }
  const skill = sys.body.skillIds.indexOf('construction');
  const level = skill >= 0 ? sys.people.skill(person, skill) : 0;
  const worked = hours * (1 + sys.params.work.skillSpeedBonus * level);
  const { quality } = sys.params;
  const made = Math.min(1, quality.base + quality.skillWeight * level + quality.toolWeight * 0.5);
  site.quality = site.work + worked > 0 ? (site.quality * site.work + made * worked) / (site.work + worked) : made;
  site.work += worked;
  if (!site.builders.includes(person)) site.builders.push(person);
  out.skill = skill;
  out.hours = hours;
  if (site.work >= type.def.workHours) {
    sys.completeBuilding(site);
    out.status = 'done';
  }
}

function craft(sys: ProductionSystem, person: number, job: Job, hours: number, out: WorkResult): void {
  const recipe = job.recipe!;
  const camp = sys.people.camp(person);
  const station = sys.buildings[job.site];
  if (recipe.station >= 0 && (!station || station.state !== BuildState.Done)) {
    out.status = 'failed';
    return;
  }
  job.progress += hours * speed(sys, person, recipe);
  out.skill = recipe.skill;
  out.hours = hours;
  if (job.progress < recipe.def.hours) return;
  const carried = sys.carried[person]!;
  recipe.inputs.forEach((need, k) => carried.take(job.chosen[k] ?? need.items[0]!, need.qty));
  if (recipe.def.effect === 'sow' && station) {
    station.sown = recipe.inputs[0]?.qty ?? 0;
    station.growth = 0;
  }
  const quality = qualityFor(sys, person, recipe);
  const tile = sys.people.y(person) * sys.size + sys.people.x(person);
  const here = sys.atCamp(camp, tile);
  for (const output of recipe.outputs) {
    if (here) sys.storeInCamp(camp, output.item, output.qty, quality);
    else carried.put(output.item, output.qty, quality, person);
    const state = sys.camps[camp]!;
    if (!state.firsts.has(output.item) && !sys.isResource(output.item)) {
      state.firsts.add(output.item);
      publishFirstItem(sys, person, output.item, tile);
    }
  }
  out.status = 'done';
}

function deposit(sys: ProductionSystem, person: number, out: WorkResult): void {
  const camp = sys.people.camp(person);
  const carried = sys.carried[person]!;
  const stock = sys.stockOf(camp);
  for (let k = carried.piles.length - 1; k >= 0; k--) {
    const pile = carried.piles[k]!;
    if (!depositable(sys, pile.item)) continue;
    stock.put(pile.item, pile.qty, pile.quality, campOwner(camp));
    carried.piles.splice(k, 1);
  }
  // What one wears or carries with is taken from the common stock when one has none.
  for (let item = 0; item < sys.catalog.items.length; item++) {
    if (depositable(sys, item) || carried.count(item) >= 1 - 1e-9 || stock.count(item) < 1 - 1e-9) continue;
    const def = sys.catalog.items[item]!;
    const same = carried.piles.some((pile) => {
      const other = sys.catalog.items[pile.item]!;
      return (def.warmthCelsius > 0 && other.warmthCelsius > 0) || (def.carryBonus > 0 && other.carryBonus > 0);
    });
    if (same) continue;
    const taken = stock.take(item, 1);
    carried.put(item, taken.qty, taken.quality, campOwner(camp));
  }
  out.status = 'done';
}

function fuel(sys: ProductionSystem, person: number, job: Job, out: WorkResult): void {
  const recipe = job.recipe!;
  const fire = sys.buildings[job.site];
  if (!fire || fire.state !== BuildState.Done) {
    out.status = 'failed';
    return;
  }
  const max = sys.typeOf(fire).def.fuelMaxHours;
  const carried = sys.carried[person]!;
  for (const item of recipe.inputs[0]?.items ?? []) {
    const hoursPerUnit = sys.catalog.fuel[item]!;
    if (hoursPerUnit <= 0) continue;
    const units = Math.min(carried.count(item), Math.max(0, (max - fire.fuel) / hoursPerUnit));
    if (units <= 0) continue;
    carried.take(item, units);
    fire.fuel = Math.min(max, fire.fuel + units * hoursPerUnit);
  }
  out.skill = recipe.skill;
  out.hours = recipe.def.hours;
  out.status = 'done';
}

export { tileDistance };
