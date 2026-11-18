import SimWorker from '../worker/sim.worker?worker';
import type { VariableValue } from '../sim/core/variables';
import type { PresetFile } from '../sim/core/workshop';
import type { FromSimMessage, ToSimMessage } from '../shared/messages';

/** Talks to the simulation worker with typed messages. */
export class SimClient {
  private readonly worker = new SimWorker();

  constructor(onMessage: (message: FromSimMessage) => void) {
    this.worker.onmessage = (event: MessageEvent<FromSimMessage>) => onMessage(event.data);
    this.worker.onerror = (event) => onMessage({ type: 'error', message: event.message });
  }

  start(seed: number, benchmark?: { warmupYears: number }): void {
    this.send(benchmark ? { type: 'start', seed, benchmark } : { type: 'start', seed });
  }

  setSpeed(speedIndex: number): void {
    this.send({ type: 'setSpeed', speedIndex });
  }

  setPaused(paused: boolean): void {
    this.send({ type: 'setPaused', paused });
  }

  inspect(requestId: number, tile: number, animalUid: number): void {
    this.send({ type: 'inspect', requestId, tile, animalUid });
  }

  inspectPerson(requestId: number, person: number): void {
    this.send({ type: 'inspectPerson', requestId, person });
  }

  inspectBuilding(requestId: number, building: number): void {
    this.send({ type: 'inspectBuilding', requestId, building });
  }

  workshopGet(): void {
    this.send({ type: 'workshopGet' });
  }

  workshopSet(file: string, key: string, value: VariableValue): void {
    this.send({ type: 'workshopSet', file, key, value });
  }

  workshopReset(file: string, key: string): void {
    this.send({ type: 'workshopReset', file, key });
  }

  workshopResetAll(): void {
    this.send({ type: 'workshopResetAll' });
  }

  workshopLoadPreset(preset: PresetFile): void {
    this.send({ type: 'workshopLoadPreset', preset });
  }

  workshopMakePreset(name: string): void {
    this.send({ type: 'workshopMakePreset', name });
  }

  workshopSaved(name: string): void {
    this.send({ type: 'workshopSaved', name });
  }

  private send(message: ToSimMessage): void {
    this.worker.postMessage(message);
  }
}
