import { DataFileError } from '../../core/data-validation';
import type { KnowledgeCatalog } from '../../core/knowledge';
import type { ResourceCatalog } from '../../core/resources';
import type { BuildingCatalog, ItemCatalog, ProductionParams, RecipeBook } from './params';

export interface LinkedFiles {
  knowledge: KnowledgeCatalog;
  items: ItemCatalog;
  recipes: RecipeBook;
  buildings: BuildingCatalog;
  production: ProductionParams;
  resources: ResourceCatalog;
  skillIds: readonly string[];
  speciesIds: readonly string[];
  biomeIds: readonly string[];
  seasonCount: number;
}

/** Checks that the production files only name things that exist (French messages, per file). */
export function checkProductionLinks(files: LinkedFiles): void {
  const items = new Set(files.items.items.map((item) => item.id));
  const knowledge = new Set(files.knowledge.knowledge.map((item) => item.id));
  const buildings = new Set(files.buildings.buildings.map((building) => building.id));
  const unknownItems = (ids: readonly string[], where: string): string[] => ids.filter((id) => !items.has(id)).map((id) => `${where} : l'objet « ${id} » n'existe pas dans data/items.json.`);
  const unknownKnowledge = (ids: readonly string[], where: string): string[] =>
    ids.filter((id) => !knowledge.has(id)).map((id) => `${where} : le savoir « ${id} » n'existe pas dans data/knowledge.json.`);

  const itemProblems = files.resources.resources.filter((resource) => !items.has(resource.id)).map((resource) => `la ressource « ${resource.id} » (data/resources.json) doit aussi être un objet.`);
  if (itemProblems.length > 0) throw new DataFileError('data/items.json', itemProblems);

  const recipeProblems: string[] = [];
  for (const recipe of files.recipes.recipes) {
    const where = `recette « ${recipe.id} »`;
    if (recipe.knowledge) recipeProblems.push(...unknownKnowledge([recipe.knowledge], where));
    if (recipe.skill && !files.skillIds.includes(recipe.skill)) recipeProblems.push(`${where} : la compétence « ${recipe.skill} » n'existe pas dans data/humans.json.`);
    if (recipe.station && !buildings.has(recipe.station)) recipeProblems.push(`${where} : le bâtiment « ${recipe.station} » n'existe pas dans data/buildings.json.`);
    for (const species of recipe.source?.species ?? []) if (!files.speciesIds.includes(species)) recipeProblems.push(`${where} : l'animal « ${species} » n'existe pas.`);
    recipeProblems.push(...unknownItems([...recipe.inputs.flatMap((input) => input.items), ...recipe.tools, ...recipe.outputs.map((output) => output.item)], where));
  }
  if (recipeProblems.length > 0) throw new DataFileError('data/recipes.json', recipeProblems);

  const buildingProblems: string[] = [];
  for (const building of files.buildings.buildings) {
    const where = `bâtiment « ${building.id} »`;
    buildingProblems.push(...unknownKnowledge(building.knowledge, where), ...unknownItems(building.materials.flatMap((material) => material.items), where));
  }
  if (buildingProblems.length > 0) throw new DataFileError('data/buildings.json', buildingProblems);

  const { production } = files;
  const problems: string[] = [];
  for (const start of production.startingBuildings) if (!buildings.has(start.building)) problems.push(`« startingBuildings » : le bâtiment « ${start.building} » n'existe pas.`);
  for (const source of production.terrainSources) {
    problems.push(...unknownItems([source.item], '« terrainSources »'));
    for (const biome of source.biomes) if (!files.biomeIds.includes(biome)) problems.push(`« terrainSources » : le biome « ${biome} » n'existe pas.`);
  }
  problems.push(...unknownItems(production.hunting.rangedTools, '« hunting.rangedTools »'));
  if (production.custom.foodReserveDaysBySeason.length !== files.seasonCount) {
    problems.push(`« custom.foodReserveDaysBySeason » doit avoir une valeur par saison (${files.seasonCount}, comme dans data/time.json).`);
  }
  if (problems.length > 0) throw new DataFileError('data/production.json', problems);
}
