import { DataFileError, validateData, type Schema } from '../../core/data-validation';
import { unknownResources, type ResourceCatalog } from '../../core/resources';
import type { BiomeTable } from '../world/biomes';
import type { ResourceAmount } from '../flora/params';

/** What an animal can eat: grass on the ground, a plant produce (resource id), fish, or meat (hunting). */
export type FoodSource = 'grass' | 'meat' | 'fish' | string;

export interface AnimalSpecies {
  id: string;
  name: string;
  /** Plural, lower case ("chevaux sauvages"), used in journal sentences. */
  plural: string;
  color: string;
  /** Sprite size in pixels. */
  size: number;
  /** Food sources and preference weights. */
  diet: Record<FoodSource, number>;
  /** Species ids this one hunts. */
  prey: string[];
  /** Biome id → relative density where the species starts. */
  habitat: Record<string, number>;
  populationPer1000Tiles: number;
  groupSize: [number, number];
  maxGroupSize: number;
  maxAgeYears: number;
  adultAgeYears: number;
  /** Mating season, in days of the LOCAL year: [from, to). */
  breedingDays: [number, number];
  gestationDays: number;
  litter: [number, number];
  /** Chance per day, for a fertile female during the mating season. */
  conceptionChance: number;
  /** Territory: a female does not breed if more than `crowdingMax` animals of her species live within `crowdingRadius` tiles. */
  crowdingRadius: number;
  crowdingMax: number;
  /** Hunters only: a female breeds only if she sees at least `breedingMinPrey` prey within `preyCheckRadius` tiles. */
  preyCheckRadius: number;
  breedingMinPrey: number;
  hungerPerDay: number;
  /** Food units that cover one day of hunger. */
  foodPerDay: number;
  thirstPerDay: number;
  /** Below this temperature, the animal suffers from the cold. */
  minCelsius: number;
  /** Chance to actually move each step (speed). */
  moveChance: number;
  /** Prey only: distance (tiles) at which a hunter is noticed. */
  fleeRadius: number;
  /** Hunters only: distance at which prey is looked for. */
  huntRadius: number;
  /** Hunters only: chance per step to bring down an adjacent prey. */
  huntSuccess: number;
  /** Hunters only: tiles covered per step while chasing (a sprint). */
  sprintTiles: number;
  /** Food units its body gives to the hunters who kill it. */
  meat: number;
  migratory: boolean;
  /** Distance of the seasonal migration toward the equator (autumn) and back (spring). */
  migrationTiles: number;
  /** Can be tamed later (herding). */
  domesticable: boolean;
  /** What the animal provides when it dies (for the hunters of later steps). */
  carcass: ResourceAmount[];
}

export interface FaunaParams {
  stepsPerDay: number;
  thinkEverySteps: number;
  gridCellTiles: number;
  needs: {
    seekWaterAbove: number;
    seekFoodAbove: number;
    fullBelow: number;
    drinkPerStep: number;
    starvationDamagePerDay: number;
    thirstDamagePerDay: number;
    coldDamagePerDegreeDay: number;
    regenPerDay: number;
    oldAgeShare: number;
    oldAgeDamagePerDay: number;
  };
  behavior: {
    forageRadius: number;
    forageSamples: number;
    cohesionRadius: number;
    wanderChance: number;
    wanderRadius: number;
    fleeDistance: number;
    chaseSteps: number;
    packShareRadius: number;
    lonerJoinRadius: number;
    waterSearchTiles: number;
    migrationMaxDays: number;
    breedingMinHealth: number;
    breedingMaxHunger: number;
    /** A female finds a mate if an adult male of her species is within this distance. */
    mateRadius: number;
  };
  fish: {
    maxAmount: number;
    regrowthPerDay: number;
    updateIntervalDays: number;
    capacityByWater: { river: number; lake: number; coast: number; openSea: number };
    coastMaxDepthMeters: number;
  };
  /** Carcasses: share of the meat that rots each day, and scraps below which they vanish. */
  carrion: { rotPerDay: number; minimumMeat: number };
  stats: { intervalDays: number };
  events: {
    collapseShare: number;
    collapseMinPopulation: number;
    extinctionMinLandmassTiles: number;
    extinctionMinPreviousPopulation: number;
    migrationMinAnimals: number;
    /** The same migration (species, landmass, direction) is reported at most once in this many years. */
    migrationEventEveryYears: number;
    migrationText: string;
    extinctionText: string;
    collapseText: string;
  };
  species: AnimalSpecies[];
}

const POSITIVE: Schema = { kind: 'number', min: 0 };
const SHARE: Schema = { kind: 'number', min: 0, max: 1 };
const PAIR = (min: number): Schema => ({ kind: 'array', minLength: 2, maxLength: 2, items: { kind: 'number', min } });
const COUNT: Schema = { kind: 'integer', min: 1 };

const SCHEMA: Schema = {
  kind: 'object',
  fields: {
    stepsPerDay: { kind: 'integer', min: 1, max: 240 },
    thinkEverySteps: { kind: 'integer', min: 1, max: 64 },
    gridCellTiles: { kind: 'integer', min: 2, max: 256 },
    needs: {
      kind: 'object',
      fields: {
        seekWaterAbove: POSITIVE,
        seekFoodAbove: POSITIVE,
        fullBelow: POSITIVE,
        drinkPerStep: POSITIVE,
        starvationDamagePerDay: POSITIVE,
        thirstDamagePerDay: POSITIVE,
        coldDamagePerDegreeDay: POSITIVE,
        regenPerDay: POSITIVE,
        oldAgeShare: SHARE,
        oldAgeDamagePerDay: POSITIVE,
      },
    },
    behavior: {
      kind: 'object',
      fields: {
        forageRadius: COUNT,
        forageSamples: COUNT,
        cohesionRadius: COUNT,
        wanderChance: SHARE,
        wanderRadius: COUNT,
        fleeDistance: COUNT,
        chaseSteps: COUNT,
        packShareRadius: { kind: 'integer', min: 0 },
        lonerJoinRadius: { kind: 'integer', min: 0 },
        waterSearchTiles: COUNT,
        migrationMaxDays: COUNT,
        breedingMinHealth: POSITIVE,
        breedingMaxHunger: POSITIVE,
        mateRadius: COUNT,
      },
    },
    fish: {
      kind: 'object',
      fields: {
        maxAmount: { kind: 'integer', min: 1, max: 255 },
        regrowthPerDay: POSITIVE,
        updateIntervalDays: { kind: 'integer', min: 1, max: 365 },
        capacityByWater: { kind: 'object', fields: { river: SHARE, lake: SHARE, coast: SHARE, openSea: SHARE } },
        coastMaxDepthMeters: POSITIVE,
      },
    },
    carrion: { kind: 'object', fields: { rotPerDay: SHARE, minimumMeat: POSITIVE } },
    stats: { kind: 'object', fields: { intervalDays: COUNT } },
    events: {
      kind: 'object',
      fields: {
        collapseShare: SHARE,
        collapseMinPopulation: COUNT,
        extinctionMinLandmassTiles: COUNT,
        extinctionMinPreviousPopulation: COUNT,
        migrationMinAnimals: COUNT,
        migrationEventEveryYears: COUNT,
        migrationText: { kind: 'string' },
        extinctionText: { kind: 'string' },
        collapseText: { kind: 'string' },
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
          plural: { kind: 'string' },
          color: { kind: 'string', pattern: /^#[0-9a-fA-F]{6}$/, patternHint: 'une couleur au format #rrggbb' },
          size: { kind: 'integer', min: 1, max: 16 },
          diet: { kind: 'record', values: POSITIVE },
          prey: { kind: 'array', items: { kind: 'string' } },
          habitat: { kind: 'record', values: POSITIVE },
          populationPer1000Tiles: POSITIVE,
          groupSize: PAIR(1),
          maxGroupSize: COUNT,
          maxAgeYears: { kind: 'number', min: 0.1 },
          adultAgeYears: POSITIVE,
          breedingDays: PAIR(0),
          gestationDays: COUNT,
          litter: PAIR(1),
          conceptionChance: SHARE,
          crowdingRadius: { kind: 'integer', min: 1, max: 64 },
          crowdingMax: COUNT,
          preyCheckRadius: { kind: 'integer', min: 0, max: 64 },
          breedingMinPrey: { kind: 'integer', min: 0 },
          hungerPerDay: POSITIVE,
          foodPerDay: { kind: 'number', min: 0.01 },
          thirstPerDay: POSITIVE,
          minCelsius: { kind: 'number' },
          moveChance: SHARE,
          fleeRadius: { kind: 'integer', min: 0 },
          huntRadius: { kind: 'integer', min: 0 },
          huntSuccess: SHARE,
          sprintTiles: { kind: 'integer', min: 1, max: 8 },
          meat: POSITIVE,
          migratory: { kind: 'boolean' },
          migrationTiles: { kind: 'integer', min: 0 },
          domesticable: { kind: 'boolean' },
          carcass: { kind: 'array', items: { kind: 'object', fields: { resource: { kind: 'string' }, amount: POSITIVE } } },
        },
      },
    },
  },
};

const FILE = 'data/animals.json';
/** Species codes are stored in a Uint8Array. */
const MAX_SPECIES = 255;

export function parseFaunaParams(raw: unknown, biomes: BiomeTable, resources: ResourceCatalog, plantResources: readonly string[]): FaunaParams {
  const params = validateData<FaunaParams>(FILE, raw, SCHEMA);
  const problems: string[] = [];
  const biomeIds = new Set(biomes.biomes.map((biome) => biome.id));
  const speciesIds = new Set(params.species.map((species) => species.id));
  const foods = new Set(['grass', 'meat', 'fish', ...plantResources]);
  if (speciesIds.size !== params.species.length) problems.push('deux animaux ont le même « id ».');
  if (params.species.length > MAX_SPECIES) problems.push(`au plus ${MAX_SPECIES} espèces animales sont possibles.`);
  if (params.stepsPerDay % params.thinkEverySteps !== 0) problems.push('« stepsPerDay » doit être un multiple de « thinkEverySteps ».');
  for (const species of params.species) {
    const where = `animal « ${species.id} »`;
    for (const id of Object.keys(species.habitat)) if (!biomeIds.has(id)) problems.push(`${where} : le biome « ${id} » n'existe pas.`);
    for (const id of species.prey) if (!speciesIds.has(id)) problems.push(`${where} : la proie « ${id} » n'existe pas.`);
    for (const food of Object.keys(species.diet)) {
      if (!foods.has(food)) problems.push(`${where} : la nourriture « ${food} » n'est produite par aucune plante (ni herbe, viande, poisson).`);
    }
    if (species.prey.length > 0 && !('meat' in species.diet)) problems.push(`${where} : un chasseur doit avoir « meat » dans « diet ».`);
    if (species.groupSize[0] > species.groupSize[1]) problems.push(`${where} : « groupSize » doit être [min, max].`);
    if (species.litter[0] > species.litter[1]) problems.push(`${where} : « litter » doit être [min, max].`);
    problems.push(...unknownResources(resources, species.carcass.map((item) => item.resource), where));
  }
  if (problems.length > 0) throw new DataFileError(FILE, problems);
  return params;
}
