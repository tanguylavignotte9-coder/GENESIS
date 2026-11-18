/**
 * What the Electron main process offers the display (through the preload script): reading and
 * writing presets in presets/, and running the benchmark. Undefined when the display runs elsewhere.
 */
import type { PresetFile } from '../sim/core/workshop';

export interface PresetEntry {
  /** File name in presets/ ("loups-affames.json"). */
  file: string;
  /** Name stored in the preset. */
  name: string;
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
  runBenchmark(): Promise<BenchmarkResult>;
  onBenchmarkLine(listener: (line: string) => void): void;
}

declare global {
  interface Window {
    genesis?: GenesisBridge;
  }
}
