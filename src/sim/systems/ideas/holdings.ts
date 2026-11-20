import { appendColumns } from '../../core/columns';

/** Languages a person can speak at most (mother tongue first). */
export const LANGUAGE_SLOTS = 3;

/**
 * The ideas each person carries, as compact typed arrays that grow with the population (one row
 * per person, dead people keep theirs). Knowledge: a bit field of what is known, the progress of
 * what is being learnt, which discovery each piece comes from and who taught it. Culture: one
 * culture and the person's own values. Languages: up to three, with fluency, and the way the mother
 * tongue is spoken (its drift). Religion: one, with its fervour and the person's own beliefs.
 * Exchange: the good the person accepts as payment, and how much.
 */
export class PersonIdeas {
  count: number;
  readonly knowledgeCount: number;
  readonly valueCount: number;
  readonly dialectCount: number;
  readonly beliefCount: number;
  /** Bit k set = knows knowledge k. */
  readonly known: Uint32Array;
  /** knowledgeCount per person: learning progress 0..1 (1 = known). */
  readonly learning: Float32Array;
  /** knowledgeCount per person: idea id of the discovery this knowledge comes from (-1 none). */
  readonly source: Int32Array;
  /** knowledgeCount per person: who taught it (-1: discovered oneself, or always known). */
  readonly teacher: Int32Array;
  /** knowledgeCount per person: day it was learnt or discovered. */
  readonly learntDay: Int32Array;
  readonly culture: Int32Array;
  /** Strength of the attachment to one's culture 0..1. */
  readonly cultureStrength: Float32Array;
  readonly values: Float32Array;
  /** LANGUAGE_SLOTS per person: language idea id (-1 empty) and fluency 0..1. */
  readonly language: Int32Array;
  readonly fluency: Float32Array;
  readonly dialect: Float32Array;
  readonly religion: Int32Array;
  readonly piety: Float32Array;
  readonly beliefs: Float32Array;
  /** Item index the person accepts as a good of exchange (-1 none), and how much 0..1. */
  readonly token: Int32Array;
  readonly tokenTrust: Float32Array;
  /** 1 once the person's ideas were set (at birth or at the start). */
  readonly ready: Uint8Array;

  constructor(count: number, knowledgeCount: number, valueCount: number, dialectCount: number, beliefCount: number) {
    this.count = count;
    this.knowledgeCount = knowledgeCount;
    this.valueCount = valueCount;
    this.dialectCount = dialectCount;
    this.beliefCount = beliefCount;
    this.known = new Uint32Array(count);
    this.learning = new Float32Array(count * knowledgeCount);
    this.source = new Int32Array(count * knowledgeCount).fill(-1);
    this.teacher = new Int32Array(count * knowledgeCount).fill(-1);
    this.learntDay = new Int32Array(count * knowledgeCount);
    this.culture = new Int32Array(count).fill(-1);
    this.cultureStrength = new Float32Array(count);
    this.values = new Float32Array(count * valueCount);
    this.language = new Int32Array(count * LANGUAGE_SLOTS).fill(-1);
    this.fluency = new Float32Array(count * LANGUAGE_SLOTS);
    this.dialect = new Float32Array(count * dialectCount);
    this.religion = new Int32Array(count).fill(-1);
    this.piety = new Float32Array(count);
    this.beliefs = new Float32Array(count * beliefCount);
    this.token = new Int32Array(count).fill(-1);
    this.tokenTrust = new Float32Array(count);
    this.ready = new Uint8Array(count);
  }

  /** Room for `capacity` people (new rows hold the defaults). */
  ensure(capacity: number): void {
    if (this.count >= capacity) return;
    appendColumns(this, new PersonIdeas(capacity - this.count, this.knowledgeCount, this.valueCount, this.dialectCount, this.beliefCount));
    this.count = capacity;
  }

  knows(person: number, knowledge: number): boolean {
    return (this.known[person]! & (1 << knowledge)) !== 0;
  }

  /** Fluency of the person in a language (0 if not spoken at all). */
  fluencyIn(person: number, language: number): number {
    for (let s = person * LANGUAGE_SLOTS; s < (person + 1) * LANGUAGE_SLOTS; s++) if (this.language[s] === language) return this.fluency[s]!;
    return 0;
  }

  /** Mother tongue (first slot). */
  motherTongue(person: number): number {
    return this.language[person * LANGUAGE_SLOTS]!;
  }

  /** Slot of a language for the person (an empty or the weakest foreign slot if `create`), -1 if none. */
  languageSlot(person: number, language: number, create: boolean): number {
    const base = person * LANGUAGE_SLOTS;
    let weakest = -1;
    for (let s = base; s < base + LANGUAGE_SLOTS; s++) {
      if (this.language[s] === language) return s;
      if (s === base) continue;
      if (this.language[s] === -1) return create ? this.claim(s, language) : -1;
      if (weakest < 0 || this.fluency[s]! < this.fluency[weakest]!) weakest = s;
    }
    return create && weakest >= 0 && this.fluency[weakest]! < 0.2 ? this.claim(weakest, language) : -1;
  }

  private claim(slot: number, language: number): number {
    this.language[slot] = language;
    this.fluency[slot] = 0;
    return slot;
  }
}
