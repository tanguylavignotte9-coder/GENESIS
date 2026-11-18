import { Application } from 'pixi.js';
// Lets PixiJS work under our strict Content-Security-Policy (no eval).
import 'pixi.js/unsafe-eval';
import { ClimateState } from '../sim/systems/world/climate-state';
import type { FromSimMessage, LifeTables, Roster, WorldSnapshot } from '../shared/messages';
import { Hover } from './hover';
import { JournalPanel } from './hud/journal-panel';
import { PersonSheet } from './hud/person-sheet';
import { TribePanel } from './hud/tribe-panel';
import { StatsPanel } from './hud/stats-panel';
import { TimeControls } from './hud/time-controls';
import { Tooltip } from './hud/tooltip';
import { randomSeed, WorldPanel } from './hud/world-panel';
import { AnimalLayer } from './life/animal-layer';
import { HumanLayer } from './life/human-layer';
import { PlantLayer } from './life/plant-layer';
import { NightLayer } from './map/night-layer';
import { Camera } from './map/camera';
import { MapView } from './map/map-view';
import { SimClient } from './sim-client';
import { VIEW } from './view-settings';
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
  const plants = new PlantLayer();
  const animals = new AnimalLayer();
  const people = new HumanLayer();
  const night = new NightLayer();
  mapView.container.addChild(plants.container, animals.container, people.container, night.sprite);
  app.stage.addChild(mapView.container);
  const camera = new Camera(app.canvas, mapView.container);
  const tooltip = new Tooltip(element('tooltip'));
  let world: WorldSnapshot | null = null;
  let climate: ClimateState | null = null;
  let life: LifeTables | null = null;
  let daysPerYear = 1;
  let roster: Roster | null = null;
  let hour = 0;
  let weatherRegions: Uint8Array | null = null;
  let weatherRegionTiles = 1;
  let personRequest = 0;
  let lastPersonRequest = 0;
  let mouse: { x: number; y: number } | null = null;

  const sim = new SimClient((message: FromSimMessage) => onMessage(message));
  const hover = new Hover(sim, animals, people);
  hover.weatherLine = (tile) => {
    if (!world || !weatherRegions || !roster) return null;
    const x = tile % world.size;
    const y = Math.floor(tile / world.size);
    const perSide = Math.ceil(world.size / weatherRegionTiles);
    const code = weatherRegions[Math.floor(y / weatherRegionTiles) * perSide + Math.floor(x / weatherRegionTiles)] ?? 0;
    return `Météo : ${roster.weatherNames[code] ?? '?'}`;
  };
  hover.personLines = (person) => {
    const humans = people.snapshot;
    if (!roster || !humans) return [];
    const age = Math.floor(roster.ageYears[person]!);
    return [roster.names[person] ?? '?', `${roster.female[person] ? 'Femme' : 'Homme'}, ${age} an${age > 1 ? 's' : ''}`, roster.actionLabels[humans.action[person]!] ?? '', 'Clic : ouvrir sa fiche'];
  };
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
  const journal = new JournalPanel(element('journal'), element<HTMLButtonElement>('journal-toggle'), element('journal-list'), (place) => {
    camera.stopFollowing();
    camera.focusOn(place.x, place.y);
  });
  const stats = new StatsPanel(element('stats'), element<HTMLButtonElement>('stats-toggle'), element<HTMLCanvasElement>('stats-chart'), element('stats-legend'));
  const sheet = new PersonSheet(element('person'), element('person-body'), element<HTMLButtonElement>('person-close'), element<HTMLButtonElement>('person-follow'), () => {
    if (people.selected >= 0 && !followingPerson) people.selected = -1;
  });
  let followingPerson = false;
  sheet.onFollow(() => {
    const person = sheet.person;
    if (person < 0 || !roster) return;
    followingPerson = true;
    animals.followedUid = -1;
    people.selected = person;
    followText.textContent = `Suivi : ${roster.names[person] ?? ''}`;
    followBadge.hidden = false;
    camera.startFollowing(() => people.positionOf(person));
  });
  const selectPerson = (person: number): void => {
    people.selected = person;
    sheet.open(person);
    lastPersonRequest = 0;
    const spot = people.positionOf(person);
    if (spot) {
      camera.stopFollowing();
      camera.focusOn(Math.floor(spot.x), Math.floor(spot.y));
    }
  };
  const tribe = new TribePanel(element('tribe'), element<HTMLButtonElement>('tribe-toggle'), element('tribe-list'), selectPerson);
  const followBadge = element('follow');
  const followText = element('follow-text');
  element<HTMLButtonElement>('follow-stop').addEventListener('click', () => camera.stopFollowing());
  camera.onFollowEnd = () => {
    animals.followedUid = -1;
    followBadge.hidden = true;
    if (followingPerson && !sheet.isOpen) people.selected = -1;
    followingPerson = false;
  };

  function onMessage(message: FromSimMessage): void {
    switch (message.type) {
      case 'worldGenerating':
        panel.setGenerating(message.seed);
        tooltip.hide();
        journal.clear();
        camera.stopFollowing();
        sheet.close();
        return;
      case 'worldReady':
        world = message.world;
        life = message.life;
        daysPerYear = message.daysPerYear;
        climate = new ClimateState(world, message.climate, message.daysPerYear);
        mapView.setWorld(world);
        mapView.setClimate(climate);
        plants.setSpecies(life.plants, world.size);
        animals.setSpecies(life.animals);
        stats.reset(life.animals, daysPerYear);
        roster = message.roster;
        weatherRegionTiles = message.weatherRegionTiles;
        weatherRegions = null;
        people.setRoster(roster, world.size);
        tribe.setRoster(roster);
        night.setSize(world.size);
        hover.reset();
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
      case 'flora':
        plants.setFlora(message.flora);
        return;
      case 'fauna':
        animals.setFauna(message.fauna);
        return;
      case 'humans':
        people.setHumans(message.humans);
        return;
      case 'weather':
        weatherRegions = message.regions;
        return;
      case 'person':
        if (roster) sheet.render(message.details, roster);
        return;
      case 'populations':
        stats.add(message.samples);
        return;
      case 'inspection':
        hover.receive(message.inspection);
        return;
      case 'journal':
        journal.add(message.entries);
        return;
      case 'status':
        time.setStatus(message.date, message.paused, message.speedIndex);
        hour = message.hour;
        return;
      case 'error':
        panel.showError(message.message);
        return;
    }
  }

  let pressedAt: { x: number; y: number } | null = null;
  app.canvas.addEventListener('pointerdown', (event) => (pressedAt = { x: event.offsetX, y: event.offsetY }));
  app.canvas.addEventListener('pointerup', (event) => {
    if (!pressedAt || !world || Math.hypot(event.offsetX - pressedAt.x, event.offsetY - pressedAt.y) > VIEW.clickMaxPixels) return;
    pressedAt = null;
    const tile = camera.screenToTile(event.offsetX, event.offsetY);
    const target = hover.targetAt(world, tile.x, tile.y, camera.pixelsPerTile);
    if (target && target.person >= 0) {
      people.selected = target.person;
      sheet.open(target.person);
      lastPersonRequest = 0;
    } else if (target && target.animalUid >= 0) follow(target.animalUid);
    else camera.stopFollowing();
  });
  app.canvas.addEventListener('pointermove', (event) => (mouse = { x: event.offsetX, y: event.offsetY }));
  app.canvas.addEventListener('pointerleave', () => {
    mouse = null;
    tooltip.hide();
  });

  function follow(uid: number): void {
    const fauna = animals.snapshot;
    if (!fauna || !life) return;
    let name = '';
    for (let k = 0; k < fauna.count; k++) if (fauna.uid[k] === uid) name = life.animals[fauna.species[k]!]?.name ?? '';
    followingPerson = false;
    animals.followedUid = uid;
    followText.textContent = `Suivi : ${name}`;
    followBadge.hidden = false;
    camera.startFollowing(() => animals.positionOf(uid));
  }

  app.ticker.add((ticker) => {
    camera.update(ticker.deltaMS);
    const visible = camera.visibleTiles();
    mapView.update(visible);
    plants.update(visible, camera.pixelsPerTile);
    animals.update(visible, camera.pixelsPerTile);
    people.update(visible, camera.pixelsPerTile);
    night.update(climate, hour);
    const now = performance.now();
    tribe.update(people.snapshot, now);
    if (sheet.isOpen && now - lastPersonRequest > VIEW.inspectEveryMs) {
      lastPersonRequest = now;
      sim.inspectPerson(++personRequest, sheet.person);
    }
    if (world && life && mouse && !camera.isDragging) {
      const tile = camera.screenToTile(mouse.x, mouse.y);
      const target = hover.targetAt(world, tile.x, tile.y, camera.pixelsPerTile);
      if (target) tooltip.show(hover.lines(world, climate, life, daysPerYear, target, performance.now()), mouse.x, mouse.y);
      else tooltip.hide();
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
