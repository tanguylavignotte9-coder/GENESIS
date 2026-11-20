import type { Journal } from '../../core/journal';
import { deNoun, fillTemplate } from '../../core/text';
import { describeLocation, ofPlace } from '../world/places';
import type { FaunaSystem } from './fauna-system';

export const MIGRATION_START = 'fauna.migration.start';
export const SPECIES_EXTINCT = 'fauna.species.extinct';
export const POPULATION_COLLAPSE = 'fauna.population.collapse';

export interface MigrationStart {
  group: number;
  species: number;
  x: number;
  y: number;
  animals: number;
  /** Heading south (true) or north. */
  south: boolean;
}

/**
 * "Une grande migration commence": one event per species, landmass and direction when enough
 * animals leave the same day.
 */
export function publishMigrations(fauna: FaunaSystem, starts: readonly MigrationStart[], journal: Journal, tick: number): void {
  const reported = fauna.migrationReports;
  const year = Math.floor(tick / (fauna.ticksPerDay * fauna.daysPerYear));
  const buckets = new Map<string, { species: number; landmass: number; south: boolean; animals: number; sx: number; sy: number }>();
  for (const start of starts) {
    const landmass = fauna.world.landmasses.idOf[start.y * fauna.size + start.x]!;
    const key = `${start.species}:${landmass}:${start.south}`;
    const bucket = buckets.get(key) ?? { species: start.species, landmass, south: start.south, animals: 0, sx: 0, sy: 0 };
    bucket.animals += start.animals;
    bucket.sx += start.x * start.animals;
    bucket.sy += start.y * start.animals;
    buckets.set(key, bucket);
  }
  const { events } = fauna.params;
  for (const [key, bucket] of buckets) {
    if (bucket.animals < events.migrationMinAnimals) continue;
    const last = reported.get(key);
    if (last !== undefined && year - last < events.migrationEventEveryYears) continue;
    reported.set(key, year);
    const species = fauna.params.species[bucket.species]!;
    const landmassName = fauna.world.landmassNames[bucket.landmass] ?? 'la haute mer';
    const x = Math.round(bucket.sx / bucket.animals);
    const y = Math.round(bucket.sy / bucket.animals);
    journal.publish({
      tick,
      type: MIGRATION_START,
      text: fillTemplate(events.migrationText, {
        espèces: species.plural,
        d_espèces: deNoun(species.plural),
        lieu: landmassName,
        de_lieu: ofPlace(landmassName),
        direction: bucket.south ? 'sud' : 'nord',
      }),
      place: { x, y, label: describeLocation(fauna.world, x, y) },
      actors: [],
      causes: [],
      details: { species: species.id, animals: bucket.animals },
    });
  }
}
