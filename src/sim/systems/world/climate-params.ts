import { DataFileError, validateData, type Schema } from '../../core/data-validation';
import { latitudeCurveProblem, type LatitudePoint } from './latitude-curve';

/** Seasons and abnormal years, read from data/climate.json. */
export interface ClimateParams {
  seasonalTemperature: {
    /** Day of the year (0-based) when the northern hemisphere is warmest; the south is opposite. */
    warmestDayOfYear: number;
    /** ± °C around the annual mean, by latitude. */
    amplitudeByLatitude: LatitudePoint[];
  };
  seasonalHumidity: {
    /** ± share of the annual humidity (wet/dry seasons, wet in the local summer), by latitude. */
    amplitudeByLatitude: LatitudePoint[];
  };
  snow: {
    /** Snow starts to cover the ground below this temperature… */
    startCelsius: number;
    /** …and fully covers it below this one. */
    fullCelsius: number;
  };
  anomalies: AnomalyParams;
}

export interface AnomalyParams {
  /** Chance of each yearly roll to start an abnormal year. */
  chancePerRoll: number;
  /** A landmass gets one roll per this many tiles (at least one). */
  tilesPerRoll: number;
  /** Smaller landmasses never get abnormal years. */
  minLandmassTiles: number;
  /** Size of the affected region, as a share of the map size. */
  radiusMin: number;
  radiusMax: number;
  types: AnomalyType[];
}

export interface AnomalyType {
  id: string;
  /** Shown to the player. */
  name: string;
  /** Relative chance of this type. */
  weight: number;
  temperatureOffsetCelsius: number;
  /** Extra offset applied in proportion to how wintry the local season is. */
  winterTemperatureOffsetCelsius: number;
  humidityFactor: number;
  /** Journal sentences; "{lieu}" is replaced by the place. */
  startText: string;
  endText: string;
}

const PLACEHOLDER = '{lieu}';
const CURVE: Schema = {
  kind: 'array',
  minLength: 1,
  items: { kind: 'object', fields: { latitude: { kind: 'number', min: 0, max: 1 }, value: { kind: 'number', min: 0 } } },
};
const TEXT_WITH_PLACE: Schema = {
  kind: 'string',
  pattern: /\{lieu\}/,
  patternHint: 'un texte contenant {lieu} (remplacé par le lieu)',
};

const CLIMATE_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    seasonalTemperature: {
      kind: 'object',
      fields: { warmestDayOfYear: { kind: 'integer', min: 0 }, amplitudeByLatitude: CURVE },
    },
    seasonalHumidity: { kind: 'object', fields: { amplitudeByLatitude: CURVE } },
    snow: { kind: 'object', fields: { startCelsius: { kind: 'number' }, fullCelsius: { kind: 'number' } } },
    anomalies: {
      kind: 'object',
      fields: {
        chancePerRoll: { kind: 'number', min: 0, max: 1 },
        tilesPerRoll: { kind: 'integer', min: 1 },
        minLandmassTiles: { kind: 'integer', min: 1 },
        radiusMin: { kind: 'number', min: 0.001, max: 1 },
        radiusMax: { kind: 'number', min: 0.001, max: 1 },
        types: {
          kind: 'array',
          minLength: 1,
          items: {
            kind: 'object',
            fields: {
              id: { kind: 'string', pattern: /^[a-z_]+$/, patternHint: 'un identifiant en minuscules (a-z, _)' },
              name: { kind: 'string' },
              weight: { kind: 'number', min: 0 },
              temperatureOffsetCelsius: { kind: 'number' },
              winterTemperatureOffsetCelsius: { kind: 'number' },
              humidityFactor: { kind: 'number', min: 0 },
              startText: TEXT_WITH_PLACE,
              endText: TEXT_WITH_PLACE,
            },
          },
        },
      },
    },
  },
};

const FILE = 'data/climate.json';

export function parseClimateParams(raw: unknown): ClimateParams {
  const params = validateData<ClimateParams>(FILE, raw, CLIMATE_SCHEMA);
  const problems = [
    latitudeCurveProblem(params.seasonalTemperature.amplitudeByLatitude, 'seasonalTemperature.amplitudeByLatitude'),
    latitudeCurveProblem(params.seasonalHumidity.amplitudeByLatitude, 'seasonalHumidity.amplitudeByLatitude'),
  ].filter((problem): problem is string => problem !== null);
  if (params.snow.fullCelsius >= params.snow.startCelsius) {
    problems.push('« snow.fullCelsius » doit être plus froid que « snow.startCelsius ».');
  }
  if (params.anomalies.radiusMin > params.anomalies.radiusMax) {
    problems.push('« anomalies.radiusMin » doit être inférieur ou égal à « anomalies.radiusMax ».');
  }
  if (params.anomalies.types.every((type) => type.weight === 0)) {
    problems.push('au moins un type d\'année anormale doit avoir un « weight » supérieur à 0.');
  }
  if (problems.length > 0) throw new DataFileError(FILE, problems);
  return params;
}

export function fillPlace(template: string, place: string): string {
  return template.split(PLACEHOLDER).join(place);
}
