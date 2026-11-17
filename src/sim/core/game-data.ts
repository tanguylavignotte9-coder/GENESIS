import biomesJson from '../../../data/biomes.json';
import climateJson from '../../../data/climate.json';
import timeJson from '../../../data/time.json';
import worldgenJson from '../../../data/worldgen.json';
import { parseBiomeTable, type BiomeTable } from '../systems/world/biomes';
import { parseClimateParams, type ClimateParams } from '../systems/world/climate-params';
import { parseWorldgenParams, type WorldgenParams } from '../systems/world/params';
import { parseTimeParams, type TimeParams } from './time-params';

/** All validated data files the simulation needs. */
export interface GameData {
  time: TimeParams;
  worldgen: WorldgenParams;
  biomes: BiomeTable;
  climate: ClimateParams;
}

/** Validates the bundled data/*.json files. Throws a DataFileError (French message) if one is invalid. */
export function loadGameData(): GameData {
  return {
    time: parseTimeParams(timeJson),
    worldgen: parseWorldgenParams(worldgenJson),
    biomes: parseBiomeTable(biomesJson),
    climate: parseClimateParams(climateJson),
  };
}
