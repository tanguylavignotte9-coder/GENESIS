import { EMOTIONS, MEMORY_KINDS, type EmotionId, type MemoryKind } from './params';
import type { SocialLife } from './social-life';
import { EMOTION_INDEX } from './state';

const FULL = 100;
const LN2 = Math.LN2;

/** Adds to an emotion (0..100). */
export function stir(life: SocialLife, person: number, emotion: EmotionId, amount: number): void {
  const at = person * EMOTIONS.length + EMOTION_INDEX[emotion];
  const e = life.state.emotions;
  e[at] = Math.max(0, Math.min(FULL, e[at]! + amount));
}

/**
 * Records a marking memory (`scale` 0..1 of the kind's intensity): it stirs its emotion at once,
 * shapes the personality a little (within a limit from birth), and keeps the emotion alive while
 * it stays strong. The weakest memory gives way when all slots are taken.
 */
export function remember(life: SocialLife, person: number, kind: MemoryKind, other: number, scale: number, event = -1): void {
  const s = life.state;
  const params = life.params.memories;
  const def = params.kinds[kind];
  const weight = def.intensity * scale;
  if (weight < params.forgetBelow) return;
  const code = MEMORY_KINDS.indexOf(kind);
  const base = person * s.memorySlots;
  let slot = -1;
  let previous = 0;
  for (let k = base; k < base + s.memorySlots; k++) {
    // The same memory (kind and person) is refreshed rather than duplicated.
    if (s.memKind[k] === code && s.memOther[k] === other) {
      slot = k;
      previous = s.memWeight[k]!;
      break;
    }
  }
  if (slot < 0) {
    slot = base;
    for (let k = base; k < base + s.memorySlots; k++) {
      if (s.memKind[k]! < 0) {
        slot = k;
        break;
      }
      if (s.memWeight[k]! < s.memWeight[slot]!) slot = k;
    }
    if (s.memKind[slot]! >= 0 && s.memWeight[slot]! >= weight) return;
  }
  s.memKind[slot] = code;
  s.memOther[slot] = other;
  s.memWeight[slot] = Math.max(previous, weight);
  s.memDay[slot] = life.day;
  if (event >= 0 || previous === 0) s.memEvent[slot] = event;
  stir(life, person, def.emotion, weight);
  // Only what is new in the experience shapes the personality (a memory refreshed does not add up).
  if (weight > previous) shapePersonality(life, person, def.traits, (weight - previous) / Math.max(1, def.intensity));
}

/** Great events shape the personality a little (design: "personnalité évolutive"). */
function shapePersonality(life: SocialLife, person: number, effects: Record<string, number>, scale: number): void {
  const people = life.people;
  // A child is shaped more by what it lives through (famine, grief, affection), and further.
  const childhood = life.shaping(person);
  const drift = life.params.memories.maxTraitDrift + childhood.extraDrift;
  for (const [id, change] of Object.entries(effects)) {
    const t = life.traitIndex(id);
    if (t < 0) continue;
    const at = person * people.traitCount + t;
    const born = life.state.birthTraits[at]!;
    const next = people.traits[at]! + change * scale * childhood.factor;
    people.traits[at] = Math.max(0, Math.min(1, Math.max(born - drift, Math.min(born + drift, next))));
  }
}

/** Every day, memories fade (half-life of their kind); faint ones are forgotten. */
export function fadeMemories(life: SocialLife): void {
  const s = life.state;
  const params = life.params.memories;
  const factors = MEMORY_KINDS.map((kind) => Math.exp(-LN2 / params.kinds[kind].halfLifeDays));
  for (let k = 0; k < s.memKind.length; k++) {
    const code = s.memKind[k]!;
    if (code < 0) continue;
    s.memWeight[k] = s.memWeight[k]! * factors[code]!;
    if (s.memWeight[k]! < params.forgetBelow) {
      s.memKind[k] = -1;
      s.memOther[k] = -1;
      s.memEvent[k] = -1;
    }
  }
}

/** Strongest memory of a kind (about `other`, or anyone if -1): its weight, 0 if none. */
export function memoryWeight(life: SocialLife, person: number, kind: MemoryKind, other = -1): number {
  const s = life.state;
  const code = MEMORY_KINDS.indexOf(kind);
  let best = 0;
  for (let k = person * s.memorySlots; k < (person + 1) * s.memorySlots; k++) {
    if (s.memKind[k] === code && (other < 0 || s.memOther[k] === other)) best = Math.max(best, s.memWeight[k]!);
  }
  return best;
}

/**
 * Every step: emotions calm down, but not below what strong memories keep alive (a fresh grief
 * keeps sadness up, and it comes back after a consolation); loneliness grows while awake, faster
 * for the sociable.
 */
export function liveFeelings(life: SocialLife, person: number, hours: number, awake: boolean, sociability: number): void {
  const s = life.state;
  const params = life.params;
  const n = EMOTIONS.length;
  memoryFloors(life, person, FLOORS);
  for (let e = 0; e < n; e++) {
    const at = person * n + e;
    const floor = FLOORS[e]!;
    // Emotions drift toward what the memories keep alive: down when calming, back up after a relief.
    const step = params.emotions[EMOTIONS[e]!].decayPerHour * hours;
    const now = s.emotions[at]!;
    s.emotions[at] = now > floor ? Math.max(floor, now - step) : Math.min(floor, now + step);
  }
  if (awake) {
    const rate = params.loneliness.perHour * (1 + params.loneliness.sociabilityEffect * (2 * sociability - 1));
    s.loneliness[person] = Math.min(FULL, s.loneliness[person]! + rate * hours);
  }
}

const FLOORS = new Float64Array(EMOTIONS.length);

/** For each emotion, the level that the person's memories keep alive. */
function memoryFloors(life: SocialLife, person: number, floors: Float64Array): void {
  const s = life.state;
  floors.fill(0);
  for (let k = person * s.memorySlots; k < (person + 1) * s.memorySlots; k++) {
    const code = s.memKind[k]!;
    if (code < 0) continue;
    const e = life.memoryEmotion[code]!;
    floors[e] = Math.max(floors[e]!, s.memWeight[k]! * life.params.memories.feelShare);
  }
}
