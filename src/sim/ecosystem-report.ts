import type { GameData } from './core/game-data';
import { Simulation } from './core/simulation';
import { daysPerYear } from './core/time-params';

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
  msPerDay: number;
}

/**
 * Plants and animals alone (no humans), for `years` years, with a census every `everyYears`:
 * to check that the ecosystem stays varied by itself.
 */
export function runEcosystem(seed: number, years: number, everyYears: number, data: GameData, now: () => number = () => 0): EcosystemReport {
  const simulation = new Simulation(seed, data);
  const yearDays = daysPerYear(data.time);
  const sample = (year: number): EcosystemSample => ({ year, animals: simulation.fauna.countBySpecies(), plants: simulation.flora.countBySpecies() });
  const samples = [sample(0)];
  const startedAt = now();
  for (let year = 0; year < years; year += everyYears) {
    const span = Math.min(everyYears, years - year);
    simulation.runEcosystemOnly(span * yearDays);
    samples.push(sample(year + span));
  }
  return {
    seed,
    animalNames: data.fauna.species.map((species) => species.name),
    plantNames: data.flora.species.map((species) => species.name),
    samples,
    msPerDay: (now() - startedAt) / Math.max(1, years * yearDays),
  };
}
