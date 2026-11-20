import { Application } from 'pixi.js';
// Lets PixiJS work under our strict Content-Security-Policy (no eval).
import 'pixi.js/unsafe-eval';
import { ClimateState } from '../sim/systems/world/climate-state';
import type { ClimateYearSnapshot, FromSimMessage, LifeTables, MotionInfo, PerfSnapshot, Roster, WorldSnapshot } from '../shared/messages';
import { runRenderTest, type RenderTestHost } from './bench/render-test';
import '../shared/bridge';
import { Hover } from './hover';
import { JournalPanel } from './hud/journal-panel';
import { PerfPanel } from './hud/perf-panel';
import { BenchmarkPanel } from './hud/workshop/benchmark-panel';
import { PresetsBar } from './hud/workshop/presets-bar';
import { WorkshopPage } from './hud/workshop/workshop-page';
import { PersonSheet } from './hud/person-sheet';
import { TribePanel } from './hud/tribe-panel';
import { SavesPanel } from './hud/saves-panel';
import { GroupsPanel } from './hud/groups-panel';
import { IdeasPanel } from './hud/ideas-panel';
import { TribeLayer } from './life/tribe-layer';
import { StatsPanel } from './hud/stats-panel';
import { TimeControls } from './hud/time-controls';
import { Tooltip } from './hud/tooltip';
import { randomSeed, WorldPanel } from './hud/world-panel';
import { AnimalLayer } from './life/animal-layer';
import { BuildingLayer } from './life/building-layer';
import { BuildingPanel } from './hud/building-panel';
import { HumanLayer } from './life/human-layer';
import { PlantLayer } from './life/plant-layer';
import { SimPace } from './life/glide';
import { NightLayer } from './map/night-layer';
import { Camera } from './map/camera';
import { MapView } from './map/map-view';
import { SimClient } from './sim-client';
import { BrainPanel } from './hud/brain-panel';
import { GovernancePanel } from './hud/governance-panel';
import { AnimalSheet } from './hud/animal-sheet';
import { VIEW } from './view-settings';
import './style.css';

const BACKGROUND_COLOR = '#0b0d12';
/** The performance indicator is refreshed twice a second. */
const PERF_REFRESH_MS = 500;

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
  const buildings = new BuildingLayer();
  const night = new NightLayer();
  const tribes = new TribeLayer();
  mapView.container.addChild(plants.container, buildings.container, animals.container, people.container, night.sprite, tribes.container);
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
  let climateYear: ClimateYearSnapshot | null = null;
  let tablesKey = '';
  let speedsKey = '';
  let lastPerfAt = 0;
  const pace = new SimPace();
  let motion: MotionInfo = { ticksPerHumanStep: 1, ticksPerAnimalStep: 1, hoursPerHumanStep: 1, hoursPerAnimalStep: 1 };

  const sim = new SimClient((message: FromSimMessage) => onMessage(message));
  const hover = new Hover(sim, animals, people, buildings);
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
  const journal = new JournalPanel(
    element('journal'),
    element<HTMLButtonElement>('journal-toggle'),
    element('journal-list'),
    (place) => {
      camera.stopFollowing();
      camera.focusOn(place.x, place.y);
    },
    (person) => selectPerson(person),
    (person) => roster?.names[person] ?? '',
  );
  const stats = new StatsPanel(
    element('stats'),
    element<HTMLButtonElement>('stats-toggle'),
    element<HTMLCanvasElement>('stats-chart'),
    element('stats-legend'),
    { tab: element<HTMLButtonElement>('stats-tab-animals'), block: element('stats-animals') },
    {
      tab: element<HTMLButtonElement>('stats-tab-humans'),
      block: element('stats-humans'),
      curve: element<HTMLCanvasElement>('humans-chart'),
      pyramid: element<HTMLCanvasElement>('pyramid-chart'),
      causes: element('death-causes'),
    },
  );
  const sheet = new PersonSheet(
    element('person'),
    element('person-body'),
    element<HTMLButtonElement>('person-close'),
    element<HTMLButtonElement>('person-follow'),
    () => {
      if (people.selected >= 0 && !followingPerson) people.selected = -1;
    },
    (person) => selectPerson(person),
  );
  const brainPanel = new BrainPanel(element('brain'), element('brain-title'), element('brain-body'), element<HTMLButtonElement>('brain-close'), (kind, id) => sim.watchBrain(kind, id));
  element<HTMLButtonElement>('person-brain').addEventListener('click', (event) => {
    (event.currentTarget as HTMLButtonElement).blur();
    if (sheet.person >= 0) brainPanel.open('human', sheet.person);
  });
  const animalSheet = new AnimalSheet(element('animal'), element('animal-body'), element<HTMLButtonElement>('animal-close'), element<HTMLButtonElement>('animal-brain'), (uid) => brainPanel.open('animal', uid));
  let lastAnimalRequest = 0;
  const buildingPanel = new BuildingPanel(element('building'), element('building-body'), element<HTMLButtonElement>('building-close'), () => (buildings.selected = -1));
  let buildingRequest = 0;
  let lastBuildingRequest = 0;
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
  const workshop = new WorkshopPage(
    {
      page: element('workshop'),
      close: element<HTMLButtonElement>('workshop-close'),
      search: element<HTMLInputElement>('workshop-search'),
      nav: element('workshop-nav'),
      list: element('workshop-list'),
      status: element('workshop-status'),
      message: element('workshop-message'),
      resetAll: element<HTMLButtonElement>('workshop-reset-all'),
    },
    {
      get: () => sim.workshopGet(),
      set: (file, key, value) => sim.workshopSet(file, key, value),
      reset: (file, key) => sim.workshopReset(file, key),
      resetAll: () => {
        sim.workshopResetAll();
        presets.forgetActive();
      },
    },
  );
  element<HTMLButtonElement>('workshop-toggle').addEventListener('click', (event) => {
    (event.currentTarget as HTMLButtonElement).blur();
    workshop.open();
  });
  const presets = new PresetsBar(
    {
      list: element<HTMLSelectElement>('preset-list'),
      load: element<HTMLButtonElement>('preset-load'),
      remove: element<HTMLButtonElement>('preset-delete'),
      name: element<HTMLInputElement>('preset-name'),
      save: element<HTMLButtonElement>('preset-save'),
    },
    window.genesis,
    {
      makePreset: (name) => sim.workshopMakePreset(name),
      load: (preset) => sim.workshopLoadPreset(preset),
      saved: (name) => sim.workshopSaved(name),
      message: (messages, ok) => workshop.showMessages(messages, ok),
    },
  );
  let lastPerf: PerfSnapshot | null = null;
  let knownSpeeds: readonly number[] = [];
  /** Resolved once the benchmark world's humans and animals reached the display. */
  let benchmarkWorld: { resolve: () => void; ready: boolean; humans: boolean; fauna: boolean } | null = null;
  const benchmarkHost: RenderTestHost = {
    startBenchmarkWorld: (seed, warmupYears) =>
      new Promise<void>((resolve) => {
        benchmarkWorld = { resolve, ready: false, humans: false, fauna: false };
        sim.start(seed, { warmupYears });
      }),
    speeds: () => knownSpeeds,
    setSpeed: (index) => sim.setSpeed(index),
    world: () => world,
    humans: () => people.snapshot,
    fauna: () => animals.snapshot,
    population: () => ({ animals: lastPerf?.animals ?? 0, plants: lastPerf?.plants ?? 0, humans: lastPerf?.humans ?? 0 }),
    camera,
    ticker: app.ticker,
    viewSize: () => ({ width: mapElement.clientWidth, height: mapElement.clientHeight }),
    progress: () => undefined,
  };
  const benchmarkPanel = new BenchmarkPanel(element<HTMLButtonElement>('benchmark-run'), element('benchmark-log'), element('bench-overlay'), window.genesis, {
    renderTest: (print) => runRenderTest({ ...benchmarkHost, progress: print }),
    pause: () => sim.setPaused(true),
    showMap: () => workshop.close(),
    newWorld: () => sim.start(randomSeed()),
  });
  const benchmarkProgress = (kind: 'ready' | 'humans' | 'fauna'): void => {
    const pending = benchmarkWorld;
    if (!pending) return;
    pending[kind] = true;
    if (pending.ready && pending.humans && pending.fauna) {
      benchmarkWorld = null;
      pending.resolve();
    }
  };
  const saves = new SavesPanel(
    {
      panel: element('saves'),
      toggle: element<HTMLButtonElement>('saves-toggle'),
      name: element<HTMLInputElement>('save-name'),
      save: element<HTMLButtonElement>('save-now'),
      list: element('saves-list'),
      message: element('saves-message'),
    },
    window.genesis,
    { requestSave: (requestId, reason) => sim.save(requestId, reason), load: (body, label) => sim.load(body, label) },
  );
  const governancePanel = new GovernancePanel(
    element('governance'),
    element('governance-title'),
    element('governance-body'),
    element<HTMLButtonElement>('governance-close'),
    (tribe) => sim.inspectGovernance(tribe),
    (person) => selectPerson(person),
    (day) => `jour ${day}`,
  );
  const groupsPanel = new GroupsPanel(
    element('groups'),
    element<HTMLButtonElement>('groups-toggle'),
    element('groups-body'),
    (person) => selectPerson(person),
    (x, y) => {
      camera.stopFollowing();
      camera.focusOn(x, y);
    },
    (tribe) => governancePanel.open(tribe),
  );
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyG' || event.target instanceof HTMLInputElement) return;
    element<HTMLButtonElement>('groups-toggle').click();
  });
  const ideasPanel = new IdeasPanel(element('ideas'), element<HTMLButtonElement>('ideas-toggle'), element('ideas-body'), (person) => selectPerson(person));
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyI' || event.target instanceof HTMLInputElement) return;
    element<HTMLButtonElement>('ideas-toggle').click();
  });
  const perfPanel = new PerfPanel(element('perf'));
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
        tribes.clear();
        groupsPanel.clear();
        ideasPanel.clear();
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
        motion = message.motion;
        pace.reset();
        weatherRegionTiles = message.weatherRegionTiles;
        weatherRegions = null;
        people.setRoster(roster);
        buildings.setTables(life);
        buildingPanel.close();
        tribe.setRoster(roster);
        night.setSize(world.size);
        hover.reset();
        camera.reset(world.size);
        time.setSpeeds(message.speeds);
        speedsKey = JSON.stringify(message.speeds);
        tablesKey = JSON.stringify([life.plants, life.animals]);
        climateYear = null;
        if (workshop.isOpen) sim.workshopGet();
        panel.setWorld({ seed: message.seed, generationMs: message.generationMs, riverCount: world.riverCount, lakeCount: world.lakeCount });
        knownSpeeds = message.speeds;
        if (message.loadedFrom !== null) saves.onLoaded(message.loadedFrom);
        if (benchmarkWorld && message.benchmark) {
          benchmarkWorld.humans = false;
          benchmarkWorld.fauna = false;
          benchmarkProgress('ready');
        }
        return;
      case 'climateYear':
        climateYear = message.year;
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
        animals.setFauna(message.fauna, performance.now(), pace.msFor(motion.ticksPerAnimalStep), motion.hoursPerAnimalStep);
        benchmarkProgress('fauna');
        return;
      case 'humans':
        people.setHumans(message.humans, performance.now(), pace.msFor(motion.ticksPerHumanStep), motion.hoursPerHumanStep);
        benchmarkProgress('humans');
        return;
      case 'weather':
        weatherRegions = message.regions;
        return;
      case 'person':
        if (roster && life) sheet.render(message.details, roster, life);
        return;
      case 'brain':
        brainPanel.receive(message.brain);
        return;
      case 'governance':
        governancePanel.receive(message.governance);
        return;
      case 'buildings':
        buildings.setBuildings(message.buildings);
        return;
      case 'building':
        if (!hover.receiveBuilding(message.details) && life) buildingPanel.render(message.details, life);
        return;
      case 'populations':
        stats.add(message.samples);
        return;
      case 'humanStats':
        stats.addHumans(message.stats);
        return;
      case 'groups':
        tribes.setGroups(message.groups);
        groupsPanel.setGroups(message.groups);
        return;
      case 'battles':
        tribes.setBattles(message.battles);
        return;
      case 'ideas':
        ideasPanel.setIdeas(message.ideas);
        return;
      case 'roster':
        roster = message.roster;
        people.updateRoster(roster);
        tribe.setRoster(roster);
        return;
      case 'inspection':
        if (animalSheet.owns(message.inspection.requestId)) {
          if (life) animalSheet.render(message.inspection.animal, life, daysPerYear);
        } else hover.receive(message.inspection);
        return;
      case 'journal':
        journal.add(message.entries);
        return;
      case 'status':
        time.setStatus(message.date, message.paused, message.speedIndex);
        pace.observe(message.tick, performance.now(), message.paused);
        hour = message.hour;
        return;
      case 'error':
        panel.showError(message.message);
        return;
      case 'workshop':
        workshop.receive(message.workshop);
        return;
      case 'workshopPreset':
        void presets.onPreset(message.preset);
        return;
      case 'perf':
        perfPanel.setPerf(message.perf);
        lastPerf = message.perf;
        return;
      case 'liveTables':
        applyLiveTables(message.climate, message.life, message.speeds);
        return;
      case 'saveData':
        void saves.onSaveData(message.requestId, message.reason, message.meta, message.body, message.autosaveSlots);
        return;
      case 'saveFailed':
        saves.onSaveFailed(message.requestId, message.message);
        return;
    }
  }

  /** A live change in the workshop: redraw with the new climate, species and speeds. */
  function applyLiveTables(params: ClimateState['params'], tables: LifeTables, speeds: number[]): void {
    if (!world) return;
    const day = climate?.dayOfYear ?? 0;
    climate = new ClimateState(world, params, daysPerYear);
    if (climateYear) climate.setAnomalies(climateYear.anomalies, climateYear.anomalyIndex, climateYear.anomalyWeight);
    climate.setDay(day);
    mapView.setClimate(climate);
    life = tables;
    buildings.setTables(tables);
    const key = JSON.stringify([tables.plants, tables.animals]);
    if (key !== tablesKey) {
      tablesKey = key;
      plants.setSpecies(tables.plants, world.size);
      animals.setSpecies(tables.animals);
    }
    const speedKey = JSON.stringify(speeds);
    if (speedKey !== speedsKey) {
      speedsKey = speedKey;
      time.setSpeeds(speeds);
      knownSpeeds = speeds;
    }
  }

  let pressedAt: { x: number; y: number } | null = null;
  app.canvas.addEventListener('pointerdown', (event) => (pressedAt = { x: event.offsetX, y: event.offsetY }));
  app.canvas.addEventListener('pointerup', (event) => {
    if (!pressedAt || !world || Math.hypot(event.offsetX - pressedAt.x, event.offsetY - pressedAt.y) > VIEW.clickMaxPixels) return;
    pressedAt = null;
    const tile = camera.screenToTile(event.offsetX, event.offsetY);
    const target = hover.targetAt(world, tile.x, tile.y, camera.pixelsPerTile, event.shiftKey);
    if (target && target.person >= 0) {
      people.selected = target.person;
      sheet.open(target.person);
      lastPersonRequest = 0;
    } else if (target && target.building >= 0) {
      buildings.selected = target.building;
      buildingPanel.open(target.building);
      lastBuildingRequest = 0;
    } else if (target && target.animalUid >= 0) {
      follow(target.animalUid);
      animalSheet.open(target.animalUid);
      lastAnimalRequest = 0;
    }
    else camera.stopFollowing();
  });
  let shiftHeld = false;
  app.canvas.addEventListener('pointermove', (event) => {
    mouse = { x: event.offsetX, y: event.offsetY };
    shiftHeld = event.shiftKey;
  });
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
    const frameAt = performance.now();
    animals.update(visible, camera.pixelsPerTile, frameAt);
    people.update(visible, camera.pixelsPerTile, frameAt);
    buildings.update(visible);
    night.update(climate, hour);
    const now = performance.now();
    if (now - lastPerfAt > PERF_REFRESH_MS) {
      lastPerfAt = now;
      perfPanel.update(app.ticker.FPS);
    }
    tribe.update(people.snapshot, now);
    tribes.update(camera.pixelsPerTile);
    groupsPanel.update(now);
    governancePanel.update(now);
    ideasPanel.update(now);
    if (animalSheet.isOpen && now - lastAnimalRequest > VIEW.inspectEveryMs) {
      lastAnimalRequest = now;
      sim.inspect(animalSheet.nextRequest(), 0, animalSheet.uid);
    }
    if (sheet.isOpen && now - lastPersonRequest > VIEW.inspectEveryMs) {
      lastPersonRequest = now;
      sim.inspectPerson(++personRequest, sheet.person);
    }
    if (buildingPanel.isOpen && now - lastBuildingRequest > VIEW.inspectEveryMs) {
      lastBuildingRequest = now;
      sim.inspectBuilding(++buildingRequest, buildingPanel.building);
    }
    if (world && life && mouse && !camera.isDragging) {
      const tile = camera.screenToTile(mouse.x, mouse.y);
      const target = hover.targetAt(world, tile.x, tile.y, camera.pixelsPerTile, shiftHeld);
      if (target) tooltip.show(hover.lines(world, climate, life, daysPerYear, target, performance.now()), mouse.x, mouse.y);
      else tooltip.hide();
    } else if (camera.isDragging) {
      tooltip.hide();
    }
  });

  // The last active preset is reloaded before the first world (its values apply to it).
  await presets.reloadActive();
  sim.start(randomSeed());
  await benchmarkPanel.startIfAuto();
}

main().catch((error: unknown) => {
  const summary = document.getElementById('summary');
  if (summary) {
    summary.classList.add('error');
    summary.textContent = `Impossible de démarrer l'affichage : ${error instanceof Error ? error.message : String(error)}`;
  }
});
