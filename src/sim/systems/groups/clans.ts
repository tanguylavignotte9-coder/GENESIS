import type { Group } from './group';
import type { GroupsSystem } from './groups-system';
import { capitalize, syncClan, topOf } from './membership';
import { designateLeaders } from './leaders';
import { bestRegime, feeling, groupFactors } from './power';
import { genderVars, GROUP_EVENTS, listNames, nameOf, publishGroupEvent } from './texts';
import { groupName } from './texts';
import { hasAmbition } from '../individuals/social/ambitions';
import { AMBITIONS } from '../individuals/social/params';

const FOUND_CLAN = AMBITIONS.indexOf('foundClan');

/**
 * Clans form by themselves, over the generations: households tied by blood (a parent, a child, a
 * brother or a sister in each) gather around the eldest of their line; an ambitious adult may also
 * rally the households of their friends. A household without a clan joins the one it is most tied to.
 */
export function formClans(sys: GroupsSystem): void {
  for (const tribe of sys.tribes()) {
    const free = sys.childrenOf(tribe).filter((group) => group.level === 2 && group.members.length > 0);
    if (free.length > 0) {
      lineageClans(sys, tribe, free);
      ambitiousClans(sys, tribe);
    }
    joinClans(sys, tribe);
  }
}

/** Strength of the ties between two households: blood ties and friendships between their adults. */
function ties(sys: GroupsSystem, a: Group, b: Group): number {
  const { params } = sys;
  let tie = 0;
  for (const p of a.members) {
    for (const q of b.members) {
      const kin = sys.humans.social.kinOf(p, q);
      if (kin !== 0 && (sys.people.mother[p] === q || sys.people.father[p] === q || sys.people.mother[q] === p || sys.people.father[q] === p || sharesParent(sys, p, q))) tie += params.clans.kinTie;
      else if (sys.isAdult(p) && sys.isAdult(q) && feeling(sys, p, q, 'affection') >= params.clans.friendAffection) tie += params.clans.kinTie / 2;
    }
  }
  return tie;
}

function sharesParent(sys: GroupsSystem, p: number, q: number): boolean {
  const { mother, father } = sys.people;
  return (mother[p]! >= 0 && mother[p] === mother[q]) || (father[p]! >= 0 && father[p] === father[q]);
}

/** Households of a living elder and of their children's households: a clan of the same blood. */
function lineageClans(sys: GroupsSystem, tribe: Group, free: Group[]): void {
  const { people, params } = sys;
  for (const family of free) {
    if (family.parent !== tribe.id || family.members.length === 0) continue;
    const kin = free.filter((other) => other !== family && other.parent === tribe.id && ties(sys, family, other) >= params.clans.kinTie);
    const households = [family, ...kin];
    const members = households.reduce((sum, group) => sum + group.members.length, 0);
    if (households.length < params.clans.minFamilies || members < params.clans.minMembers) continue;
    // The eldest adult of these households gives the clan its name.
    let elder = -1;
    for (const group of households) for (const person of group.members) if (sys.isAdult(person) && (elder < 0 || people.ageYears[person]! > people.ageYears[elder]!)) elder = person;
    if (elder < 0) continue;
    const reason = fillVars(params.texts.clanKin, { familles: listNames(households.map((group) => sys.people.names[group.founder] ?? '?')), nom: nameOf(sys, elder) });
    foundClan(sys, tribe, elder, households, reason);
  }
}

/** An ambitious adult who wants a clan of their own rallies the households of their friends. */
function ambitiousClans(sys: GroupsSystem, tribe: Group): void {
  const { params } = sys;
  for (const person of sys.adults(tribe)) {
    if (sys.groupOf(person, 1) !== null || !hasAmbition(sys.humans.social, person, FOUND_CLAN)) continue;
    const own = sys.groupOf(person, 2);
    if (!own || own.parent !== tribe.id) continue;
    const friends = sys.childrenOf(tribe).filter((group) => group.level === 2 && group !== own && ties(sys, own, group) >= params.clans.kinTie / 2);
    const households = [own, ...friends];
    const members = households.reduce((sum, group) => sum + group.members.length, 0);
    if (households.length < params.clans.minFamilies || members < params.clans.minMembers) continue;
    const vars = { ...genderVars(sys, person), nom: nameOf(sys, person), familles: listNames(friends.map((group) => group.name)) };
    foundClan(sys, tribe, person, households, fillVars(params.texts.clanAmbition, vars));
  }
}

function fillVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([^{}]+)\}/g, (match, key: string) => vars[key] ?? match);
}

function foundClan(sys: GroupsSystem, tribe: Group, founder: number, households: Group[], reason: string): void {
  const event = publishGroupEvent(sys, GROUP_EVENTS.founded, sys.params.texts.founded, { groupe: capitalize(groupName(sys.params.nameTemplates[1]!, nameOf(sys, founder))), raison: reason }, tribe, [founder], []);
  const clan = sys.addGroup(1, tribe.id, founder, 0, event);
  for (const household of households) {
    household.parent = clan.id;
    for (const person of household.members) syncClan(sys, person);
  }
  clan.members = households.flatMap((group) => group.members);
  clan.regime = bestRegime(sys, clan, groupFactors(sys, clan));
  designateLeaders(sys, clan, [event], true);
}

/** A household without a clan joins the clan it is most tied to, if the ties are strong enough. */
function joinClans(sys: GroupsSystem, tribe: Group): void {
  const clans = sys.childrenOf(tribe).filter((group) => group.level === 1);
  if (clans.length === 0) return;
  for (const family of sys.childrenOf(tribe)) {
    if (family.level !== 2 || family.members.length === 0) continue;
    let best: Group | null = null;
    let bestTie = sys.params.clans.joinTie;
    for (const clan of clans) {
      const tie = sys.childrenOf(clan).reduce((sum, other) => sum + ties(sys, family, other), 0);
      if (tie >= bestTie) {
        bestTie = tie;
        best = clan;
      }
    }
    if (!best || topOf(sys, best) !== tribe) continue;
    family.parent = best.id;
    for (const person of family.members) {
      syncClan(sys, person);
      best.members.push(person);
    }
  }
}
