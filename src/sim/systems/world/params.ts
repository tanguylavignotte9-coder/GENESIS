import { DataFileError, validateData, type Schema } from '../../core/data-validation';

/** World generation settings, read from data/worldgen.json. Distances are fractions of the map size. */
export interface WorldgenParams {
  size: number;
  elevation: ElevationParams;
  temperature: TemperatureParams;
  humidity: HumidityParams;
  hydrology: HydrologyParams;
  /** Max distance (tiles) from the ocean for a tile to count as coastal (beaches). */
  beachMaxDistance: number;
  /** Land masses smaller than this (tiles) are ignored in statistics. */
  landmassMinTiles: number;
  /** A land mass holding at least this share of all land is a continent; smaller ones are islands. */
  continentMinShare: number;
}

export interface ElevationParams {
  continentCountMin: number;
  continentCountMax: number;
  continentRadiusMin: number;
  continentRadiusMax: number;
  continentMargin: number;
  /** Minimum distance between continent centers, as a multiple of the sum of their radii. */
  continentSpacing: number;
  /** Outer share of a continent's radius over which the land rises from the sea floor to the plateau. */
  continentShelf: number;
  islandCountMin: number;
  islandCountMax: number;
  islandRadiusMin: number;
  islandRadiusMax: number;
  islandStrength: number;
  coastWarpFrequency: number;
  coastWarpStrength: number;
  detailFrequency: number;
  detailOctaves: number;
  detailWeight: number;
  edgeFalloffWidth: number;
  oceanFraction: number;
  lowlandMaxMeters: number;
  lowlandExponent: number;
  /** Mountain belts: low-frequency noise above `mountainBeltThreshold` hosts mountain chains. */
  mountainBeltFrequency: number;
  mountainBeltThreshold: number;
  mountainBeltWidth: number;
  ridgeFrequency: number;
  ridgeOctaves: number;
  /** Exponent applied to the ridged noise: higher = thinner, sharper chains. */
  ridgeSharpness: number;
  mountainMaxMeters: number;
  /** Inland distance (0..1 of the land shape) over which mountains rise from nothing near the coast. */
  mountainCoastRamp: number;
  maxOceanDepthMeters: number;
  oceanDepthExponent: number;
}

export interface TemperatureParams {
  equatorCelsius: number;
  poleCelsius: number;
  latitudeExponent: number;
  lapseRateCelsiusPerKm: number;
  noiseFrequency: number;
  noiseCelsius: number;
}

export type WindDirection = 'fromEast' | 'fromWest';

export interface HumidityParams {
  /** Prevailing wind per latitude band (0 = equator, 1 = pole), in increasing order. */
  windBands: { untilLatitude: number; direction: WindDirection }[];
  /** Latitude distance over which two neighbouring wind bands blend (avoids sharp lines). */
  windBandBlend: number;
  /** Share of missing moisture the air picks up over each water tile. */
  oceanEvaporation: number;
  /** Share of carried moisture that falls as rain on each flat land tile. */
  landRainPerTile: number;
  /** Extra rain share per meter of climb (mountains wring out the air). */
  orographicRainPerMeter: number;
  /** Share of fallen rain that evaporates back into the air (vegetation, soil). */
  rainRecycling: number;
  /** Large-scale circulation: humidity multiplier by latitude (interpolated). */
  latitudeFactors: { latitude: number; factor: number }[];
  /** Blur radius (tiles) of the relief seen by the winds: only large landforms cause rain shadows. */
  reliefSmoothing: number;
  blurRadius: number;
  noiseFrequency: number;
  noiseAmplitude: number;
}

export interface HydrologyParams {
  fillEpsilonMeters: number;
  /** Extra runoff per km of altitude (mountains catch more rain and snow): runoff = humidity² × (1 + this × km). */
  runoffPerKmOfAltitude: number;
  /** Accumulated runoff (sum over all upstream tiles) needed for a tile to carry a river. */
  riverMinFlow: number;
  lakeMinDepthMeters: number;
  /** Accumulated runoff needed for a basin to hold a lake (otherwise it stays a dry basin). */
  lakeMinInflow: number;
}

const POSITIVE = { kind: 'number', min: 0 } as const;
const FRACTION = { kind: 'number', min: 0, max: 1 } as const;
const COUNT = { kind: 'integer', min: 0 } as const;

const ELEVATION_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    continentCountMin: { kind: 'integer', min: 1 },
    continentCountMax: { kind: 'integer', min: 1 },
    continentRadiusMin: FRACTION,
    continentRadiusMax: FRACTION,
    continentMargin: { kind: 'number', min: 0, max: 0.5 },
    continentSpacing: POSITIVE,
    continentShelf: { kind: 'number', min: 0.01, max: 1 },
    islandCountMin: COUNT,
    islandCountMax: COUNT,
    islandRadiusMin: FRACTION,
    islandRadiusMax: FRACTION,
    islandStrength: POSITIVE,
    coastWarpFrequency: POSITIVE,
    coastWarpStrength: POSITIVE,
    detailFrequency: POSITIVE,
    detailOctaves: { kind: 'integer', min: 1, max: 12 },
    detailWeight: POSITIVE,
    edgeFalloffWidth: { kind: 'number', min: 0, max: 0.5 },
    oceanFraction: { kind: 'number', min: 0.05, max: 0.95 },
    lowlandMaxMeters: POSITIVE,
    lowlandExponent: { kind: 'number', min: 0.1 },
    mountainBeltFrequency: POSITIVE,
    mountainBeltThreshold: { kind: 'number', min: -1, max: 1 },
    mountainBeltWidth: { kind: 'number', min: 0.001 },
    ridgeFrequency: POSITIVE,
    ridgeOctaves: { kind: 'integer', min: 1, max: 12 },
    ridgeSharpness: { kind: 'number', min: 0.1 },
    mountainMaxMeters: POSITIVE,
    mountainCoastRamp: { kind: 'number', min: 0.001, max: 1 },
    maxOceanDepthMeters: { kind: 'number', min: 1 },
    oceanDepthExponent: { kind: 'number', min: 0.1 },
  },
};

const WORLDGEN_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    size: { kind: 'integer', min: 64, max: 4096 },
    elevation: ELEVATION_SCHEMA,
    temperature: {
      kind: 'object',
      fields: {
        equatorCelsius: { kind: 'number' },
        poleCelsius: { kind: 'number' },
        latitudeExponent: { kind: 'number', min: 0.1 },
        lapseRateCelsiusPerKm: POSITIVE,
        noiseFrequency: POSITIVE,
        noiseCelsius: POSITIVE,
      },
    },
    humidity: {
      kind: 'object',
      fields: {
        windBands: {
          kind: 'array',
          minLength: 1,
          items: {
            kind: 'object',
            fields: { untilLatitude: FRACTION, direction: { kind: 'enum', values: ['fromEast', 'fromWest'] } },
          },
        },
        windBandBlend: { kind: 'number', min: 0, max: 0.5 },
        oceanEvaporation: FRACTION,
        landRainPerTile: FRACTION,
        orographicRainPerMeter: POSITIVE,
        rainRecycling: FRACTION,
        latitudeFactors: {
          kind: 'array',
          minLength: 1,
          items: { kind: 'object', fields: { latitude: FRACTION, factor: POSITIVE } },
        },
        reliefSmoothing: { kind: 'integer', min: 0, max: 64 },
        blurRadius: { kind: 'integer', min: 0, max: 64 },
        noiseFrequency: POSITIVE,
        noiseAmplitude: POSITIVE,
      },
    },
    hydrology: {
      kind: 'object',
      fields: {
        fillEpsilonMeters: { kind: 'number', min: 0.001 },
        runoffPerKmOfAltitude: POSITIVE,
        riverMinFlow: { kind: 'number', min: 1 },
        lakeMinDepthMeters: POSITIVE,
        lakeMinInflow: POSITIVE,
      },
    },
    beachMaxDistance: { kind: 'integer', min: 1, max: 16 },
    landmassMinTiles: { kind: 'integer', min: 1 },
    continentMinShare: FRACTION,
  },
};

const FILE = 'data/worldgen.json';

export function parseWorldgenParams(raw: unknown): WorldgenParams {
  const params = validateData<WorldgenParams>(FILE, raw, WORLDGEN_SCHEMA);
  const problems = crossFieldProblems(params);
  if (problems.length > 0) throw new DataFileError(FILE, problems);
  return params;
}

function crossFieldProblems(params: WorldgenParams): string[] {
  const e = params.elevation;
  const h = params.humidity;
  const problems: string[] = [];
  const minMax = (min: number, max: number, name: string): void => {
    if (min > max) problems.push(`« elevation.${name}Min » doit être inférieur ou égal à « elevation.${name}Max ».`);
  };
  minMax(e.continentCountMin, e.continentCountMax, 'continentCount');
  minMax(e.continentRadiusMin, e.continentRadiusMax, 'continentRadius');
  minMax(e.islandCountMin, e.islandCountMax, 'islandCount');
  minMax(e.islandRadiusMin, e.islandRadiusMax, 'islandRadius');

  if (!isIncreasing(h.windBands.map((band) => band.untilLatitude)) || h.windBands.at(-1)?.untilLatitude !== 1) {
    problems.push('« humidity.windBands » : les latitudes doivent être croissantes et la dernière doit valoir 1.');
  }
  const latitudes = h.latitudeFactors.map((point) => point.latitude);
  if (!isIncreasing(latitudes) || latitudes[0] !== 0 || latitudes.at(-1) !== 1) {
    problems.push('« humidity.latitudeFactors » : les latitudes doivent être croissantes, de 0 à 1.');
  }
  return problems;
}

function isIncreasing(values: readonly number[]): boolean {
  return values.every((value, index) => index === 0 || value > (values[index - 1] ?? value));
}
