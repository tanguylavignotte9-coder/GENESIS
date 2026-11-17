import type { GameData } from './core/game-data';
import { Simulation } from './core/simulation';
import { ticksPerYear } from './core/time-params';

/** Number of random draws shown in the report to prove the seed's determinism. */
const FINGERPRINT_DRAWS = 3;

export interface HeadlessReport {
  seed: number;
  years: number;
  ticks: number;
  finalTick: number;
  worldSize: number;
  riverCount: number;
  lakeCount: number;
  /** First draws of the seeded generator after the run: identical for identical seeds. */
  randomFingerprint: number[];
}

/** Generates a world then runs the simulation without any display for `years` game years. */
export function runHeadless(seed: number, years: number, data: GameData): HeadlessReport {
  const simulation = new Simulation(seed, data);
  const ticks = years * ticksPerYear(data.time);
  simulation.step(ticks);

  const randomFingerprint: number[] = [];
  for (let i = 0; i < FINGERPRINT_DRAWS; i++) randomFingerprint.push(simulation.rng.nextUint32());

  const { world } = simulation;
  return {
    seed,
    years,
    ticks,
    finalTick: simulation.clock.tick,
    worldSize: world.size,
    riverCount: world.riverCount,
    lakeCount: world.lakeCount,
    randomFingerprint,
  };
}
