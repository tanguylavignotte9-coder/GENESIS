/**
 * Every living animal, stored as parallel typed arrays (structure of arrays).
 * A slot is reused after a death; `uid` identifies an individual for its whole life.
 */
export const State = {
  Rest: 0,
  Wander: 1,
  Eat: 2,
  Drink: 3,
  Flee: 4,
  Hunt: 5,
  Migrate: 6,
  Follow: 7,
  Forage: 8,
  SeekWater: 9,
} as const;
export type StateCode = (typeof State)[keyof typeof State];

/** Shown to the player (tooltip). */
export const STATE_NAMES: readonly string[] = [
  'se repose',
  'se promène',
  'mange',
  'boit',
  'fuit un prédateur',
  'chasse',
  'migre',
  'suit son groupe',
  'cherche à manger',
  'cherche de l’eau',
  'fuit les humains',
];

/** Display-only state code: fleeing a human (the simulation state is Flee, with `fleesHuman`). */
export const FLEES_HUMAN_STATE = 10;

export const Sex = { Female: 0, Male: 1 } as const;
const INITIAL_CAPACITY = 1024;
/** "Never gave birth" (technical: far in the past). */
const NEVER = -1000000;

export class AnimalStore {
  capacity = 0;
  /** Number of slots ever used (living or free). */
  slots = 0;
  living = 0;
  private nextUid = 1;
  private free: number[] = [];

  alive = new Uint8Array(0);
  uid = new Int32Array(0);
  species = new Uint8Array(0);
  sex = new Uint8Array(0);
  ageDays = new Float32Array(0);
  /** Tile under the animal (integer part of its free position). */
  x = new Int16Array(0);
  y = new Int16Array(0);
  /** Free position (decimal tiles), velocity (tiles per hour) and gait: natural movement (core/motion). */
  px = new Float32Array(0);
  py = new Float32Array(0);
  vx = new Float32Array(0);
  vy = new Float32Array(0);
  gait = new Uint8Array(0);
  /** Last push away from too close neighbours (tiles per hour), refreshed when the animal thinks. */
  pushX = new Float32Array(0);
  pushY = new Float32Array(0);
  hunger = new Float32Array(0);
  thirst = new Float32Array(0);
  health = new Float32Array(0);
  state = new Uint8Array(0);
  group = new Int32Array(0);
  /** Point the animal heads for (decimal tiles). */
  targetX = new Float32Array(0);
  targetY = new Float32Array(0);
  /** Hunted being (hunters) — or -1: an animal slot, or a person if `huntsHuman` is 1. */
  targetAnimal = new Int32Array(0);
  /** 1 while the hunter's target is a human (seen through the humans' view of the world). */
  huntsHuman = new Uint8Array(0);
  /** Steps left in the current chase. */
  chase = new Int16Array(0);
  /** Individual wariness toward humans (1 = as wary as the species on average). */
  wariness = new Float32Array(0);
  /** 1 while the animal is running away from a human (it sprints). */
  fleesHuman = new Uint8Array(0);
  /** Days of pregnancy left, 0 = not pregnant. */
  pregnancy = new Int16Array(0);
  /** Day of the last litter (a mother raising her young does not conceive again at once). */
  lastBirthDay = new Int32Array(0);
  /** Days of illness left (0 = healthy), then days of immunity left. */
  sickDays = new Uint8Array(0);
  immuneDays = new Int16Array(0);
  /** Spatial grid cell the animal is registered in. */
  cell = new Int32Array(0);
  /**
   * Domestic animals (husbandry): the camp that keeps it (-1 = wild), its owner (a person, -1 =
   * the camp in common), where it lives (the pen, decimal tiles), how tame it is (0..1), the days
   * it was last milked and shorn, and the journal event of its capture (-1).
   */
  ownerCamp = new Int32Array(0);
  ownerPerson = new Int32Array(0);
  homeX = new Float32Array(0);
  homeY = new Float32Array(0);
  /** 1 when its home is a pen (an animal kept without a pen escapes more easily). */
  penned = new Uint8Array(0);
  tame = new Float32Array(0);
  milkedDay = new Int32Array(0);
  shornDay = new Int32Array(0);
  captureEvent = new Int32Array(0);

  constructor() {
    this.grow(INITIAL_CAPACITY);
  }

  /** Allocates a slot for a newborn (or initial) animal and returns it. Fields must then be set. */
  add(): number {
    let slot = this.free.pop();
    if (slot === undefined) {
      if (this.slots === this.capacity) this.grow(this.capacity * 2);
      slot = this.slots++;
    }
    this.alive[slot] = 1;
    this.uid[slot] = this.nextUid++;
    this.targetAnimal[slot] = -1;
    this.huntsHuman[slot] = 0;
    this.chase[slot] = 0;
    this.fleesHuman[slot] = 0;
    this.wariness[slot] = 1;
    this.pregnancy[slot] = 0;
    this.lastBirthDay[slot] = NEVER;
    this.sickDays[slot] = 0;
    this.immuneDays[slot] = 0;
    this.ownerCamp[slot] = -1;
    this.ownerPerson[slot] = -1;
    this.penned[slot] = 0;
    this.tame[slot] = 0;
    this.milkedDay[slot] = NEVER;
    this.shornDay[slot] = NEVER;
    this.captureEvent[slot] = -1;
    this.state[slot] = State.Rest;
    this.vx[slot] = 0;
    this.vy[slot] = 0;
    this.gait[slot] = 0;
    this.pushX[slot] = 0;
    this.pushY[slot] = 0;
    this.living++;
    return slot;
  }

  /** Kept by humans (a domestic animal)? */
  isDomestic(slot: number): boolean {
    return this.ownerCamp[slot]! >= 0;
  }

  remove(slot: number): void {
    if (this.alive[slot] === 0) return;
    this.alive[slot] = 0;
    this.living--;
    this.free.push(slot);
  }

  private grow(capacity: number): void {
    const copy = <T extends Uint8Array | Int16Array | Int32Array | Float32Array>(old: T, make: (n: number) => T): T => {
      const next = make(capacity);
      next.set(old);
      return next;
    };
    this.alive = copy(this.alive, (n) => new Uint8Array(n));
    this.uid = copy(this.uid, (n) => new Int32Array(n));
    this.species = copy(this.species, (n) => new Uint8Array(n));
    this.sex = copy(this.sex, (n) => new Uint8Array(n));
    this.ageDays = copy(this.ageDays, (n) => new Float32Array(n));
    this.x = copy(this.x, (n) => new Int16Array(n));
    this.y = copy(this.y, (n) => new Int16Array(n));
    this.px = copy(this.px, (n) => new Float32Array(n));
    this.py = copy(this.py, (n) => new Float32Array(n));
    this.vx = copy(this.vx, (n) => new Float32Array(n));
    this.vy = copy(this.vy, (n) => new Float32Array(n));
    this.gait = copy(this.gait, (n) => new Uint8Array(n));
    this.pushX = copy(this.pushX, (n) => new Float32Array(n));
    this.pushY = copy(this.pushY, (n) => new Float32Array(n));
    this.hunger = copy(this.hunger, (n) => new Float32Array(n));
    this.thirst = copy(this.thirst, (n) => new Float32Array(n));
    this.health = copy(this.health, (n) => new Float32Array(n));
    this.state = copy(this.state, (n) => new Uint8Array(n));
    this.group = copy(this.group, (n) => new Int32Array(n));
    this.targetX = copy(this.targetX, (n) => new Float32Array(n));
    this.targetY = copy(this.targetY, (n) => new Float32Array(n));
    this.targetAnimal = copy(this.targetAnimal, (n) => new Int32Array(n));
    this.huntsHuman = copy(this.huntsHuman, (n) => new Uint8Array(n));
    this.chase = copy(this.chase, (n) => new Int16Array(n));
    this.wariness = copy(this.wariness, (n) => new Float32Array(n));
    this.fleesHuman = copy(this.fleesHuman, (n) => new Uint8Array(n));
    this.pregnancy = copy(this.pregnancy, (n) => new Int16Array(n));
    this.lastBirthDay = copy(this.lastBirthDay, (n) => new Int32Array(n));
    this.sickDays = copy(this.sickDays, (n) => new Uint8Array(n));
    this.immuneDays = copy(this.immuneDays, (n) => new Int16Array(n));
    this.cell = copy(this.cell, (n) => new Int32Array(n));
    this.ownerCamp = copy(this.ownerCamp, (n) => new Int32Array(n));
    this.ownerPerson = copy(this.ownerPerson, (n) => new Int32Array(n));
    this.homeX = copy(this.homeX, (n) => new Float32Array(n));
    this.homeY = copy(this.homeY, (n) => new Float32Array(n));
    this.penned = copy(this.penned, (n) => new Uint8Array(n));
    this.tame = copy(this.tame, (n) => new Float32Array(n));
    this.milkedDay = copy(this.milkedDay, (n) => new Int32Array(n));
    this.shornDay = copy(this.shornDay, (n) => new Int32Array(n));
    this.captureEvent = copy(this.captureEvent, (n) => new Int32Array(n));
    this.capacity = capacity;
  }
}
