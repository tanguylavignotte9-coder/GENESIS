/** Typed messages exchanged between the display (renderer) and the simulation worker. */
import type { EventPlace } from '../sim/core/journal';
import type { BiomeTable } from '../sim/systems/world/biomes';

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

/** Climate of the current day, quantized to keep messages small. */
export interface ClimateSnapshot {
  /** Changes every game day. */
  version: number;
  /** °C, rounded. */
  temperature: Int8Array;
  /** 0..100 % */
  humidity: Uint8Array;
  /** Snow cover, 0..100 % */
  snow: Uint8Array;
  /** 0 = none, k + 1 = anomalyNames[k]. */
  anomaly: Uint8Array;
  /** Name of each abnormal year in progress ("Sécheresse"). */
  anomalyNames: string[];
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
  | { type: 'worldReady'; seed: number; world: WorldSnapshot; generationMs: number; speeds: number[] }
  | { type: 'climate'; climate: ClimateSnapshot }
  | { type: 'journal'; entries: JournalEntry[] }
  | { type: 'status'; seed: number; tick: number; date: string; paused: boolean; speedIndex: number }
  | { type: 'error'; message: string };
