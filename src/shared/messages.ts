/** Typed messages exchanged between the display (renderer) and the simulation worker. */
import type { BiomeTable } from '../sim/systems/world/biomes';

/** Display -> simulation: (re)start a simulation with a new world. */
export type ToSimMessage = { type: 'start'; seed: number };

/** Copy of the generated map sent to the display (arrays are transferred, not shared). */
export interface WorldSnapshot {
  size: number;
  /** Meters; negative under the sea. */
  elevation: Float32Array;
  /** °C, mean annual. */
  temperature: Float32Array;
  /** 0..1 */
  humidity: Float32Array;
  ocean: Uint8Array;
  biome: Uint8Array;
  /** 0 = none, 1 = river, 2 = lake (see Water in the world system). */
  water: Uint8Array;
  biomes: BiomeTable;
  riverCount: number;
  lakeCount: number;
}

/** Simulation -> display. */
export type FromSimMessage =
  | { type: 'worldGenerating'; seed: number }
  | { type: 'worldReady'; seed: number; world: WorldSnapshot; generationMs: number }
  | { type: 'status'; seed: number; tick: number }
  | { type: 'error'; message: string };
