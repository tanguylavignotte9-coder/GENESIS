import { appendColumns } from '../../core/columns';

/**
 * Every human, as parallel typed arrays (structure of arrays). People are never removed:
 * the dead keep their slot (alive = 0) so that family links stay valid. Births add a slot at the
 * end (the arrays grow by doubling: `count` slots are in use, the others wait).
 */
export const NEEDS = ['hunger', 'thirst', 'fatigue', 'cold', 'danger'] as const;
export type NeedId = (typeof NEEDS)[number];

export const DeathCause = { None: 0, Hunger: 1, Thirst: 2, Cold: 3, Predator: 4, OldAge: 5, Disease: 6, Childbirth: 7, Violence: 8 } as const;
/** Number of death causes (None included): texts indexed by cause have this length. */
export const DEATH_CAUSE_COUNT = 9;
/** Kinds of harm counted per person (hunger, thirst, cold, disease), see `People.harm`. */
export const HARM_KINDS = 4;
/** Decisions kept per person for the visual brain (the last ones, with why the activity changed). */
export const DECISION_HISTORY = 20;
/** Why an activity changed (index kept in `People.histWhy`). */
export const ChangeWhy = { Ended: 0, Outscored: 1, Danger: 2 } as const;
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
  /** Tile under the person's feet (integer part of the free position). */
  readonly x: Int16Array;
  readonly y: Int16Array;
  /** Free position (decimal tiles), velocity (tiles per hour) and gait: natural movement (core/motion). */
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly gait: Uint8Array;
  /** Point the person walks to at the end of the current trip (her own spot at the target). */
  readonly goalX: Float32Array;
  readonly goalY: Float32Array;
  /** Number of the place the person took at her target (no two people of a camp take the same). */
  readonly spotSlot: Uint8Array;
  /** 1 once arrived on the goal point of the current target. */
  readonly settled: Uint8Array;
  /** Steps in a row without being able to move (blocked by water): the trip is given up. */
  readonly blocked: Uint8Array;
  /** Step of the last walk (whoever did not walk this step slows to a stop). */
  readonly lastWalk: Int32Array;
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
  /** 1 when the current action just ended (the next decision starts afresh). */
  readonly ended: Uint8Array;
  /**
   * The last DECISION_HISTORY changes of activity (ring per person, `histHead` = next slot): new
   * action, previous one, game tick, why (ChangeWhy) and the value of the new action's reason.
   */
  readonly histAction: Int16Array;
  readonly histFrom: Int16Array;
  readonly histTick: Int32Array;
  readonly histWhy: Uint8Array;
  readonly histValue: Float32Array;
  readonly histHead: Uint8Array;
  /** Animal slot of the predator seen nearby (-1 = none), refreshed every hour. */
  readonly threat: Int32Array;
  readonly isolated: Uint8Array;
  readonly deathCause: Uint8Array;
  /**
   * Health lost to each need since the body was last whole (HARM_KINDS per person: hunger, thirst,
   * cold, disease): the cause of a death is what wore the body down most, not the last blow.
   */
  readonly harm: Float32Array;
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
    this.px = new Float32Array(count);
    this.py = new Float32Array(count);
    this.vx = new Float32Array(count);
    this.vy = new Float32Array(count);
    this.gait = new Uint8Array(count);
    this.goalX = new Float32Array(count);
    this.goalY = new Float32Array(count);
    this.spotSlot = new Uint8Array(count);
    this.settled = new Uint8Array(count);
    this.blocked = new Uint8Array(count);
    this.lastWalk = new Int32Array(count).fill(-1);
    this.action = new Uint8Array(count);
    this.target = new Int32Array(count).fill(-1);
    this.working = new Uint8Array(count);
    this.moveProgress = new Float32Array(count);
    this.nextThink = new Int32Array(count);
    this.reasonValue = new Float32Array(count);
    this.topActions = new Int16Array(count * 3).fill(-1);
    this.topScores = new Float32Array(count * 3);
    this.ended = new Uint8Array(count);
    this.histAction = new Int16Array(count * DECISION_HISTORY).fill(-1);
    this.histFrom = new Int16Array(count * DECISION_HISTORY).fill(-1);
    this.histTick = new Int32Array(count * DECISION_HISTORY);
    this.histWhy = new Uint8Array(count * DECISION_HISTORY);
    this.histValue = new Float32Array(count * DECISION_HISTORY);
    this.histHead = new Uint8Array(count);
    this.threat = new Int32Array(count).fill(-1);
    this.isolated = new Uint8Array(count);
    this.deathCause = new Uint8Array(count);
    this.harm = new Float32Array(count * HARM_KINDS);
    this.waterMemory = new Int32Array(count * waterSlots).fill(-1);
    this.waterMemoryDay = new Int32Array(count * waterSlots);
    this.foodMemory = new Int32Array(count * foodSlots).fill(-1);
    this.foodMemoryDay = new Int32Array(count * foodSlots);
    this.paths = new Array<Int32Array | null>(count).fill(null);
    this.pathIndex = new Int32Array(count);
  }

  /** Records a change of activity in the person's history. */
  recordChange(person: number, action: number, from: number, tick: number, why: number, value: number): void {
    const at = person * DECISION_HISTORY + this.histHead[person]!;
    this.histAction[at] = action;
    this.histFrom[at] = from;
    this.histTick[at] = tick;
    this.histWhy[at] = why;
    this.histValue[at] = value;
    this.histHead[person] = (this.histHead[person]! + 1) % DECISION_HISTORY;
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

  /** Puts a person at a free position (decimal tiles); the tile under her feet follows. */
  placeAt(person: number, fx: number, fy: number): void {
    this.px[person] = fx;
    this.py[person] = fy;
    this.x[person] = Math.floor(fx);
    this.y[person] = Math.floor(fy);
  }

  /** Real distance between two people (tiles, from their free positions). */
  distance(a: number, b: number): number {
    const dx = this.px[a]! - this.px[b]!;
    const dy = this.py[a]! - this.py[b]!;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Real distance from a person to a point (decimal tiles). */
  distanceTo(person: number, x: number, y: number): number {
    const dx = this.px[person]! - x;
    const dy = this.py[person]! - y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Real distance from a person to the middle of a tile. */
  distanceToTile(person: number, tile: number, size: number): number {
    const tx = tile % size;
    return this.distanceTo(person, tx + 0.5, (tile - tx) / size + 0.5);
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
