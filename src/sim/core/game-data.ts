import animalsJson from '../../../data/animals.json';
import groupsJson from '../../../data/groups.json';
import biomesJson from '../../../data/biomes.json';
import buildingsJson from '../../../data/buildings.json';
import climateJson from '../../../data/climate.json';
import humansJson from '../../../data/humans.json';
import itemsJson from '../../../data/items.json';
import knowledgeJson from '../../../data/knowledge.json';
import lifeJson from '../../../data/life.json';
import plantsJson from '../../../data/plants.json';
import productionJson from '../../../data/production.json';
import recipesJson from '../../../data/recipes.json';
import resourcesJson from '../../../data/resources.json';
import socialJson from '../../../data/social.json';
import timeJson from '../../../data/time.json';
import weatherJson from '../../../data/weather.json';
import worldgenJson from '../../../data/worldgen.json';
import { ANIMALS_SCHEMA, parseFaunaParams, type FaunaParams } from '../systems/fauna/params';
import { parseFloraParams, PLANTS_SCHEMA, type FloraParams } from '../systems/flora/params';
import { checkHumanLinks, HUMANS_SCHEMA, parseHumanParams, type HumanParams } from '../systems/individuals/params';
import { parseSocialParams, SOCIAL_SCHEMA, type SocialParams } from '../systems/individuals/social/params';
import { LIFE_SCHEMA, parseLifeParams, type LifeParams } from '../systems/individuals/life/params';
import { checkGroupLinks, GROUPS_SCHEMA, parseGroupsParams, type GroupsParams } from '../systems/groups/params';
import { checkProductionLinks } from '../systems/production/links';
import {
  BUILDINGS_SCHEMA,
  ITEMS_SCHEMA,
  parseBuildings,
  parseItems,
  parseProductionParams,
  parseRecipes,
  PRODUCTION_SCHEMA,
  RECIPES_SCHEMA,
  type BuildingCatalog,
  type ItemCatalog,
  type ProductionParams,
  type RecipeBook,
} from '../systems/production/params';
import { KNOWLEDGE_SCHEMA, parseKnowledge, type KnowledgeCatalog } from './knowledge';
import { BIOMES_SCHEMA, parseBiomeTable, type BiomeTable } from '../systems/world/biomes';
import { parseWeatherParams, WEATHER_SCHEMA, type WeatherParams } from '../systems/world/weather';
import { CLIMATE_SCHEMA, parseClimateParams, type ClimateParams } from '../systems/world/climate-params';
import { parseWorldgenParams, WORLDGEN_SCHEMA, type WorldgenParams } from '../systems/world/params';
import type { Schema } from './data-validation';
import { parseResourceCatalog, RESOURCES_SCHEMA, type ResourceCatalog } from './resources';
import { parseTimeParams, TIME_SCHEMA, type TimeParams } from './time-params';

/** All validated data files the simulation needs. */
export interface GameData {
  time: TimeParams;
  worldgen: WorldgenParams;
  biomes: BiomeTable;
  climate: ClimateParams;
  resources: ResourceCatalog;
  flora: FloraParams;
  fauna: FaunaParams;
  weather: WeatherParams;
  humans: HumanParams;
  social: SocialParams;
  life: LifeParams;
  groups: GroupsParams;
  knowledge: KnowledgeCatalog;
  items: ItemCatalog;
  recipes: RecipeBook;
  buildings: BuildingCatalog;
  production: ProductionParams;
}

export type DataKey = keyof GameData;

/** One file of data/: where it goes in GameData, which system it tunes, and its documented schema. */
export interface DataFileInfo {
  /** "animals.json" */
  file: string;
  key: DataKey;
  /** System shown in the variables workshop ("Faune"). */
  system: string;
  schema: Schema;
}

/** Every data file, in the order of the variables workshop. A new data/*.json file must be listed here. */
export const DATA_FILES: readonly DataFileInfo[] = [
  { file: 'worldgen.json', key: 'worldgen', system: 'Monde', schema: WORLDGEN_SCHEMA },
  { file: 'biomes.json', key: 'biomes', system: 'Monde', schema: BIOMES_SCHEMA },
  { file: 'resources.json', key: 'resources', system: 'Monde', schema: RESOURCES_SCHEMA },
  { file: 'climate.json', key: 'climate', system: 'Climat', schema: CLIMATE_SCHEMA },
  { file: 'weather.json', key: 'weather', system: 'Climat', schema: WEATHER_SCHEMA },
  { file: 'time.json', key: 'time', system: 'Temps', schema: TIME_SCHEMA },
  { file: 'plants.json', key: 'flora', system: 'Flore', schema: PLANTS_SCHEMA },
  { file: 'animals.json', key: 'fauna', system: 'Faune', schema: ANIMALS_SCHEMA },
  { file: 'humans.json', key: 'humans', system: 'Humains', schema: HUMANS_SCHEMA },
  { file: 'social.json', key: 'social', system: 'Humains', schema: SOCIAL_SCHEMA },
  { file: 'life.json', key: 'life', system: 'Humains', schema: LIFE_SCHEMA },
  { file: 'groups.json', key: 'groups', system: 'Groupes', schema: GROUPS_SCHEMA },
  { file: 'knowledge.json', key: 'knowledge', system: 'Production', schema: KNOWLEDGE_SCHEMA },
  { file: 'items.json', key: 'items', system: 'Production', schema: ITEMS_SCHEMA },
  { file: 'recipes.json', key: 'recipes', system: 'Production', schema: RECIPES_SCHEMA },
  { file: 'buildings.json', key: 'buildings', system: 'Production', schema: BUILDINGS_SCHEMA },
  { file: 'production.json', key: 'production', system: 'Production', schema: PRODUCTION_SCHEMA },
];

/** Raw content of the data files, by data key (before validation). */
export type RawGameData = Record<DataKey, unknown>;

/** A fresh copy of the bundled data/*.json files (the default values). */
export function defaultRawData(): RawGameData {
  const files = {
    time: timeJson,
    worldgen: worldgenJson,
    biomes: biomesJson,
    climate: climateJson,
    resources: resourcesJson,
    flora: plantsJson,
    fauna: animalsJson,
    weather: weatherJson,
    humans: humansJson,
    social: socialJson,
    life: lifeJson,
    groups: groupsJson,
    knowledge: knowledgeJson,
    items: itemsJson,
    recipes: recipesJson,
    buildings: buildingsJson,
    production: productionJson,
  };
  return JSON.parse(JSON.stringify(files)) as RawGameData;
}

/** Validates raw data files. Throws a DataFileError (French message) if one is invalid. */
export function parseGameData(raw: RawGameData): GameData {
  const biomes = parseBiomeTable(raw.biomes);
  const resources = parseResourceCatalog(raw.resources);
  const flora = parseFloraParams(raw.flora, biomes, resources);
  const plantFoods = flora.species.flatMap((species) => (species.produce ? [species.produce.resource] : []));
  const fauna = parseFaunaParams(raw.fauna, biomes, resources, plantFoods);
  const time = parseTimeParams(raw.time);
  const speciesIds = fauna.species.map((species) => species.id);
  const humans = parseHumanParams(raw.humans, speciesIds);
  const social = parseSocialParams(
    raw.social,
    humans.traits.map((trait) => trait.id),
  );
  const life = parseLifeParams(raw.life);
  const groups = parseGroupsParams(raw.groups);
  checkGroupLinks(
    groups,
    humans.traits.map((trait) => trait.id),
  );
  const knowledge = parseKnowledge(raw.knowledge);
  const items = parseItems(raw.items);
  const recipes = parseRecipes(raw.recipes);
  const buildings = parseBuildings(raw.buildings);
  const production = parseProductionParams(raw.production);
  checkProductionLinks({
    knowledge,
    items,
    recipes,
    buildings,
    production,
    resources,
    skillIds: humans.skills.map((skill) => skill.id),
    speciesIds,
    biomeIds: biomes.biomes.map((biome) => biome.id),
    seasonCount: time.seasons.length,
  });
  checkHumanLinks(
    humans,
    knowledge.knowledge.map((item) => item.id),
    recipes.recipes.map((recipe) => recipe.id),
    items.items.map((item) => item.id),
  );
  return {
    time,
    worldgen: parseWorldgenParams(raw.worldgen),
    biomes,
    climate: parseClimateParams(raw.climate),
    resources,
    flora,
    fauna,
    weather: parseWeatherParams(raw.weather),
    humans,
    social,
    life,
    groups,
    knowledge,
    items,
    recipes,
    buildings,
    production,
  };
}

/** Validates the bundled data/*.json files (a private copy: the caller may change it). */
export function loadGameData(): GameData {
  return parseGameData(defaultRawData());
}
