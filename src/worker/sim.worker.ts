/// <reference lib="webworker" />
/**
 * Simulation thread. Generates the world (without blocking the window), sends it to the display,
 * then runs the simulation in real time at the chosen speed, sending the date, the climate of
 * each new day and the new journal events.
 */
import { formatDate, dateAtTick } from '../sim/core/calendar';
import { Simulation } from '../sim/core/simulation';
import { loadGameData } from '../sim/core/game-data';
import { daysPerYear } from '../sim/core/time-params';
import { Workshop, type WorkshopResult } from '../sim/core/workshop';
import { loadWorld, saveWorld } from '../sim/core/save/save';
import { describeGroups } from '../sim/systems/groups/describe';
import { describeIdeas } from '../sim/systems/ideas/describe';
import type { FromSimMessage, JournalEntry, LifeTables, SaveReason, ToSimMessage } from '../shared/messages';
import { PerfMeter } from './perf-meter';
import { snapshotWorld } from './world-snapshot';
import { inspect, snapshotFauna, snapshotFlora } from './life-snapshots';
import { describePerson, snapshotHumanStats, snapshotHumans, snapshotRoster } from './human-snapshots';
import { describeBuilding, snapshotBuildings } from './building-snapshots';
import { STATE_NAMES } from '../sim/systems/fauna/animal-store';

declare const self: DedicatedWorkerGlobalScope;

/** How often the worker wakes up to catch up with real time (technical, not gameplay). */
const LOOP_INTERVAL_MS = 50;
const MS_PER_SECOND = 1000;
/** If the computer falls behind, at most this much real time is caught up at once. */
const MAX_CATCH_UP_SECONDS = 0.5;
/**
 * Computation allowed per loop (technical). When the simulation cannot keep up with the requested
 * speed, the rest is dropped: the game slows down instead of freezing, and the perf panel shows the
 * speed really reached. No population cap is imposed.
 */
const STEP_BUDGET_MS = 40;
/** Ticks computed between two looks at the clock (a quarter of a game hour at 4 800 ticks a day). */
const TICKS_PER_CHUNK = 50;
const PERF_INTERVAL_MS = 500;

const MS_PER_MINUTE = 60_000;

const workshop = new Workshop();
/** Real time of the last save (automatic saves count from there), and whether the world is the render test's. */
let lastSaveAt = 0;
let benchmarkWorld = false;
const perf = new PerfMeter();
let lastPerfAt = 0;
let simulation: Simulation | undefined;
let loop: ReturnType<typeof setInterval> | undefined;
let paused = false;
let speedIndex = 0;
let pendingTicks = 0;
let lastLoopAt = 0;
let sentClimateVersion = -1;
let sentAnomalies: unknown = null;
let sentEvents = 0;
let sentFloraDay = -1;
let sentSamples = 0;
let sentHumanSamples = 0;
let sentRosterDay = -1;
let sentRosterCount = 0;
let sentRosterLiving = 0;
let sentFaunaStep = -1;
let sentHumanStep = -1;

/** The plants change slowly: the display gets them every few game days (technical setting). */
const FLORA_SEND_INTERVAL_DAYS = 2;

function post(message: FromSimMessage, transfer: Transferable[] = []): void {
  self.postMessage(message, transfer);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function start(seed: number, benchmark?: { warmupYears: number }): void {
  if (loop !== undefined) clearInterval(loop);
  loop = undefined;
  simulation = undefined;
  post({ type: 'worldGenerating', seed });

  const generationStart = performance.now();
  let created: Simulation;
  try {
    if (benchmark) {
      const data = loadGameData();
      const yearDays = data.time.daysPerSeason * data.time.seasons.length;
      created = new Simulation(seed, data, { ecosystemWarmupDays: benchmark.warmupYears * yearDays });
    } else created = new Simulation(seed, workshop.dataForNewWorld());
  } catch (error) {
    post({ type: 'error', message: errorMessage(error) });
    return;
  }
  workshop.attach(created);
  begin(created, performance.now() - generationStart, benchmark !== undefined, null);
}

/** Replaces the running world by a saved one; if the save cannot be loaded, the world goes on. */
function load(body: Uint8Array, label: string): void {
  const startedAt = performance.now();
  let loaded: ReturnType<typeof loadWorld>;
  try {
    loaded = loadWorld(body);
  } catch (error) {
    post({ type: 'saveFailed', requestId: -1, message: errorMessage(error) });
    return;
  }
  if (loop !== undefined) clearInterval(loop);
  loop = undefined;
  post({ type: 'worldGenerating', seed: loaded.simulation.seed });
  workshop.restore(loaded.workshop, loaded.simulation);
  begin(loaded.simulation, performance.now() - startedAt, false, label);
  publishWorkshop();
}

/** Saves the running world (never the render test's world). */
function save(requestId: number, reason: SaveReason): void {
  const current = simulation;
  if (!current || benchmarkWorld) {
    post({ type: 'saveFailed', requestId, message: 'Aucun monde à sauvegarder.' });
    return;
  }
  if (reason === 'quit' && !current.data.time.autosave.onQuit) {
    post({ type: 'saveFailed', requestId, message: 'Sauvegarde à la fermeture désactivée (Atelier).' });
    return;
  }
  try {
    const { meta, body } = saveWorld(current, workshop.state());
    lastSaveAt = performance.now();
    post({ type: 'saveData', requestId, reason, meta, body, autosaveSlots: current.data.time.autosave.slots }, [body.buffer]);
  } catch (error) {
    post({ type: 'saveFailed', requestId, message: errorMessage(error) });
  }
}

/** Shows a world (new or loaded) and runs it. */
function begin(created: Simulation, generationMs: number, benchmark: boolean, loadedFrom: string | null): void {
  simulation = created;
  benchmarkWorld = benchmark;
  lastSaveAt = performance.now();
  perf.reset();
  const { snapshot, transfer } = snapshotWorld(created.world);
  post(
    {
      type: 'worldReady',
      seed: created.seed,
      world: snapshot,
      generationMs,
      speeds: created.data.time.speeds,
      climate: created.data.climate,
      daysPerYear: daysPerYear(created.data.time),
      life: lifeTables(created),
      roster: snapshotRoster(created),
      weatherRegionTiles: created.data.weather.regionTiles,
      motion: {
        ticksPerHumanStep: created.ticksPerHumanStep,
        ticksPerAnimalStep: created.ticksPerStep,
        hoursPerHumanStep: 1 / created.data.humans.stepsPerHour,
        hoursPerAnimalStep: created.fauna.hoursPerStep,
      },
      benchmark,
      loadedFrom,
    },
    transfer,
  );

  sentClimateVersion = -1;
  sentAnomalies = null;
  sentEvents = 0;
  sentFloraDay = -1;
  sentFaunaStep = -1;
  sentHumanStep = -1;
  sentSamples = 0;
  sentHumanSamples = 0;
  sentRosterDay = -1;
  sentRosterCount = created.humans.people.count;
  pendingTicks = 0;
  lastLoopAt = performance.now();
  publishChanges(created);
  loop = setInterval(runLoop, LOOP_INTERVAL_MS);
}

function lifeTables(current: Simulation): LifeTables {
  return {
    plants: current.data.flora.species,
    animals: current.data.fauna.species,
    resources: current.data.resources,
    animalStates: STATE_NAMES,
    buildings: current.data.buildings.buildings.map((building) => ({ id: building.id, name: building.name, function: building.function })),
    items: current.data.items.items.map((item) => ({ name: item.name, category: item.category })),
  };
}

function runLoop(): void {
  const current = simulation;
  if (!current) return;
  const now = performance.now();
  const realMs = now - lastLoopAt;
  const elapsedSeconds = Math.min(MAX_CATCH_UP_SECONDS, realMs / MS_PER_SECOND);
  lastLoopAt = now;
  let done = 0;
  let computeMs = 0;
  if (!paused) {
    const { ticksPerRealSecond, speeds } = current.data.time;
    pendingTicks += elapsedSeconds * ticksPerRealSecond * (speeds[speedIndex] ?? 1);
    const wanted = Math.floor(pendingTicks);
    const startedAt = performance.now();
    while (done < wanted && performance.now() - startedAt < STEP_BUDGET_MS) {
      const ticks = Math.min(TICKS_PER_CHUNK, wanted - done);
      current.step(ticks);
      done += ticks;
    }
    computeMs = performance.now() - startedAt;
    // What could not be computed in time is dropped (the game slows down), only the fraction is kept.
    pendingTicks -= wanted;
  }
  perf.add(realMs, computeMs, done);
  const { everyMinutes } = current.data.time.autosave;
  if (!paused && everyMinutes > 0 && now - lastSaveAt >= everyMinutes * MS_PER_MINUTE) save(-1, 'auto');
  publishChanges(current);
  if (now - lastPerfAt >= PERF_INTERVAL_MS) {
    lastPerfAt = now;
    publishPerf(current);
  }
}

function publishPerf(current: Simulation): void {
  const { ticksPerDay, ticksPerRealSecond, speeds } = current.data.time;
  post({
    type: 'perf',
    perf: {
      ...perf.summary(ticksPerDay, ticksPerRealSecond, STEP_BUDGET_MS / LOOP_INTERVAL_MS),
      requestedSpeed: speeds[speedIndex] ?? 1,
      paused,
      humans: current.humans.people.living,
      animals: current.fauna.store.living,
      plants: current.flora.countLiving(),
    },
  });
}

function publishWorkshop(result: WorkshopResult = { ok: true, messages: [] }): void {
  post({
    type: 'workshop',
    workshop: { variables: workshop.variables(), presetName: workshop.presetName, modified: workshop.modified, messages: result.messages, ok: result.ok },
  });
  const current = simulation;
  if (!current) return;
  speedIndex = Math.min(speedIndex, current.data.time.speeds.length - 1);
  post({ type: 'liveTables', climate: current.data.climate, life: lifeTables(current), speeds: current.data.time.speeds });
}

/** Sends what changed since the last loop: climate (once per day), new events, date. */
function publishChanges(current: Simulation): void {
  const climate = current.climate;
  if (climate.anomalies !== sentAnomalies) {
    // A new year began: the abnormal years changed (the array is replaced each year).
    sentAnomalies = climate.anomalies;
    const anomalyIndex = climate.anomalyIndex.slice();
    const anomalyWeight = climate.anomalyWeight.slice();
    post({ type: 'climateYear', year: { anomalyIndex, anomalyWeight, anomalies: climate.anomalies } }, [anomalyIndex.buffer, anomalyWeight.buffer]);
  }
  if (current.climateVersion !== sentClimateVersion) {
    sentClimateVersion = current.climateVersion;
    post({ type: 'climateDay', dayOfYear: climate.dayOfYear });
    post({ type: 'weather', regions: current.weather.regions.slice() });
  }
  const day = current.date.absoluteDay;
  if (sentFloraDay < 0 || day - sentFloraDay >= FLORA_SEND_INTERVAL_DAYS) {
    sentFloraDay = day;
    const flora = snapshotFlora(current);
    post({ type: 'flora', flora: flora.snapshot }, flora.transfer);
  }
  // Beings move only at their steps: positions are sent when a step happened (or a new world began).
  if (current.fauna.step !== sentFaunaStep) {
    sentFaunaStep = current.fauna.step;
    const fauna = snapshotFauna(current);
    post({ type: 'fauna', fauna: fauna.snapshot }, fauna.transfer);
  }
  // Births, ages and couples change the roster: sent again when someone is born, and once a day.
  const count = current.humans.people.count;
  const living = current.humans.people.living;
  if (count !== sentRosterCount || living !== sentRosterLiving || day !== sentRosterDay) {
    sentRosterCount = count;
    sentRosterLiving = living;
    sentRosterDay = day;
    post({ type: 'roster', roster: snapshotRoster(current) });
    post({ type: 'groups', groups: describeGroups(current.groups) });
    post({ type: 'ideas', ideas: describeIdeas(current.ideas) });
    const stats = snapshotHumanStats(current, sentHumanSamples);
    sentHumanSamples += stats.samples.length;
    post({ type: 'humanStats', stats });
  }
  if (current.humans.step !== sentHumanStep) {
    sentHumanStep = current.humans.step;
    const humans = snapshotHumans(current);
    post({ type: 'humans', humans: humans.snapshot }, humans.transfer);
  }
  post({ type: 'buildings', buildings: snapshotBuildings(current) });
  const history = current.fauna.census.history;
  if (history.length > sentSamples) {
    post({ type: 'populations', samples: history.slice(sentSamples) });
    sentSamples = history.length;
  }
  if (current.journal.size > sentEvents) {
    const time = current.data.time;
    const entries: JournalEntry[] = current.journal.since(sentEvents).map((event) => ({
      id: event.id,
      date: formatDate(dateAtTick(event.tick, time), time),
      text: event.text,
      place: event.place,
      causes: event.causes,
      people: event.actors.flatMap((actor) => (actor.kind === 'human' ? [actor.id] : [])),
    }));
    sentEvents = current.journal.size;
    post({ type: 'journal', entries });
  }
  post({
    type: 'status',
    seed: current.seed,
    tick: current.clock.tick,
    date: `${formatDate(current.date, current.data.time)} · ${Math.floor(current.hour)} h`,
    hour: current.hour,
    paused,
    speedIndex,
  });
}

self.onmessage = (event: MessageEvent<ToSimMessage>) => {
  const message = event.data;
  switch (message.type) {
    case 'start':
      start(message.seed, message.benchmark);
      return;
    case 'setSpeed':
      if (simulation && message.speedIndex >= 0 && message.speedIndex < simulation.data.time.speeds.length) {
        speedIndex = message.speedIndex;
        paused = false;
      }
      return;
    case 'setPaused':
      paused = message.paused;
      return;
    case 'inspectPerson': {
      const details = simulation ? describePerson(simulation, message.requestId, message.person) : null;
      if (details) post({ type: 'person', details });
      return;
    }
    case 'inspectBuilding': {
      const details = simulation ? describeBuilding(simulation, message.requestId, message.building) : null;
      if (details) post({ type: 'building', details });
      return;
    }
    case 'inspect':
      if (simulation) post({ type: 'inspection', inspection: inspect(simulation, message.requestId, message.tile, message.animalUid) });
      return;
    case 'workshopGet':
      publishWorkshop();
      return;
    case 'workshopSet':
      publishWorkshop(workshop.set(message.file, message.key, message.value));
      return;
    case 'workshopReset':
      publishWorkshop(workshop.reset(message.file, message.key));
      return;
    case 'workshopResetAll':
      publishWorkshop(workshop.resetAll());
      return;
    case 'workshopLoadPreset':
      publishWorkshop(workshop.loadPreset(message.preset));
      return;
    case 'workshopMakePreset':
      post({ type: 'workshopPreset', preset: workshop.toPreset(message.name) });
      return;
    case 'workshopSaved':
      workshop.markSaved(message.name);
      publishWorkshop();
      return;
    case 'save':
      save(message.requestId, message.reason);
      return;
    case 'load':
      load(message.body, message.label);
      return;
  }
};
