import type { Group } from './group';
import type { GroupsSystem } from './groups-system';
import { LEVEL_COUNT } from './params';
import { bestRegime, groupFactors } from './power';
import { designateLeaders } from './leaders';
import { factorReason, GROUP_EVENTS, publishGroupEvent } from './texts';

/** The starting tribes (one per camp), and the households inside them. Clans form later, by themselves. */
export function foundStartingGroups(sys: GroupsSystem): void {
  const { humans } = sys;
  for (const camp of humans.camps) {
    const members = humans.campMembers(camp.id).filter((p) => sys.people.alive[p] === 1);
    if (members.length === 0) continue;
    const tribe = sys.addGroup(0, -1, members[0]!, 0, -1);
    tribe.camp = camp.id;
    for (const person of members) sys.setMember(person, tribe);
    tribe.members = [...members];
    for (const person of members) if (sys.groupOf(person, 2) === null) foundHousehold(sys, person, tribe);
    const factors = groupFactors(sys, tribe);
    tribe.regime = bestRegime(sys, tribe, factors);
    const regime = sys.params.regimes[tribe.regime]!;
    tribe.regimeEvent = publishGroupEvent(
      sys,
      GROUP_EVENTS.founded,
      sys.params.texts.founded,
      { groupe: capitalize(tribe.name), raison: `${regime.name.toLowerCase()}, car ${factorReason(sys.params, regime.favors, factors)}` },
      tribe,
      [],
      [],
    );
    designateLeaders(sys, tribe, [tribe.regimeEvent], true);
    chooseRules(sys, tribe, factors);
  }
  rebuildMembers(sys);
  for (const group of sys.groups) if (group.level === 2) designateLeaders(sys, group, [], false);
}

/** A household around `person`: their partner and the children they raise. */
function foundHousehold(sys: GroupsSystem, person: number, tribe: Group): Group {
  const { people } = sys;
  const family = sys.addGroup(2, tribe.id, person, familyRegime(sys), -1);
  const spouse = people.spouse[person]!;
  const heads = [person];
  if (spouse >= 0 && people.alive[spouse] === 1 && sys.groupOf(spouse, 0) === tribe && sys.groupOf(spouse, 2) === null) heads.push(spouse);
  for (const head of heads) sys.setMember(head, family);
  for (const child of tribe.members) {
    if (sys.isAdult(child) || sys.groupOf(child, 2) !== null) continue;
    if (heads.includes(people.mother[child]!) || heads.includes(people.father[child]!)) sys.setMember(child, family);
  }
  return family;
}

/** The regime of a household (the only one the data allows at that level, or the best of them). */
function familyRegime(sys: GroupsSystem): number {
  const index = sys.params.regimes.findIndex((regime) => regime.levels.includes(2) && regime.requires.length === 0);
  return Math.max(0, index);
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The leaders fix the property and inheritance rules and the strategy that suit them and the situation. */
export function chooseRules(sys: GroupsSystem, group: Group, factors: ReturnType<typeof groupFactors>): void {
  const leader = group.leaders[0] ?? -1;
  group.property = bestOption(sys, sys.params.property, leader, factors);
  group.inheritance = bestOption(sys, sys.params.inheritance, leader, factors);
  group.strategy = bestOption(sys, sys.params.strategies, leader, factors);
}

/** Option with the best score: the leader's traits (each × (2·trait − 1)) plus the situation it fits. */
export function bestOption(sys: GroupsSystem, options: readonly { traits: Record<string, number>; favors?: Partial<Record<string, number>> }[], leader: number, factors: Record<string, number>): number {
  let best = 0;
  let bestScore = -Infinity;
  options.forEach((option, index) => {
    const score = optionScore(sys, option, leader, factors);
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}

export function optionScore(sys: GroupsSystem, option: { traits: Record<string, number>; favors?: Partial<Record<string, number>> }, leader: number, factors: Record<string, number>): number {
  let score = 0;
  if (leader >= 0) for (const [trait, weight] of Object.entries(option.traits)) score += weight * (2 * sys.humans.social.trait(leader, trait) - 1);
  for (const [factor, weight] of Object.entries(option.favors ?? {})) score += (weight ?? 0) * (factors[factor] ?? 0);
  return score;
}

/**
 * Newcomers (births) and people whose camp changed: tribe of their camp, family of the one who
 * raises them (or a household of their own), clan of their family.
 */
export function assignNewcomers(sys: GroupsSystem): void {
  const { people, humans } = sys;
  const guardian = humans.life.state.guardian;
  for (let p = 0; p < people.count; p++) {
    if (people.alive[p] === 0) continue;
    const tribe = sys.tribeOfCamp(people.camp[p]!);
    if (!tribe) continue;
    if (sys.groupOf(p, 0) !== tribe) {
      sys.setMember(p, tribe);
      const family = sys.groupOf(p, 2);
      if (family && topOf(sys, family) !== tribe) sys.clearMember(p, 2);
      const clan = sys.groupOf(p, 1);
      if (clan && clan.parent !== tribe.id) sys.clearMember(p, 1);
    }
    if (sys.groupOf(p, 2) === null) {
      const raiser = guardian[p]! >= 0 ? guardian[p]! : people.mother[p]!;
      const family = raiser >= 0 && people.alive[raiser] === 1 ? sys.groupOf(raiser, 2) : null;
      if (family && family.alive && topOf(sys, family) === tribe) sys.setMember(p, family);
      else {
        const own = sys.addGroup(2, tribe.id, p, familyRegime(sys), -1);
        sys.setMember(p, own);
        own.leaders = [p];
      }
    }
    syncClan(sys, p);
  }
}

/** The tribe a group belongs to. */
export function topOf(sys: GroupsSystem, group: Group): Group {
  let top = group;
  while (top.level > 0 && sys.groups[top.parent]) top = sys.groups[top.parent]!;
  return top;
}

/** A person's clan is the clan of their family. */
export function syncClan(sys: GroupsSystem, person: number): void {
  const family = sys.groupOf(person, 2);
  const parent = family ? sys.groups[family.parent] : undefined;
  if (parent && parent.level === 1 && parent.alive) sys.setMember(person, parent);
  else sys.clearMember(person, 1);
}

/**
 * Households follow life: a child lives in the household of the one who raises them; a new couple
 * lives together (the partner without children of their own moves in with the other, or both found
 * their own household).
 */
export function updateFamilies(sys: GroupsSystem): void {
  const { people, humans } = sys;
  const guardian = humans.life.state.guardian;
  for (let p = 0; p < people.count; p++) {
    if (people.alive[p] === 0) continue;
    const family = sys.groupOf(p, 2);
    if (!sys.isAdult(p)) {
      const raiser = guardian[p]!;
      const theirs = raiser >= 0 && people.alive[raiser] === 1 ? sys.groupOf(raiser, 2) : null;
      if (theirs && theirs !== family && topOf(sys, theirs) === sys.groupOf(p, 0)) moveTo(sys, p, theirs);
      continue;
    }
    const spouse = people.spouse[p]!;
    if (spouse < p || people.alive[spouse] === 0) continue;
    const other = sys.groupOf(spouse, 2);
    if (!family || !other || family === other || sys.groupOf(spouse, 0) !== sys.groupOf(p, 0)) continue;
    const pKids = raises(sys, p, family);
    const sKids = raises(sys, spouse, other);
    if (pKids && !sKids) moveTo(sys, spouse, family);
    else if (sKids && !pKids) moveTo(sys, p, other);
    else if (pKids && sKids) moveTo(sys, spouse, family);
    else if (sys.params.families.joinSpouse) {
      const tribe = sys.groupOf(p, 0)!;
      const clan = family.parent;
      const home = sys.addGroup(2, clan >= 0 ? clan : tribe.id, people.ageYears[p]! >= people.ageYears[spouse]! ? p : spouse, familyRegime(sys), -1);
      moveTo(sys, p, home);
      moveTo(sys, spouse, home);
    }
  }
}

/** Does the person raise a child in this household? */
function raises(sys: GroupsSystem, person: number, family: Group): boolean {
  const guardian = sys.humans.life.state.guardian;
  for (let c = 0; c < sys.people.count; c++) {
    if (sys.people.alive[c] === 1 && guardian[c] === person && sys.groupOf(c, 2) === family) return true;
  }
  return false;
}

function moveTo(sys: GroupsSystem, person: number, family: Group): void {
  sys.setMember(person, family);
  syncClan(sys, person);
}

/** Living members of every group; a group left without members ends. */
export function rebuildMembers(sys: GroupsSystem): void {
  const { people } = sys;
  for (const group of sys.groups) if (group.alive) group.members = [];
  for (let p = 0; p < people.count; p++) {
    if (people.alive[p] === 0) continue;
    for (let level = 0; level < LEVEL_COUNT; level++) {
      const group = sys.groupOf(p, level);
      if (group && group.alive) group.members.push(p);
    }
  }
  for (const group of sys.groups) {
    if (!group.alive) continue;
    group.leaders = group.leaders.filter((leader) => people.alive[leader] === 1 && sys.groupOf(leader, group.level) === group);
    if (group.members.length > 0) continue;
    if (group.level === 2) sys.endGroup(group, -1);
    else endWithStory(sys, group);
  }
}

/** A tribe or a clan ends with its last member: told in the journal. */
function endWithStory(sys: GroupsSystem, group: Group): void {
  const event = publishGroupEvent(
    sys,
    GROUP_EVENTS.dissolved,
    sys.params.texts.dissolved,
    { groupe: capitalize(group.name), raison: group.level === 0 ? 'son dernier membre est mort' : 'plus personne ne s’en réclame' },
    group,
    [],
    group.sufferings.slice(-3).map((s) => s.event),
  );
  sys.endGroup(group, event);
}
