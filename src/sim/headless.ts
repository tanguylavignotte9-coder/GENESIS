import { dateAtTick, formatDate } from './core/calendar';
import type { GameData } from './core/game-data';
import { Simulation } from './core/simulation';
import { ticksPerYear } from './core/time-params';
import { MIGRATION_START, POPULATION_COLLAPSE, SPECIES_EXTINCT } from './systems/fauna/fauna-events';
import { ANOMALY_START } from './systems/world/anomalies';
import { CAMP_MOVED } from './systems/individuals/camp-move';
import { BUILDING_DONE, FIRST_ITEM } from './systems/production/events';
import { COUPLE_FORMED, FALLING_OUT, GREAT_FRIENDSHIP, MOURNING, SEPARATION } from './systems/individuals/social/milestones';

/** Social events listed in the summary. */
const SOCIAL_EVENTS = [COUPLE_FORMED, GREAT_FRIENDSHIP, FALLING_OUT, SEPARATION, MOURNING];

/** Number of random draws shown in the report to prove the seed's determinism. */
const FINGERPRINT_DRAWS = 3;

export interface AnomalySummary {
  /** Number of abnormal years started, per anomaly type name. */
  countsByType: { name: string; count: number }[];
  /** "Jour 1 · Printemps · An 3 — Une sécheresse frappe…" for each one, oldest first. */
  lines: string[];
}

export interface PopulationLine {
  name: string;
  start: number;
  end: number;
  /** Lowest and highest counts seen at the censuses. */
  min: number;
  max: number;
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
  animals: PopulationLine[];
  plants: { name: string; count: number }[];
  /** Notable fauna events (migrations, disappearances, collapses), by type. */
  faunaEvents: { migrations: number; extinctions: number; collapses: number; examples: string[] };
  humans: { start: number; alive: number; deaths: { cause: string; count: number }[] };
  /** Work and production over the period: the camps' common stocks at the end, buildings finished, firsts, moves. */
  production: {
    stock: { name: string; qty: number }[];
    built: { name: string; count: number }[];
    openSites: number;
    firstItems: string[];
    campMoves: string[];
    /** Couples, great friendships, falling-outs, separations and griefs, with their date. */
    social: string[];
  };
  /** Mean computation time of one game day, in ms (world generation excluded). */
  msPerDay: number;
  /** First draws of the seeded generator after the run: identical for identical seeds. */
  randomFingerprint: number[];
}

/** Generates a world then runs the simulation without any display for `years` game years. */
export function runHeadless(seed: number, years: number, data: GameData, now: () => number = () => 0): HeadlessReport {
  const simulation = new Simulation(seed, data);
  const startCounts = simulation.fauna.countBySpecies();
  const ticks = years * ticksPerYear(data.time);
  const startedAt = now();
  simulation.step(ticks);
  const elapsed = now() - startedAt;

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
    animals: summarizeAnimals(simulation, startCounts),
    plants: simulation.flora.countBySpecies().map((count, k) => ({ name: data.flora.species[k]?.name ?? '?', count })),
    faunaEvents: summarizeFaunaEvents(simulation),
    humans: summarizeHumans(simulation),
    production: summarizeProduction(simulation),
    msPerDay: ticks > 0 ? elapsed / (ticks / data.time.ticksPerDay) : 0,
    randomFingerprint,
  };
}

function summarizeAnimals(simulation: Simulation, startCounts: number[]): PopulationLine[] {
  const end = simulation.fauna.countBySpecies();
  const history = simulation.fauna.census.history;
  return simulation.data.fauna.species.map((species, k) => {
    const counts = [startCounts[k] ?? 0, ...history.map((sample) => sample.animals[k] ?? 0), end[k] ?? 0];
    return { name: species.name, start: startCounts[k] ?? 0, end: end[k] ?? 0, min: Math.min(...counts), max: Math.max(...counts) };
  });
}

const DEATH_CAUSES = ['', 'faim', 'soif', 'froid', 'prédateur'];

function summarizeHumans(simulation: Simulation): HeadlessReport['humans'] {
  const { people } = simulation.humans;
  const counts = DEATH_CAUSES.map(() => 0);
  for (let p = 0; p < people.count; p++) if (people.alive[p] === 0) counts[people.deathCause[p]!]!++;
  return {
    start: people.count,
    alive: people.living,
    deaths: DEATH_CAUSES.flatMap((cause, k) => (k > 0 && counts[k]! > 0 ? [{ cause, count: counts[k]! }] : [])),
  };
}

function summarizeFaunaEvents(simulation: Simulation): HeadlessReport['faunaEvents'] {
  const events = simulation.journal.all();
  const time = simulation.data.time;
  const notable = events.filter((event) => event.type === SPECIES_EXTINCT || event.type === POPULATION_COLLAPSE);
  return {
    migrations: events.filter((event) => event.type === MIGRATION_START).length,
    extinctions: events.filter((event) => event.type === SPECIES_EXTINCT).length,
    collapses: events.filter((event) => event.type === POPULATION_COLLAPSE).length,
    examples: notable.slice(0, 8).map((event) => `${formatDate(dateAtTick(event.tick, time), time)} — ${event.text}`),
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

function summarizeProduction(simulation: Simulation): HeadlessReport['production'] {
  const { production, journal } = simulation;
  const time = simulation.data.time;
  const totals = new Map<number, number>();
  for (const camp of production.camps) for (const pile of camp?.stock.piles ?? []) totals.set(pile.item, (totals.get(pile.item) ?? 0) + pile.qty);
  const built = new Map<string, number>();
  for (const event of journal.all()) {
    if (event.type !== BUILDING_DONE) continue;
    const id = String(event.details['building']);
    built.set(id, (built.get(id) ?? 0) + 1);
  }
  const dated = (type: string): string[] =>
    journal
      .all()
      .filter((event) => event.type === type)
      .map((event) => `${formatDate(dateAtTick(event.tick, time), time)} — ${event.text}`);
  return {
    stock: [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([item, qty]) => ({ name: production.catalog.items[item]!.name, qty })),
    built: [...built.entries()].map(([id, count]) => ({ name: production.catalog.building(id)?.def.name ?? id, count })),
    openSites: production.buildings.filter((building) => building.state === 0).length,
    firstItems: dated(FIRST_ITEM),
    campMoves: dated(CAMP_MOVED),
    social: journal
      .all()
      .filter((event) => SOCIAL_EVENTS.includes(event.type))
      .map((event) => `${formatDate(dateAtTick(event.tick, time), time)} — ${event.text}`),
  };
}
