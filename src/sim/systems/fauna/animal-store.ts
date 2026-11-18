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
  x = new Int16Array(0);
  y = new Int16Array(0);
  hunger = new Float32Array(0);
  thirst = new Float32Array(0);
  health = new Float32Array(0);
  state = new Uint8Array(0);
  group = new Int32Array(0);
  targetX = new Int16Array(0);
  targetY = new Int16Array(0);
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
  /** Spatial grid cell the animal is registered in. */
  cell = new Int32Array(0);

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
    this.state[slot] = State.Rest;
    this.living++;
    return slot;
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
    this.hunger = copy(this.hunger, (n) => new Float32Array(n));
    this.thirst = copy(this.thirst, (n) => new Float32Array(n));
    this.health = copy(this.health, (n) => new Float32Array(n));
    this.state = copy(this.state, (n) => new Uint8Array(n));
    this.group = copy(this.group, (n) => new Int32Array(n));
    this.targetX = copy(this.targetX, (n) => new Int16Array(n));
    this.targetY = copy(this.targetY, (n) => new Int16Array(n));
    this.targetAnimal = copy(this.targetAnimal, (n) => new Int32Array(n));
    this.huntsHuman = copy(this.huntsHuman, (n) => new Uint8Array(n));
    this.chase = copy(this.chase, (n) => new Int16Array(n));
    this.wariness = copy(this.wariness, (n) => new Float32Array(n));
    this.fleesHuman = copy(this.fleesHuman, (n) => new Uint8Array(n));
    this.pregnancy = copy(this.pregnancy, (n) => new Int16Array(n));
    this.cell = copy(this.cell, (n) => new Int32Array(n));
    this.capacity = capacity;
  }
}
