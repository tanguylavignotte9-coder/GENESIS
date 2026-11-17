/// <reference lib="webworker" />
/**
 * Simulation thread. Generates the world (without blocking the window), sends it to the display,
 * then drives the simulation clock in real time (x1 speed).
 */
import { loadGameData, type GameData } from '../sim/core/game-data';
import { Simulation } from '../sim/core/simulation';
import type { FromSimMessage, ToSimMessage } from '../shared/messages';
import { snapshotWorld } from './world-snapshot';

declare const self: DedicatedWorkerGlobalScope;

/** How often the worker wakes up to catch up with real time (technical, not gameplay). */
const LOOP_INTERVAL_MS = 50;
const MS_PER_SECOND = 1000;

let loop: ReturnType<typeof setInterval> | undefined;
let data: GameData | undefined;

function post(message: FromSimMessage, transfer: Transferable[] = []): void {
  self.postMessage(message, transfer);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function start(seed: number): void {
  if (loop !== undefined) clearInterval(loop);
  loop = undefined;
  post({ type: 'worldGenerating', seed });

  let simulation: Simulation;
  const generationStart = performance.now();
  try {
    data ??= loadGameData();
    simulation = new Simulation(seed, data);
  } catch (error) {
    post({ type: 'error', message: errorMessage(error) });
    return;
  }
  const generationMs = performance.now() - generationStart;
  const { snapshot, transfer } = snapshotWorld(simulation.world);
  post({ type: 'worldReady', seed, world: snapshot, generationMs }, transfer);

  const startedAt = performance.now();
  const { ticksPerRealSecond } = simulation.data.time;
  loop = setInterval(() => {
    const elapsedSeconds = (performance.now() - startedAt) / MS_PER_SECOND;
    const targetTick = Math.floor(elapsedSeconds * ticksPerRealSecond);
    simulation.step(targetTick - simulation.clock.tick);
    post({ type: 'status', seed: simulation.seed, tick: simulation.clock.tick });
  }, LOOP_INTERVAL_MS);
}

self.onmessage = (event: MessageEvent<ToSimMessage>) => {
  if (event.data.type === 'start') start(event.data.seed);
};
