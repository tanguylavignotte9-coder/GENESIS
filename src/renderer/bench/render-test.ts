import type { Ticker } from 'pixi.js';
import type { FaunaSnapshot, HumansSnapshot, WorldSnapshot } from '../../shared/messages';
import { HumanFlag } from '../../shared/messages';
import type { RenderMeasure, RenderTestResult } from '../../shared/bridge';
import type { Camera } from '../map/camera';

/** Settings of the render test (technical, not gameplay). */
const RENDER_TEST = {
  seed: 42,
  /** Same balance as the load test: 15 years of plants and animals alone before the humans. */
  warmupYears: 15,
  speeds: [1, 25],
  /** Time given to each view to settle (textures built, glides started) before measuring. */
  settleMs: 3000,
  measureMs: 10000,
  campPixelsPerTile: 24,
  forestPixelsPerTile: 12,
  /** Size of the squares in which animals are counted to find the busiest forest. */
  forestBlockTiles: 48,
  forestBiomes: ['temperate_forest', 'taiga', 'tropical_forest'],
} as const;

const MS_PER_SECOND = 1000;
const WORST_SHARE = 0.01;

/** What the render test needs from the game's display. */
export interface RenderTestHost {
  /** Starts the benchmark world; resolves once its humans and animals are on screen. */
  startBenchmarkWorld(seed: number, warmupYears: number): Promise<void>;
  speeds(): readonly number[];
  setSpeed(index: number): void;
  world(): WorldSnapshot | null;
  humans(): HumansSnapshot | null;
  fauna(): FaunaSnapshot | null;
  population(): { animals: number; plants: number; humans: number };
  camera: Camera;
  ticker: Ticker;
  viewSize(): { width: number; height: number };
  progress(line: string): void;
}

interface View {
  name: string;
  /** Centre tile and zoom; null = the whole map. */
  place: { x: number; y: number; pixelsPerTile: number } | null;
}

/**
 * In-game render test: frames per second (mean and slowest 1 %) at x1 and x25 on three typical
 * views — the whole map, the camp zoomed in, a big forest zoomed in with many animals — on a world
 * whose fauna and flora have reached their balance.
 */
export async function runRenderTest(host: RenderTestHost): Promise<RenderTestResult> {
  host.progress(`Test de rendu : mise en route d’un monde (graine ${RENDER_TEST.seed}, ${RENDER_TEST.warmupYears} ans de faune et de flore, environ une minute)…`);
  await host.startBenchmarkWorld(RENDER_TEST.seed, RENDER_TEST.warmupYears);
  const world = host.world();
  if (!world) throw new Error('Le monde du test de rendu n’a pas été créé.');
  const views: View[] = [
    { name: 'Carte entière', place: null },
    { name: 'Camp zoomé', place: { ...campCentre(host.humans(), world.size), pixelsPerTile: RENDER_TEST.campPixelsPerTile } },
    { name: 'Grande forêt zoomée', place: { ...busiestForest(world, host.fauna()), pixelsPerTile: RENDER_TEST.forestPixelsPerTile } },
  ];
  const measures: RenderMeasure[] = [];
  for (const speed of RENDER_TEST.speeds) {
    const index = host.speeds().indexOf(speed);
    if (index < 0) continue;
    host.setSpeed(index);
    for (const view of views) {
      if (view.place) host.camera.view(view.place.x, view.place.y, view.place.pixelsPerTile);
      else host.camera.reset(world.size);
      host.progress(`  ${view.name}, x${speed}…`);
      await wait(RENDER_TEST.settleMs);
      const counts = inView(host);
      const frames = await recordFrames(host.ticker, RENDER_TEST.measureMs);
      const measure: RenderMeasure = { view: view.name, speed, pixelsPerTile: host.camera.pixelsPerTile, ...counts, ...fpsOf(frames) };
      measures.push(measure);
      host.progress(`  ${view.name}, x${speed} : ${Math.round(measure.meanFps)} images/s en moyenne, ${Math.round(measure.low1PercentFps)} pour les 1 % les plus lentes`);
    }
  }
  const gpu = graphicsCard();
  const size = host.viewSize();
  return {
    ...gpu,
    viewWidth: size.width,
    viewHeight: size.height,
    devicePixelRatio: window.devicePixelRatio,
    seed: RENDER_TEST.seed,
    warmupYears: RENDER_TEST.warmupYears,
    ...host.population(),
    measures,
  };
}

/** Mean FPS and FPS of the slowest 1 % of frames. */
export function fpsOf(frameMs: readonly number[]): { meanFps: number; low1PercentFps: number; frames: number } {
  if (frameMs.length === 0) return { meanFps: 0, low1PercentFps: 0, frames: 0 };
  const total = frameMs.reduce((sum, ms) => sum + ms, 0);
  const sorted = [...frameMs].sort((a, b) => b - a);
  const worst = sorted.slice(0, Math.max(1, Math.round(sorted.length * WORST_SHARE)));
  const worstMean = worst.reduce((sum, ms) => sum + ms, 0) / worst.length;
  return { meanFps: (frameMs.length * MS_PER_SECOND) / total, low1PercentFps: MS_PER_SECOND / worstMean, frames: frameMs.length };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Duration of every frame drawn during `ms`. */
function recordFrames(ticker: Ticker, ms: number): Promise<number[]> {
  return new Promise((resolve) => {
    const frames: number[] = [];
    let elapsed = 0;
    const listener = (t: Ticker): void => {
      frames.push(t.deltaMS);
      elapsed += t.deltaMS;
      if (elapsed < ms) return;
      ticker.remove(listener);
      resolve(frames);
    };
    ticker.add(listener);
  });
}

/** Where the tribe is: the mean position of the living people. */
function campCentre(humans: HumansSnapshot | null, size: number): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let n = 0;
  for (let p = 0; humans && p < humans.x.length; p++) {
    if ((humans.flags[p]! & HumanFlag.Alive) === 0) continue;
    x += humans.x[p]!;
    y += humans.y[p]!;
    n++;
  }
  return n > 0 ? { x: Math.round(x / n), y: Math.round(y / n) } : { x: size / 2, y: size / 2 };
}

/** Centre of the forest square holding the most animals. */
function busiestForest(world: WorldSnapshot, fauna: FaunaSnapshot | null): { x: number; y: number } {
  const block = RENDER_TEST.forestBlockTiles;
  const perSide = Math.ceil(world.size / block);
  const counts = new Uint32Array(perSide * perSide);
  for (let k = 0; fauna && k < fauna.count; k++) counts[Math.floor(fauna.y[k]! / block) * perSide + Math.floor(fauna.x[k]! / block)]!++;
  const forests = new Set(world.biomes.biomes.flatMap((biome, index) => ((RENDER_TEST.forestBiomes as readonly string[]).includes(biome.id) ? [index] : [])));
  let best = 0;
  let bestCount = -1;
  for (let b = 0; b < counts.length; b++) {
    const cx = (b % perSide) * block + block / 2;
    const cy = Math.floor(b / perSide) * block + block / 2;
    if (cx >= world.size || cy >= world.size || !forests.has(world.biome[cy * world.size + cx]!)) continue;
    if (counts[b]! > bestCount) {
      best = b;
      bestCount = counts[b]!;
    }
  }
  return { x: (best % perSide) * block + block / 2, y: Math.floor(best / perSide) * block + block / 2 };
}

function inView(host: RenderTestHost): { animalsInView: number; humansInView: number } {
  const rect = host.camera.visibleTiles();
  const inside = (x: number, y: number): boolean => x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
  let animalsInView = 0;
  let humansInView = 0;
  const fauna = host.fauna();
  for (let k = 0; fauna && k < fauna.count; k++) if (inside(fauna.x[k]!, fauna.y[k]!)) animalsInView++;
  const humans = host.humans();
  for (let p = 0; humans && p < humans.x.length; p++) if ((humans.flags[p]! & HumanFlag.Alive) !== 0 && inside(humans.x[p]!, humans.y[p]!)) humansInView++;
  return { animalsInView, humansInView };
}

/** The graphics card, as WebGL reports it (the unmasked name when the browser gives it). */
function graphicsCard(): { gpu: string; gpuVendor: string } {
  const gl = document.createElement('canvas').getContext('webgl');
  if (!gl) return { gpu: 'inconnue (WebGL indisponible)', gpuVendor: 'inconnu' };
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  const gpuVendor = String(info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return { gpu, gpuVendor };
}
