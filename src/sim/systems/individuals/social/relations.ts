import { REASONS, type Feelings, type ReasonId } from './params';
import type { SocialLife } from './social-life';
import { Kin, REASONS_PER_RELATION } from './state';

const LIMIT = 100;

function clamp(value: number): number {
  return value < -LIMIT ? -LIMIT : value > LIMIT ? LIMIT : value;
}

/** What family ties alone make one feel (the strongest tie counts). */
export function kinBase(life: SocialLife, kin: number): Feelings {
  const k = life.params.relations.kin;
  const base = { affection: 0, trust: 0, respect: 0 };
  const take = (f: Feelings): void => {
    base.affection = Math.max(base.affection, f.affection);
    base.trust = Math.max(base.trust, f.trust);
    base.respect = Math.max(base.respect, f.respect);
  };
  if (kin & Kin.Spouse) take(k.spouse);
  if (kin & Kin.Parent) take(k.parent);
  if (kin & Kin.Child) take(k.child);
  if (kin & Kin.Sibling) take(k.sibling);
  return base;
}

/** How much a relation counts (family always counts): used to keep only the relations that matter. */
function importance(life: SocialLife, slot: number): number {
  const s = life.state;
  const strength = Math.max(Math.abs(s.affection[slot]!), Math.abs(s.trust[slot]!), Math.abs(s.respect[slot]!));
  return s.kin[slot] !== 0 ? strength + 2 * LIMIT : strength;
}

/**
 * Slot of the relation of `person` with `other`; with `create`, a new relation is made if needed
 * (in a free slot, or in place of the one that counts least). -1 if none (or no room).
 */
export function relationSlot(life: SocialLife, person: number, other: number, create: boolean): number {
  const s = life.state;
  const found = s.slotOf(person, other);
  if (found >= 0 || !create || person === other) return found;
  const base = person * s.relationSlots;
  let slot = -1;
  let weakest = Infinity;
  for (let k = base; k < base + s.relationSlots; k++) {
    const holder = s.relOther[k]!;
    if (holder < 0 || !life.alive(holder)) {
      slot = k;
      break;
    }
    const value = importance(life, k);
    if (value < weakest) {
      weakest = value;
      slot = k;
    }
  }
  if (slot < 0 || (s.relOther[slot]! >= 0 && life.alive(s.relOther[slot]!) && s.kin[slot] !== 0)) return -1;
  clearSlot(life, slot);
  s.relOther[slot] = other;
  s.kin[slot] = life.kinOf(person, other);
  const feelings = kinBase(life, s.kin[slot]!);
  s.affection[slot] = feelings.affection;
  s.trust[slot] = feelings.trust;
  s.respect[slot] = feelings.respect;
  s.peakAffection[slot] = feelings.affection;
  if (s.kin[slot] !== 0) addReason(life, slot, s.kin[slot]! & Kin.Spouse ? 'spouse' : 'kin', feelings.affection, -1);
  return slot;
}

function clearSlot(life: SocialLife, slot: number): void {
  const s = life.state;
  s.relOther[slot] = -1;
  s.affection[slot] = 0;
  s.trust[slot] = 0;
  s.respect[slot] = 0;
  s.peakAffection[slot] = 0;
  s.kin[slot] = 0;
  s.toldFriendship[slot] = 0;
  s.toldFallingOut[slot] = 0;
  for (let r = slot * REASONS_PER_RELATION; r < (slot + 1) * REASONS_PER_RELATION; r++) {
    s.reasonCode[r] = -1;
    s.reasonWeight[r] = 0;
    s.reasonEvent[r] = -1;
  }
}

/** Keeps the main reasons of a relation: same reason adds up, a new one replaces the weakest. */
function addReason(life: SocialLife, slot: number, reason: ReasonId, weight: number, event: number): void {
  const s = life.state;
  const code = REASONS.indexOf(reason);
  const first = slot * REASONS_PER_RELATION;
  let target = -1;
  let weakest = first;
  for (let r = first; r < first + REASONS_PER_RELATION; r++) {
    if (s.reasonCode[r] === code) target = r;
    if (s.reasonWeight[r]! < s.reasonWeight[weakest]!) weakest = r;
  }
  if (target < 0) {
    if (s.reasonCode[weakest]! >= 0 && s.reasonWeight[weakest]! >= Math.abs(weight)) return;
    target = weakest;
    s.reasonCode[target] = code;
    s.reasonWeight[target] = 0;
  }
  s.reasonWeight[target] = s.reasonWeight[target]! + Math.abs(weight);
  s.reasonDay[target] = life.day;
  if (event >= 0) s.reasonEvent[target] = event;
}

/**
 * Changes what `person` feels for `other` and remembers why. Returns the relation's slot (-1 if
 * there was no room for it).
 */
export function feel(life: SocialLife, person: number, other: number, delta: Feelings, reason: ReasonId, event = -1): number {
  const slot = relationSlot(life, person, other, true);
  if (slot < 0) return -1;
  const s = life.state;
  s.affection[slot] = clamp(s.affection[slot]! + delta.affection);
  s.trust[slot] = clamp(s.trust[slot]! + delta.trust);
  s.respect[slot] = clamp(s.respect[slot]! + delta.respect);
  if (s.affection[slot]! > s.peakAffection[slot]!) s.peakAffection[slot] = s.affection[slot]!;
  const weight = Math.abs(delta.affection) + Math.abs(delta.trust) + Math.abs(delta.respect);
  if (weight > 0) addReason(life, slot, reason, weight, event);
  return slot;
}

/** Affection of `person` for `other` (0 if unknown). */
export function affectionFor(life: SocialLife, person: number, other: number): number {
  const slot = life.state.slotOf(person, other);
  return slot < 0 ? 0 : life.state.affection[slot]!;
}

/** Every day, relations drift back toward what family ties alone make one feel; weak ones are forgotten. */
export function wearRelations(life: SocialLife): void {
  const s = life.state;
  const { decayPerDay, forgetBelow, reasonHalfLifeDays } = life.params.relations;
  const fade = Math.exp(-Math.LN2 / reasonHalfLifeDays);
  for (let slot = 0; slot < s.relOther.length; slot++) {
    const other = s.relOther[slot]!;
    if (other < 0) continue;
    const person = Math.floor(slot / s.relationSlots);
    if (!life.alive(person)) continue;
    const base = kinBase(life, s.kin[slot]!);
    s.affection[slot] = toward(s.affection[slot]!, base.affection, decayPerDay);
    s.trust[slot] = toward(s.trust[slot]!, base.trust, decayPerDay);
    s.respect[slot] = toward(s.respect[slot]!, base.respect, decayPerDay);
    const faint = Math.abs(s.affection[slot]!) < forgetBelow && Math.abs(s.trust[slot]!) < forgetBelow && Math.abs(s.respect[slot]!) < forgetBelow;
    if (s.kin[slot] === 0 && faint) {
      clearSlot(life, slot);
      continue;
    }
    for (let r = slot * REASONS_PER_RELATION; r < (slot + 1) * REASONS_PER_RELATION; r++) s.reasonWeight[r] = s.reasonWeight[r]! * fade;
  }
}

function toward(value: number, base: number, step: number): number {
  return value > base ? Math.max(base, value - step) : Math.min(base, value + step);
}

/** Living friends of a person (affection above the friendship threshold). */
export function friendCount(life: SocialLife, person: number): number {
  const s = life.state;
  let n = 0;
  const base = person * s.relationSlots;
  for (let slot = base; slot < base + s.relationSlots; slot++) {
    const other = s.relOther[slot]!;
    if (other >= 0 && life.alive(other) && s.kin[slot] === 0 && s.affection[slot]! >= life.params.relations.friendAffection) n++;
  }
  return n;
}

/** A new tie of kinship between two people (a couple): both relations learn it. */
export function addKin(life: SocialLife, person: number, other: number, kin: number): void {
  for (const [a, b] of [
    [person, other],
    [other, person],
  ] as const) {
    const slot = relationSlot(life, a, b, true);
    if (slot >= 0) life.state.kin[slot] = life.state.kin[slot]! | kin;
  }
}

export function removeKin(life: SocialLife, person: number, other: number, kin: number): void {
  for (const [a, b] of [
    [person, other],
    [other, person],
  ] as const) {
    const slot = life.state.slotOf(a, b);
    if (slot >= 0) life.state.kin[slot] = life.state.kin[slot]! & ~kin;
  }
}
