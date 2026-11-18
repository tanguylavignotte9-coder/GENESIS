/** Typed messages exchanged between the display (renderer) and the simulation worker. */
import type { EventPlace } from '../sim/core/journal';
import type { BiomeTable } from '../sim/systems/world/biomes';
import type { ClimateParams } from '../sim/systems/world/climate-params';
import type { ResourceCatalog } from '../sim/core/resources';
import type { AnimalSpecies } from '../sim/systems/fauna/params';
import type { PlantSpecies } from '../sim/systems/flora/params';
import type { ActiveAnomaly } from '../sim/systems/world/climate-state';

/** Display -> simulation. */
export type ToSimMessage =
  | { type: 'start'; seed: number }
  /** Index into the speeds sent with 'worldReady'. */
  | { type: 'setSpeed'; speedIndex: number }
  | { type: 'setPaused'; paused: boolean }
  /** Asks for the details of a tile (plant, grass, fish) and, if `animalUid` >= 0, of an animal. */
  | { type: 'inspect'; requestId: number; tile: number; animalUid: number };

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

/** Content tables the display needs to draw and name plants and animals. */
export interface LifeTables {
  plants: PlantSpecies[];
  animals: AnimalSpecies[];
  resources: ResourceCatalog;
  /** Names of the animal states ("broute"…), indexed by state code. */
  animalStates: readonly string[];
}

/** Which plant grows where (sent every few days). */
export interface FloraSnapshot {
  /** 0 = none, k + 1 = plants[k]. */
  species: Uint8Array;
  /** 0..255 */
  growth: Uint8Array;
}

/** Every living animal, packed (sent several times per second). */
export interface FaunaSnapshot {
  count: number;
  uid: Int32Array;
  species: Uint8Array;
  x: Int16Array;
  y: Int16Array;
  state: Uint8Array;
}

export interface AnimalDetails {
  uid: number;
  species: number;
  ageDays: number;
  female: boolean;
  /** 0..100 */
  hunger: number;
  thirst: number;
  health: number;
  state: number;
  pregnant: boolean;
  groupSize: number;
}

export interface PlantDetails {
  species: number;
  ageDays: number;
  /** 0..1 */
  growth: number;
  health: number;
  /** Seasonal produce available right now (berries…), 0 if none. */
  produce: number;
}

export interface Inspection {
  requestId: number;
  tile: number;
  plant: PlantDetails | null;
  /** 0..100, grass not under snow. */
  grass: number;
  /** Fish stock on the tile and next to it. */
  fish: number;
  animal: AnimalDetails | null;
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
  | {
      type: 'worldReady';
      seed: number;
      world: WorldSnapshot;
      generationMs: number;
      speeds: number[];
      climate: ClimateParams;
      daysPerYear: number;
      life: LifeTables;
    }
  | { type: 'flora'; flora: FloraSnapshot }
  | { type: 'fauna'; fauna: FaunaSnapshot }
  /** New population samples (day, animals per species). */
  | { type: 'populations'; samples: { day: number; animals: number[] }[] }
  | { type: 'inspection'; inspection: Inspection }
  | { type: 'climateYear'; year: ClimateYearSnapshot }
  | { type: 'climateDay'; dayOfYear: number }
  | { type: 'journal'; entries: JournalEntry[] }
  | { type: 'status'; seed: number; tick: number; date: string; paused: boolean; speedIndex: number }
  | { type: 'error'; message: string };
