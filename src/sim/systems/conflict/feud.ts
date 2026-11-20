import type { JournalEvent } from '../../core/journal';
import { HUMAN_DEATH } from '../individuals/individuals-system';
import { ambitionTarget, offerAmbition } from '../individuals/social/ambitions';
import { feel } from '../individuals/social/relations';
import { Kin } from '../individuals/social/state';
import { judgeMurder } from './brawl';
import type { ConflictSystem } from './conflict-system';
import { Feud } from './state';
import { CONFLICT_EVENTS, e, placeOfPerson, publish } from './texts';

const FULL = 100;
const MURDER_GRUDGE = 60;

/** Close kin of a person: partner, parents, children, brothers and sisters (alive or not). */
function closeKin(sys: ConflictSystem, person: number): number[] {
  const people = sys.humans.people;
  const out = new Set<number>();
  for (const p of [people.spouse[person]!, people.mother[person]!, people.father[person]!]) if (p >= 0) out.add(p);
  for (let q = 0; q < people.count; q++) {
    if (q === person) continue;
    const kin = sys.humans.social.kinOf(person, q);
    if ((kin & (Kin.Child | Kin.Sibling)) !== 0) out.add(q);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Killings of yesterday, as the journal tells them: a murder (a brawl, a revenge) is judged by the
 * group and starts or feeds a feud between the two families; a death in battle leaves the victim's
 * kin with an enemy.
 */
export function readKillings(sys: ConflictSystem, events: readonly JournalEvent[]): void {
  for (const event of events) {
    if (event.type !== HUMAN_DEATH || event.details['killer'] === undefined) continue;
    const victim = Number(event.details['person']);
    const killer = Number(event.details['killer']);
    const kind = sys.killKinds.get(victim) ?? 'brawl';
    sys.killKinds.delete(victim);
    const social = sys.humans.social;
    for (const kin of closeKin(sys, victim)) {
      if (sys.humans.people.alive[kin] === 1 && kin !== killer) feel(social, kin, killer, { affection: -MURDER_GRUDGE, trust: -MURDER_GRUDGE, respect: 0 }, kind === 'battle' ? 'enemy' : 'murdered', event.id);
    }
    if (kind === 'battle' || kind === 'civil') continue;
    judgeMurder(sys, killer, victim, event.id);
    feedFeud(sys, killer, victim, event.id);
  }
}

/** A murder: the feud between the two families goes on, or begins; the victim's kin may swear revenge. */
function feedFeud(sys: ConflictSystem, killer: number, victim: number, death: number): void {
  const { humans, params } = sys;
  const people = humans.people;
  let feud = sys.feuds.find((f) => !f.ended && ((f.sides[0].has(victim) && f.sides[1].has(killer)) || (f.sides[1].has(victim) && f.sides[0].has(killer))));
  let victims = 0;
  if (!feud) {
    feud = new Feud(sys.feuds.length, sys.day, people.names[victim]!, people.names[killer]!);
    feud.sides[0].add(victim);
    for (const p of closeKin(sys, victim)) feud.sides[0].add(p);
    feud.sides[1].add(killer);
    for (const p of closeKin(sys, killer)) if (!feud.sides[0].has(p)) feud.sides[1].add(p);
    sys.feuds.push(feud);
  }
  victims = feud.sides[0].has(victim) ? 0 : 1;
  feud.lastBlood = sys.day;
  feud.events.push(death);
  // Those who loved the victim may swear revenge, by their character.
  const social = humans.social;
  const avengers: number[] = [];
  for (const p of feud.sides[victims]!) {
    if (people.alive[p] !== 1 || humans.life.isChild(p) || p === killer) continue;
    const want = params.feud.avengeChance * Math.max(0, 1 + (2 * social.trait(p, 'temper') - 1)) * Math.max(0, 1 - (social.trait(p, 'prudence') - 0.5));
    if (sys.rng.nextFloat() < want && offerAmbition(social, p, 'avenge', killer)) avengers.push(p);
  }
  if (avengers.length === 0) return;
  if (feud.events.length === 1) {
    sys.counts.feuds++;
    publish(sys, CONFLICT_EVENTS.feud, params.texts.feudBegins, { vengeur: people.names[avengers[0]!]!, victime: people.names[victim]!, tueur: people.names[killer]!, e: e(sys, victim) }, placeOfPerson(sys, avengers[0]!), [avengers[0]!, killer, victim], [death], { feud: feud.id });
  }
}

/**
 * Every day: children born into a feuding family join it; those who come of age hear the family's
 * story and may take up the revenge; an avenger who comes upon their target may strike; a feud with
 * no new blood for years may die out.
 */
export function feudDay(sys: ConflictSystem): void {
  const { humans, params } = sys;
  const people = humans.people;
  const yearDays = humans.life.yearDays;
  // Newborns of a feuding family.
  for (let p = sys.knownPeople; p < people.count; p++) {
    for (const feud of sys.feuds) {
      if (feud.ended) continue;
      for (const side of feud.sides) if (side.has(people.mother[p]!) || side.has(people.father[p]!)) side.add(p);
    }
  }
  sys.knownPeople = people.count;
  for (const feud of sys.feuds) {
    if (feud.ended) continue;
    const alive = feud.sides.map((side) => [...side].filter((p) => people.alive[p] === 1));
    if (alive[0]!.length === 0 || alive[1]!.length === 0) {
      feud.ended = true;
      continue;
    }
    for (const side of [0, 1]) {
      for (const p of alive[side]!) {
        if (humans.life.isChild(p)) continue;
        const age = people.ageYears[p]!;
        // Coming of age in a feuding family: the family's story makes the enemy one's own.
        if (age >= params.feud.sideAdultAge && age - params.feud.sideAdultAge < 1 / yearDays) inheritRevenge(sys, feud, p, side, alive[1 - side]!);
        const target = ambitionTarget(humans.social, p, 'avenge');
        if (target >= 0 && people.alive[target] === 1 && feud.sides[1 - side]!.has(target)) tryRevenge(sys, feud, p, target);
      }
    }
    if (sys.day - feud.lastBlood > params.feud.fadeYears * yearDays && sys.rng.nextFloat() < params.feud.fadeChancePerYear / yearDays) {
      feud.ended = true;
      sys.counts.feuds += 0;
      publish(sys, CONFLICT_EVENTS.feudEnds, params.texts.feudEnds, { a: feud.names[0], b: feud.names[1], ans: String(Math.round((sys.day - feud.day) / yearDays)) }, null, [], feud.events.slice(-1), { feud: feud.id });
    }
  }
}

function inheritRevenge(sys: ConflictSystem, feud: Feud, person: number, side: number, enemies: number[]): void {
  const social = sys.humans.social;
  const adults = enemies.filter((p) => !sys.humans.life.isChild(p));
  if (adults.length === 0) return;
  const want = sys.params.feud.avengeChance * Math.max(0, 1 + (2 * social.trait(person, 'temper') - 1));
  if (sys.rng.nextFloat() >= want) return;
  // The killers of one's family first, else whoever of theirs.
  const killers = adults.filter((p) => (sys.kills.get(p) ?? []).some((victim) => feud.sides[side]!.has(victim)));
  const pool = killers.length > 0 ? killers : adults;
  const target = pool[Math.floor(sys.rng.nextFloat() * pool.length)]!;
  if (offerAmbition(social, person, 'avenge', target)) feel(social, person, target, { affection: -MURDER_GRUDGE / 2, trust: -MURDER_GRUDGE / 2, respect: 0 }, 'murdered', feud.events.at(-1) ?? -1);
}

/** An avenger who comes upon their target may strike: a fight between the two. */
function tryRevenge(sys: ConflictSystem, feud: Feud, avenger: number, target: number): void {
  const { humans, params } = sys;
  const people = humans.people;
  const social = humans.social;
  if (people.distance(avenger, target) > params.feud.reachTiles || humans.life.isChild(avenger)) return;
  const chance = params.feud.actChancePerDay * Math.max(0, 1 + (2 * social.trait(avenger, 'temper') - 1)) * Math.max(0, 1.5 - social.trait(avenger, 'prudence'));
  if (sys.rng.nextFloat() >= chance) return;
  sys.currentFight = 'revenge';
  sys.counts.revenges++;
  const victim = feud.names[feud.sides[0].has(avenger) ? 0 : 1];
  const context = `pour venger les siens (${victim})`;
  let hurt = 0;
  for (let blow = 0; blow < params.brawl.blows * 2 && people.alive[avenger] === 1 && people.alive[target] === 1; blow++) {
    for (const [hitter, struck] of [
      [avenger, target],
      [target, avenger],
    ] as const) {
      if (people.alive[hitter] !== 1 || people.alive[struck] !== 1 || sys.rng.nextFloat() >= params.combat.hitChance) continue;
      const damage = params.combat.blowDamage * humans.life.vigor(hitter) * (0.5 + sys.rng.nextFloat());
      const outcome = humans.interactions.attack({ attacker: { kind: 'human', id: hitter }, target: { kind: 'human', id: struck }, damage, attackerName: people.names[hitter]!, tick: sys.tick, motive: 'fight', context, causes: feud.events.slice(-1) });
      if (struck === target) hurt += outcome.damage ?? 0;
      if (outcome.killed) {
        sys.counts.murders++;
        sys.noteKill(hitter, struck);
        return;
      }
    }
    if (hurt > FULL / 2) break;
  }
  feel(social, target, avenger, { affection: -MURDER_GRUDGE / 2, trust: -MURDER_GRUDGE / 2, respect: 0 }, 'assaulted');
  publish(sys, CONFLICT_EVENTS.revenge, params.texts.revenge, { a: people.names[avenger]!, b: people.names[target]!, victime: victim, bilan: hurt > 0 ? `${people.names[target]} s’en tire blessé${e(sys, target)}` : `${people.names[target]} lui échappe` }, placeOfPerson(sys, avenger), [avenger, target], feud.events.slice(-1), { feud: feud.id });
}
