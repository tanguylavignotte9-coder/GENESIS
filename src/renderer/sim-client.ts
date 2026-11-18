import SimWorker from '../worker/sim.worker?worker';
import type { FromSimMessage, ToSimMessage } from '../shared/messages';

/** Talks to the simulation worker with typed messages. */
export class SimClient {
  private readonly worker = new SimWorker();

  constructor(onMessage: (message: FromSimMessage) => void) {
    this.worker.onmessage = (event: MessageEvent<FromSimMessage>) => onMessage(event.data);
    this.worker.onerror = (event) => onMessage({ type: 'error', message: event.message });
  }

  start(seed: number): void {
    this.send({ type: 'start', seed });
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

  private send(message: ToSimMessage): void {
    this.worker.postMessage(message);
  }
}
