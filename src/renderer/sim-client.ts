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
    const message: ToSimMessage = { type: 'start', seed };
    this.worker.postMessage(message);
  }
}
