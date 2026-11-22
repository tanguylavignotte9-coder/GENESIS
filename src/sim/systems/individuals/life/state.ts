import { appendColumns } from '../../../core/columns';

/** A day long before any game day (never happened). */
export const NEVER_DAY = -1_000_000;

/**
 * The life cycle of every person, as parallel typed arrays (compact): birth, who takes care of a
 * child, pregnancy, disease and immunity, what the body remembers of hunger, and the skill a person
 * was last seen practising (what a child watching learns). Grows with the people.
 */
export class LifeState {
  readonly diseaseCount: number;
  /** Absolute game day of birth (negative for the starting tribe). */
  readonly birthDay: Int32Array;
  readonly deathDay: Int32Array;
  /** Adult who takes care of a child (parent, then whoever took in the orphan); -1 = none. */
  readonly guardian: Int32Array;
  /** Day the pregnancy began (NEVER_DAY = not pregnant) and the father. */
  readonly pregnantSince: Int32Array;
  readonly pregnantBy: Int32Array;
  /** Day of the last birth given (a nursing mother). */
  readonly lastBirthDay: Int32Array;
  /** Disease (index in data, -1 = healthy), day it ends, who passed it on, and the epidemic event. */
  readonly disease: Int8Array;
  readonly diseaseSince: Int32Array;
  readonly diseaseEnds: Int32Array;
  readonly diseaseSource: Int32Array;
  readonly diseaseEvent: Int32Array;
  /** diseaseCount values per person: day until which the person cannot catch the disease again. */
  readonly immuneUntil: Int32Array;
  /** Mean hunger of the last days (0..100): what the body remembers (fertility, childbirth). */
  readonly nourishment: Float32Array;
  /** Skill practised at the last work step (-1 none) and the step it was: what children watch. */
  readonly lastSkill: Int8Array;
  readonly lastSkillStep: Int32Array;
  /** Skills practised on day `skillsDay` (bit k = skill k): every craft of the day counts, not only the last. */
  readonly skillsToday: Uint32Array;
  readonly skillsDay: Int32Array;
  /** Journal event of the birth (-1 for the starting tribe) and of being taken in (-1). */
  readonly birthEvent: Int32Array;
  readonly adoptionEvent: Int32Array;
  /** 1 once a wound left the person crippled for life, and the journal event that tells it (-1). */
  readonly crippled: Uint8Array;
  readonly crippledEvent: Int32Array;
  /** Build at birth (1 = average, inherited in part) and training of the body (0..1), see life/strength. */
  readonly build: Float32Array;
  readonly training: Float32Array;

  constructor(count: number, diseaseCount: number) {
    this.diseaseCount = diseaseCount;
    this.birthDay = new Int32Array(count);
    this.deathDay = new Int32Array(count).fill(NEVER_DAY);
    this.guardian = new Int32Array(count).fill(-1);
    this.pregnantSince = new Int32Array(count).fill(NEVER_DAY);
    this.pregnantBy = new Int32Array(count).fill(-1);
    this.lastBirthDay = new Int32Array(count).fill(NEVER_DAY);
    this.disease = new Int8Array(count).fill(-1);
    this.diseaseSince = new Int32Array(count);
    this.diseaseEnds = new Int32Array(count);
    this.diseaseSource = new Int32Array(count).fill(-1);
    this.diseaseEvent = new Int32Array(count).fill(-1);
    this.immuneUntil = new Int32Array(count * diseaseCount).fill(NEVER_DAY);
    this.nourishment = new Float32Array(count);
    this.lastSkill = new Int8Array(count).fill(-1);
    this.lastSkillStep = new Int32Array(count).fill(-1);
    this.skillsToday = new Uint32Array(count);
    this.skillsDay = new Int32Array(count).fill(-1);
    this.birthEvent = new Int32Array(count).fill(-1);
    this.adoptionEvent = new Int32Array(count).fill(-1);
    this.crippled = new Uint8Array(count);
    this.crippledEvent = new Int32Array(count).fill(-1);
    this.build = new Float32Array(count).fill(1);
    this.training = new Float32Array(count);
  }

  get capacity(): number {
    return this.birthDay.length;
  }

  /** Room for at least `count` people. */
  ensure(count: number): void {
    if (count <= this.capacity) return;
    appendColumns(this, new LifeState(Math.max(count - this.capacity, this.capacity), this.diseaseCount));
  }

  pregnant(person: number): boolean {
    return this.pregnantSince[person] !== NEVER_DAY;
  }
}
