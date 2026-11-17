/// <reference lib="webworker" />
/**
 * Simulation thread. Owns the Simulation and drives its clock in real time
 * (x1 speed), then reports its state to the display.
 */
import { loadGameData } from '../sim/core/game-data';
import { Simulation } from '../sim/core/simulation';
import type { FromSimMessage, ToSimMessage } from '../shared/messages';

declare const self: DedicatedWorkerGlobalScope;

/** How often the worker wakes up to catch up with real time (technical, not gameplay). */
const LOOP_INTERVAL_MS = 50;
const MS_PER_SECOND = 1000;

let loop: ReturnType<typeof setInterval> | undefined;

function post(message: FromSimMessage): void {
  self.postMessage(message);
}

function start(seed: number): void {
  if (loop !== undefined) clearInterval(loop);

  let simulation: Simulation;
  try {
    simulation = new Simulation(seed, loadGameData());
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    return;
  }

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
