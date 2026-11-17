/** Typed messages exchanged between the display (renderer) and the simulation worker. */
import type { EventPlace } from '../sim/core/journal';
import type { BiomeTable } from '../sim/systems/world/biomes';
import type { ClimateParams } from '../sim/systems/world/climate-params';
import type { ActiveAnomaly } from '../sim/systems/world/climate-state';

/** Display -> simulation. */
export type ToSimMessage =
  | { type: 'start'; seed: number }
  /** Index into the speeds sent with 'worldReady'. */
  | { type: 'setSpeed'; speedIndex: number }
  | { type: 'setPaused'; paused: boolean };

/** Copy of the generated map sent to the display (arrays are transferred, not shared). */
export interface WorldSnapshot {
  size: number;
  /** Meters; negative under the sea. */
  elevation: Float32Array;
  /** °C, mean annual. */
  temperature: Float32Array;
  /** 0..1, mean annual. */
  humidity: Float32Array;
  ocean: Uint8Array;
  biome: Uint8Array;
  /** 0 = none, 1 = river, 2 = lake (see Water in the world system). */
  water: Uint8Array;
  biomes: BiomeTable;
  riverCount: number;
  lakeCount: number;
}

/** Abnormal years of the current year (sent once per year). The display rebuilds the climate from it. */
export interface ClimateYearSnapshot {
  anomalyIndex: Uint8Array;
  anomalyWeight: Float32Array;
  anomalies: ActiveAnomaly[];
}

/** A journal event as shown to the player. */
export interface JournalEntry {
  id: number;
  /** "Jour 1 · Printemps · An 3" */
  date: string;
  text: string;
  place: EventPlace | null;
  causes: number[];
}

/** Simulation -> display. */
export type FromSimMessage =
  | { type: 'worldGenerating'; seed: number }
  | { type: 'worldReady'; seed: number; world: WorldSnapshot; generationMs: number; speeds: number[]; climate: ClimateParams; daysPerYear: number }
  | { type: 'climateYear'; year: ClimateYearSnapshot }
  | { type: 'climateDay'; dayOfYear: number }
  | { type: 'journal'; entries: JournalEntry[] }
  | { type: 'status'; seed: number; tick: number; date: string; paused: boolean; speedIndex: number }
  | { type: 'error'; message: string };
