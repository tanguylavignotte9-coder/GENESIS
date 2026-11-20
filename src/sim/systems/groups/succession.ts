import { feel } from '../individuals/social/relations';
import type { Group } from './group';
import type { GroupsSystem } from './groups-system';
import { meanApproval } from './ambitions';
import { designateLeaders } from './leaders';
import { approvalTarget } from './opinion';
import { rankCandidates } from './power';
import { genderVars, GROUP_EVENTS, nameOf, publishGroupEvent } from './texts';
import { scission } from './tribes';

/** Claimants looked at when a chief dies (the best placed under the regime). */
const CLAIMANTS = 3;

/**
 * The chief of a group is dead. The regime's custom names an heir, but each adult follows the
 * claimant they prefer (relations, kinship, clan, grievances): when another claimant has a real
 * following and the ambition to use it, the succession is disputed. The rival may win the tribe
 * over, or give in, or lead their clan away. Returns true if the crisis settled who leads.
 */
export function successionCrisis(sys: GroupsSystem, group: Group): boolean {
  const { params, rng } = sys;
  const regime = params.regimes[group.regime]!;
  if (regime.leaders !== 1 || group.level > 1) return false;
  const dead = [...group.formerLeaders].reverse().find((leader) => sys.people.alive[leader] === 0);
  if (dead === undefined) return false;
  const claimants = rankCandidates(sys, group).slice(0, CLAIMANTS).map((candidate) => candidate.person);
  if (claimants.length < 2) return false;
  const heir = claimants[0]!;
  const adults = sys.adults(group);
  const following = new Map<number, number[]>(claimants.map((claimant) => [claimant, [claimant]]));
  for (const person of adults) {
    if (claimants.includes(person)) continue;
    let chosen = heir;
    let best = -Infinity;
    for (const claimant of claimants) {
      const support = approvalTarget(sys, group, person, [claimant]);
      if (support > best) {
        best = support;
        chosen = claimant;
      }
    }
    following.get(chosen)!.push(person);
  }
  let rival = -1;
  for (const claimant of claimants) {
    if (claimant !== heir && (rival < 0 || following.get(claimant)!.length > following.get(rival)!.length)) rival = claimant;
  }
  const rivalSide = following.get(rival)!;
  const heirSide = following.get(heir)!;
  const ambitious = sys.humans.social.trait(rival, 'ambition') >= params.politics.ambitionTrait;
  if (!ambitious || rivalSide.length < params.politics.successionShare * adults.length) return false;
  const reason = params.causeTexts.succession.replace('{nom}', nameOf(sys, dead));
  const vars = { ...genderVars(sys, heir), nom: nameOf(sys, heir), rival: nameOf(sys, rival), ancien: nameOf(sys, dead), groupe: group.name, soutiens: String(rivalSide.length), total: String(adults.length), raison: reason };
  const social = sys.humans.social;
  if (rivalSide.length > heirSide.length) {
    const event = publishGroupEvent(sys, GROUP_EVENTS.succession, params.texts.successionWon, vars, group, [rival, heir, ...rivalSide], [group.leaderEvent], { outcome: 'won' });
    group.leaders = [rival];
    if (!group.formerLeaders.includes(rival)) group.formerLeaders.push(rival);
    group.leaderEvent = event;
    group.leadersSince = sys.day;
    for (const person of rivalSide) if (person !== rival) feel(social, person, rival, { affection: 0, trust: 0, respect: params.politics.challengerRespect }, 'rallied', event);
    feel(social, heir, rival, { affection: -params.politics.challengerRespect, trust: -params.politics.challengerRespect, respect: 0 }, 'contested', event);
    return true;
  }
  designateLeaders(sys, group, [group.leaderEvent], true);
  // The beaten claimant who leads a clan that follows them may take it away.
  const clan = group.level === 0 ? sys.groupOf(rival, 1) : null;
  const leavesWithClan = clan !== null && sys.isLeader(rival, clan) && meanApproval(sys, clan, 1) > meanApproval(sys, clan, 0) && rng.nextFloat() < params.scission.chance;
  const issue = leavesWithClan ? params.causeTexts.successionLeaves : params.causeTexts.successionYields;
  const event = publishGroupEvent(sys, GROUP_EVENTS.succession, params.texts.succession, { ...vars, issue }, group, [heir, rival, ...rivalSide], [group.leaderEvent], { outcome: leavesWithClan ? 'split' : 'lost' });
  for (const person of heirSide) if (person !== heir) feel(social, person, rival, { affection: 0, trust: 0, respect: params.politics.failedRespect / 2 }, 'contested', event);
  if (leavesWithClan) scission(sys, group, clan, reason, [event]);
  return true;
}
