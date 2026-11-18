import { DataFileError, validateData, type Schema } from '../../core/data-validation';
import { unknownResources, type ResourceCatalog } from '../../core/resources';
import type { BiomeTable } from '../world/biomes';

export type PlantKind = 'tree' | 'shrub' | 'herb';

export interface ResourceAmount {
  resource: string;
  amount: number;
}

/** Seasonal harvest (berries, cereals…), available between two days of the LOCAL year. */
export interface Produce {
  resource: string;
  /** First day (0-based, local calendar: seasons are shifted by half a year in the south). */
  fromDay: number;
  /** Day after the last one. */
  toDay: number;
  /** Amount on a healthy mature plant. */
  amount: number;
}

export interface PlantSpecies {
  id: string;
  name: string;
  kind: PlantKind;
  color: string;
  /** Display only: how the plant is drawn, and an optional accent color (berries, flowers, birch bark). */
  shape: 'round' | 'conifer' | 'umbrella' | 'bush' | 'grass';
  accentColor?: string;
  /** Relative frequency when the map is first populated. */
  abundance: number;
  /** Comfortable range of the ANNUAL MEAN temperature (°C) and humidity (0..1). */
  temperature: [number, number];
  humidity: [number, number];
  /** Below this temperature right now, the plant suffers from frost. */
  frostCelsius: number;
  /** Below this humidity right now, the plant suffers from drought. */
  droughtHumidity: number;
  maxAgeYears: number;
  maturityYears: number;
  growthYears: number;
  seedsPerYear: number;
  seedRadius: number;
  germinationChance: number;
  produce?: Produce;
  /** What the plant gives when it is cut down (at full size). */
  materials?: ResourceAmount[];
}

export interface FloraParams {
  /** Each plant (and each tile of grass) is updated once every this many days. */
  updateIntervalDays: number;
  /** How far outside its comfortable range a species can still live (fitness falls to 0). */
  fitnessToleranceCelsius: number;
  fitnessToleranceHumidity: number;
  growthMinCelsius: number;
  health: { regenPerDay: number; frostDamagePerDegreeDay: number; droughtDamagePerDay: number; misfitDamagePerDay: number };
  seedlingHealth: number;
  seedlingGrowth: number;
  initialCoverByBiome: Record<string, number>;
  /** Share of the grass capacity left under a plant of each kind (trees shade the ground). */
  shadeByKind: Record<PlantKind, number>;
  grass: {
    maxAmount: number;
    growthPerDay: number;
    minGrowthCelsius: number;
    /** Grass grows at full speed above this humidity. */
    idealHumidity: number;
    coverByBiome: Record<string, number>;
  };
  species: PlantSpecies[];
}

/** [min, max] */
const RANGE: Schema = { kind: 'array', minLength: 2, maxLength: 2, items: { kind: 'number' } };
const SHARE: Schema = { kind: 'number', min: 0, max: 1 };
const COLOR: Schema = { kind: 'string', pattern: /^#[0-9a-fA-F]{6}$/, patternHint: 'une couleur au format #rrggbb' };
const POSITIVE: Schema = { kind: 'number', min: 0 };
const BY_BIOME: Schema = { kind: 'record', values: SHARE };
const AMOUNTS: Schema = {
  kind: 'array',
  items: { kind: 'object', fields: { resource: { kind: 'string' }, amount: POSITIVE } },
};

const SCHEMA: Schema = {
  kind: 'object',
  fields: {
    updateIntervalDays: { kind: 'integer', min: 1, max: 365 },
    fitnessToleranceCelsius: { kind: 'number', min: 0.1 },
    fitnessToleranceHumidity: { kind: 'number', min: 0.01 },
    growthMinCelsius: { kind: 'number' },
    health: {
      kind: 'object',
      fields: { regenPerDay: POSITIVE, frostDamagePerDegreeDay: POSITIVE, droughtDamagePerDay: POSITIVE, misfitDamagePerDay: POSITIVE },
    },
    seedlingHealth: SHARE,
    seedlingGrowth: SHARE,
    initialCoverByBiome: BY_BIOME,
    shadeByKind: { kind: 'object', fields: { tree: SHARE, shrub: SHARE, herb: SHARE } },
    grass: {
      kind: 'object',
      fields: {
        maxAmount: { kind: 'integer', min: 1, max: 255 },
        growthPerDay: POSITIVE,
        minGrowthCelsius: { kind: 'number' },
        idealHumidity: { kind: 'number', min: 0.01, max: 1 },
        coverByBiome: BY_BIOME,
      },
    },
    species: {
      kind: 'array',
      minLength: 1,
      items: {
        kind: 'object',
        fields: {
          id: { kind: 'string', pattern: /^[a-z_]+$/, patternHint: 'un identifiant en minuscules (a-z, _)' },
          name: { kind: 'string' },
          kind: { kind: 'enum', values: ['tree', 'shrub', 'herb'] },
          color: COLOR,
          shape: { kind: 'enum', values: ['round', 'conifer', 'umbrella', 'bush', 'grass'] },
          accentColor: COLOR,
          abundance: POSITIVE,
          temperature: RANGE,
          humidity: RANGE,
          frostCelsius: { kind: 'number' },
          droughtHumidity: SHARE,
          maxAgeYears: { kind: 'number', min: 0.1 },
          maturityYears: POSITIVE,
          growthYears: { kind: 'number', min: 0.01 },
          seedsPerYear: POSITIVE,
          seedRadius: { kind: 'integer', min: 1, max: 32 },
          germinationChance: SHARE,
          produce: {
            kind: 'object',
            fields: {
              resource: { kind: 'string' },
              fromDay: { kind: 'integer', min: 0 },
              toDay: { kind: 'integer', min: 1 },
              amount: { kind: 'integer', min: 1, max: 255 },
            },
          },
          materials: AMOUNTS,
        },
        optional: ['produce', 'materials', 'accentColor'],
      },
    },
  },
};

const FILE = 'data/plants.json';
/** Plant species are stored in a Uint8Array (0 = no plant). */
const MAX_SPECIES = 254;

export function parseFloraParams(raw: unknown, biomes: BiomeTable, resources: ResourceCatalog): FloraParams {
  const params = validateData<FloraParams>(FILE, raw, SCHEMA);
  const problems: string[] = [];
  const biomeIds = new Set(biomes.biomes.map((biome) => biome.id));
  for (const [table, key] of [
    [params.initialCoverByBiome, 'initialCoverByBiome'],
    [params.grass.coverByBiome, 'grass.coverByBiome'],
  ] as const) {
    for (const id of Object.keys(table)) if (!biomeIds.has(id)) problems.push(`« ${key} » : le biome « ${id} » n'existe pas.`);
  }
  if (params.species.length > MAX_SPECIES) problems.push(`au plus ${MAX_SPECIES} espèces de plantes sont possibles.`);
  for (const species of params.species) {
    const ids = [...(species.materials ?? []).map((m) => m.resource), ...(species.produce ? [species.produce.resource] : [])];
    problems.push(...unknownResources(resources, ids, `plante « ${species.id} »`));
    if (species.produce && species.produce.fromDay >= species.produce.toDay) {
      problems.push(`plante « ${species.id} » : « produce.fromDay » doit être avant « produce.toDay ».`);
    }
  }
  if (problems.length > 0) throw new DataFileError(FILE, problems);
  return params;
}
