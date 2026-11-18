import { DataFileError, validateData, variable, type Schema } from '../../core/data-validation';
import { fillTemplate } from '../../core/text';
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
  daylight: DaylightParams;
}

/** Day and night: hours of daylight depend on the season and the latitude. */
export interface DaylightParams {
  /** Hours of daylight at the equinoxes (everywhere) and all year at the equator. */
  equinoxHours: number;
  /** Extra hours of daylight at midsummer (and fewer at midwinter), by latitude. */
  deviationByLatitude: LatitudePoint[];
  /** Length of dawn and dusk, in hours. */
  twilightHours: number;
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
  /** For hardships only: how the journal names it as a cause ("la sécheresse"). */
  hardshipName?: string;
  /** Journal sentences; "{lieu}" is replaced by the place. */
  startText: string;
  endText: string;
}

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

const DAYLIGHT_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    equinoxHours: variable('number', 1, 23, {
      label: 'Durée du jour à l’équinoxe',
      help: 'Heures de jour aux équinoxes, et toute l’année à l’équateur.',
      unit: 'heures',
      apply: 'live',
    }),
    deviationByLatitude: {
      kind: 'array',
      minLength: 1,
      items: {
        kind: 'object',
        fields: {
          latitude: variable('number', 0, 1, {
            label: 'Latitude',
            help: '0 = équateur (milieu de la carte), 1 = pôle (haut ou bas).',
            unit: 'fraction',
            apply: 'live',
          }),
          value: variable('number', 0, 12, {
            label: 'Écart de durée du jour',
            help: 'Heures de jour en plus au cœur de l’été (et en moins au cœur de l’hiver) à cette latitude.',
            unit: 'heures',
            apply: 'live',
          }),
        },
      },
    },
    twilightHours: variable('number', 0, 4, {
      label: 'Crépuscule',
      help: 'Durée de l’aube et du crépuscule, pendant lesquels la lumière monte ou baisse.',
      unit: 'heures',
      apply: 'live',
    }),
  },
};

/** Schema of the variables added since the variables workshop requirement (all documented). */
export const DOCUMENTED_CLIMATE_SCHEMA = DAYLIGHT_SCHEMA;

const CLIMATE_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    daylight: DAYLIGHT_SCHEMA,
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
              hardshipName: { kind: 'string' },
              startText: TEXT_WITH_PLACE,
              endText: TEXT_WITH_PLACE,
            },
            optional: ['hardshipName'],
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
    latitudeCurveProblem(params.daylight.deviationByLatitude, 'daylight.deviationByLatitude'),
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
  return fillTemplate(template, { lieu: place });
}
