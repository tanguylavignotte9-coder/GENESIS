import { HUMAN_DEATH } from '../individuals/individuals-system';
import { DeathCause } from '../individuals/people';
import type { Group } from './group';
import type { GroupsSystem } from './groups-system';
import { LEVEL_COUNT } from './params';
import { bestRegime, feeling, groupFactors, regimeFit } from './power';
import { hasPowerAmbition } from './ambitions';
import { feel } from '../individuals/social/relations';

const FULL = 100;
const NEUTRAL = 50;
const SUFFERING_CAUSES: readonly number[] = [DeathCause.Hunger, DeathCause.Thirst, DeathCause.Cold, DeathCause.Disease];
/** Approval a leader has of their own power. */
const SELF_SUPPORT = 90;

function clamp(value: number): number {
  return value < 0 ? 0 : value > FULL ? FULL : value;
}

/**
 * What happened since yesterday, as the journal tells it: deaths of members by hunger, thirst,
 * cold or disease weigh on their tribe (its sufferings) and on those who loved them (grievance).
 */
export function readJournal(sys: GroupsSystem): void {
  const { journal, people } = sys;
  const yearDays = sys.humans.life.yearDays;
  for (; sys.journalRead < journal.size; sys.journalRead++) {
    const event = journal.get(sys.journalRead)!;
    if (event.type !== HUMAN_DEATH) continue;
    const cause = Number(event.details['cause']);
    const dead = Number(event.details['person']);
    if (!SUFFERING_CAUSES.includes(cause)) continue;
    const tribe = dead < sys.grievance.length ? sys.tribeOf(dead) : null;
    if (!tribe) continue;
    tribe.sufferings.push({ day: sys.day, cause, event: event.id });
    while (tribe.sufferings.length > 0 && sys.day - tribe.sufferings[0]!.day > yearDays) tribe.sufferings.shift();
    const close = (person: number): boolean => sys.humans.social.kinOf(person, dead) !== 0 || feeling(sys, person, dead, 'affection') >= sys.humans.social.params.relations.friendAffection;
    for (const person of tribe.members) {
      if (person === dead || people.alive[person] === 0) continue;
      if (close(person)) sys.grievance[person] = clamp(sys.grievance[person]! + sys.params.opinion.grievanceLoss);
    }
    blameLeaders(sys, tribe, event.id, close);
  }
}

/**
 * A death by hunger, thirst, cold or disease under the leaders' authority: those who lost someone
 * dear hold the leaders responsible (less trust, less respect), the others a little; much more when
 * the death follows a move or a migration the leaders decided.
 */
function blameLeaders(sys: GroupsSystem, tribe: Group, event: number, close: (person: number) => boolean): void {
  const o = sys.params.opinion;
  if (tribe.leaders.length === 0) return;
  const camp = sys.humans.camps[tribe.camp];
  const afterMove = camp !== undefined && camp.movedEvent >= 0 && sys.day - tribe.settledDay <= o.moveBlameDays && sys.day > tribe.foundedDay;
  const factor = afterMove ? o.moveBlameFactor : 1;
  const social = sys.humans.social;
  for (const person of tribe.members) {
    if (!sys.isAdult(person) || sys.people.alive[person] === 0 || tribe.leaders.includes(person)) continue;
    const share = (close(person) ? 1 : o.blameOthers) * factor;
    if (share <= 0) continue;
    for (const leader of tribe.leaders) {
      // One does not blame one's own kin as much.
      const kin = social.kinOf(person, leader) !== 0 ? 0.5 : 1;
      feel(social, person, leader, { affection: 0, trust: -o.blameTrust * share * kin, respect: -o.blameRespect * share * kin }, 'blamed', afterMove ? camp!.movedEvent : event);
    }
  }
}

/** Every day: grievances grow with suffering and fade; support for the leaders follows the relations and the welfare. */
export function updateOpinions(sys: GroupsSystem): void {
  const { people, params } = sys;
  const o = params.opinion;
  const disease = sys.humans.life.state.disease;
  for (let p = 0; p < people.count; p++) {
    if (people.alive[p] === 0 || !sys.isAdult(p)) continue;
    let g = sys.grievance[p]!;
    if (people.hunger[p]! > o.hungerFloor) g += (o.grievanceHunger * (people.hunger[p]! - o.hungerFloor)) / (FULL - o.hungerFloor);
    if (people.cold[p]! > o.coldFloor) g += (o.grievanceCold * (people.cold[p]! - o.coldFloor)) / (FULL - o.coldFloor);
    if (disease[p]! >= 0) g += o.grievanceSick;
    const tribe = sys.tribeOf(p);
    if (tribe && hasPowerAmbition(sys, p) && !sys.isLeader(p, tribe)) g += o.grievanceBlockedAmbition;
    sys.grievance[p] = clamp(g * (1 - o.grievanceDecay));
  }
  for (const group of sys.groups) {
    if (!group.alive || group.members.length === 0) continue;
    updateGroupOpinion(sys, group);
  }
}

/** Approval of each adult member for the leaders, then legitimacy and discontent of the group. */
function updateGroupOpinion(sys: GroupsSystem, group: Group): void {
  const o = sys.params.opinion;
  const factors = groupFactors(sys, group);
  const regimes = sys.params.regimes;
  const fitGap = regimeFit(regimes[bestRegime(sys, group, factors)]!, group.level, factors) - regimeFit(regimes[group.regime]!, group.level, factors);
  const fitPenalty = Number.isFinite(fitGap) ? o.fitWeight * Math.min(1, Math.max(0, fitGap)) : o.fitWeight;
  let approvals = 0;
  let grievances = 0;
  let adults = 0;
  for (const person of group.members) {
    if (!sys.isAdult(person)) continue;
    const index = person * LEVEL_COUNT + group.level;
    const target = group.leaders.includes(person) ? SELF_SUPPORT : approvalTarget(sys, group, person) - fitPenalty;
    sys.approval[index] = clamp(sys.approval[index]! + o.approvalRate * (target - sys.approval[index]!));
    approvals += sys.approval[index]!;
    grievances += sys.grievance[person]!;
    adults++;
  }
  group.legitimacy = adults > 0 ? approvals / adults : NEUTRAL;
  group.discontent = adults > 0 ? grievances / adults : 0;
}

/** What a member would think of the leaders today: relations with them, kinship, own welfare. */
export function approvalTarget(sys: GroupsSystem, group: Group, person: number, leaders: readonly number[] = group.leaders): number {
  const o = sys.params.opinion;
  if (leaders.length === 0) return NEUTRAL - (o.welfareWeight * sys.grievance[person]!) / FULL;
  let relation = 0;
  let kin = 0;
  let clan = 0;
  // Within a tribe, one prefers a leader of one's own clan, and distrusts one of a rival clan.
  const ownClan = group.level === 0 ? sys.member[person * LEVEL_COUNT + 1]! : -1;
  for (const leader of leaders) {
    relation += o.respectWeight * feeling(sys, person, leader, 'respect') + o.affectionWeight * feeling(sys, person, leader, 'affection') + o.trustWeight * feeling(sys, person, leader, 'trust');
    if (sys.humans.social.kinOf(person, leader) !== 0) kin = 1;
    if (ownClan >= 0) {
      const theirs = sys.member[leader * LEVEL_COUNT + 1]!;
      clan += theirs === ownClan ? 1 : theirs >= 0 ? -0.5 : 0;
    }
  }
  relation /= leaders.length;
  clan /= leaders.length;
  return NEUTRAL + relation / 2 + o.kinBonus * kin + o.clanBonus * clan - (o.welfareWeight * sys.grievance[person]!) / FULL;
}
