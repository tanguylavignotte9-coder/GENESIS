import timeJson from '../../../data/time.json';
import { parseTimeParams, type TimeParams } from './time-params';

/** All validated data files the simulation needs. */
export interface GameData {
  time: TimeParams;
}

/** Validates the bundled data/*.json files. Throws a DataFileError (French message) if one is invalid. */
export function loadGameData(): GameData {
  return { time: parseTimeParams(timeJson) };
}
