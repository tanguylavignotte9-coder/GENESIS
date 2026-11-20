/**
 * What the Electron main process offers the display (through the preload script): reading and
 * writing presets in presets/, and running the benchmark. Undefined when the display runs elsewhere.
 */
import type { PresetFile } from '../sim/core/workshop';
import type { SaveMeta } from '../sim/core/save/save';
import type { SaveReason } from './messages';

/** A save file as the menu lists it. */
export interface SaveEntry {
  /** Path inside sauvegardes/ ("auto-1.genesis", "partage/loups.genesis"). */
  file: string;
  meta: (SaveMeta & { label: string; savedAt: string }) | null;
  /** French reason when the file cannot be read. */
  problem: string | null;
  bytes: number;
}

/** A world to write: the main process picks the file from the reason (automatic slots, closing, a name). */
export interface SaveRequest {
  reason: SaveReason;
  /** Name given by the player (manual saves). */
  label: string;
  meta: SaveMeta;
  body: Uint8Array;
  autosaveSlots: number;
}

export interface PresetEntry {
  /** File name in presets/ ("loups-affames.json"). */
  file: string;
  /** Name stored in the preset. */
  name: string;
}

/** Frames per second measured on one view at one speed. */
export interface RenderMeasure {
  /** "Carte entière", "Camp zoomé", "Grande forêt zoomée". */
  view: string;
  speed: number;
  /** Zoom of the view (screen pixels per tile). */
  pixelsPerTile: number;
  /** Animals and humans drawn on screen at the start of the measure. */
  animalsInView: number;
  humansInView: number;
  meanFps: number;
  /** FPS of the slowest 1 % of frames (mean of their durations). */
  low1PercentFps: number;
  frames: number;
}

/** In-game render test: the graphics card and the measures of each view. */
export interface RenderTestResult {
  /** Graphics card as WebGL names it ("ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 …)"). */
  gpu: string;
  gpuVendor: string;
  /** Size of the map view, in screen pixels. */
  viewWidth: number;
  viewHeight: number;
  devicePixelRatio: number;
  seed: number;
  warmupYears: number;
  animals: number;
  plants: number;
  humans: number;
  measures: RenderMeasure[];
}

export interface BenchmarkResult {
  ok: boolean;
  /** French summary of the outcome. */
  message: string;
  /** Report files written in rapports/ (relative paths). */
  reports: string[];
}

export interface GenesisBridge {
  listPresets(): Promise<PresetEntry[]>;
  readPreset(file: string): Promise<unknown>;
  savePreset(preset: PresetFile): Promise<PresetEntry>;
  deletePreset(file: string): Promise<void>;
  /** File of the last preset loaded or saved (reloaded at startup), or null. */
  activePreset(): Promise<string | null>;
  setActivePreset(file: string | null): Promise<void>;
  /** Runs the load test (the game is paused) and writes the report, with the render test's results. */
  runBenchmark(render: RenderTestResult | null): Promise<BenchmarkResult>;
  onBenchmarkLine(listener: (line: string) => void): void;
  /** True when the game was launched by Benchmark-GENESIS.bat: run the whole benchmark at once. */
  isAutoBenchmark(): Promise<boolean>;
  /** Closes the game (end of an automatic benchmark). */
  quit(): Promise<void>;
  listSaves(): Promise<SaveEntry[]>;
  writeSave(request: SaveRequest): Promise<SaveEntry>;
  readSave(file: string): Promise<{ meta: SaveEntry['meta']; body: Uint8Array }>;
  deleteSave(file: string): Promise<void>;
  /** Copies a save into sauvegardes/partage/ (kept in the repository); returns its new file. */
  shareSave(file: string): Promise<string>;
  /** The window is closing: save if wanted, then call quitReady(). */
  onBeforeQuit(listener: () => void): void;
  quitReady(): Promise<void>;
}

declare global {
  interface Window {
    genesis?: GenesisBridge;
  }
}
