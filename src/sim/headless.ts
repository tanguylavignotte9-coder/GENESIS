import { isExileCamp } from './systems/groups/describe';
import { DOMESTIC_EVENTS } from './systems/fauna/domestic';
import { HUSBANDRY_EVENTS } from './systems/production/husbandry';
import { DeathCause as FaunaDeath } from './systems/fauna/fauna-system';
import { dateAtTick, formatDate } from './core/calendar';
import type { GameData } from './core/game-data';
import { Simulation } from './core/simulation';
import { ticksPerYear } from './core/time-params';
import { MIGRATION_START, POPULATION_COLLAPSE, SPECIES_EXTINCT } from './systems/fauna/fauna-events';
import { ANOMALY_START } from './systems/world/anomalies';
import { CAMP_MOVED } from './systems/individuals/camp-move';
import { BUILDING_DONE, FIRST_ITEM } from './systems/production/events';
import { COUPLE_FORMED, FALLING_OUT, GREAT_FRIENDSHIP, MOURNING, SEPARATION } from './systems/individuals/social/milestones';
import { EPIDEMIC_START } from './systems/individuals/life/disease';
import { FAMINE } from './systems/individuals/life/life-cycle';
import { ADOPTION } from './systems/individuals/life/orphans';
import { GROUP_EVENTS } from './systems/groups/texts';
import { IDEA_EVENTS } from './systems/ideas/texts';
import { Family } from './systems/ideas/idea';

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
  humans: {
    start: number;
    alive: number;
    /** Most people alive at once (at the censuses). */
    peak: number;
    births: number;
    stillbirths: number;
    deaths: { cause: string; count: number }[];
    /** Share of the children born who died before 1 year, and before the adult age. */
    infantMortality: number;
    childMortality: number;
    /** Mean age at death of those who reached adulthood. */
    adultLifespan: number;
    oldest: number;
    epidemics: number;
    famines: number;
    adoptions: number;
    /** Every 10 years: year, people alive, ms per game day over the decade. */
    timeline: { year: number; alive: number; msPerDay: number }[];
    /** Epidemics, famines and orphans taken in, dated. */
    lifeEvents: string[];
  };
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
  /** Groups: tribes alive, regimes seen, splits, mergers…, and the political events, dated. */
  groups: {
    tribesAlive: number;
    exileCamps: number;
    tribesEver: number;
    clansEver: number;
    /** Regimes held by tribes and clans at some point (name, groups that had it). */
    regimes: { name: string; groups: number }[];
    counts: Record<keyof typeof GROUP_EVENTS, number>;
    events: string[];
  };
  /** Ideas: how many of each family were born and are still carried, and the dated stories. */
  ideas: {
    discoveries: number;
    lost: number;
    knowledgeKnown: string[];
    cultures: { ever: number; alive: number };
    languages: { ever: number; alive: number };
    religions: { ever: number; alive: number };
    /** Adults alive at the end without religion, once at least one religion exists in their tribe's world, and those who lost a faith. */
    unbelievers: { adults: number; without: number; lostFaith: number; faithLost: number; conversions: number };
    currencies: string[];
    places: number;
    events: string[];
  };
  /** Violence and diplomacy (step 11): counts, violent deaths, tribes at war, and the dated stories. */
  conflict: {
    counts: Record<string, number>;
    violentDeaths: number;
    tribesAlive: number;
    atWar: number;
    events: string[];
  };
  /** Predators alive at the end (wolves, lions). */
  predators: { name: string; count: number }[];
  /** Husbandry: domestic animals alive at the end (by species), captures, escapes, animals stolen, first slaughters. */
  husbandry: {
    herds: { name: string; count: number }[];
    captures: number;
    escapes: number;
    stolen: number;
    slaughters: number;
    /** Other deaths of domestic animals (age, hunger, predators, disease…) and herds left behind by a camp that is no more. */
    otherDeaths: number;
    released: number;
  };
  /** Mean computation time of one game day, in ms (world generation excluded). */
  msPerDay: number;
  /** First draws of the seeded generator after the run: identical for identical seeds. */
  randomFingerprint: number[];
}

/** Generates a world then runs the simulation without any display for `years` game years. */
export function runHeadless(
  seed: number,
  years: number,
  data: GameData,
  now: () => number = () => 0,
  options: { stopWhenExtinct?: boolean; from?: Simulation | undefined; onDone?: ((simulation: Simulation) => void) | undefined } = {},
): HeadlessReport {
  // From a save, the world goes on with its own data and seed.
  const simulation = options.from ?? new Simulation(seed, data);
  seed = simulation.seed;
  data = simulation.data;
  const startCounts = simulation.fauna.countBySpecies();
  const startTick = simulation.clock.tick;
  const startYear = Math.floor(startTick / ticksPerYear(data.time));
  const ticks = years * ticksPerYear(data.time);
  const startedAt = now();
  const timeline: HeadlessReport['humans']['timeline'] = [];
  const yearDays = data.time.daysPerSeason * data.time.seasons.length;
  for (let year = 0; year < years; year += TIMELINE_YEARS) {
    const span = Math.min(TIMELINE_YEARS, years - year);
    const at = now();
    simulation.step(span * ticksPerYear(data.time));
    timeline.push({ year: startYear + year + span, alive: simulation.humans.people.living, msPerDay: (now() - at) / (span * yearDays) });
    if (simulation.humans.people.living === 0 && options.stopWhenExtinct) break;
  }
  const elapsed = now() - startedAt;
  options.onDone?.(simulation);

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
    humans: summarizeHumans(simulation, timeline),
    production: summarizeProduction(simulation),
    groups: summarizeGroups(simulation),
    ideas: summarizeIdeas(simulation),
    conflict: summarizeConflict(simulation),
    husbandry: summarizeHusbandry(simulation),
    predators: ['wolf', 'lion'].map((id) => {
      const code = simulation.data.fauna.species.findIndex((species) => species.id === id);
      let count = 0;
      for (let slot = 0; slot < simulation.fauna.store.slots; slot++) if (simulation.fauna.store.alive[slot] === 1 && simulation.fauna.store.species[slot] === code) count++;
      return { name: simulation.data.fauna.species[code]?.name ?? id, count };
    }),
    msPerDay: ticks > 0 ? elapsed / ((simulation.clock.tick - startTick) / data.time.ticksPerDay) : 0,
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

const DEATH_CAUSES = ['', 'faim', 'soif', 'froid', 'prédateur', 'vieillesse', 'maladie', 'en couches', 'violence'];
/** Years between two points of the timeline. */
const TIMELINE_YEARS = 10;
const LIFE_EVENTS = [EPIDEMIC_START, FAMINE, ADOPTION];

function summarizeHumans(simulation: Simulation, timeline: HeadlessReport['humans']['timeline']): HeadlessReport['humans'] {
  const { people, life } = simulation.humans;
  const counts = DEATH_CAUSES.map(() => 0);
  const adultAge = life.params.stages.adultAge;
  let born = 0;
  let deadBabies = 0;
  let deadChildren = 0;
  let adultDeaths = 0;
  let adultYears = 0;
  let oldest = 0;
  for (let p = 0; p < people.count; p++) {
    oldest = Math.max(oldest, people.ageYears[p]!);
    if (p >= simulation.humans.startingCount) born++;
    if (people.alive[p] === 1) continue;
    counts[people.deathCause[p]!]!++;
    const age = people.ageYears[p]!;
    if (age >= adultAge) {
      adultDeaths++;
      adultYears += age;
    } else if (p >= simulation.humans.startingCount) {
      deadChildren++;
      if (age < 1) deadBabies++;
    }
  }
  const time = simulation.data.time;
  return {
    start: simulation.humans.startingCount,
    alive: people.living,
    peak: Math.max(simulation.humans.startingCount, ...life.census.map((sample) => sample.humans)),
    births: life.births,
    stillbirths: life.stillbirths,
    deaths: DEATH_CAUSES.flatMap((cause, k) => (k > 0 && counts[k]! > 0 ? [{ cause, count: counts[k]! }] : [])),
    infantMortality: born > 0 ? deadBabies / born : 0,
    childMortality: born > 0 ? deadChildren / born : 0,
    adultLifespan: adultDeaths > 0 ? adultYears / adultDeaths : 0,
    oldest,
    epidemics: life.epidemicCount + life.epidemics.size,
    famines: life.famineCount,
    adoptions: life.adoptions,
    timeline,
    lifeEvents: simulation.journal
      .all()
      .filter((event) => LIFE_EVENTS.includes(event.type))
      .map((event) => `${formatDate(dateAtTick(event.tick, time), time)} — ${event.text}`),
  };
}

/** Political events listed in the summary (the many leader designations of bands are not). */
const POLITICAL_EVENTS: readonly string[] = [GROUP_EVENTS.founded, GROUP_EVENTS.regime, GROUP_EVENTS.overthrown, GROUP_EVENTS.contested, GROUP_EVENTS.succession, GROUP_EVENTS.religion, GROUP_EVENTS.scission, GROUP_EVENTS.fusion, GROUP_EVENTS.alliance, GROUP_EVENTS.betrayal, GROUP_EVENTS.contact, GROUP_EVENTS.move, GROUP_EVENTS.dissolved, GROUP_EVENTS.rule, GROUP_EVENTS.strategy, CAMP_MOVED];

function summarizeGroups(simulation: Simulation): HeadlessReport['groups'] {
  const { groups, journal } = simulation;
  const time = simulation.data.time;
  const events = journal.all();
  const counts = Object.fromEntries(Object.entries(GROUP_EVENTS).map(([key, type]) => [key, events.filter((event) => event.type === type).length])) as Record<keyof typeof GROUP_EVENTS, number>;
  counts.move = events.filter((event) => event.type === CAMP_MOVED).length;
  // Regimes seen: the founding regime of each tribe and clan, plus every regime change.
  const seen = new Map<string, Set<number>>();
  const add = (regime: string, group: number): void => {
    const set = seen.get(regime) ?? new Set<number>();
    set.add(group);
    seen.set(regime, set);
  };
  for (const group of groups.groups) if (group.level < 2) add(groups.params.regimes[group.regime]!.id, group.id);
  for (const event of events) if (event.type === GROUP_EVENTS.regime) add(String(event.details['from']), Number(event.details['group']));
  return {
    // A lone exile's camp is not a people: counted apart.
    tribesAlive: groups.tribes().filter((tribe) => !isExileCamp(tribe)).length,
    exileCamps: groups.tribes().filter((tribe) => isExileCamp(tribe)).length,
    tribesEver: groups.groups.filter((group) => group.level === 0).length,
    clansEver: groups.groups.filter((group) => group.level === 1).length,
    regimes: groups.params.regimes.flatMap((regime) => (seen.has(regime.id) ? [{ name: regime.name, groups: seen.get(regime.id)!.size }] : [])),
    counts,
    events: events.filter((event) => POLITICAL_EVENTS.includes(event.type)).map((event) => `${formatDate(dateAtTick(event.tick, time), time)} — ${event.text}`),
  };
}

/** Idea events listed in the summary (all of them: discoveries, losses, births of cultures, languages, religions…). */
function summarizeIdeas(simulation: Simulation): HeadlessReport['ideas'] {
  const { ideas, journal } = simulation;
  const time = simulation.data.time;
  const events = journal.all().filter((event) => event.type.startsWith('ideas.'));
  const family = (f: number): { ever: number; alive: number } => ({
    ever: ideas.ideas.filter((idea) => idea.family === f).length,
    alive: ideas.ideas.filter((idea) => idea.family === f && idea.alive && idea.holders > 0).length,
  });
  const known = simulation.data.knowledge.knowledge.filter((_, k) => {
    for (let p = 0; p < simulation.humans.people.count; p++) if (simulation.humans.people.alive[p] === 1 && ideas.holdings.knows(p, k)) return true;
    return false;
  });
  return {
    discoveries: events.filter((event) => event.type === IDEA_EVENTS.discovery).length,
    lost: events.filter((event) => event.type === IDEA_EVENTS.lost).length,
    knowledgeKnown: known.map((item) => item.name),
    cultures: family(Family.Culture),
    languages: family(Family.Language),
    religions: family(Family.Religion),
    unbelievers: countUnbelievers(simulation, events),
    currencies: ideas.ideas.filter((idea) => idea.family === Family.Currency).map((idea) => idea.name),
    places: ideas.toponyms.names.size,
    events: events.map((event) => `${formatDate(dateAtTick(event.tick, time), time)} — ${event.text}`),
  };
}

/** Adults without religion at the end (only counted when a religion exists in the world), faith lost and conversions told. */
function countUnbelievers(simulation: Simulation, events: readonly { type: string }[]): HeadlessReport['ideas']['unbelievers'] {
  const { ideas, humans } = simulation;
  const people = humans.people;
  const h = ideas.holdings;
  const anyFaith = ideas.ideas.some((idea) => idea.family === Family.Religion && idea.holders > 0);
  let adults = 0;
  let without = 0;
  let lostFaith = 0;
  for (let p = 0; p < people.count && p < h.count; p++) {
    if (people.alive[p] === 0 || humans.life.isChild(p)) continue;
    adults++;
    if (h.religion[p]! < 0) without++;
    if (h.religion[p]! < 0 && h.lostFaith[p] === 1) lostFaith++;
  }
  return {
    adults,
    without: anyFaith ? without : 0,
    lostFaith,
    faithLost: events.filter((event) => event.type === IDEA_EVENTS.faithLost).length,
    conversions: events.filter((event) => event.type === IDEA_EVENTS.conversion).length,
  };
}

function summarizeConflict(simulation: Simulation): HeadlessReport['conflict'] {
  const { conflict, journal, humans } = simulation;
  const time = simulation.data.time;
  let violent = 0;
  for (let p = 0; p < humans.people.count; p++) if (humans.people.alive[p] === 0 && humans.people.deathCause[p] === 8) violent++;
  const tribes = simulation.groups.tribes().filter((tribe) => tribe.members.length > 0 && !isExileCamp(tribe));
  return {
    counts: { ...conflict.counts },
    violentDeaths: violent,
    tribesAlive: tribes.length,
    atWar: [...conflict.relations.values()].filter((relation) => relation.state === 'war').length,
    events: journal
      .all()
      // Brawls are counted, not listed (there are hundreds): murders, feuds, raids, wars, treaties.
      .filter((event) => event.type.startsWith('conflict.') && event.type !== 'conflict.brawl')
      .map((event) => `${formatDate(dateAtTick(event.tick, time), time)} — ${event.text}`),
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

function summarizeHusbandry(simulation: Simulation): HeadlessReport['husbandry'] {
  const { store } = simulation.fauna;
  const counts = new Map<number, number>();
  for (let slot = 0; slot < store.slots; slot++) if (store.alive[slot] === 1 && store.ownerCamp[slot]! >= 0) counts.set(store.species[slot]!, (counts.get(store.species[slot]!) ?? 0) + 1);
  const count = (type: string): number => simulation.journal.all().filter((event) => event.type === type).length;
  return {
    herds: [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([code, n]) => ({ name: simulation.data.fauna.species[code]!.tameName, count: n })),
    captures: count(HUSBANDRY_EVENTS.capture),
    escapes: simulation.fauna.domesticTally.escaped,
    stolen: simulation.conflict.counts.animalsStolen,
    slaughters: simulation.fauna.domesticTally.deaths[FaunaDeath.Hunted]!,
    otherDeaths: simulation.fauna.domesticTally.deaths.reduce((sum, n, cause) => sum + (cause === FaunaDeath.Hunted ? 0 : n), 0),
    released: simulation.fauna.domesticTally.released,
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
