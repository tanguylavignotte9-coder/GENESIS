import type { GameData } from './core/game-data';
import { Simulation } from './core/simulation';
import { daysPerYear } from './core/time-params';
import { DEATH_CAUSE_NAMES } from './systems/fauna/fauna-system';

/** One census of the ecosystem alone: animals and plants per species. */
export interface EcosystemSample {
  year: number;
  animals: number[];
  plants: number[];
}

export interface EcosystemReport {
  seed: number;
  animalNames: string[];
  plantNames: string[];
  samples: EcosystemSample[];
  /** Deaths of each species over the run, by cause (names in `causeNames`). */
  deaths: number[][];
  causeNames: readonly string[];
  msPerDay: number;
}

/**
 * Plants and animals alone (no humans), for `years` years, with a census every `everyYears`:
 * to check that the ecosystem stays varied by itself.
 */
export function runEcosystem(
  seed: number,
  years: number,
  everyYears: number,
  data: GameData,
  now: () => number = () => 0,
  options: { from?: Simulation | undefined; onDone?: ((simulation: Simulation) => void) | undefined } = {},
): EcosystemReport {
  const simulation = options.from ?? new Simulation(seed, data);
  seed = simulation.seed;
  data = simulation.data;
  const yearDays = daysPerYear(data.time);
  const firstYear = Math.floor(simulation.date.absoluteDay / yearDays);
  const sample = (year: number): EcosystemSample => ({ year: firstYear + year, animals: simulation.fauna.countBySpecies(), plants: simulation.flora.countBySpecies() });
  const samples = [sample(0)];
  const startedAt = now();
  for (let year = 0; year < years; year += everyYears) {
    const span = Math.min(everyYears, years - year);
    simulation.runEcosystemOnly(span * yearDays);
    samples.push(sample(year + span));
  }
  options.onDone?.(simulation);
  return {
    seed,
    animalNames: data.fauna.species.map((species) => species.name),
    plantNames: data.flora.species.map((species) => species.name),
    samples,
    deaths: simulation.fauna.deaths.map((causes) => [...causes]),
    causeNames: DEATH_CAUSE_NAMES,
    msPerDay: (now() - startedAt) / Math.max(1, years * yearDays),
  };
}
