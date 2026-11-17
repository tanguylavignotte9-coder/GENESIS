import { Application } from 'pixi.js';
// Lets PixiJS work under our strict Content-Security-Policy (no eval).
import 'pixi.js/unsafe-eval';
import SimWorker from '../worker/sim.worker?worker';
import type { FromSimMessage, ToSimMessage } from '../shared/messages';
import { renderHud } from './hud';
import './style.css';

const BACKGROUND_COLOR = '#0b0d12';

async function createMap(container: HTMLElement): Promise<Application> {
  const app = new Application();
  await app.init({ resizeTo: window, background: BACKGROUND_COLOR, antialias: false });
  container.appendChild(app.canvas);
  return app;
}

/** A fresh random seed for each launch (randomness is allowed here, outside the simulation). */
function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

function startSimulation(hud: HTMLElement): void {
  const worker = new SimWorker();
  worker.onmessage = (event: MessageEvent<FromSimMessage>) => renderHud(hud, event.data);
  worker.onerror = (event) => renderHud(hud, { type: 'error', message: event.message });
  const start: ToSimMessage = { type: 'start', seed: randomSeed() };
  worker.postMessage(start);
}

async function main(): Promise<void> {
  const mapElement = document.getElementById('map');
  const hudElement = document.getElementById('hud');
  if (!mapElement || !hudElement) throw new Error('Éléments #map ou #hud introuvables dans index.html');
  try {
    await createMap(mapElement);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    renderHud(hudElement, { type: 'error', message: `Impossible d'initialiser la carte : ${message}` });
    return;
  }
  startSimulation(hudElement);
}

void main();
