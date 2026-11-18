/** Typed messages exchanged between the display (renderer) and the simulation worker. */
import type { EventPlace } from '../sim/core/journal';
import type { BiomeTable } from '../sim/systems/world/biomes';
import type { ClimateParams } from '../sim/systems/world/climate-params';
import type { ResourceCatalog } from '../sim/core/resources';
import type { AnimalSpecies } from '../sim/systems/fauna/params';
import type { PlantSpecies } from '../sim/systems/flora/params';
import type { ActiveAnomaly } from '../sim/systems/world/climate-state';
import type { VariableValue } from '../sim/core/variables';
import type { PresetFile, WorkshopVariable } from '../sim/core/workshop';

/** Display -> simulation. */
export type ToSimMessage =
  | { type: 'start'; seed: number }
  /** Index into the speeds sent with 'worldReady'. */
  | { type: 'setSpeed'; speedIndex: number }
  | { type: 'setPaused'; paused: boolean }
  /** Asks for the details of a tile (plant, grass, fish) and, if `animalUid` >= 0, of an animal. */
  | { type: 'inspect'; requestId: number; tile: number; animalUid: number }
  /** Asks for the character sheet of a person. */
  | { type: 'inspectPerson'; requestId: number; person: number }
  /** Variables workshop: get the variables, change one, reset, presets. */
  | { type: 'workshopGet' }
  | { type: 'workshopSet'; file: string; key: string; value: VariableValue }
  | { type: 'workshopReset'; file: string; key: string }
  | { type: 'workshopResetAll' }
  | { type: 'workshopLoadPreset'; preset: PresetFile }
  /** Asks for the current values as a preset, to save it under this name. */
  | { type: 'workshopMakePreset'; name: string }
  | { type: 'workshopSaved'; name: string };

/** State of the variables workshop (sent after every change). */
export interface WorkshopSnapshot {
  variables: WorkshopVariable[];
  presetName: string | null;
  modified: boolean;
  /** Refusal or warnings of the last operation (French). */
  messages: string[];
  ok: boolean;
}

/** Performance of the simulation thread (sent twice a second). */
export interface PerfSnapshot {
  /** Mean computation time of one game day, in ms (over the last measures). */
  msPerDay: number;
  /** Share of the real time the simulation thread spent computing (0..1). */
  busyShare: number;
  requestedSpeed: number;
  /** Speed really reached (game time / real time, as a speed multiplier). */
  actualSpeed: number;
  paused: boolean;
  humans: number;
  animals: number;
  plants: number;
}

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

/** Who the humans are (sent once per world): identity and family links. */
export interface Roster {
  names: string[];
  female: Uint8Array;
  ageYears: Float32Array;
  mother: Int32Array;
  father: Int32Array;
  spouse: Int32Array;
  camp: Int32Array;
  /** Labels of the actions ("Va boire"), indexed like the action codes. */
  actionLabels: string[];
  actionNames: string[];
  traitNames: string[];
  knowledgeNames: string[];
  weatherNames: string[];
}

/** Where everybody is and what they do (sent several times per second). */
export interface HumansSnapshot {
  x: Int16Array;
  y: Int16Array;
  action: Uint8Array;
  /** Bit 0 alive, bit 1 working on the spot (asleep when the action is "sleep"). */
  flags: Uint8Array;
  camps: { fireX: number; fireY: number; lit: boolean; huts: number[] }[];
}

export const HumanFlag = { Alive: 1, Working: 2 } as const;

/** Character sheet of a person. */
export interface PersonDetails {
  requestId: number;
  person: number;
  alive: boolean;
  /** Death cause code (0 = alive). */
  deathCause: number;
  traits: number[];
  needs: { hunger: number; thirst: number; fatigue: number; cold: number; danger: number };
  health: number;
  food: number;
  branches: number;
  carryFood: number;
  carryBranches: number;
  action: number;
  /** Input that motivated the action and its value (0..1). */
  reason: string;
  reasonValue: number;
  top: { action: number; score: number }[];
  knowledge: number[];
  rememberedWater: number;
  rememberedFood: number;
  feltCelsius: number;
  weather: number;
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
      roster: Roster;
      weatherRegionTiles: number;
    }
  | { type: 'humans'; humans: HumansSnapshot }
  | { type: 'weather'; regions: Uint8Array }
  | { type: 'person'; details: PersonDetails }
  | { type: 'flora'; flora: FloraSnapshot }
  | { type: 'fauna'; fauna: FaunaSnapshot }
  /** New population samples (day, animals per species). */
  | { type: 'populations'; samples: { day: number; animals: number[] }[] }
  | { type: 'inspection'; inspection: Inspection }
  | { type: 'climateYear'; year: ClimateYearSnapshot }
  | { type: 'climateDay'; dayOfYear: number }
  | { type: 'journal'; entries: JournalEntry[] }
  | { type: 'status'; seed: number; tick: number; date: string; hour: number; paused: boolean; speedIndex: number }
  | { type: 'workshop'; workshop: WorkshopSnapshot }
  | { type: 'workshopPreset'; preset: PresetFile }
  /** After a live change: the tables the display draws with (climate, species, speeds). */
  | { type: 'liveTables'; climate: ClimateParams; life: LifeTables; speeds: number[] }
  | { type: 'perf'; perf: PerfSnapshot }
  | { type: 'error'; message: string };
