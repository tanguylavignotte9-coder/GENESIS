import { relationReasons } from '../individuals/social/texts';
import { DeathCause } from '../individuals/people';
import type { DecisionRecord } from './decisions';
import type { Group } from './group';
import type { GroupsSystem } from './groups-system';
import { feeling } from './power';
import { hasPowerAmbition } from './ambitions';
import { LEVEL_COUNT } from './params';

/**
 * Visual governance (step 10.5), read only: a tribe's collective decisions (options weighed, what
 * weighed, why the others were set aside), the map of support (each adult and each clan coloured by
 * their support for the leaders, with their reasons) and the main sources of discontent.
 */

export interface SupportLine {
  person: number;
  name: string;
  clan: string;
  /** 0..100 */
  support: number;
  reasons: string[];
}

export interface GovernanceFacts {
  tribe: number;
  name: string;
  regime: string;
  leaders: string;
  legitimacy: number;
  discontent: number;
  /** The latest decisions; `date` is filled by whoever knows the calendar. */
  decisions: (DecisionRecord & { date: string })[];
  members: SupportLine[];
  clans: { name: string; support: number; members: number; leader: string }[];
  discontentSources: { label: string; weight: number }[];
}

const FULL = 100;
const NEUTRAL = 50;

/** Why a member supports the leaders or not (the parts of their approval). */
function supportReasons(sys: GroupsSystem, tribe: Group, person: number): string[] {
  const o = sys.params.opinion;
  const social = sys.humans.social;
  const reasons: string[] = [];
  if (tribe.leaders.includes(person)) return ['c’est un des dirigeants'];
  for (const leader of tribe.leaders) {
    const name = sys.people.names[leader] ?? '?';
    const respect = feeling(sys, person, leader, 'respect');
    const affection = feeling(sys, person, leader, 'affection');
    const trust = feeling(sys, person, leader, 'trust');
    const part = (o.respectWeight * respect + o.affectionWeight * affection + o.trustWeight * trust) / 2 / tribe.leaders.length;
    if (Math.abs(part) >= 1) reasons.push(`${part > 0 ? 'estime' : 'mésestime'} ${name} (respect ${Math.round(respect)}, affection ${Math.round(affection)}, confiance ${Math.round(trust)}) : ${part > 0 ? '+' : '−'}${Math.round(Math.abs(part))}`);
    const slot = social.state.slotOf(person, leader);
    if (slot >= 0) for (const reason of relationReasons(social, slot).slice(0, 2)) if (reason.text) reasons.push(`  · ${reason.text}`);
    if (social.kinOf(person, leader) !== 0) reasons.push(`de la famille de ${name} : +${o.kinBonus}`);
    const ownClan = sys.member[person * LEVEL_COUNT + 1]!;
    const theirs = sys.member[leader * LEVEL_COUNT + 1]!;
    if (ownClan >= 0 && theirs >= 0) reasons.push(ownClan === theirs ? `même clan que ${name} : +${o.clanBonus}` : `${name} est d’un autre clan : −${o.clanBonus / 2}`);
  }
  const grievance = sys.grievance[person]!;
  if (grievance >= 1) reasons.push(`griefs (faim, froid, deuils, maladie, ambition contrariée) ${Math.round(grievance)} : −${Math.round((o.welfareWeight * grievance) / FULL)}`);
  if (hasPowerAmbition(sys, person)) reasons.push('veut le pouvoir pour lui-même');
  return reasons;
}

/** The main sources of discontent of a tribe, by weight (members concerned, deaths of the year). */
function discontentSources(sys: GroupsSystem, tribe: Group): GovernanceFacts['discontentSources'] {
  const o = sys.params.opinion;
  const people = sys.people;
  const disease = sys.humans.life.state.disease;
  let hungry = 0;
  let cold = 0;
  let sick = 0;
  let ambitious = 0;
  for (const person of sys.adults(tribe)) {
    if (people.hunger[person]! > o.hungerFloor) hungry++;
    if (people.cold[person]! > o.coldFloor) cold++;
    if (disease[person]! >= 0) sick++;
    if (hasPowerAmbition(sys, person) && !tribe.leaders.includes(person)) ambitious++;
  }
  const deaths = (cause: number): number => tribe.sufferings.filter((s) => s.cause === cause).length;
  const sources = [
    { label: `Morts de faim cette année (${deaths(DeathCause.Hunger)})`, weight: deaths(DeathCause.Hunger) * 5 },
    { label: `Morts de soif cette année (${deaths(DeathCause.Thirst)})`, weight: deaths(DeathCause.Thirst) * 5 },
    { label: `Morts de froid cette année (${deaths(DeathCause.Cold)})`, weight: deaths(DeathCause.Cold) * 5 },
    { label: `Morts de maladie cette année (${deaths(DeathCause.Disease)})`, weight: deaths(DeathCause.Disease) * 5 },
    { label: `Adultes qui ont faim (${hungry})`, weight: hungry * o.grievanceHunger },
    { label: `Adultes qui ont froid (${cold})`, weight: cold * o.grievanceCold },
    { label: `Adultes malades (${sick})`, weight: sick * o.grievanceSick },
    { label: `Ambitieux tenus loin du pouvoir (${ambitious})`, weight: ambitious * o.grievanceBlockedAmbition },
  ];
  const total = sources.reduce((sum, source) => sum + source.weight, 0);
  return sources.filter((source) => source.weight > 0).map((source) => ({ label: source.label, weight: total > 0 ? Math.round((source.weight / total) * FULL) : 0 })).sort((a, b) => b.weight - a.weight);
}

/** The governance of a tribe, for the Groups panel. Null if the tribe no longer exists. */
export function describeGovernance(sys: GroupsSystem, tribeId: number): GovernanceFacts | null {
  const tribe = sys.groups[tribeId];
  if (!tribe || !tribe.alive || tribe.level !== 0) return null;
  const regime = sys.params.regimes[tribe.regime]!;
  const members: SupportLine[] = sys.adults(tribe).map((person) => {
    const clan = sys.groupOf(person, 1);
    return {
      person,
      name: sys.people.names[person] ?? '?',
      clan: clan?.name ?? 'sans clan',
      support: Math.round(tribe.leaders.includes(person) ? FULL : sys.approval[person * LEVEL_COUNT]!),
      reasons: supportReasons(sys, tribe, person),
    };
  });
  const clans = sys
    .childrenOf(tribe)
    .filter((group) => group.level === 1 && group.members.length > 0)
    .map((clan) => {
      const adults = sys.adults(clan);
      const support = adults.length > 0 ? adults.reduce((sum, person) => sum + sys.approval[person * LEVEL_COUNT]!, 0) / adults.length : NEUTRAL;
      return { name: clan.name, support: Math.round(support), members: clan.members.length, leader: sys.people.names[clan.leaders[0] ?? -1] ?? '' };
    });
  return {
    tribe: tribe.id,
    name: tribe.name,
    regime: regime.name,
    leaders: tribe.leaders.map((leader) => sys.people.names[leader] ?? '?').join(', '),
    legitimacy: Math.round(tribe.legitimacy),
    discontent: Math.round(tribe.discontent),
    decisions: tribe.decisions.map((decision) => ({ ...decision, date: '', options: decision.options.map((option) => ({ ...option, reasons: [...option.reasons] })) })),
    members: members.sort((a, b) => a.support - b.support),
    clans,
    discontentSources: discontentSources(sys, tribe),
  };
}
