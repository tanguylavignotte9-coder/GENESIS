import { Application } from 'pixi.js';
// Lets PixiJS work under our strict Content-Security-Policy (no eval).
import 'pixi.js/unsafe-eval';
import type { FromSimMessage, WorldSnapshot } from '../shared/messages';
import { Tooltip } from './hud/tooltip';
import { randomSeed, WorldPanel } from './hud/world-panel';
import { Camera } from './map/camera';
import { MapView } from './map/map-view';
import { SimClient } from './sim-client';
import './style.css';

const BACKGROUND_COLOR = '#0b0d12';

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Élément #${id} introuvable dans index.html`);
  return found as T;
}

async function main(): Promise<void> {
  const mapElement = element<HTMLElement>('map');
  const app = new Application();
  await app.init({ resizeTo: mapElement, background: BACKGROUND_COLOR, antialias: false });
  mapElement.appendChild(app.canvas);

  const mapView = new MapView();
  app.stage.addChild(mapView.container);
  const camera = new Camera(app.canvas, mapView.container);
  const tooltip = new Tooltip(element('tooltip'));
  let world: WorldSnapshot | null = null;
  let mouse: { x: number; y: number } | null = null;

  const sim = new SimClient((message: FromSimMessage) => {
    switch (message.type) {
      case 'worldGenerating':
        panel.setGenerating(message.seed);
        tooltip.hide();
        return;
      case 'worldReady':
        world = message.world;
        mapView.setWorld(world);
        camera.reset(world.size);
        panel.setWorld({ seed: message.seed, generationMs: message.generationMs, riverCount: world.riverCount, lakeCount: world.lakeCount });
        return;
      case 'status':
        panel.setTick(message.tick);
        return;
      case 'error':
        panel.showError(message.message);
        return;
    }
  });

  const panel = new WorldPanel(
    element('summary'),
    element<HTMLFormElement>('world-form'),
    element<HTMLInputElement>('seed'),
    element<HTMLButtonElement>('new-world'),
    element('form-error'),
    element('loading'),
    (seed) => sim.start(seed),
  );

  app.canvas.addEventListener('pointermove', (event) => (mouse = { x: event.offsetX, y: event.offsetY }));
  app.canvas.addEventListener('pointerleave', () => {
    mouse = null;
    tooltip.hide();
  });

  app.ticker.add((ticker) => {
    camera.update(ticker.deltaMS);
    mapView.update(camera.visibleTiles());
    if (world && mouse && !camera.isDragging) {
      const tile = camera.screenToTile(mouse.x, mouse.y);
      tooltip.show(world, tile.x, tile.y, mouse.x, mouse.y);
    } else if (camera.isDragging) {
      tooltip.hide();
    }
  });

  sim.start(randomSeed());
}

main().catch((error: unknown) => {
  const summary = document.getElementById('summary');
  if (summary) {
    summary.classList.add('error');
    summary.textContent = `Impossible de démarrer l'affichage : ${error instanceof Error ? error.message : String(error)}`;
  }
});
