import { formCouple } from '../individuals/social/milestones';
import type { Group } from '../groups/group';
import type { ConflictSystem } from './conflict-system';
import { Envoy, ExpeditionState, type TribeRelation } from './state';
import { fightersOf } from './war';
import { CONFLICT_EVENTS, placeAt, placeOfPerson, publish } from './texts';

const OFFERS = { peace: 'paix', truce: 'trêve', tribute: 'tribut' } as const;
/** Arrival distance of an emissary (tiles). */
const ARRIVED_TILES = 4;
/** Opinion regained by both sides when peace is made. */
const PEACE_OPINION = 30;

/**
 * Every day: truces run out, tributes are paid, and a tribe weary of war sends an emissary to offer
 * peace, a truce, or a tribute if it is the weaker. The emissary walks; the war goes on meanwhile.
 */
export function diplomacyDay(sys: ConflictSystem): void {
  const { params, humans } = sys;
  for (const relation of sys.relations.values()) {
    const a = sys.tribe(relation.a);
    const b = sys.tribe(relation.b);
    if (!a || !b) {
      relation.state = 'peace';
      relation.tributePayer = -1;
      continue;
    }
    if (relation.state === 'truce' && sys.day > relation.until) relation.state = 'peace';
    if (relation.tributePayer >= 0) payTribute(sys, relation, a, b);
    if (relation.state !== 'war') continue;
    for (const side of [0, 1]) {
      if (relation.weariness[side]! < params.war.peaceWeariness) continue;
      const mine = side === 0 ? a : b;
      const theirs = side === 0 ? b : a;
      if (sys.envoys.some((envoy) => envoy.stage < 2 && envoy.from === mine.id && envoy.to === theirs.id)) continue;
      const weak = fightersOf(sys, mine).length * 2 < theirs.members.filter((p) => sys.isFighter(p)).length;
      const offer = weak ? 'tribute' : relation.weariness[1 - side]! < params.war.peaceWeariness / 2 ? 'truce' : 'peace';
      sendEnvoy(sys, mine, theirs, offer, relation);
    }
  }
  void humans;
}

function payTribute(sys: ConflictSystem, relation: TribeRelation, a: Group, b: Group): void {
  const { params } = sys;
  if (sys.day > relation.tributeUntil) {
    relation.tributePayer = -1;
    return;
  }
  if (sys.day < relation.tributeNext) return;
  relation.tributeNext = sys.day + params.war.tributeEveryDays;
  const payer = relation.tributePayer === 0 ? a : b;
  const receiver = relation.tributePayer === 0 ? b : a;
  if (payer.camp < 0 || receiver.camp < 0) return;
  const goods = sys.humans.production.shareStock(payer.camp, receiver.camp, params.war.tributeShare);
  if (goods.length === 0) return;
  const camp = sys.humans.camps[payer.camp]!;
  publish(sys, CONFLICT_EVENTS.tributePaid, params.texts.tributePaid, { payeur: capitalize(payer.name), receveur: receiver.name, biens: goods.slice(0, 4).join(', ').toLowerCase() }, placeAt(sys, camp.centerX, camp.centerY), payer.leaders, [relation.event], {}, [payer.id, receiver.id]);
}

/** The most fitting emissary: a sociable adult who speaks the other tribe's language best. */
function sendEnvoy(sys: ConflictSystem, tribe: Group, other: Group, offer: Envoy['offer'], relation: TribeRelation): void {
  const { humans } = sys;
  const language = other.language;
  let best = -1;
  let bestScore = -Infinity;
  for (const p of tribe.members) {
    if (humans.life.isChild(p) || humans.people.alive[p] !== 1 || sys.mission[p]! >= 0 || sys.envoyOf[p]! >= 0 || humans.people.ageYears[p]! > 65) continue;
    const fluency = language >= 0 ? sys.ideas.holdings.fluencyIn(p, language) : 0;
    const score = humans.social.trait(p, 'sociability') + 2 * fluency + (tribe.leaders.includes(p) ? -0.5 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  if (best < 0) return;
  const reason = `la guerre a trop coûté à ${tribe.name}`;
  const event = publish(sys, CONFLICT_EVENTS.envoy, sys.params.texts.envoySent, { nom: humans.people.names[best]!, cible: other.name, offre: OFFERS[offer], tribu: tribe.name, raison: reason }, placeOfPerson(sys, best), [best], [relation.event], { other: other.id }, [tribe.id, other.id]);
  const envoy = new Envoy(best, tribe.id, other.id, offer, sys.day, reason, event);
  humans.production.takeRations(best, humans.production.body.dailyFood * sys.params.raid.rationDays);
  sys.envoyOf[best] = sys.envoys.length;
  sys.envoys.push(envoy);
}

/** Every hour: emissaries who reach the other camp deliver their offer; those back home are done. */
export function envoysHour(sys: ConflictSystem): void {
  const { humans } = sys;
  const people = humans.people;
  sys.envoys.forEach((envoy, index) => {
    if (envoy.stage >= 2) return;
    if (people.alive[envoy.person] !== 1) {
      envoy.stage = 2;
      return;
    }
    const tribe = envoy.stage === 0 ? envoy.to : envoy.from;
    const center = sys.campCenter(tribe);
    if (center < 0) {
      envoy.stage = 2;
      sys.envoyOf[envoy.person] = -1;
      return;
    }
    const near = people.distanceTo(envoy.person, (center % humans.size) + 0.5, Math.floor(center / humans.size) + 0.5) <= ARRIVED_TILES;
    if (!near) return;
    if (envoy.stage === 1) {
      envoy.stage = 2;
      if (sys.envoyOf[envoy.person] === index) sys.envoyOf[envoy.person] = -1;
      return;
    }
    deliver(sys, envoy);
    envoy.stage = 1;
  });
}

/**
 * The offer reaches the other tribe: understood or not (languages), accepted or not (their own
 * weariness, the memory of betrayals, their strength); the decision follows their regime.
 */
function deliver(sys: ConflictSystem, envoy: Envoy): void {
  const { params, groups, humans } = sys;
  const from = sys.tribe(envoy.from);
  const to = sys.tribe(envoy.to);
  if (!from || !to) return;
  const relation = sys.relation(from.id, to.id);
  if (relation.state !== 'war') return;
  const people = humans.people;
  const listener = to.leaders[0] ?? to.members[0] ?? -1;
  const understood = listener >= 0 ? Math.max(params.diplomacy.understandFloor, sys.ideas.understanding(envoy.person, listener)) : 0;
  const place = placeOfPerson(sys, listener >= 0 ? listener : envoy.person);
  if (sys.rng.nextFloat() >= understood) {
    publish(sys, CONFLICT_EVENTS.envoyLost, params.texts.envoyLost, { nom: people.names[envoy.person]!, tribu: from.name, cible: to.name, offre: OFFERS[envoy.offer] }, place, [envoy.person], [envoy.event], {}, [from.id, to.id]);
    return;
  }
  const side = sys.side(relation, to.id);
  const weariness = relation.weariness[side]! / params.war.peaceWeariness;
  const distrust = relation.betrayals[1 - side]! * params.diplomacy.betrayalWeight;
  const chance = envoy.offer === 'tribute' ? 0.9 - distrust : Math.min(0.95, 0.15 + weariness) - distrust;
  const wants = (p: number): boolean => sys.rng.nextFloat() < chance || humans.people.hunger[p]! > 70;
  if (sys.rng.nextFloat() >= chance || !groups.decideFor(to, wants)) return;
  conclude(sys, relation, from, to, envoy);
}

function conclude(sys: ConflictSystem, relation: TribeRelation, from: Group, to: Group, envoy: Envoy): void {
  const { params, groups, humans } = sys;
  const people = humans.people;
  const place = placeOfPerson(sys, envoy.person);
  const reason = envoy.reason;
  let event: number;
  if (envoy.offer === 'truce') {
    relation.state = 'truce';
    relation.until = sys.day + params.diplomacy.truceDays;
    sys.counts.truces++;
    event = publish(sys, CONFLICT_EVENTS.truce, params.texts.truce, { a: capitalize(from.name), b: to.name, jours: String(params.diplomacy.truceDays), raison: reason }, place, [envoy.person, ...to.leaders], [envoy.event], {}, [from.id, to.id]);
  } else {
    relation.state = 'peace';
    let marriage = '';
    if (envoy.offer === 'tribute') {
      relation.tributePayer = sys.side(relation, from.id);
      relation.tributeUntil = sys.day + params.war.tributeYears * humans.life.yearDays;
      relation.tributeNext = sys.day + params.war.tributeEveryDays;
      sys.counts.tributes++;
      event = publish(sys, CONFLICT_EVENTS.tribute, params.texts.tribute, { payeur: capitalize(from.name), receveur: to.name, raison: reason }, place, [envoy.person, ...to.leaders], [envoy.event], {}, [from.id, to.id]);
    } else {
      sys.counts.peaces++;
      marriage = diplomaticMarriage(sys, from, to);
      event = publish(sys, CONFLICT_EVENTS.peace, params.texts.peace, { a: capitalize(from.name), b: to.name, raison: reason, mariage: marriage }, place, [envoy.person, ...to.leaders], [envoy.event], {}, [from.id, to.id]);
    }
    groups.shiftOpinion(from, to, PEACE_OPINION);
    groups.shiftOpinion(to, from, PEACE_OPINION);
  }
  relation.event = event;
  relation.weariness[0] = 0;
  relation.weariness[1] = 0;
  // War parties already on the road do not know yet.
  for (const expedition of sys.expeditions) {
    const between = (expedition.tribe === from.id && expedition.target === to.id) || (expedition.tribe === to.id && expedition.target === from.id);
    if (between && expedition.state === ExpeditionState.Marching) expedition.unaware = envoy.offer === 'truce' ? 'trêve' : 'paix';
  }
  void people;
}

/** A peace may be sealed by a marriage between a single man and woman of the two tribes; the bride or groom joins the other tribe. */
function diplomaticMarriage(sys: ConflictSystem, a: Group, b: Group): string {
  const { humans, groups, params } = sys;
  if (sys.rng.nextFloat() >= params.diplomacy.marriageChance) return '';
  const people = humans.people;
  const single = (tribe: Group, female: boolean): number => {
    const leaderKin = tribe.members.filter((p) => tribe.leaders.some((l) => humans.social.kinOf(l, p) !== 0));
    const pool = [...leaderKin, ...tribe.members].filter((p) => people.alive[p] === 1 && people.spouse[p]! < 0 && !humans.life.isChild(p) && people.ageYears[p]! < 40 && (people.female[p] === 1) === female);
    return pool[0] ?? -1;
  };
  const fromA = single(a, false);
  const fromB = single(b, true);
  const pair = fromA >= 0 && fromB >= 0 ? [fromA, fromB] : [single(a, true), single(b, false)];
  if (pair[0]! < 0 || pair[1]! < 0) return '';
  formCouple(humans.social, pair[0]!, pair[1]!);
  // The bride or groom of the smaller tribe goes to live with the other.
  const [mover, host] = a.members.length < b.members.length ? [pair[0]!, b] : [pair[1]!, a];
  groups.capture(mover, host, 60);
  sys.counts.marriages++;
  return sys.params.texts.marriage.replace('{a}', people.names[pair[0]!]!).replace('{b}', people.names[pair[1]!]!);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
