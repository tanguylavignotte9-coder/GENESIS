import animalsJson from '../../../data/animals.json';
import biomesJson from '../../../data/biomes.json';
import climateJson from '../../../data/climate.json';
import humansJson from '../../../data/humans.json';
import plantsJson from '../../../data/plants.json';
import resourcesJson from '../../../data/resources.json';
import timeJson from '../../../data/time.json';
import weatherJson from '../../../data/weather.json';
import worldgenJson from '../../../data/worldgen.json';
import { ANIMALS_SCHEMA, parseFaunaParams, type FaunaParams } from '../systems/fauna/params';
import { parseFloraParams, PLANTS_SCHEMA, type FloraParams } from '../systems/flora/params';
import { HUMANS_SCHEMA, parseHumanParams, type HumanParams } from '../systems/individuals/params';
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
  return {
    time: parseTimeParams(raw.time),
    worldgen: parseWorldgenParams(raw.worldgen),
    biomes,
    climate: parseClimateParams(raw.climate),
    resources,
    flora,
    fauna,
    weather: parseWeatherParams(raw.weather),
    humans: parseHumanParams(raw.humans, plantFoods, fauna.species.map((species) => species.id)),
  };
}

/** Validates the bundled data/*.json files (a private copy: the caller may change it). */
export function loadGameData(): GameData {
  return parseGameData(defaultRawData());
}
