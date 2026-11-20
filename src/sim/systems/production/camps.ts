import { Inventory } from './inventory';
import type { Recipe } from './catalog';

/** What a camp lacks, as custom sees it (each value 0 = nothing, 1 = urgent). */
export interface CampNeeds {
  /** Food reserve below what the season calls for. */
  food: number;
  /** Firewood reserve below custom. */
  wood: number;
  /** A building is wanted (or a site waits for hands). */
  build: number;
  /** An object wanted by custom is missing and can be made. */
  craft: number;
  /** What to build: an existing site (id) or a new building type and why. */
  buildPlan: BuildPlan | null;
  craftPlan: CraftPlan | null;
  /** Reserves wanted and counted (food value, fire hours), to judge one's own share. */
  foodReserve: number;
  foodHave: number;
  woodReserve: number;
  woodHave: number;
  /** Living members and the union of their knowledge. */
  members: number[];
  knowledge: number;
}

export type WantReason = 'fire' | 'shelter' | 'storage' | 'station' | 'perMember';

export interface BuildPlan {
  /** Existing site to work on (-1: start a new one of `type`). */
  site: number;
  type: number;
  reason: WantReason;
  /** For a station: the recipe that needs it. */
  recipe: Recipe | null;
}

/** How to answer the most pressing craft need. */
export interface CraftPlan {
  kind: 'craft' | 'harvest' | 'build';
  recipe: Recipe;
  /** Item to obtain (harvest) or to make (craft). */
  item: number;
  /** Station to build first (build), else -1. */
  station: number;
  /** The object custom wants, that this plan leads to. */
  wantedItem: number;
}

/** A piece of work left unfinished (its materials are in it): anyone may take it up again. */
export interface Unfinished {
  recipe: Recipe;
  /** Hours of work done. */
  progress: number;
}

/** Factors on the reserves and urges custom asks for, set by the tribe's strategy. */
export interface CampPolicy {
  food: number;
  wood: number;
  build: number;
  craft: number;
}

/** Production's view of a camp: where it is, its common stock, its needs. */
export class CampState {
  stock = new Inventory();
  /** Item types the tribe has already made (for "a first for the tribe"). */
  readonly firsts = new Set<number>();
  /** Items being made right now by members (counted with the stock so that not everyone makes the same thing). */
  readonly pending: Float64Array;
  /** Work left unfinished in the camp (an axe half polished…). */
  readonly unfinished: Unfinished[] = [];
  /** Food value and fire hours that members are bringing back right now (harvests under way). */
  pendingFood = 0;
  pendingFuel = 0;
  /** Hours of fire someone is already bringing to the campfire. */
  pendingFire = 0;
  needsHour = -1;
  /** Journal event of the camp's last move: the cause of the fire, shelters and cache rebuilt (-1 = none). */
  settleEvent = -1;
  /** Factors the tribe's strategy puts on what custom asks for (groups system, step 9). */
  policy: CampPolicy = { food: 1, wood: 1, build: 1, craft: 1 };
  needs: CampNeeds = { food: 0, wood: 0, build: 0, craft: 0, buildPlan: null, craftPlan: null, foodReserve: 0, foodHave: 0, woodReserve: 0, woodHave: 0, members: [], knowledge: 0 };

  constructor(
    readonly id: number,
    public center: number,
    itemCount: number,
  ) {
    this.pending = new Float64Array(itemCount);
  }
}
