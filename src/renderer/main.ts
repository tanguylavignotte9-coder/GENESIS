import { Application } from 'pixi.js';
// Lets PixiJS work under our strict Content-Security-Policy (no eval).
import 'pixi.js/unsafe-eval';
import { ClimateState } from '../sim/systems/world/climate-state';
import type { FromSimMessage, WorldSnapshot } from '../shared/messages';
import { JournalPanel } from './hud/journal-panel';
import { TimeControls } from './hud/time-controls';
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
  let climate: ClimateState | null = null;
  let mouse: { x: number; y: number } | null = null;

  const sim = new SimClient((message: FromSimMessage) => onMessage(message));
  const panel = new WorldPanel(
    element('summary'),
    element<HTMLFormElement>('world-form'),
    element<HTMLInputElement>('seed'),
    element<HTMLButtonElement>('new-world'),
    element('form-error'),
    element('loading'),
    (seed) => sim.start(seed),
  );
  const time = new TimeControls(
    element('date'),
    element('speeds'),
    element<HTMLButtonElement>('pause'),
    (paused) => sim.setPaused(paused),
    (speedIndex) => sim.setSpeed(speedIndex),
  );
  const journal = new JournalPanel(element('journal'), element<HTMLButtonElement>('journal-toggle'), element('journal-list'), (place) =>
    camera.focusOn(place.x, place.y),
  );

  function onMessage(message: FromSimMessage): void {
    switch (message.type) {
      case 'worldGenerating':
        panel.setGenerating(message.seed);
        tooltip.hide();
        journal.clear();
        return;
      case 'worldReady':
        world = message.world;
        climate = new ClimateState(world, message.climate, message.daysPerYear);
        mapView.setWorld(world);
        mapView.setClimate(climate);
        camera.reset(world.size);
        time.setSpeeds(message.speeds);
        panel.setWorld({ seed: message.seed, generationMs: message.generationMs, riverCount: world.riverCount, lakeCount: world.lakeCount });
        return;
      case 'climateYear':
        climate?.setAnomalies(message.year.anomalies, message.year.anomalyIndex, message.year.anomalyWeight);
        if (climate) mapView.setClimate(climate);
        return;
      case 'climateDay':
        climate?.setDay(message.dayOfYear);
        if (climate) mapView.setClimate(climate);
        return;
      case 'journal':
        journal.add(message.entries);
        return;
      case 'status':
        time.setStatus(message.date, message.paused, message.speedIndex);
        return;
      case 'error':
        panel.showError(message.message);
        return;
    }
  }

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
      tooltip.show(world, climate, tile.x, tile.y, mouse.x, mouse.y);
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
