import { distance } from '../../../core/motion';
import { NEWS_KINDS, type NewsKind } from './params';
import type { SocialLife } from './social-life';

/** Most detail lost through retelling: 0 seen, 1 heard from a witness, 2 heard from far. */
export const MAX_DETAIL = 2;

/**
 * Something that happened and can be known: a death, a new couple, a place with food, a danger.
 * Facts are true (no lies yet); retelling only loses details.
 */
export interface Fact {
  id: number;
  kind: NewsKind;
  /** The dead, the first of the couple, the finder… */
  subject: number;
  /** The second of the couple (-1 otherwise). */
  other: number;
  tile: number;
  day: number;
  /** Journal event that told it (-1 if none): the cause of what it brings about. */
  event: number;
  /** Death cause code (deaths only). */
  cause: number;
  /** People who know it (the fact is dropped when nobody does any more). */
  knowers: number;
}

/** Every fact someone knows, and the recent deaths whose body may still be found. */
export class NewsBoard {
  readonly facts = new Map<number, Fact>();
  readonly unfoundDeaths: Fact[] = [];
  private nextId = 0;

  add(kind: NewsKind, subject: number, other: number, tile: number, day: number, event: number, cause = 0): Fact {
    const fact: Fact = { id: this.nextId++, kind, subject, other, tile, day, event, cause, knowers: 0 };
    this.facts.set(fact.id, fact);
    return fact;
  }
}

/** Slot where `person` keeps `fact`, or -1. */
function slotOf(life: SocialLife, person: number, fact: number): number {
  const s = life.state;
  for (let k = person * s.newsSlots; k < (person + 1) * s.newsSlots; k++) if (s.newsFact[k] === fact) return k;
  return -1;
}

export function knows(life: SocialLife, person: number, fact: number): boolean {
  return slotOf(life, person, fact) >= 0;
}

function worth(life: SocialLife, fact: Fact): number {
  const age = Math.max(0, life.day - fact.day);
  const kind = life.params.news.kinds[fact.kind];
  return kind.importance * (1 - age / (kind.forgetDays + 1));
}

/**
 * `person` learns a fact (seen: `from` = -1, or told by `from`) with some precision. Returns true
 * if it was new to them (then its consequences follow: grief, jealousy, a place to remember…).
 */
export function learn(life: SocialLife, person: number, fact: Fact, detail: number, from: number): boolean {
  if (!life.alive(person) || person === fact.subject) return false;
  const s = life.state;
  const known = slotOf(life, person, fact.id);
  if (known >= 0) {
    if (detail < s.newsDetail[known]!) s.newsDetail[known] = detail;
    return false;
  }
  let slot = -1;
  let least = Infinity;
  for (let k = person * s.newsSlots; k < (person + 1) * s.newsSlots; k++) {
    const id = s.newsFact[k]!;
    if (id < 0) {
      slot = k;
      break;
    }
    const held = life.news.facts.get(id);
    const value = held ? worth(life, held) : -1;
    if (value < least) {
      least = value;
      slot = k;
    }
  }
  if (s.newsFact[slot]! >= 0) {
    if (least >= worth(life, fact)) return false;
    drop(life, slot);
  }
  s.newsFact[slot] = fact.id;
  s.newsDetail[slot] = Math.min(MAX_DETAIL, detail);
  fact.knowers++;
  life.onLearn(person, fact, detail, from);
  return true;
}

function drop(life: SocialLife, slot: number): void {
  const s = life.state;
  const fact = life.news.facts.get(s.newsFact[slot]!);
  s.newsFact[slot] = -1;
  if (!fact) return;
  fact.knowers--;
  if (fact.knowers <= 0 && !life.news.unfoundDeaths.includes(fact)) life.news.facts.delete(fact.id);
}

/** Everybody who sees (x, y) at this moment learns the fact first-hand. */
export function witness(life: SocialLife, fact: Fact, x: number, y: number): number[] {
  const radius = life.params.news.witnessTiles;
  const seen: number[] = [];
  life.forEachNear(x, y, radius, (person) => {
    if (person === fact.subject || person === fact.other) return;
    if (learn(life, person, fact, 0, -1)) seen.push(person);
  });
  return seen;
}

/** Someone passing by a recent death finds out what happened. (x, y): where she is, in decimal tiles. */
export function discoverDeaths(life: SocialLife, person: number, x: number, y: number, perception: number): void {
  const size = life.size;
  for (const fact of life.news.unfoundDeaths) {
    const fx = (fact.tile % size) + 0.5;
    const fy = Math.floor(fact.tile / size) + 0.5;
    if (distance(fx, fy, x, y) <= perception) learn(life, person, fact, 0, -1);
  }
}

/**
 * A conversation: the speaker tells the listener the most important news the listener does not
 * know yet (a death in the listener's family first). Each retelling may lose a detail.
 */
export function tellNews(life: SocialLife, speaker: number, listener: number): void {
  const s = life.state;
  const limit = life.params.conversation.newsPerTalk;
  for (let told = 0; told < limit; told++) {
    let best = -1;
    let bestValue = 0;
    for (let k = speaker * s.newsSlots; k < (speaker + 1) * s.newsSlots; k++) {
      const id = s.newsFact[k]!;
      if (id < 0 || knows(life, listener, id)) continue;
      const fact = life.news.facts.get(id);
      if (!fact || fact.subject === listener || fact.other === listener) continue;
      let value = worth(life, fact);
      if (life.kinOf(listener, fact.subject) !== 0) value += 1;
      if (value > bestValue) {
        bestValue = value;
        best = k;
      }
    }
    if (best < 0) return;
    const fact = life.news.facts.get(s.newsFact[best]!)!;
    const detail = s.newsDetail[best]! + (life.rng.nextFloat() < life.params.news.detailLossChance ? 1 : 0);
    learn(life, listener, fact, detail, speaker);
  }
}

/** Every day: old news is forgotten; bodies are no longer found after a while. */
export function forgetNews(life: SocialLife): void {
  const s = life.state;
  const { kinds, discoveryDays } = life.params.news;
  for (let k = 0; k < s.newsFact.length; k++) {
    const id = s.newsFact[k]!;
    if (id < 0) continue;
    const fact = life.news.facts.get(id);
    if (!fact || life.day - fact.day > kinds[fact.kind].forgetDays) drop(life, k);
  }
  const unfound = life.news.unfoundDeaths;
  for (let k = unfound.length - 1; k >= 0; k--) {
    const fact = unfound[k]!;
    if (life.day - fact.day <= discoveryDays) continue;
    unfound.splice(k, 1);
    if (fact.knowers <= 0) life.news.facts.delete(fact.id);
  }
}

/** A remembered place, less precise when heard from others. */
export function fuzzyTile(life: SocialLife, tile: number, detail: number): number {
  const fuzz = life.params.news.fuzzTiles[Math.min(MAX_DETAIL, detail)] ?? 0;
  if (fuzz <= 0) return tile;
  const size = life.size;
  const x = Math.max(0, Math.min(size - 1, (tile % size) + life.rng.nextIntInclusive(-fuzz, fuzz)));
  const y = Math.max(0, Math.min(size - 1, Math.floor(tile / size) + life.rng.nextIntInclusive(-fuzz, fuzz)));
  return y * size + x;
}

export const NEWS_KIND_INDEX = Object.fromEntries(NEWS_KINDS.map((id, k) => [id, k])) as Record<NewsKind, number>;
