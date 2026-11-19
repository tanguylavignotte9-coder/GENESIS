import { fillTemplate } from '../../../core/text';
import { describeLocation } from '../../world/places';
import { remember } from './feelings';
import { learn, witness, type Fact } from './news';
import { addKin, kinBase, removeKin } from './relations';
import type { SocialLife } from './social-life';
import { REASONS } from './params';
import { Kin, REASONS_PER_RELATION } from './state';
import { pairReasons, tieName } from './texts';

const FULL = 100;
const CONFLICT = new Set<number>([REASONS.indexOf('quarrel'), REASONS.indexOf('jealousy')]);

export const COUPLE_FORMED = 'social.couple';
export const GREAT_FRIENDSHIP = 'social.friendship';
export const FALLING_OUT = 'social.fallingOut';
export const SEPARATION = 'social.separation';
export const MOURNING = 'social.mourning';

function publishPair(life: SocialLife, type: string, template: string, a: number, b: number, negative = false): number {
  const reasons = pairReasons(life, a, b, negative);
  const x = life.people.x[a]!;
  const y = life.people.y[a]!;
  const causes = [...new Set(reasons.causes)].filter((id) => id >= 0 && life.journal.get(id) !== undefined);
  return life.journal.publish({
    tick: life.tick,
    type,
    text: fillTemplate(template, { a: life.name(a), b: life.name(b), raisons: reasons.text }),
    place: { x, y, label: describeLocation(life.world.landmasses, life.world.landmassNames, x, y, life.size) },
    actors: [
      { kind: 'human', id: a },
      { kind: 'human', id: b },
    ],
    causes,
    details: { a, b },
  });
}

/** Does the relation keep a reason of conflict (quarrels, jealousy)? */
function hasConflict(life: SocialLife, slot: number): boolean {
  const s = life.state;
  for (let r = slot * REASONS_PER_RELATION; r < (slot + 1) * REASONS_PER_RELATION; r++) if (CONFLICT.has(s.reasonCode[r]!)) return true;
  return false;
}

/** Can `a` be drawn to `b` as a partner (age, attraction, not family)? */
export function attracted(life: SocialLife, a: number, b: number): boolean {
  const { people } = life;
  const couples = life.params.couples;
  if (a === b || !life.alive(a) || !life.alive(b)) return false;
  if (people.ageYears[a]! < couples.minAge || people.ageYears[b]! < couples.minAge) return false;
  if (Math.abs(people.ageYears[a]! - people.ageYears[b]!) > couples.maxAgeGap) return false;
  if ((life.kinOf(a, b) & (Kin.Parent | Kin.Child | Kin.Sibling)) !== 0) return false;
  const sameSex = people.female[a] === people.female[b];
  return life.state.sameSex[a] === 1 ? sameSex : !sameSex;
}

/**
 * Free to form a couple: no living partner — and, for a widow or widower, the death known and the
 * grief eased.
 */
export function single(life: SocialLife, person: number): boolean {
  const partner = life.people.spouse[person]!;
  if (partner < 0) return true;
  if (life.alive(partner)) return false;
  return life.knowsDeathOf(person, partner) && life.griefFor(person, partner) < life.params.couples.mourningMemoryBelow;
}

/** Two people become a couple: journal (with the reasons of their affection), memories, the news spreads. */
export function formCouple(life: SocialLife, a: number, b: number): void {
  const { people } = life;
  people.spouse[a] = b;
  people.spouse[b] = a;
  addKin(life, a, b, Kin.Spouse);
  const event = publishPair(life, COUPLE_FORMED, life.params.texts.couple, a, b);
  remember(life, a, 'couple', b, 1, event);
  remember(life, b, 'couple', a, 1, event);
  const fact = life.news.add('couple', a, b, life.tileOf(a), life.day, event);
  learn(life, a, fact, 0, -1);
  learn(life, b, fact, 0, -1);
  witness(life, fact, people.px[a]!, people.py[a]!);
}

function separate(life: SocialLife, a: number, b: number): void {
  const { people } = life;
  people.spouse[a] = -1;
  people.spouse[b] = -1;
  removeKin(life, a, b, Kin.Spouse);
  const event = publishPair(life, SEPARATION, life.params.texts.separation, a, b, true);
  remember(life, a, 'separation', b, 1, event);
  remember(life, b, 'separation', a, 1, event);
}

/**
 * After feelings changed between two people: a great friendship, a falling-out or a separation is
 * told in the journal (once), with the reasons both keep.
 */
export function checkPair(life: SocialLife, a: number, b: number): void {
  const s = life.state;
  const rel = life.params.relations;
  const ab = s.slotOf(a, b);
  const ba = s.slotOf(b, a);
  if (ab < 0 || ba < 0) return;
  const spouses = life.people.spouse[a] === b && life.people.spouse[b] === a;
  if (spouses && Math.min(s.affection[ab]!, s.affection[ba]!) < life.params.couples.breakupAffection) {
    separate(life, a, b);
    return;
  }
  const great = rel.greatFriendAffection;
  if (!spouses && (s.kin[ab]! & ~Kin.Spouse) === 0 && s.toldFriendship[ab] === 0 && s.affection[ab]! >= great && s.affection[ba]! >= great) {
    s.toldFriendship[ab] = 1;
    s.toldFriendship[ba] = 1;
    const event = publishPair(life, GREAT_FRIENDSHIP, life.params.texts.friendship, a, b);
    remember(life, a, 'friendship', b, 1, event);
    remember(life, b, 'friendship', a, 1, event);
  }
  for (const slot of [ab, ba]) {
    // A friendship that merely fades is no falling-out: quarrels or jealousy must have done it.
    const fell = s.peakAffection[slot]! >= rel.friendAffection && s.affection[slot]! <= s.peakAffection[slot]! - rel.fallingOutDrop && hasConflict(life, slot);
    if (!fell || spouses || s.toldFallingOut[ab] === 1) continue;
    s.toldFallingOut[ab] = 1;
    s.toldFallingOut[ba] = 1;
    // A new friendship would have to grow again from here.
    s.peakAffection[ab] = s.affection[ab]!;
    s.peakAffection[ba] = s.affection[ba]!;
    s.toldFriendship[ab] = 0;
    s.toldFriendship[ba] = 0;
    publishPair(life, FALLING_OUT, life.params.texts.fallingOut, a, b, true);
    break;
  }
  // Friends again: a future falling-out can be told again.
  if (s.toldFallingOut[ab] === 1 && s.affection[ab]! >= rel.friendAffection && s.affection[ba]! >= rel.friendAffection) {
    s.toldFallingOut[ab] = 0;
    s.toldFallingOut[ba] = 0;
  }
}

/**
 * Someone learns of a death: grief for a relative or a friend (the deeper the bond, the stronger),
 * fear for a witness. Mourning a relative or a great friend is told in the journal.
 */
export function learnDeath(life: SocialLife, person: number, fact: Fact, from: number): void {
  const dead = fact.subject;
  const s = life.state;
  const slot = s.slotOf(person, dead);
  const kin = life.kinOf(person, dead) | (life.people.spouse[person] === dead ? Kin.Spouse : 0);
  // The deeper the bond (family ties included), the stronger the grief.
  const affection = Math.max(slot >= 0 ? s.affection[slot]! : 0, kinBase(life, kin).affection);
  const rel = life.params.relations;
  const scale = Math.max(0, affection) / FULL;
  const seen = from < 0;
  if (seen) remember(life, person, 'witnessedDeath', dead, 1, fact.event);
  if (scale <= 0) return;
  let event = fact.event;
  if (kin !== 0 || affection >= rel.greatFriendAffection) {
    const texts = life.params.texts;
    const x = life.people.x[person]!;
    const y = life.people.y[person]!;
    const witnessed = seen && fact.day === life.day;
    event = life.journal.publish({
      tick: life.tick,
      type: MOURNING,
      text: fillTemplate(witnessed ? texts.mourningWitness : texts.mourning, {
        nom: life.name(person),
        mort: life.name(dead),
        lien: tieName(life, person, dead),
        par: from >= 0 ? fillTemplate(texts.toldBy, { nom: life.name(from) }) : '',
      }),
      place: { x, y, label: describeLocation(life.world.landmasses, life.world.landmassNames, x, y, life.size) },
      actors: from >= 0 ? [{ kind: 'human', id: person }, { kind: 'human', id: dead }, { kind: 'human', id: from }] : [{ kind: 'human', id: person }, { kind: 'human', id: dead }],
      causes: fact.event >= 0 ? [fact.event] : [],
      details: { person, dead },
    });
  }
  remember(life, person, 'grief', dead, scale, event);
  // Long after the grief, those who knew the dead keep their memory.
  remember(life, person, 'lostOne', dead, scale, event);
}
