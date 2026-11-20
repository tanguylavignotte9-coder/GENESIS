import type { Group } from './group';
import type { GroupsSystem } from './groups-system';
import { DUTIES, LEVEL_COUNT } from './params';
import { titleOf } from './texts';

/** A group as the Groups panel shows it. */
export interface GroupFacts {
  id: number;
  level: number;
  /** "Tribu", "Clan", "Famille". */
  levelName: string;
  parent: number;
  name: string;
  regime: string;
  access: string;
  leaders: { person: number; name: string; title: string }[];
  legitimacy: number;
  discontent: number;
  members: number;
  adults: number;
  /** Rules (tribes; households and clans follow their tribe's). */
  property: string;
  inheritance: string;
  strategy: string;
  /** Tribes: camp center (tiles), -1 if none. */
  campX: number;
  campY: number;
  /** Tribes: the other tribes they know. */
  known: { group: number; name: string; opinion: number; allied: boolean; status: string }[];
  /** Day of founding (absolute day) and the founder. */
  foundedDay: number;
  founder: string;
  /** Clans and families inside (ids). */
  children: number[];
}

export interface GroupsFacts {
  /** Living tribes first, then their clans and households (each group once). */
  groups: GroupFacts[];
  /** Tribes that ended (name and absolute day). */
  ended: { name: string; day: number }[];
}

/** A person's place in each level of groups (character sheet). */
export interface MembershipFacts {
  levels: { level: number; levelName: string; group: number; name: string; role: string; support: number }[];
  duty: string;
  obeys: boolean;
}

const ROUND = 10;

function round(value: number): number {
  return Math.round(value * ROUND) / ROUND;
}

function facts(sys: GroupsSystem, group: Group): GroupFacts {
  const { params, people } = sys;
  const regime = params.regimes[group.regime]!;
  let tribe = group;
  while (tribe.level > 0 && sys.groups[tribe.parent]) tribe = sys.groups[tribe.parent]!;
  const camp = group.level === 0 ? sys.humans.camps[group.camp] : undefined;
  return {
    id: group.id,
    level: group.level,
    levelName: params.levels[group.level]!,
    parent: group.parent,
    name: group.name,
    regime: regime.name,
    access: regime.access,
    leaders: group.leaders.map((person) => ({ person, name: people.names[person] ?? '?', title: titleOf(sys, person, group) })),
    legitimacy: round(group.legitimacy),
    discontent: round(group.discontent),
    members: group.members.length,
    adults: sys.adults(group).length,
    property: params.property[tribe.property]!.name,
    inheritance: params.inheritance[tribe.inheritance]!.name,
    strategy: params.strategies[tribe.strategy]!.name,
    campX: camp ? camp.centerX : -1,
    campY: camp ? camp.centerY : -1,
    known: [...group.known.entries()].map(([id, view]) => ({ group: id, name: sys.groups[id]!.name, opinion: round(view.opinion), allied: view.allied, status: '' })),
    foundedDay: group.foundedDay,
    founder: people.names[group.founder] ?? '?',
    children: sys.childrenOf(group).filter((child) => child.members.length > 0).map((child) => child.id),
  };
}

export function describeGroups(sys: GroupsSystem): GroupsFacts {
  const living = sys.groups.filter((group) => group.alive && group.members.length > 0);
  return {
    groups: living.map((group) => facts(sys, group)),
    ended: sys.groups.filter((group) => group.level === 0 && !group.alive).map((group) => ({ name: group.name, day: group.endedDay })),
  };
}

export function describeMembership(sys: GroupsSystem, person: number): MembershipFacts {
  const levels: MembershipFacts['levels'] = [];
  if (person >= sys.grievance.length) return { levels, duty: '', obeys: true };
  for (let level = 0; level < LEVEL_COUNT; level++) {
    const group = sys.groupOf(person, level);
    if (!group) continue;
    const role = group.leaders.includes(person) ? titleOf(sys, person, group) : 'membre';
    levels.push({ level, levelName: sys.params.levels[level]!, group: group.id, name: group.name, role, support: round(sys.approval[person * LEVEL_COUNT + level]!) });
  }
  const duty = sys.duty[person]!;
  return { levels, duty: duty >= 0 ? sys.params.dutyNames[DUTIES[duty]!] : '', obeys: sys.obeys[person] === 1 };
}
