import { appendColumns } from '../../core/columns';

/**
 * Every human, as parallel typed arrays (structure of arrays). People are never removed:
 * the dead keep their slot (alive = 0) so that family links stay valid. Births add a slot at the
 * end (the arrays grow by doubling: `count` slots are in use, the others wait).
 */
export const NEEDS = ['hunger', 'thirst', 'fatigue', 'cold', 'danger'] as const;
export type NeedId = (typeof NEEDS)[number];

export const DeathCause = { None: 0, Hunger: 1, Thirst: 2, Cold: 3, Predator: 4, OldAge: 5, Disease: 6, Childbirth: 7 } as const;
/** Number of death causes (None included): texts indexed by cause have this length. */
export const DEATH_CAUSE_COUNT = 8;
/** Room made at least when the arrays grow (technical). */
const MIN_GROWTH = 16;

export class People {
  /** Slots in use (living and dead); the arrays may be longer. */
  count: number;
  readonly names: string[];
  readonly alive: Uint8Array;
  readonly female: Uint8Array;
  readonly ageYears: Float32Array;
  readonly mother: Int32Array;
  readonly father: Int32Array;
  readonly spouse: Int32Array;
  readonly camp: Int32Array;
  /** traitCount values per person, 0..1. */
  readonly traits: Float32Array;
  readonly traitCount: number;
  /** Bit k set = knows knowledge k. */
  readonly knowledge: Uint32Array;
  /** skillCount values per person: level 0..1, and hours of practice (the most practised is the trade). */
  readonly skills: Float32Array;
  readonly practice: Float32Array;
  readonly skillCount: number;
  /** Mean distance from the camp of the last food harvests, and the last far spot where food was found. */
  readonly forageDistance: Float32Array;
  readonly farFood: Int32Array;
  /** Needs, 0 (satisfied) .. 100 (urgent). */
  readonly hunger: Float32Array;
  readonly thirst: Float32Array;
  readonly fatigue: Float32Array;
  readonly cold: Float32Array;
  readonly danger: Float32Array;
  readonly health: Float32Array;
  readonly x: Int16Array;
  readonly y: Int16Array;
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

  constructor(count: number, traitCount: number, skillCount: number, waterSlots: number, foodSlots: number) {
    this.count = count;
    this.traitCount = traitCount;
    this.skillCount = skillCount;
    this.waterSlots = waterSlots;
    this.foodSlots = foodSlots;
    this.names = new Array<string>(count).fill('');
    this.alive = new Uint8Array(count);
    this.female = new Uint8Array(count);
    this.ageYears = new Float32Array(count);
    this.mother = new Int32Array(count).fill(-1);
    this.father = new Int32Array(count).fill(-1);
    this.spouse = new Int32Array(count).fill(-1);
    this.camp = new Int32Array(count);
    this.traits = new Float32Array(count * traitCount);
    this.knowledge = new Uint32Array(count);
    this.skills = new Float32Array(count * skillCount);
    this.practice = new Float32Array(count * skillCount);
    this.forageDistance = new Float32Array(count);
    this.farFood = new Int32Array(count).fill(-1);
    this.hunger = new Float32Array(count);
    this.thirst = new Float32Array(count);
    this.fatigue = new Float32Array(count);
    this.cold = new Float32Array(count);
    this.danger = new Float32Array(count);
    this.health = new Float32Array(count).fill(100);
    this.x = new Int16Array(count);
    this.y = new Int16Array(count);
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

  /** Room for the arrays (slots in use or waiting). */
  get capacity(): number {
    return this.alive.length;
  }

  /** A new person at the end (all values at their defaults, alive). Returns their index. */
  add(): number {
    if (this.count >= this.capacity) {
      const extra = Math.max(MIN_GROWTH, this.capacity);
      appendColumns(this, new People(extra, this.traitCount, this.skillCount, this.waterSlots, this.foodSlots));
    }
    const person = this.count++;
    this.alive[person] = 1;
    return person;
  }

  trait(person: number, trait: number): number {
    return this.traits[person * this.traitCount + trait]!;
  }

  skill(person: number, skill: number): number {
    return this.skills[person * this.skillCount + skill]!;
  }

  /** The most practised skill (-1 if nothing practised for at least `minHours`). */
  trade(person: number, minHours: number): number {
    let best = -1;
    let bestHours = minHours;
    for (let s = 0; s < this.skillCount; s++) {
      const hours = this.practice[person * this.skillCount + s]!;
      if (hours >= bestHours) {
        best = s;
        bestHours = hours;
      }
    }
    return best;
  }

  get living(): number {
    let n = 0;
    for (let p = 0; p < this.count; p++) n += this.alive[p]!;
    return n;
  }
}
