/**
 * Load test (Node side): times a game day with 100 … 5 000 humains (several camps), the fauna and
 * the flora of a full map. Shared by `npm run sim -- --load-test` and the benchmark.
 */
import { performance } from 'node:perf_hooks';
import type { GameData } from '../sim/core/game-data';
import { Simulation } from '../sim/core/simulation';

/** Humans tested, and game days measured for each count (after one warm-up day). */
export const LOAD_TEST_HUMANS = [100, 500, 1000, 2000, 5000];
export const LOAD_TEST_DAYS = 20;
/**
 * Years plants and animals live alone before the humans arrive: a world born today holds about
 * 7 000 animals and 125 000 plants; after 15 years, about 15 000 and 280 000 (their balance).
 */
export const ECOSYSTEM_WARMUP_YEARS = 15;
/** At x500, one game day lasts 480 s / 500 = 0.96 s of real time. */
export const X500_DAY_BUDGET_MS = 960;
/** Share of the real time the simulation thread may compute (the rest: display, messages). */
export const BUDGET_SHARE = 0.7;
const BYTES_PER_MB = 1024 * 1024;

export interface LoadTestStep {
  humans: number;
  camps: number;
  animals: number;
  plants: number;
  generationMs: number;
  /** Real time spent letting the fauna and flora reach their balance (before the humans arrive). */
  warmupMs: number;
  msPerDay: number;
  /** Slowest measured game day (ms). */
  worstDayMs: number;
  /** Share of the real time a game day takes at x500 (1 = exactly 0.96 s). */
  x500Share: number;
  /** Highest speed multiplier the simulation alone could sustain (x1 = 480 s per game day). */
  maxSpeed: number;
  /** Memory used by the whole process after the measure (MB). */
  memoryMb: number;
}

export interface LoadTestResult {
  seed: number;
  days: number;
  warmupYears: number;
  steps: LoadTestStep[];
  /** Estimated humans for a game day under BUDGET_SHARE of the x500 budget. */
  advisedHumans: number;
}

export function runLoadTest(
  seed: number,
  data: GameData,
  onStep: (step: LoadTestStep) => void = () => {},
  options: { humans?: readonly number[]; days?: number; warmupYears?: number } = {},
): LoadTestResult {
  const days = options.days ?? LOAD_TEST_DAYS;
  const warmupDays = (options.warmupYears ?? ECOSYSTEM_WARMUP_YEARS) * data.time.daysPerSeason * data.time.seasons.length;
  const size = data.humans.tribe.size;
  const realMsPerDayAtX1 = (data.time.ticksPerDay / data.time.ticksPerRealSecond) * 1000;
  const steps: LoadTestStep[] = [];
  for (const wanted of options.humans ?? LOAD_TEST_HUMANS) {
    const humans = {
      ...data.humans,
      tribe: { ...data.humans.tribe, count: Math.ceil(wanted / size), campSpacingTiles: 12 },
      site: { ...data.humans.site, candidates: 60000, minFoodPlants: 10 },
    };
    const generationStart = performance.now();
    new Simulation(seed, { ...data, humans }); // the world alone, to time its generation
    const generationMs = performance.now() - generationStart;
    const simulation = new Simulation(seed, { ...data, humans }, { ecosystemWarmupDays: warmupDays });
    const warmupMs = performance.now() - generationStart - generationMs;
    simulation.step(data.time.ticksPerDay); // first day of the humans, not measured
    let total = 0;
    let worstDayMs = 0;
    for (let d = 0; d < days; d++) {
      const dayStart = performance.now();
      simulation.step(data.time.ticksPerDay);
      const dayMs = performance.now() - dayStart;
      total += dayMs;
      worstDayMs = Math.max(worstDayMs, dayMs);
    }
    const msPerDay = total / days;
    const step: LoadTestStep = {
      humans: simulation.humans.people.count,
      camps: simulation.humans.camps.length,
      animals: simulation.fauna.store.living,
      plants: simulation.flora.countLiving(),
      generationMs,
      warmupMs,
      msPerDay,
      worstDayMs,
      x500Share: msPerDay / X500_DAY_BUDGET_MS,
      maxSpeed: realMsPerDayAtX1 / msPerDay,
      memoryMb: process.memoryUsage().rss / BYTES_PER_MB,
    };
    steps.push(step);
    onStep(step);
  }
  return { seed, days, warmupYears: options.warmupYears ?? ECOSYSTEM_WARMUP_YEARS, steps, advisedHumans: advisedHumans(steps) };
}

/** Humans for which a game day takes BUDGET_SHARE of the x500 budget (linear interpolation). */
function advisedHumans(steps: readonly LoadTestStep[]): number {
  const budget = X500_DAY_BUDGET_MS * BUDGET_SHARE;
  let max = 0;
  for (let k = 0; k < steps.length; k++) {
    const current = steps[k]!;
    if (current.msPerDay <= budget) {
      max = current.humans;
      continue;
    }
    const previous = steps[k - 1];
    if (previous) max = Math.round(previous.humans + ((budget - previous.msPerDay) / (current.msPerDay - previous.msPerDay)) * (current.humans - previous.humans));
    break;
  }
  return max;
}
