/**
 * Every human, as parallel typed arrays (structure of arrays). People are never removed:
 * the dead keep their slot (alive = 0) so that family links stay valid.
 */
export const NEEDS = ['hunger', 'thirst', 'fatigue', 'cold', 'danger'] as const;
export type NeedId = (typeof NEEDS)[number];

export const DeathCause = { None: 0, Hunger: 1, Thirst: 2, Cold: 3, Predator: 4 } as const;

export class People {
  readonly count: number;
  readonly names: string[];
  readonly alive: Uint8Array;
  readonly female: Uint8Array;
  readonly ageYears: Float32Array;
  readonly mother: Int32Array;
  readonly father: Int32Array;
  readonly spouse: Int32Array;
  readonly camp: Int32Array;
  readonly hut: Int32Array;
  /** traitCount values per person, 0..1. */
  readonly traits: Float32Array;
  readonly traitCount: number;
  /** Bit k set = knows knowledge k. */
  readonly knowledge: Uint32Array;
  /** Needs, 0 (satisfied) .. 100 (urgent). */
  readonly hunger: Float32Array;
  readonly thirst: Float32Array;
  readonly fatigue: Float32Array;
  readonly cold: Float32Array;
  readonly danger: Float32Array;
  readonly health: Float32Array;
  readonly x: Int16Array;
  readonly y: Int16Array;
  /** Carried food (units) and branches. */
  readonly food: Float32Array;
  readonly branches: Float32Array;
  /** Index of the current action in the data list. */
  readonly action: Uint8Array;
  /** Target tile of the action (-1 = none). */
  readonly target: Int32Array;
  /** 1 while the action is being performed on the spot (drinking, gathering, sleeping…). */
  readonly working: Uint8Array;
  readonly moveProgress: Float32Array;
  /** Step at which the person will reconsider its decision anyway. */
  readonly nextThink: Int32Array;
  /** Value (0..1) of the input that motivated the current action, for "why". */
  readonly reasonValue: Float32Array;
  /** The 3 best actions at the last decision, and their scores. */
  readonly topActions: Int16Array;
  readonly topScores: Float32Array;
  /** Animal slot of the predator seen nearby (-1 = none), refreshed every hour. */
  readonly threat: Int32Array;
  readonly isolated: Uint8Array;
  readonly deathCause: Uint8Array;
  /** Remembered places: tile and day last seen (waterSlots and foodSlots per person). */
  readonly waterMemory: Int32Array;
  readonly waterMemoryDay: Int32Array;
  readonly foodMemory: Int32Array;
  readonly foodMemoryDay: Int32Array;
  readonly waterSlots: number;
  readonly foodSlots: number;
  /** Current path (tile indices) and position in it. */
  readonly paths: (Int32Array | null)[];
  readonly pathIndex: Int32Array;

  constructor(count: number, traitCount: number, waterSlots: number, foodSlots: number) {
    this.count = count;
    this.traitCount = traitCount;
    this.waterSlots = waterSlots;
    this.foodSlots = foodSlots;
    this.names = new Array<string>(count).fill('');
    this.alive = new Uint8Array(count).fill(1);
    this.female = new Uint8Array(count);
    this.ageYears = new Float32Array(count);
    this.mother = new Int32Array(count).fill(-1);
    this.father = new Int32Array(count).fill(-1);
    this.spouse = new Int32Array(count).fill(-1);
    this.camp = new Int32Array(count);
    this.hut = new Int32Array(count).fill(-1);
    this.traits = new Float32Array(count * traitCount);
    this.knowledge = new Uint32Array(count);
    this.hunger = new Float32Array(count);
    this.thirst = new Float32Array(count);
    this.fatigue = new Float32Array(count);
    this.cold = new Float32Array(count);
    this.danger = new Float32Array(count);
    this.health = new Float32Array(count).fill(100);
    this.x = new Int16Array(count);
    this.y = new Int16Array(count);
    this.food = new Float32Array(count);
    this.branches = new Float32Array(count);
    this.action = new Uint8Array(count);
    this.target = new Int32Array(count).fill(-1);
    this.working = new Uint8Array(count);
    this.moveProgress = new Float32Array(count);
    this.nextThink = new Int32Array(count);
    this.reasonValue = new Float32Array(count);
    this.topActions = new Int16Array(count * 3).fill(-1);
    this.topScores = new Float32Array(count * 3);
    this.threat = new Int32Array(count).fill(-1);
    this.isolated = new Uint8Array(count);
    this.deathCause = new Uint8Array(count);
    this.waterMemory = new Int32Array(count * waterSlots).fill(-1);
    this.waterMemoryDay = new Int32Array(count * waterSlots);
    this.foodMemory = new Int32Array(count * foodSlots).fill(-1);
    this.foodMemoryDay = new Int32Array(count * foodSlots);
    this.paths = new Array<Int32Array | null>(count).fill(null);
    this.pathIndex = new Int32Array(count);
  }

  trait(person: number, trait: number): number {
    return this.traits[person * this.traitCount + trait]!;
  }

  get living(): number {
    let n = 0;
    for (const a of this.alive) n += a;
    return n;
  }
}
