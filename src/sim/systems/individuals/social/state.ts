import { EMOTIONS } from './params';

/** Family ties held in a relation (bits). */
export const Kin = { Spouse: 1, Parent: 2, Child: 4, Sibling: 8 } as const;

/** Reasons kept with each relation (the strongest ones). */
export const REASONS_PER_RELATION = 3;
/** Active ambitions at most per person (the design says 1 to 3). */
export const AMBITION_SLOTS = 3;

/**
 * Everything social about every person, as parallel typed arrays (compact): relations with the
 * people who count, short-lived emotions, loneliness, marking memories, what one knows of the
 * news, ambitions, and the conversation under way. Slots are fixed per person; when they are full,
 * the least important entry gives way.
 */
export class SocialState {
  count: number;
  readonly relationSlots: number;
  readonly memorySlots: number;
  readonly newsSlots: number;

  // ----- relations (relationSlots per person) -----
  /** The other person (-1 = free slot). */
  readonly relOther: Int32Array;
  readonly affection: Float32Array;
  readonly trust: Float32Array;
  readonly respect: Float32Array;
  /** Highest affection ever reached (a big drop from it is a falling-out). */
  readonly peakAffection: Float32Array;
  readonly kin: Uint8Array;
  /** 1 once this pair's great friendship (or falling-out) has been told in the journal. */
  readonly toldFriendship: Uint8Array;
  readonly toldFallingOut: Uint8Array;
  /** REASONS_PER_RELATION per relation: reason code (-1 none), weight, game day, journal event (-1). */
  readonly reasonCode: Int8Array;
  readonly reasonWeight: Float32Array;
  readonly reasonDay: Int32Array;
  readonly reasonEvent: Int32Array;

  // ----- feelings -----
  /** EMOTIONS.length values per person, 0..100. */
  readonly emotions: Float32Array;
  /** 0..100: grows while awake without anyone to talk to. */
  readonly loneliness: Float32Array;
  /** Traits at birth (personality drifts from them, within a limit). */
  readonly birthTraits: Float32Array;
  /** 0 = attracted to the other sex, 1 = to one's own. */
  readonly sameSex: Uint8Array;

  // ----- memories (memorySlots per person) -----
  readonly memKind: Int8Array;
  readonly memOther: Int32Array;
  readonly memWeight: Float32Array;
  readonly memDay: Int32Array;
  readonly memEvent: Int32Array;

  // ----- news one knows (newsSlots per person) -----
  readonly newsFact: Int32Array;
  /** 0 = first-hand, 1 = second-hand, 2 = told from far (fewer details). */
  readonly newsDetail: Uint8Array;

  // ----- ambitions (AMBITION_SLOTS per person) -----
  readonly ambition: Int8Array;
  /** Person (regain esteem) or skill (excel) the ambition is about, -1 if none. */
  readonly ambitionTarget: Int32Array;
  readonly ambitionSince: Int32Array;

  // ----- conversation under way -----
  readonly talkWith: Int32Array;
  readonly talkKind: Int8Array;
  readonly talkHours: Float32Array;
  /** 1 once the conversation took place (its effects are applied once). */
  readonly talkDone: Uint8Array;

  /** Last day this person turned a find into news (one a day at most). */
  readonly lastFoodNewsDay: Int32Array;
  readonly lastDangerNewsDay: Int32Array;

  constructor(count: number, traitCount: number, relationSlots: number, memorySlots: number, newsSlots: number) {
    this.count = count;
    this.relationSlots = relationSlots;
    this.memorySlots = memorySlots;
    this.newsSlots = newsSlots;
    const relations = count * relationSlots;
    this.relOther = new Int32Array(relations).fill(-1);
    this.affection = new Float32Array(relations);
    this.trust = new Float32Array(relations);
    this.respect = new Float32Array(relations);
    this.peakAffection = new Float32Array(relations);
    this.kin = new Uint8Array(relations);
    this.toldFriendship = new Uint8Array(relations);
    this.toldFallingOut = new Uint8Array(relations);
    this.reasonCode = new Int8Array(relations * REASONS_PER_RELATION).fill(-1);
    this.reasonWeight = new Float32Array(relations * REASONS_PER_RELATION);
    this.reasonDay = new Int32Array(relations * REASONS_PER_RELATION);
    this.reasonEvent = new Int32Array(relations * REASONS_PER_RELATION).fill(-1);
    this.emotions = new Float32Array(count * EMOTIONS.length);
    this.loneliness = new Float32Array(count);
    this.birthTraits = new Float32Array(count * traitCount);
    this.sameSex = new Uint8Array(count);
    const memories = count * memorySlots;
    this.memKind = new Int8Array(memories).fill(-1);
    this.memOther = new Int32Array(memories).fill(-1);
    this.memWeight = new Float32Array(memories);
    this.memDay = new Int32Array(memories);
    this.memEvent = new Int32Array(memories).fill(-1);
    const news = count * newsSlots;
    this.newsFact = new Int32Array(news).fill(-1);
    this.newsDetail = new Uint8Array(news);
    this.ambition = new Int8Array(count * AMBITION_SLOTS).fill(-1);
    this.ambitionTarget = new Int32Array(count * AMBITION_SLOTS).fill(-1);
    this.ambitionSince = new Int32Array(count * AMBITION_SLOTS);
    this.talkWith = new Int32Array(count).fill(-1);
    this.talkKind = new Int8Array(count).fill(-1);
    this.talkHours = new Float32Array(count);
    this.talkDone = new Uint8Array(count);
    this.lastFoodNewsDay = new Int32Array(count).fill(-1);
    this.lastDangerNewsDay = new Int32Array(count).fill(-1);
  }

  emotion(person: number, emotion: number): number {
    return this.emotions[person * EMOTIONS.length + emotion]!;
  }

  /** Slot of the relation of `person` with `other`, or -1. */
  slotOf(person: number, other: number): number {
    const base = person * this.relationSlots;
    for (let s = base; s < base + this.relationSlots; s++) if (this.relOther[s] === other) return s;
    return -1;
  }
}

export const EMOTION_INDEX = Object.fromEntries(EMOTIONS.map((id, k) => [id, k])) as Record<(typeof EMOTIONS)[number], number>;
