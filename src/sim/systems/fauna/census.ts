import type { Journal } from '../../core/journal';
import { deNoun, fillTemplate } from '../../core/text';
import type { ActiveAnomaly } from '../world/climate-state';
import { ofPlace } from '../world/places';
import { POPULATION_COLLAPSE, SPECIES_EXTINCT } from './fauna-events';
import type { FaunaSystem } from './fauna-system';

/** Population of each species at a date (for the statistics panel). */
export interface PopulationSample {
  day: number;
  animals: number[];
}

/**
 * Counts the animals regularly: population history, species vanishing from a landmass,
 * and populations collapsing in a region struck by a hardship (drought, harsh winter).
 */
export class Census {
  readonly history: PopulationSample[] = [];
  /** counts[species * landmasses + landmass] at the previous census. */
  private previous: Int32Array | null = null;
  /** Highest count ever seen per species and landmass: only established populations "disappear". */
  private peak: Int32Array | null = null;
  /** Animals per species inside each hardship region when it began (key: start event id). */
  private readonly atHardshipStart = new Map<number, number[]>();

  constructor(private readonly fauna: FaunaSystem) {}

  onDay(absoluteDay: number, journal: Journal, tick: number): void {
    if (absoluteDay % this.fauna.params.stats.intervalDays !== 0) return;
    this.history.push({ day: absoluteDay, animals: this.fauna.countBySpecies() });
    this.checkExtinctions(journal, tick);
  }

  /** Remembers how many animals live in each new hardship region. */
  onYearStart(anomalies: readonly ActiveAnomaly[]): void {
    this.atHardshipStart.clear();
    for (const anomaly of anomalies) {
      if (this.isHardship(anomaly)) this.atHardshipStart.set(anomaly.startEventId, this.countInRegion(anomaly));
    }
  }

  /** At the end of the year: did a population collapse where a hardship struck? */
  onYearEnd(anomalies: readonly ActiveAnomaly[], journal: Journal, tick: number): void {
    const { events, species } = this.fauna.params;
    for (const anomaly of anomalies) {
      const before = this.atHardshipStart.get(anomaly.startEventId);
      if (!before) continue;
      const after = this.countInRegion(anomaly);
      const hardship = this.fauna.climate.params.anomalies.types[anomaly.type]?.hardshipName ?? '';
      species.forEach((animal, k) => {
        const start = before[k] ?? 0;
        if (start < events.collapseMinPopulation || (after[k] ?? 0) > start * (1 - events.collapseShare)) return;
        journal.publish({
          tick,
          type: POPULATION_COLLAPSE,
          text: fillTemplate(events.collapseText, { espèces: animal.plural, d_espèces: deNoun(animal.plural), lieu: anomaly.place, cause: hardship }),
          place: { x: anomaly.x, y: anomaly.y, label: anomaly.place },
          actors: [],
          causes: [anomaly.startEventId],
          details: { species: animal.id, before: start, after: after[k] ?? 0 },
        });
      });
    }
  }

  private isHardship(anomaly: ActiveAnomaly): boolean {
    return this.fauna.climate.params.anomalies.types[anomaly.type]?.hardshipName !== undefined;
  }

  private countInRegion(anomaly: ActiveAnomaly): number[] {
    const { store, params } = this.fauna;
    const counts = new Array<number>(params.species.length).fill(0);
    const r2 = anomaly.radius * anomaly.radius;
    for (let slot = 0; slot < store.slots; slot++) {
      if (store.alive[slot] === 0) continue;
      const dx = store.x[slot]! - anomaly.x;
      const dy = store.y[slot]! - anomaly.y;
      if (dx * dx + dy * dy <= r2) counts[store.species[slot]!]!++;
    }
    return counts;
  }

  /** "Les loups ont disparu du continent du nord-ouest." */
  private checkExtinctions(journal: Journal, tick: number): void {
    const { world, store, params } = this.fauna;
    const masses = world.landmasses.list.length;
    const counts = new Int32Array(params.species.length * masses);
    for (let slot = 0; slot < store.slots; slot++) {
      if (store.alive[slot] === 0) continue;
      const landmass = world.landmasses.idOf[store.y[slot]! * this.fauna.size + store.x[slot]!]!;
      if (landmass >= 0) counts[store.species[slot]! * masses + landmass]!++;
    }
    const previous = this.previous;
    this.previous = counts;
    const peak = this.peak ?? new Int32Array(counts.length);
    for (let k = 0; k < counts.length; k++) peak[k] = Math.max(peak[k]!, counts[k]!);
    this.peak = peak;
    if (!previous) return;
    const { events } = params;
    params.species.forEach((animal, k) => {
      for (let m = 0; m < masses; m++) {
        const mass = world.landmasses.list[m]!;
        const at = k * masses + m;
        if (mass.tiles < events.extinctionMinLandmassTiles || counts[at]! > 0 || previous[at]! === 0) continue;
        if (peak[at]! < events.extinctionMinPreviousPopulation) continue;
        const name = world.landmassNames[m] ?? '';
        journal.publish({
          tick,
          type: SPECIES_EXTINCT,
          text: fillTemplate(events.extinctionText, { espèces: animal.plural, d_espèces: deNoun(animal.plural), lieu: name, de_lieu: ofPlace(name) }),
          place: { x: Math.round(mass.centroidX), y: Math.round(mass.centroidY), label: name },
          actors: [],
          causes: [],
          details: { species: animal.id },
        });
      }
    });
  }
}
