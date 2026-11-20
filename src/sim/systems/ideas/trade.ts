import { feel } from '../individuals/social/relations';
import type { Group } from '../groups/group';
import type { IdeasSystem } from './ideas-system';
import { Family } from './idea';
import { interpreterOf } from './language';
import { IDEA_EVENTS, publishIdeaEvent } from './texts';

/**
 * Exchanges: barter between people of different tribes who meet, carried by individuals and slowed
 * by distance (one must meet), language (one must understand each other, or find an interpreter)
 * and trust (what one's tribe thinks of the other, one's hospitality). When the wants do not match,
 * one may still accept a durable, light object because others accept it: if most adults of a tribe
 * end up accepting the same one, it becomes the tribe's good of exchange (shells, beads…).
 */

const PERCENT = 100;

/** Several times a day: who of different tribes are within reach of each other. */
export function encounters(sys: IdeasSystem): void {
  const groups = sys.groups;
  if (!groups || groups.tribes().length < 2) return;
  const humans = sys.humans;
  const people = humans.people;
  const reach = sys.params.trade.encounterTiles;
  const adultAge = groups.params.adultAge;
  for (let p = 0; p < people.count; p++) {
    if (people.alive[p] === 0 || people.ageYears[p]! < adultAge || p >= sys.holdings.count) continue;
    const tribe = groups.member[p * 3]!;
    if (tribe < 0) continue;
    humans.grid.forEachNear(people.px[p]!, people.py[p]!, reach, (q) => {
      if (q <= p || people.alive[q] === 0 || people.ageYears[q]! < adultAge || q >= sys.holdings.count) return;
      const theirs = groups.member[q * 3]!;
      if (theirs < 0 || theirs === tribe) return;
      const met = sys.metToday.get(p) ?? [];
      if (met.includes(q)) return;
      met.push(q);
      sys.metToday.set(p, met);
      const back = sys.metToday.get(q) ?? [];
      back.push(p);
      sys.metToday.set(q, back);
      barter(sys, p, q, groups.groups[tribe]!, groups.groups[theirs]!);
    });
  }
}

/** Items one may want in a barter: durable things the custom wants (tools, clothes, ornaments). */
function tradable(sys: IdeasSystem): number[] {
  return sys.humans.production.catalog.items.flatMap((item, index) => (item.food === 0 && item.wantPerMember > 0 ? [index] : []));
}

/** Something `taker` wants that `giver` could spare (-1 none). */
function wantFrom(sys: IdeasSystem, taker: number, giver: number): number {
  const production = sys.humans.production;
  for (const item of tradable(sys)) if (production.lacks(taker, item) && production.spareFor(giver, item) >= 1) return item;
  return -1;
}

function pairKey(a: Group, b: Group, what: string): string {
  return `${what}:${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`;
}

/** Two people of different tribes met: perhaps they barter. */
export function barter(sys: IdeasSystem, a: number, b: number, ta: Group, tb: Group): void {
  const params = sys.params.trade;
  const rng = sys.rng;
  const opinion = ta.known.get(tb.id)?.opinion ?? 0;
  const hospitality = valueOf(sys, a, 'hospitality');
  const chance = params.tradeChance * (0.25 + (0.75 * (opinion + PERCENT)) / (2 * PERCENT)) * (0.5 + hospitality);
  if (rng.nextFloat() >= chance) return;
  const wantA = wantFrom(sys, a, b);
  const wantB = wantFrom(sys, b, a);
  if (wantA < 0 && wantB < 0) return;
  const understood = understand(sys, a, b, ta, tb);
  if (rng.nextFloat() < params.misunderstanding * (1 - understood)) {
    misunderstand(sys, a, b, ta, tb);
    return;
  }
  if (wantA >= 0 && wantB >= 0) {
    exchange(sys, a, b, wantB, wantA, ta, tb);
    return;
  }
  // The wants do not match: the one who wants offers a good that others accept.
  const [buyer, seller, wanted] = wantA >= 0 ? [a, b, wantA] : [b, a, wantB];
  const token = tokenOffered(sys, buyer);
  if (token < 0) return;
  const h = sys.holdings;
  const accepted = h.token[seller] === token ? 0.3 + h.tokenTrust[seller]! : 0.15;
  if (rng.nextFloat() >= params.tokenAcceptChance * accepted) return;
  exchange(sys, buyer, seller, token, wanted, wantA >= 0 ? ta : tb, wantA >= 0 ? tb : ta);
  trustToken(sys, seller, token, params.tokenGain);
  trustToken(sys, buyer, token, params.tokenGain / 2);
}

/** How well they understand each other: directly, or through the best interpreter of their tribes. */
function understand(sys: IdeasSystem, a: number, b: number, ta: Group, tb: Group): number {
  const direct = sys.understanding(a, b);
  if (direct >= sys.params.language.speaksAbove) return direct;
  const go = interpreterOf(sys, ta, tb, sys.groups!.params.adultAge);
  if (go.person < 0 || go.skill <= direct) return direct;
  const key = pairKey(ta, tb, 'interpreter');
  if (go.skill >= sys.params.language.speaksAbove && !sys.toldPairs.has(key)) {
    sys.toldPairs.add(key);
    publishIdeaEvent(sys, IDEA_EVENTS.interpreter, sys.params.texts.interpreter, { nom: sys.humans.people.names[go.person]!, tribu_a: ta.name, tribu_b: tb.name }, go.person, [], {}, [a, b]);
  }
  return go.skill;
}

/** The good the buyer offers: the one they accept themselves, else a durable object that could become one. */
function tokenOffered(sys: IdeasSystem, buyer: number): number {
  const h = sys.holdings;
  const production = sys.humans.production;
  const own = h.token[buyer]!;
  if (own >= 0 && production.spareFor(buyer, own) >= 1) return own;
  for (const id of sys.params.trade.tokenItems) {
    const item = production.catalog.itemIndex.get(id) ?? -1;
    if (item >= 0 && production.spareFor(buyer, item) >= 1) return item;
  }
  return -1;
}

function trustToken(sys: IdeasSystem, person: number, item: number, gain: number): void {
  const h = sys.holdings;
  if (h.token[person] !== item) {
    if (h.tokenTrust[person]! > gain) return;
    h.token[person] = item;
    h.tokenTrust[person] = 0;
  }
  h.tokenTrust[person] = Math.min(1, h.tokenTrust[person]! + gain);
}

function exchange(sys: IdeasSystem, a: number, b: number, fromA: number, fromB: number, ta: Group, tb: Group): void {
  const production = sys.humans.production;
  if (!production.handOver(a, b, fromA)) return;
  if (!production.handOver(b, a, fromB)) return;
  const f = sys.params.trade.tradeFeels;
  feel(sys.humans.social, a, b, { affection: f, trust: f, respect: 0 }, 'traded');
  feel(sys.humans.social, b, a, { affection: f, trust: f, respect: 0 }, 'traded');
  const key = pairKey(ta, tb, 'trade');
  if (sys.toldPairs.has(key)) return;
  sys.toldPairs.add(key);
  const items = production.catalog.items;
  const people = sys.humans.people;
  publishIdeaEvent(sys, IDEA_EVENTS.trade, sys.params.texts.firstTrade, { a: people.names[a]!, b: people.names[b]!, tribu_a: ta.name, tribu_b: tb.name, objet_a: items[fromA]!.name.toLowerCase(), objet_b: items[fromB]!.name.toLowerCase() }, a, [], {}, [b]);
}

function misunderstand(sys: IdeasSystem, a: number, b: number, ta: Group, tb: Group): void {
  const f = sys.params.trade.tradeFeels;
  feel(sys.humans.social, a, b, { affection: -f / 2, trust: -f, respect: 0 }, 'quarrel');
  feel(sys.humans.social, b, a, { affection: -f / 2, trust: -f, respect: 0 }, 'quarrel');
  const key = pairKey(ta, tb, `mis${Math.floor(sys.day / sys.yearDays)}`);
  if (sys.toldPairs.has(key)) return;
  sys.toldPairs.add(key);
  const people = sys.humans.people;
  publishIdeaEvent(sys, IDEA_EVENTS.misunderstanding, sys.params.texts.misunderstanding, { a: people.names[a]!, b: people.names[b]!, tribu_a: ta.name, tribu_b: tb.name }, a, [], {}, [b]);
}

function valueOf(sys: IdeasSystem, person: number, id: string): number {
  const v = sys.params.values.findIndex((value) => value.id === id);
  return v < 0 ? 0.5 : sys.holdings.values[person * sys.holdings.valueCount + v]!;
}

/** Two people talked: the trust one has in a good of exchange passes, a little, to the other. */
export function tokenTalk(sys: IdeasSystem, a: number, b: number): void {
  const h = sys.holdings;
  const spread = sys.params.trade.tokenSpreadPerTalk;
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as const) {
    const item = h.token[x]!;
    if (item < 0) continue;
    const gain = spread * h.tokenTrust[x]!;
    if (h.token[y] === item || h.token[y] === -1 || h.tokenTrust[y]! < gain) trustToken(sys, y, item, gain);
  }
}

/** Every few days: trust in goods fades; a good that most adults of a tribe accept becomes its good of exchange. */
export function currencyCheck(sys: IdeasSystem): void {
  const groups = sys.groups;
  const h = sys.holdings;
  const params = sys.params.trade;
  const fade = 1 - (params.tokenDecayPerYear * sys.params.everyDays) / sys.yearDays;
  const people = sys.humans.people;
  for (let p = 0; p < people.count && p < h.count; p++) {
    if (h.token[p]! < 0) continue;
    h.tokenTrust[p] = h.tokenTrust[p]! * fade;
    if (h.tokenTrust[p]! < 0.02) h.token[p] = -1;
  }
  if (!groups) return;
  for (const tribe of groups.tribes()) {
    const counts = new Map<number, number[]>();
    let adults = 0;
    for (const p of tribe.members) {
      if (people.ageYears[p]! < groups.params.adultAge || p >= h.count) continue;
      adults++;
      if (h.token[p]! >= 0 && h.tokenTrust[p]! >= params.currencyStrength) {
        const list = counts.get(h.token[p]!) ?? [];
        list.push(p);
        counts.set(h.token[p]!, list);
      }
    }
    for (const [item, holders] of [...counts.entries()].sort((x, y) => x[0] - y[0])) {
      if (adults === 0 || holders.length < params.currencyShare * adults) continue;
      let idea = sys.ideas.find((other) => other.family === Family.Currency && other.item === item && other.alive);
      if (idea?.tribes.includes(tribe.id)) continue;
      const name = sys.humans.production.catalog.items[item]!.name;
      const first = holders.sort((x, y) => h.tokenTrust[y]! - h.tokenTrust[x]! || x - y)[0]!;
      const event = publishIdeaEvent(sys, IDEA_EVENTS.currency, sys.params.texts.currency, { objet: name.toLowerCase(), tribu: tribe.name, part: `${Math.round((holders.length / adults) * PERCENT)} %` }, first, [], { item: sys.humans.production.catalog.items[item]!.id });
      if (!idea) {
        idea = sys.addIdea(Family.Currency, name, -1, first, event, tribe.id);
        idea.item = item;
      }
      idea.tribes.push(tribe.id);
      idea.holders += holders.length;
    }
  }
}
