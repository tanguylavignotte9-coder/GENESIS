/// <reference lib="webworker" />
/**
 * Simulation thread. Generates the world (without blocking the window), sends it to the display,
 * then runs the simulation in real time at the chosen speed, sending the date, the climate of
 * each new day and the new journal events.
 */
import { formatDate, dateAtTick } from '../sim/core/calendar';
import { loadGameData, type GameData } from '../sim/core/game-data';
import { Simulation } from '../sim/core/simulation';
import { daysPerYear } from '../sim/core/time-params';
import type { FromSimMessage, JournalEntry, ToSimMessage } from '../shared/messages';
import { snapshotWorld } from './world-snapshot';

declare const self: DedicatedWorkerGlobalScope;

/** How often the worker wakes up to catch up with real time (technical, not gameplay). */
const LOOP_INTERVAL_MS = 50;
const MS_PER_SECOND = 1000;
/** If the computer falls behind, at most this much real time is caught up at once. */
const MAX_CATCH_UP_SECONDS = 0.5;

let data: GameData | undefined;
let simulation: Simulation | undefined;
let loop: ReturnType<typeof setInterval> | undefined;
let paused = false;
let speedIndex = 0;
let pendingTicks = 0;
let lastLoopAt = 0;
let sentClimateVersion = -1;
let sentAnomalies: unknown = null;
let sentEvents = 0;

function post(message: FromSimMessage, transfer: Transferable[] = []): void {
  self.postMessage(message, transfer);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function start(seed: number): void {
  if (loop !== undefined) clearInterval(loop);
  loop = undefined;
  simulation = undefined;
  post({ type: 'worldGenerating', seed });

  const generationStart = performance.now();
  let created: Simulation;
  try {
    data ??= loadGameData();
    created = new Simulation(seed, data);
  } catch (error) {
    post({ type: 'error', message: errorMessage(error) });
    return;
  }
  simulation = created;
  const generationMs = performance.now() - generationStart;
  const { snapshot, transfer } = snapshotWorld(created.world);
  post(
    { type: 'worldReady', seed, world: snapshot, generationMs, speeds: created.data.time.speeds, climate: created.data.climate, daysPerYear: daysPerYear(created.data.time) },
    transfer,
  );

  sentClimateVersion = -1;
  sentAnomalies = null;
  sentEvents = 0;
  pendingTicks = 0;
  lastLoopAt = performance.now();
  publishChanges(created);
  loop = setInterval(runLoop, LOOP_INTERVAL_MS);
}

function runLoop(): void {
  const current = simulation;
  if (!current) return;
  const now = performance.now();
  const elapsedSeconds = Math.min(MAX_CATCH_UP_SECONDS, (now - lastLoopAt) / MS_PER_SECOND);
  lastLoopAt = now;
  if (!paused) {
    const { ticksPerRealSecond, speeds } = current.data.time;
    pendingTicks += elapsedSeconds * ticksPerRealSecond * (speeds[speedIndex] ?? 1);
    const ticks = Math.floor(pendingTicks);
    pendingTicks -= ticks;
    current.step(ticks);
  }
  publishChanges(current);
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
  }
  if (current.journal.size > sentEvents) {
    const time = current.data.time;
    const entries: JournalEntry[] = current.journal.since(sentEvents).map((event) => ({
      id: event.id,
      date: formatDate(dateAtTick(event.tick, time), time),
      text: event.text,
      place: event.place,
      causes: event.causes,
    }));
    sentEvents = current.journal.size;
    post({ type: 'journal', entries });
  }
  post({
    type: 'status',
    seed: current.seed,
    tick: current.clock.tick,
    date: formatDate(current.date, current.data.time),
    paused,
    speedIndex,
  });
}

self.onmessage = (event: MessageEvent<ToSimMessage>) => {
  const message = event.data;
  switch (message.type) {
    case 'start':
      start(message.seed);
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
  }
};
