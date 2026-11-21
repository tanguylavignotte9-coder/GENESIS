import type { KnowledgeTreeFacts } from '../sim/systems/ideas/knowledge-tree';
import type { HistorySample } from '../sim/history';
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
import type { SocialDetails } from '../sim/systems/individuals/social/describe';
import type { BrainFacts } from '../sim/core/brain-facts';
import type { PersonConflictFacts } from '../sim/systems/conflict/describe';
import type { GovernanceFacts } from '../sim/systems/groups/governance';
import type { LifeFacts } from '../sim/systems/individuals/life/describe';
import type { SaveMeta } from '../sim/core/save/save';
import type { GroupsFacts, MembershipFacts } from '../sim/systems/groups/describe';
import type { IdeasFacts, PersonIdeasFacts } from '../sim/systems/ideas/describe';

export type { HistorySample, TribeSample } from '../sim/history';
export type { GroupFacts, GroupsFacts } from '../sim/systems/groups/describe';
export type { IdeaFacts, IdeasFacts, PersonIdeasFacts } from '../sim/systems/ideas/describe';
export type { KnowledgeTreeFacts, TreeNode } from '../sim/systems/ideas/knowledge-tree';

/** Why a world is saved: by the player, automatically, or when the game closes. */
export type SaveReason = 'manual' | 'auto' | 'quit';

/** Display -> simulation. */
export type ToSimMessage =
  /**
   * New world. `benchmark`: the render test's world — default values (never the active preset), and
   * plants and animals live alone for `warmupYears` years first, to reach their balance.
   */
  | { type: 'start'; seed: number; benchmark?: { warmupYears: number } }
  /** Index into the speeds sent with 'worldReady'. */
  | { type: 'setSpeed'; speedIndex: number }
  | { type: 'setPaused'; paused: boolean }
  /** Asks for the details of a tile (plant, grass, fish) and, if `animalUid` >= 0, of an animal. */
  | { type: 'inspect'; requestId: number; tile: number; animalUid: number }
  /** Asks for the character sheet of a person. */
  | { type: 'inspectPerson'; requestId: number; person: number }
  /** Visual brain: watch a person (index) or an animal (uid), or nobody ('none'). */
  | { type: 'watchBrain'; kind: 'human' | 'animal' | 'none'; id: number }
  /** Visual governance of a tribe (group id). */
  | { type: 'inspectGovernance'; tribe: number }
  /** Knowledge tree (view K) as seen from a tribe (-1: the first one). */
  | { type: 'inspectKnowledgeTree'; tribe: number }
  /** Asks for the details of a building (function, state, stock…). */
  | { type: 'inspectBuilding'; requestId: number; building: number }
  /** Variables workshop: get the variables, change one, reset, presets. */
  | { type: 'workshopGet' }
  | { type: 'workshopSet'; file: string; key: string; value: VariableValue }
  | { type: 'workshopReset'; file: string; key: string }
  | { type: 'workshopResetAll' }
  | { type: 'workshopLoadPreset'; preset: PresetFile }
  /** Asks for the current values as a preset, to save it under this name. */
  | { type: 'workshopMakePreset'; name: string }
  | { type: 'workshopSaved'; name: string }
  /** Asks for the running world as bytes (answered by 'saveData'). */
  | { type: 'save'; requestId: number; reason: SaveReason }
  /** Replaces the running world by a saved one (bytes of a save body). */
  | { type: 'load'; body: Uint8Array; label: string };

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
  /** Share of its computing budget the simulation thread used (0..1; at 1 the game slows down). */
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
  /** Building types (ids drive the drawing, names the display) and item names. */
  buildings: { id: string; name: string; function: string }[];
  items: { name: string; category: string }[];
}

/** Which plant grows where (sent every few days). */
export interface FloraSnapshot {
  /** 0 = none, k + 1 = plants[k]. */
  species: Uint8Array;
  /** 0..255 */
  growth: Uint8Array;
  /** 1 where the plant has something to pick right now (its berries, ears… are drawn). */
  fruit: Uint8Array;
}

/** Every living animal, packed (sent several times per second). */
/** Pace of movement: ticks and game hours between two steps of a person and of an animal. */
export interface MotionInfo {
  ticksPerHumanStep: number;
  ticksPerAnimalStep: number;
  hoursPerHumanStep: number;
  hoursPerAnimalStep: number;
  /** Game ticks per real second at speed x1 (the display knows each speed's pace at once). */
  ticksPerRealSecond: number;
}

export interface FaunaSnapshot {
  count: number;
  uid: Int32Array;
  species: Uint8Array;
  /** Free position (decimal tiles) and velocity (tiles per game hour). */
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  /** 0 still, 1 walking, 2 running (Gait of sim/core/motion). */
  gait: Uint8Array;
  state: Uint8Array;
  /** 1 for a domestic animal (drawn with a collar and a pied coat). */
  domestic: Uint8Array;
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
  /** A domestic animal: who keeps it (« de la tribu des Tamuki »), its owner if a person, how tame (0..1). Null if wild. */
  domestic: { keeper: string; owner: number; tame: number; name: string } | null;
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
  /** 1 = alive (the roster is sent again when someone is born or dies, and once a day). */
  alive: Uint8Array;
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
  skillNames: string[];
  /** Trade of each skill, for a man and for a woman ("Chasseur", "Chasseuse"). */
  professions: string[];
  professionsFemale: string[];
  weatherNames: string[];
  /** Identifiers of the weather types (« rain », « snow »…), indexed like the names: the map draws rain and snow. */
  weatherIds: string[];
}

/** Where everybody is and what they do (sent several times per second). */
export interface HumansSnapshot {
  /** Free position (decimal tiles), velocity (tiles per game hour) and gait (0 still, 1 walking, 2 running). */
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  gait: Uint8Array;
  action: Uint8Array;
  /** Bit 0 alive, bit 1 working on the spot (asleep when the action is "sleep"). */
  flags: Uint8Array;
}

/** A building or construction site as drawn on the map. */
export interface BuildingView {
  id: number;
  /** Index in LifeTables.buildings. */
  type: number;
  x: number;
  y: number;
  /** 0 site, 1 built, 2 abandoned. */
  state: number;
  /** 0..1 for a site. */
  progress: number;
  lit: boolean;
  /** Share (0..1) of a stock's protected room in use, for storage buildings and the camp's open heap. */
  fill: number;
  /** Field: 0 fallow, 1 growing, 2 ripe. */
  crop: number;
}

/** Every building and site, plus where each camp's common stock lies and how much it holds. */
export interface BuildingsSnapshot {
  buildings: BuildingView[];
  /** Camps whose stock lies in an open heap (no storage building): its tile and size (bulk). */
  heaps: { x: number; y: number; bulk: number }[];
  /** Belongings of the dead lying on the ground far from the camps (decimal tiles). */
  belongings: { x: number; y: number }[];
}

/** One line of an inventory, for the display. */
export interface ItemLine {
  /** Index in LifeTables.items. */
  item: number;
  qty: number;
  quality: number;
}

/** Details of a building (tooltip and panel). */
export interface BuildingDetails {
  requestId: number;
  building: number;
  type: number;
  description: string;
  state: number;
  progress: number;
  /** For a site: each material, delivered / needed. */
  materials: { name: string; delivered: number; needed: number }[];
  workDone: number;
  workNeeded: number;
  builders: string[];
  residents: string[];
  /** Who is inside right now (closed building), with what they do. */
  occupants: { person: number; name: string; doing: string }[];
  sleeps: number;
  quality: number;
  /** Fire: hours left out of max. */
  fuel: number;
  fuelMax: number;
  /** Storage (or the fire with the heap): the camp's common stock. */
  stock: ItemLine[] | null;
  capacity: number;
  /** Field: units sown, growth days, crop waiting. */
  crop: { sown: number; growth: number; growthDays: number; grain: number } | null;
}

/** Inside: in a closed building (hut, granary, workshop…), not drawn on the map. */
export const HumanFlag = { Alive: 1, Working: 2, Fighting: 4, Inside: 8 } as const;

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
  /** What the person carries (and wears). */
  carried: ItemLine[];
  load: number;
  carryCapacity: number;
  /** Level (0..1) and practice hours of each skill; the trade is the most practised skill (-1 none). */
  skills: number[];
  practice: number[];
  trade: number;
  /** What the person is doing in detail ("Taille un couteau de pierre"), if working on a recipe. */
  work: string;
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
  /** Current partner (-1 none): couples form and part during the game. */
  spouse: number;
  social: SocialDetails;
  life: LifeDetails;
  /** Tribe, clan and household, role in each, duty. */
  groups: MembershipFacts;
  /** Knowledge (and where it comes from), culture, languages, religion, good of exchange. */
  ideas: PersonIdeasFacts | null;
  /** Wounds of war, victims, personal enemies, a war party or an embassy (step 11). */
  conflict: PersonConflictFacts;
}

/** Life cycle side of a character sheet. */
export type LifeDetails = LifeFacts;

/** Human population (sent once a game day): census since the last message, age pyramid, causes of death. */
export interface HumanStats {
  samples: { day: number; humans: number }[];
  /** Living people per age band (bandYears wide), men and women. */
  bandYears: number;
  men: number[];
  women: number[];
  deaths: { cause: string; count: number }[];
  births: number;
}

/** A journal event as shown to the player. */
export interface JournalEntry {
  id: number;
  /** "Jour 1 · Printemps · An 3" */
  date: string;
  text: string;
  place: EventPlace | null;
  causes: number[];
  /** People named in the event (clickable in the journal). */
  people: number[];
  /** Kind of event (« life.birth », « conflict.battle »…), absolute game day, tribes concerned. */
  type: string;
  day: number;
  tribes: number[];
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
      /** Ticks between two steps of the humans and of the animals (for smooth movement on screen). */
      motion: MotionInfo;
      /** True for the render test's world. */
      benchmark: boolean;
      /** Name of the save the world comes from (null: a new world). */
      loadedFrom: string | null;
    }
  /** The running world as bytes. Unasked (`requestId` -1) for an automatic save. */
  | { type: 'saveData'; requestId: number; reason: SaveReason; meta: SaveMeta; body: Uint8Array; autosaveSlots: number }
  /** A save could not be made or loaded (French); the running world goes on. */
  | { type: 'saveFailed'; requestId: number; message: string }
  | { type: 'humans'; humans: HumansSnapshot }
  /** Tribes, clans and households (sent once a game day). */
  | { type: 'groups'; groups: GroupsFacts }
  /** Knowledge, cultures, languages, religions, goods of exchange and named places (sent once a game day). */
  | { type: 'ideas'; ideas: IdeasFacts }
  | { type: 'weather'; regions: Uint8Array }
  | { type: 'person'; details: PersonDetails }
  /** Visual brain of the watched person or animal (sent while it is watched). */
  | { type: 'brain'; brain: BrainFacts }
  | { type: 'governance'; governance: GovernanceFacts | null }
  | { type: 'knowledgeTree'; tree: KnowledgeTreeFacts | null }
  /** Recent battles (tile and game hours since), for the map. */
  | { type: 'battles'; battles: { x: number; y: number; age: number }[] }
  /** The people changed (births, ages, couples): identity and family links again. */
  | { type: 'roster'; roster: Roster }
  | { type: 'humanStats'; stats: HumanStats }
  /** Statistics of the world and of each tribe at this moment (every few game days). */
  | { type: 'history'; sample: HistorySample }
  | { type: 'buildings'; buildings: BuildingsSnapshot }
  | { type: 'building'; details: BuildingDetails }
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
