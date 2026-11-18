import { choice, DataFileError, text, validateData, variable, type Schema } from '../../core/data-validation';
import type { Rng } from '../../core/rng';
import type { ClimateState } from './climate-state';

/** Local weather of the day, by region (data/weather.json). */
export interface WeatherParams {
  regionTiles: number;
  rainChanceAtFullHumidity: number;
  snowBelowCelsius: number;
  coldSnapBelowCelsius: number;
  coldSnapChance: number;
  types: WeatherType[];
}

export interface WeatherType {
  id: string;
  /** Shown to the player. */
  name: string;
  /** Added to the temperature people feel (rain and wind chill). */
  feltCelsius: number;
  /** Walking speed is multiplied by this. */
  movementFactor: number;
}

export const WEATHER_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    regionTiles: variable('integer', 8, 512, {
      label: 'Taille d’une région météo',
      help: 'Côté (en tuiles) des carrés de carte qui partagent la même météo du jour.',
      unit: 'tuiles',
      apply: 'newWorld',
    }),
    rainChanceAtFullHumidity: variable('number', 0, 1, {
      label: 'Probabilité de pluie',
      help: 'Chance qu’il pleuve (ou neige) un jour donné dans une région saturée d’humidité ; proportionnelle à l’humidité.',
      unit: 'probabilité par jour',
      apply: 'live',
    }),
    snowBelowCelsius: variable('number', -30, 10, {
      label: 'Seuil de neige',
      help: 'En dessous de cette température, les précipitations tombent en neige.',
      unit: '°C',
      apply: 'live',
    }),
    coldSnapBelowCelsius: variable('number', -40, 10, {
      label: 'Seuil de froid vif',
      help: 'Par temps sec, en dessous de cette température, un froid vif peut s’installer.',
      unit: '°C',
      apply: 'live',
    }),
    coldSnapChance: variable('number', 0, 1, {
      label: 'Probabilité de froid vif',
      help: 'Chance qu’un jour sec et froid devienne un jour de froid vif.',
      unit: 'probabilité par jour',
      apply: 'live',
    }),
    types: {
      kind: 'array',
      minLength: 4,
      maxLength: 4,
      items: {
        kind: 'object',
        fields: {
          id: choice(['clear', 'rain', 'snow', 'cold'], 'Type de temps', 'Les quatre temps, dans cet ordre : beau temps, pluie, neige, froid vif.', 'newWorld'),
          name: text('Nom', 'Nom affiché du temps (info-bulles, fiche personnage).', 'newWorld'),
          feltCelsius: variable('number', -30, 10, {
            label: 'Température ressentie',
            help: 'Degrés ajoutés à la température que ressentent les humains par ce temps.',
            unit: '°C',
            apply: 'live',
          }),
          movementFactor: variable('number', 0.1, 1, {
            label: 'Vitesse de marche',
            help: 'Facteur appliqué à la vitesse de marche par ce temps.',
            unit: 'facteur',
            apply: 'live',
          }),
        },
      },
    },
  },
};

const FILE = 'data/weather.json';
export const Weather = { Clear: 0, Rain: 1, Snow: 2, Cold: 3 } as const;

export function parseWeatherParams(raw: unknown): WeatherParams {
  const params = validateData<WeatherParams>(FILE, raw, WEATHER_SCHEMA);
  const order = params.types.map((type) => type.id).join(',');
  if (order !== 'clear,rain,snow,cold') throw new DataFileError(FILE, ['« types » doit lister, dans l’ordre : clear, rain, snow, cold.']);
  return params;
}

/** Today's weather in each region, drawn once a day with the seeded generator. */
export class WeatherState {
  readonly regionsPerSide: number;
  readonly regions: Uint8Array;

  constructor(
    private readonly size: number,
    readonly params: WeatherParams,
  ) {
    this.regionsPerSide = Math.ceil(size / params.regionTiles);
    this.regions = new Uint8Array(this.regionsPerSide * this.regionsPerSide);
  }

  /** New day: each region gets clear weather, rain, snow or a cold snap from its current climate. */
  newDay(climate: ClimateState, rng: Rng): void {
    const { params } = this;
    const half = Math.floor(params.regionTiles / 2);
    for (let r = 0; r < this.regions.length; r++) {
      const rx = r % this.regionsPerSide;
      const ry = (r - rx) / this.regionsPerSide;
      const x = Math.min(this.size - 1, rx * params.regionTiles + half);
      const y = Math.min(this.size - 1, ry * params.regionTiles + half);
      const tile = y * this.size + x;
      const temperature = climate.temperatureAt(tile);
      const wet = rng.nextFloat() < climate.humidityAt(tile) * params.rainChanceAtFullHumidity;
      const snap = rng.nextFloat() < params.coldSnapChance;
      let weather: number = Weather.Clear;
      if (wet) weather = temperature < params.snowBelowCelsius ? Weather.Snow : Weather.Rain;
      else if (temperature < params.coldSnapBelowCelsius && snap) weather = Weather.Cold;
      this.regions[r] = weather;
    }
  }

  /** Weather code on a tile. */
  at(index: number): number {
    const x = index % this.size;
    const y = (index - x) / this.size;
    return this.regions[Math.floor(y / this.params.regionTiles) * this.regionsPerSide + Math.floor(x / this.params.regionTiles)]!;
  }

  typeAt(index: number): WeatherType {
    return this.params.types[this.at(index)]!;
  }
}
