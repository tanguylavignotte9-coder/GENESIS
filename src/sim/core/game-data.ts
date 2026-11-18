import animalsJson from '../../../data/animals.json';
import biomesJson from '../../../data/biomes.json';
import climateJson from '../../../data/climate.json';
import humansJson from '../../../data/humans.json';
import plantsJson from '../../../data/plants.json';
import resourcesJson from '../../../data/resources.json';
import timeJson from '../../../data/time.json';
import weatherJson from '../../../data/weather.json';
import worldgenJson from '../../../data/worldgen.json';
import { parseFaunaParams, type FaunaParams } from '../systems/fauna/params';
import { parseFloraParams, type FloraParams } from '../systems/flora/params';
import { parseHumanParams, type HumanParams } from '../systems/individuals/params';
import { parseBiomeTable, type BiomeTable } from '../systems/world/biomes';
import { parseWeatherParams, type WeatherParams } from '../systems/world/weather';
import { parseClimateParams, type ClimateParams } from '../systems/world/climate-params';
import { parseWorldgenParams, type WorldgenParams } from '../systems/world/params';
import { parseResourceCatalog, type ResourceCatalog } from './resources';
import { parseTimeParams, type TimeParams } from './time-params';

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

/** Validates the bundled data/*.json files. Throws a DataFileError (French message) if one is invalid. */
export function loadGameData(): GameData {
  const biomes = parseBiomeTable(biomesJson);
  const resources = parseResourceCatalog(resourcesJson);
  const flora = parseFloraParams(plantsJson, biomes, resources);
  const plantFoods = flora.species.flatMap((species) => (species.produce ? [species.produce.resource] : []));
  const fauna = parseFaunaParams(animalsJson, biomes, resources, plantFoods);
  return {
    time: parseTimeParams(timeJson),
    worldgen: parseWorldgenParams(worldgenJson),
    biomes,
    climate: parseClimateParams(climateJson),
    resources,
    flora,
    fauna,
    weather: parseWeatherParams(weatherJson),
    humans: parseHumanParams(humansJson, plantFoods, fauna.species.map((species) => species.id)),
  };
}
