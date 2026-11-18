import { DataFileError, identifier, int, num, text, validateData, variable, type Schema } from '../../core/data-validation';
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

const LATITUDE = num(0, 1, 'Latitude', '0 = équateur (milieu de la carte), 1 = pôle (haut ou bas).', 'fraction');
const curve = (max: number, label: string, help: string, unit: string): Schema => ({
  kind: 'array',
  minLength: 1,
  items: { kind: 'object', fields: { latitude: LATITUDE, value: num(0, max, label, help, unit) } },
});
const TEXT_WITH_PLACE = (label: string, help: string): Schema =>
  text(label, `${help} « {lieu} » est remplacé par le lieu.`, 'live', { pattern: /\{lieu\}/, hint: 'un texte contenant {lieu} (remplacé par le lieu)' });

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

export const CLIMATE_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    daylight: DAYLIGHT_SCHEMA,
    seasonalTemperature: {
      kind: 'object',
      fields: {
        warmestDayOfYear: int(0, 399, 'Jour le plus chaud', 'Jour de l’année (0 = premier jour du printemps) où il fait le plus chaud au nord ; le sud est décalé d’une demi-année.', 'jour'),
        amplitudeByLatitude: curve(40, 'Écart saisonnier de température', 'Écart (±) entre la température du moment et la moyenne annuelle, au cœur de l’été et de l’hiver, à cette latitude.', '°C'),
      },
    },
    seasonalHumidity: {
      kind: 'object',
      fields: {
        amplitudeByLatitude: curve(1, 'Écart saisonnier d’humidité', 'Écart (± part de l’humidité moyenne) entre la saison humide (été local) et la saison sèche (hiver local), à cette latitude.', 'fraction'),
      },
    },
    snow: {
      kind: 'object',
      fields: {
        startCelsius: num(-20, 15, 'Début de la neige', 'En dessous de cette température, la neige commence à couvrir le sol.', '°C'),
        fullCelsius: num(-40, 10, 'Neige complète', 'En dessous de cette température, la neige couvre tout le sol (et l’herbe).', '°C'),
      },
    },
    anomalies: {
      kind: 'object',
      fields: {
        chancePerRoll: num(0, 1, 'Probabilité d’une année anormale', 'Chance de chaque tirage annuel de déclencher une année anormale.', 'probabilité'),
        tilesPerRoll: int(1, 1000000, 'Tuiles par tirage', 'Un continent reçoit un tirage par tranche de ce nombre de tuiles (au moins un) : les grands continents en ont davantage.', 'tuiles'),
        minLandmassTiles: int(1, 1000000, 'Terre minimale', 'Les terres plus petites n’ont jamais d’année anormale.', 'tuiles'),
        radiusMin: num(0.001, 1, 'Taille de la région (minimum)', 'Rayon minimal de la région touchée.', 'fraction de la carte'),
        radiusMax: num(0.001, 1, 'Taille de la région (maximum)', 'Rayon maximal de la région touchée.', 'fraction de la carte'),
        types: {
          kind: 'array',
          minLength: 1,
          items: {
            kind: 'object',
            fields: {
              id: identifier('Identifiant', 'Nom technique du type d’année anormale.'),
              name: text('Nom', 'Nom affiché (info-bulles).'),
              weight: num(0, 100, 'Fréquence relative', 'Poids de ce type parmi les années anormales (0 = jamais).', 'poids'),
              temperatureOffsetCelsius: num(-20, 20, 'Écart de température', 'Degrés ajoutés toute l’année au centre de la région.', '°C'),
              winterTemperatureOffsetCelsius: num(-30, 30, 'Écart en hiver', 'Degrés ajoutés en plus, en proportion de la rigueur de l’hiver local.', '°C'),
              humidityFactor: num(0, 3, 'Facteur d’humidité', 'Multiplie l’humidité au centre de la région (0,45 = sécheresse).', 'facteur'),
              hardshipName: text('Nom de l’épreuve', 'Pour une épreuve seulement (sécheresse, grand froid) : comment le journal la nomme comme cause d’une famine ou d’un effondrement.'),
              startText: TEXT_WITH_PLACE('Phrase du début', 'Phrase du journal quand l’année anormale commence.'),
              endText: TEXT_WITH_PLACE('Phrase de la fin', 'Phrase du journal quand elle prend fin.'),
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
