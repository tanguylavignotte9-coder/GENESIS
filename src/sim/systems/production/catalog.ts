import { anyKnowledgeMask, type KnowledgeCatalog } from '../../core/knowledge';
import type { BuildingCatalog, BuildingDef, ItemCatalog, ItemDef, RecipeBook, RecipeDef } from './params';

/** An ingredient with item indices: `qty` of any one of `items`. */
export interface Need {
  items: number[];
  qty: number;
}

export interface Recipe {
  index: number;
  def: RecipeDef;
  /** Knowledge bit needed (0 = none). */
  knowledgeMask: number;
  /** Skill index in the humans' skill list (-1 = none). */
  skill: number;
  inputs: Need[];
  tools: number[];
  /** Building type index (-1 = none). */
  station: number;
  outputs: { item: number; qty: number }[];
  /** yields[item] = 1 if the recipe can give this item (fast test in source searches). */
  yields: Uint8Array;
  /** Species indices for a hunt. */
  prey: number[];
}

export interface BuildingType {
  index: number;
  def: BuildingDef;
  knowledgeMask: number;
  materials: Need[];
}

/**
 * The content tables with indices instead of ids (built once, rebuilt after a live change):
 * items, recipes and buildings, and what each item is used for.
 */
export class Catalog {
  readonly items: ItemDef[];
  readonly itemIndex = new Map<string, number>();
  readonly bulk: Float64Array;
  readonly food: Float64Array;
  readonly fuel: Float64Array;
  readonly halfLife: Float64Array;
  readonly recipes: Recipe[];
  readonly buildings: BuildingType[];
  readonly buildingIndex = new Map<string, number>();
  /** Recipes able to produce each item (harvests and crafts), in data order (= preference). */
  readonly producers: Recipe[][];
  /** Meat left for scavengers by one unit thrown away once spoilt. */
  readonly scavengerMeat: Float64Array;

  constructor(knowledge: KnowledgeCatalog, items: ItemCatalog, recipes: RecipeBook, buildings: BuildingCatalog, skillIds: readonly string[], speciesIds: readonly string[]) {
    this.items = items.items;
    this.items.forEach((item, k) => this.itemIndex.set(item.id, k));
    this.bulk = Float64Array.from(this.items, (item) => item.bulk);
    this.food = Float64Array.from(this.items, (item) => item.food);
    this.fuel = Float64Array.from(this.items, (item) => item.fuelHours);
    this.halfLife = Float64Array.from(this.items, (item) => item.halfLifeDays);
    this.scavengerMeat = Float64Array.from(this.items, (item) => item.scavengerMeat ?? 0);
    buildings.buildings.forEach((building, k) => this.buildingIndex.set(building.id, k));
    const need = (list: { items: string[]; qty: number }[]): Need[] => list.map((entry) => ({ items: entry.items.map((id) => this.item(id)), qty: entry.qty }));
    this.recipes = recipes.recipes.map((def, index) => ({
      index,
      def,
      knowledgeMask: def.knowledge ? anyKnowledgeMask(knowledge, [def.knowledge]) : 0,
      skill: def.skill ? skillIds.indexOf(def.skill) : -1,
      inputs: need(def.inputs),
      tools: def.tools.map((id) => this.item(id)),
      station: def.station ? (this.buildingIndex.get(def.station) ?? -1) : -1,
      outputs: def.outputs.map((output) => ({ item: this.item(output.item), qty: output.qty })),
      yields: Uint8Array.from(this.items, (item) => (def.outputs.some((output) => output.item === item.id) ? 1 : 0)),
      prey: (def.source?.species ?? []).map((id) => speciesIds.indexOf(id)).filter((k) => k >= 0),
    }));
    this.buildings = buildings.buildings.map((def, index) => ({
      index,
      def,
      knowledgeMask: anyKnowledgeMask(knowledge, def.knowledge),
      materials: need(def.materials),
    }));
    this.producers = this.items.map(() => []);
    for (const recipe of this.recipes) for (const output of recipe.outputs) this.producers[output.item]!.push(recipe);
  }

  item(id: string): number {
    const index = this.itemIndex.get(id);
    if (index === undefined) throw new Error(`Objet inconnu : ${id}`);
    return index;
  }

  recipe(id: string): Recipe | undefined {
    return this.recipes.find((recipe) => recipe.def.id === id);
  }

  building(id: string): BuildingType | undefined {
    const index = this.buildingIndex.get(id);
    return index === undefined ? undefined : this.buildings[index];
  }
}
