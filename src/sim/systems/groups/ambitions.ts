import { hasAmbition, offerAmbition } from '../individuals/social/ambitions';
import { AMBITIONS } from '../individuals/social/params';
import type { Group } from './group';
import type { GroupsSystem } from './groups-system';

/** Political ambitions (their names are in data/social.json → ambitions). */
export const AMBITION_IDS = ['becomeChief', 'foundClan', 'foundTribe'] as const;

const BECOME_CHIEF = AMBITIONS.indexOf('becomeChief');

export function hasPowerAmbition(sys: GroupsSystem, person: number): boolean {
  return hasAmbition(sys.humans.social, person, BECOME_CHIEF);
}

/** Is a political ambition still alive (not fulfilled, still possible)? */
export function stillWantsPower(sys: GroupsSystem, person: number, ambition: string): boolean {
  if (person >= sys.grievance.length || sys.people.alive[person] === 0) return false;
  const tribe = sys.tribeOf(person);
  const clan = sys.groupOf(person, 1);
  switch (ambition) {
    case 'becomeChief':
      return tribe !== null && !sys.isLeader(person, tribe);
    case 'foundClan':
      return clan === null || clan.founder !== person;
    case 'foundTribe':
      return clan !== null && sys.isLeader(person, clan) && tribe !== null && !sys.isLeader(person, tribe);
    default:
      return false;
  }
}

/**
 * The situation gives ambitions to those whose character leads them there: the ambitious who are
 * not in power want to lead; an ambitious adult without a clan wants one of their own; the leader of
 * a clan that no longer supports the tribe's leaders wants a tribe of their own.
 */
export function offerPowerAmbitions(sys: GroupsSystem, tribe: Group): void {
  const { params } = sys;
  const social = sys.humans.social;
  for (const person of sys.adults(tribe)) {
    const ambition = social.trait(person, 'ambition');
    if (ambition < params.politics.ambitionTrait) continue;
    if (!sys.isLeader(person, tribe)) offerAmbition(social, person, 'becomeChief', -1);
    const clan = sys.groupOf(person, 1);
    if (!clan && ambition >= params.clans.foundAmbition) offerAmbition(social, person, 'foundClan', -1);
    const rejected = clan !== null && (meanApproval(sys, clan, 0) < params.scission.approvalBelow || meanApproval(sys, clan, 1) - meanApproval(sys, clan, 0) >= params.scission.loyaltyGap);
    if (clan && sys.isLeader(person, clan) && rejected) offerAmbition(social, person, 'foundTribe', -1);
  }
}

/** Mean support of a group's adult members for the leaders at `level` (their tribe: 0). */
export function meanApproval(sys: GroupsSystem, group: Group, level: number): number {
  let sum = 0;
  let count = 0;
  for (const person of group.members) {
    if (!sys.isAdult(person)) continue;
    sum += sys.approval[person * 3 + level]!;
    count++;
  }
  return count > 0 ? sum / count : 50;
}
