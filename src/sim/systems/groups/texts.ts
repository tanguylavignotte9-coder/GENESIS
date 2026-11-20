import type { EventPlace } from '../../core/journal';
import { fillTemplate } from '../../core/text';
import { describeLocation } from '../world/places';
import type { Group } from './group';
import type { GroupsSystem } from './groups-system';
import type { Factor, GroupsParams } from './params';

/** Journal event types of the groups system. */
export const GROUP_EVENTS = {
  founded: 'groups.founded',
  leader: 'groups.leader',
  regime: 'groups.regime',
  rule: 'groups.rule',
  strategy: 'groups.strategy',
  contested: 'groups.contested',
  overthrown: 'groups.overthrown',
  scission: 'groups.scission',
  fusion: 'groups.fusion',
  alliance: 'groups.alliance',
  betrayal: 'groups.betrayal',
  contact: 'groups.contact',
  move: 'groups.move',
  dissolved: 'groups.dissolved',
  succession: 'groups.succession',
  religion: 'groups.religion',
} as const;

/** A group's name from its template: "la tribu de Ka", "la tribu d’Irnue" (elision before a vowel). */
export function groupName(template: string, name: string): string {
  const elided = /^[aeiouyhâéèêëîïôûAEIOUYH]/.test(name);
  return elided ? template.replace('de {nom}', `d’${name}`).replace('{nom}', name) : template.replace('{nom}', name);
}

/** "Ka", "Ka et Lo", "Ka, Lo et Mi". */
export function listNames(names: readonly string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} et ${names.at(-1)!}`;
}

/** Leader's title in the group's regime ("chef", "cheffe", "ancien du conseil"…). */
export function titleOf(sys: GroupsSystem, person: number, group: Group): string {
  const regime = sys.params.regimes[group.regime]!;
  return sys.people.female[person] === 1 ? regime.titleFemale : regime.title;
}

export function nameOf(sys: GroupsSystem, person: number): string {
  return sys.people.names[person] ?? '?';
}

/** Where the group lives: its tribe's camp. */
export function placeOf(sys: GroupsSystem, group: Group): EventPlace | null {
  let tribe: Group | undefined = group;
  while (tribe && tribe.level > 0) tribe = sys.groups[tribe.parent];
  if (!tribe || tribe.camp < 0) return null;
  const camp = sys.humans.camps[tribe.camp];
  if (!camp) return null;
  return { x: camp.centerX, y: camp.centerY, label: describeLocation(sys.humans.world, camp.centerX, camp.centerY) };
}

/** "le groupe est petit et les anciens sont nombreux": the two situations that weigh most. */
export function factorReason(params: GroupsParams, weights: Partial<Record<Factor, number>>, factors: Record<Factor, number>): string {
  const parts = (Object.entries(weights) as [Factor, number][])
    .map(([factor, weight]) => ({ factor, value: weight * factors[factor] }))
    .filter((part) => part.value > 0.05)
    .sort((a, b) => b.value - a.value)
    .slice(0, 2)
    .map((part) => params.factorTexts[part.factor]);
  return parts.length > 0 ? listNames(parts) : params.causeTexts.review;
}

/** Feminine endings for a template: {e} → "e", {ne} → "ne"… */
export function genderVars(sys: GroupsSystem, person: number): { e: string; ne: string; lui_elle: string; il_elle: string } {
  const female = sys.people.female[person] === 1;
  return { e: female ? 'e' : '', ne: female ? 'ne' : '', lui_elle: female ? 'elle' : 'lui', il_elle: female ? 'elle' : 'il' };
}

/** Publishes an event of the groups system (people named are its actors). */
export function publishGroupEvent(
  sys: GroupsSystem,
  type: string,
  template: string,
  vars: Record<string, string>,
  group: Group,
  people: readonly number[],
  causes: readonly number[],
  details: Record<string, string | number> = {},
): number {
  return sys.journal.publish({
    tick: sys.tick,
    type,
    text: fillTemplate(template, vars),
    place: placeOf(sys, group),
    actors: [{ kind: 'group', id: group.id }, ...[...new Set(people)].map((id) => ({ kind: 'human', id }))],
    causes: [...new Set(causes)].filter((id) => id >= 0 && sys.journal.get(id) !== undefined),
    details: { group: group.id, ...details },
  });
}
