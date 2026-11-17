import { dateAtTick, formatDate } from './core/calendar';
import type { GameData } from './core/game-data';
import { Simulation } from './core/simulation';
import { ticksPerYear } from './core/time-params';
import { ANOMALY_START } from './systems/world/anomalies';

/** Number of random draws shown in the report to prove the seed's determinism. */
const FINGERPRINT_DRAWS = 3;

export interface AnomalySummary {
  /** Number of abnormal years started, per anomaly type name. */
  countsByType: { name: string; count: number }[];
  /** "Jour 1 · Printemps · An 3 — Une sécheresse frappe…" for each one, oldest first. */
  lines: string[];
}

export interface HeadlessReport {
  seed: number;
  years: number;
  ticks: number;
  finalTick: number;
  finalDate: string;
  worldSize: number;
  riverCount: number;
  lakeCount: number;
  journalEvents: number;
  anomalies: AnomalySummary;
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

  const { world, journal } = simulation;
  return {
    seed,
    years,
    ticks,
    finalTick: simulation.clock.tick,
    finalDate: formatDate(simulation.date, data.time),
    worldSize: world.size,
    riverCount: world.riverCount,
    lakeCount: world.lakeCount,
    journalEvents: journal.size,
    anomalies: summarizeAnomalies(simulation),
    randomFingerprint,
  };
}

function summarizeAnomalies(simulation: Simulation): AnomalySummary {
  const { time, climate } = simulation.data;
  const starts = simulation.journal.all().filter((event) => event.type === ANOMALY_START);
  return {
    countsByType: climate.anomalies.types.map((type) => ({
      name: type.name,
      count: starts.filter((event) => event.details['anomaly'] === type.id).length,
    })),
    lines: starts.map((event) => `${formatDate(dateAtTick(event.tick, time), time)} — ${event.text}`),
  };
}
